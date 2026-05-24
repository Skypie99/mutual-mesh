-- Migration 007 — Extend prune_expired_resources() to sweep completed rows
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24 — closes Quinn AC-8 (spec-phase-2-pickup-confirmation.md)
--   + PRIVACY.md D7 (30-day retention promise) for the new completed lifecycle
--   state introduced in migration 005. Resolves DFS-MIG-1 from
--   qa-reports/phase-2-dana-migrations-2026-05-24.md.
--
-- ============================================================================
-- PRIVACY NOTE — read before applying
-- ============================================================================
-- This migration extends an existing nightly cron job. It does NOT add a new
-- column, table, RPC, or RLS policy. The only behavior change: rows with
-- `status='completed' AND confirmed_at < now() - INTERVAL '30 days'` are now
-- swept (storage objects first, then the row, logged to cron_log) by the
-- same nightly job that already sweeps stale `reserved` and `available` rows.
--
-- Privacy authority: PRIVACY.md D7 — "Resource rows: Deleted 30 days after
-- status='reserved' OR 30 days after creation if never claimed." Migration 005
-- introduced a third lifecycle state (completed) but did not extend the prune
-- to cover it; completed rows were piling up indefinitely (a silent retention-
-- promise violation). This migration closes that gap.
--
-- Threat-model summary:
--   - The 30-day window starts from `confirmed_at`, NOT from `created_at` or
--     `status_changed_at`. This gives both parties ~4 weeks post-handoff to
--     revisit the listing for a dispute (extremely rare but legitimate
--     edge case — Jordan's note in the spec §"Retention").
--   - No new admin surface. The prune cron is server-side; no client-facing
--     view of completion data is added. Cycle 5 admin-visible-fields cap
--     stays at 5.
--   - Storage objects for completed rows are swept BEFORE row delete (mirrors
--     migration 003's pattern for reserved/available). The cascade-delete
--     promise (PRIVACY.md D6 "delete means delete") extends naturally to the
--     completed state.
--   - No change to `confirm_pickup` RPC, no change to columns, no change to
--     RLS. This is purely a cron-logic extension.
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- Replaces `prune_expired_resources()` (defined in migration 003) with a new
-- body that adds a third sweep branch:
--
--   (c) status='completed' AND confirmed_at IS NOT NULL
--       AND confirmed_at < now() - INTERVAL '30 days'
--
-- The two existing branches are preserved verbatim:
--
--   (a) status='reserved'  AND status_changed_at < now() - INTERVAL '30 days'
--   (b) status='available' AND created_at        < now() - INTERVAL '30 days'
--
-- Implementation reuses migration 003's pattern:
--
--   1. Snapshot (a)+(b) into temp table `_prune_targets` (existing behavior).
--   2. NEW: Snapshot (c) into a second temp table `_prune_completed_targets`.
--      Kept separate so the row count for completed sweeps can be logged
--      independently (per task brief: extend the existing format to include
--      `completed_deleted=N` alongside the existing fields).
--   3. Storage sweep operates over the UNION of both temp tables — one DELETE
--      against `storage.objects` matches any photo from either batch. This is
--      simpler than two separate sweeps (one cross-product, one log line).
--   4. Row deletes run sequentially (stale batch first, then completed batch)
--      against their respective temp tables to make the per-branch row counts
--      visible separately.
--   5. cron_log row format extended:
--        - `rows_affected` = total rows deleted (stale + completed), so the
--          existing <36h freshness alert and any downstream count dashboards
--          keep working unchanged.
--        - `error_text` carries the structured breakdown on success:
--             'storage_deleted=<N>;completed_deleted=<M>'
--          (migration 003 used just `storage_deleted=<N>`; this migration
--          extends with `;completed_deleted=<M>` per task brief.)
--
-- WHY
-- ===
-- Quinn AC-8 explicitly: "completed rows are pruned 30 days from
-- confirmed_at." PRIVACY.md D7 implicitly extends to the new state — the
-- 30-day promise is on resource rows, not on a specific status value. Without
-- this migration, completed rows sit forever, conflicting with both.
--
-- The DFS-MIG-1 default from the 2026-05-24 Dana briefing was: "ship 005
-- as-is, follow up with 007 for the prune extension." This is that 007.
--
-- INTERACTION WITH MIGRATIONS 003 + 005
-- =====================================
-- Migration 003 introduced the snapshot-then-sweep pattern (temp table +
-- separate storage delete + row delete + cron_log with `storage_deleted=`).
-- Migration 005 introduced the completed state + confirmed_at column +
-- partial index `resources_confirmed_idx ON (confirmed_at DESC) WHERE
-- confirmed_at IS NOT NULL`. The partial index already supports the new
-- branch's WHERE predicate (`confirmed_at < now() - INTERVAL '30 days'`) —
-- no new index needed.
--
-- This migration replaces the function body wholesale via CREATE OR REPLACE.
-- The function signature, return type, language, security, and search_path
-- are unchanged. The pg_cron schedule (set in schema.sql) keeps calling the
-- same function name — no schedule change needed.
--
-- IDEMPOTENT
-- ==========
-- - `CREATE OR REPLACE FUNCTION` — re-runs install the same body.
-- - No new tables, columns, indexes, or grants. The function body's
--   `CREATE TEMP TABLE IF NOT EXISTS` + `TRUNCATE` pattern is preserved
--   from migration 003 and remains safe within a single function call.
-- - GRANT EXECUTE is preserved by CREATE OR REPLACE (migration 003 already
--   granted EXECUTE on this function to postgres).
--
-- PERMISSIONS
-- ===========
-- Same as migration 003: SECURITY DEFINER function owned by postgres; the
-- postgres role has DML on storage.objects on Supabase by default. No new
-- GRANT needed (the existing GRANT DELETE ON storage.objects TO postgres
-- from migration 003 still applies).
--
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- =======================================
-- 1. (LOG FORMAT EXTENSION) cron_log.error_text on success is now
--    'storage_deleted=<N>;completed_deleted=<M>'. Migration 003 set
--    'storage_deleted=<N>'. The new semicolon-separated format is a
--    superset — any parser that already extracts `storage_deleted=` via
--    regex (`storage_deleted=(\d+)`) continues to work. Downstream
--    observability that strictly requires the OLD format is currently
--    nothing (migration 003 documented this as a single-string field; no
--    consumers exist). If Sky prefers a dedicated `cron_log.completed_deleted`
--    column, that's a Phase 3 schema migration; out of scope here.
-- 2. (ROWS_AFFECTED SEMANTICS) `rows_affected` is the SUM of both batches
--    (stale + completed). Migration 003 used it as just the stale-batch
--    count. The change preserves the 36h freshness alert (which keys off
--    success + ran_at, not row count) and gives any future "how many rows
--    did the prune touch yesterday" query the right total. The per-branch
--    breakdown is preserved in error_text.
-- 3. (CONFIRMED_AT NULL GUARD) Spec AC-8: `confirmed_at IS NOT NULL AND
--    confirmed_at < now() - INTERVAL '30 days'`. The IS NOT NULL is
--    defensive: any row with `status='completed' AND confirmed_at IS NULL`
--    is a data-integrity bug (the RPC sets confirmed_at on the transition).
--    Without the guard, `NULL < now() - 30d` would yield UNKNOWN and the
--    row would NOT be swept — silent retention of bug-state data. Including
--    the guard makes the predicate total and explicit.
-- 4. (PARTIAL INDEX USAGE) The partial index `resources_confirmed_idx ON
--    (confirmed_at DESC) WHERE confirmed_at IS NOT NULL` (from migration
--    005) covers the new branch's WHERE clause. EXPLAIN on the SELECT
--    snapshot statement should show an index scan. Peter may want to verify
--    on staging after apply.
-- 5. (STORAGE SWEEP UNION) The single storage DELETE joins against the
--    UNION of both temp tables (`_prune_targets` for stale, new
--    `_prune_completed_targets` for completed). Picked over two separate
--    DELETEs because (a) it's one transaction round-trip rather than two,
--    (b) it produces one count rather than two (matches migration 003's
--    single `storage_deleted` log field), (c) it's simpler to reason about
--    when reviewing. The task brief said: "combined or two separate sweeps;
--    pick simpler" — combined is simpler.
-- 6. (STATUS_CHANGED_AT vs CONFIRMED_AT) The new branch uses confirmed_at,
--    NOT status_changed_at. This is intentional per spec AC-8. Reasoning:
--    a poster who edits a completed row (currently impossible at the RLS
--    layer but defensive against future schema work) would bump
--    status_changed_at; the retention promise is anchored to "30 days from
--    confirmation," not "30 days from last edit." This guards Casey's
--    metric integrity and Mara's "delete means delete" timer.
-- 7. (NO RACE WITH NEW CONFIRMATIONS) The prune cron runs once nightly.
--    A user confirming a pickup mid-sweep would create a new completed row
--    with confirmed_at = now() — not eligible for sweep until 30 days
--    pass. The snapshot temp table is populated at sweep start; rows
--    created after the snapshot are skipped for this run (correct).
-- 8. (ROLLBACK SEMANTICS) Rolling back to the migration 003 body restores
--    the two-branch sweep. Completed rows would then accumulate forever
--    until the next forward apply. Rollback is safe (no data loss on the
--    SQL side) but reopens the Quinn AC-8 + PRIVACY.md D7 gap. Storage
--    objects already deleted between apply and rollback are NOT
--    recoverable from Supabase PITR (same constraint as migration 003).

-- ============================================================================
-- 1. Replace prune_expired_resources() with the three-branch body
-- ============================================================================
-- Same signature, return type, language, security, search_path as the
-- migration 003 version. New behavior described in the header.

CREATE OR REPLACE FUNCTION public.prune_expired_resources()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale_deleted     INTEGER := 0;
  completed_deleted INTEGER := 0;
  storage_deleted   INTEGER := 0;
  total_deleted     INTEGER := 0;
BEGIN
  -- Snapshot the stale (reserved + available) batch — preserved verbatim
  -- from migration 003. Temp table is per-session and per-function-call;
  -- ON COMMIT DROP cleans it up at the end of the implicit transaction.
  CREATE TEMP TABLE IF NOT EXISTS _prune_targets (
    id UUID PRIMARY KEY,
    photo_url TEXT
  ) ON COMMIT DROP;
  TRUNCATE _prune_targets;

  INSERT INTO _prune_targets (id, photo_url)
  SELECT id, photo_url
  FROM public.resources
  WHERE
    (status = 'reserved'  AND status_changed_at < now() - INTERVAL '30 days')
    OR (status = 'available' AND created_at        < now() - INTERVAL '30 days');

  -- NEW: snapshot the completed batch. Kept in a separate temp table so
  -- per-branch row counts can be logged independently and the row delete
  -- order is explicit. Same ON COMMIT DROP lifecycle as _prune_targets.
  CREATE TEMP TABLE IF NOT EXISTS _prune_completed_targets (
    id UUID PRIMARY KEY,
    photo_url TEXT
  ) ON COMMIT DROP;
  TRUNCATE _prune_completed_targets;

  -- Spec AC-8: completed rows pruned 30 days from confirmed_at.
  -- IS NOT NULL guard handles the (data-integrity bug) case where a row
  -- somehow ended up at status='completed' without a confirmed_at — see
  -- DECISIONS #3 in the header.
  INSERT INTO _prune_completed_targets (id, photo_url)
  SELECT id, photo_url
  FROM public.resources
  WHERE status = 'completed'
    AND confirmed_at IS NOT NULL
    AND confirmed_at < now() - INTERVAL '30 days';

  -- Storage sweep — one DELETE over the UNION of both temp tables.
  -- See DECISIONS #5 in the header for why this is combined rather than
  -- split into two passes. Filter out NULL paths (photo-optional posts).
  WITH all_targets AS (
    SELECT photo_url FROM _prune_targets           WHERE photo_url IS NOT NULL
    UNION ALL
    SELECT photo_url FROM _prune_completed_targets WHERE photo_url IS NOT NULL
  ),
  storage_swept AS (
    DELETE FROM storage.objects
    USING all_targets
    WHERE storage.objects.bucket_id = 'resource-photos'
      AND storage.objects.name = all_targets.photo_url
    RETURNING storage.objects.id
  )
  SELECT COUNT(*) INTO storage_deleted FROM storage_swept;

  -- Row delete — stale batch first (preserved from migration 003).
  WITH deleted AS (
    DELETE FROM public.resources r
    USING _prune_targets t
    WHERE r.id = t.id
    RETURNING r.id
  )
  SELECT COUNT(*) INTO stale_deleted FROM deleted;

  -- Row delete — completed batch.
  WITH deleted_completed AS (
    DELETE FROM public.resources r
    USING _prune_completed_targets t
    WHERE r.id = t.id
    RETURNING r.id
  )
  SELECT COUNT(*) INTO completed_deleted FROM deleted_completed;

  total_deleted := stale_deleted + completed_deleted;

  -- Log to cron_log. rows_affected = total (stale + completed) so the 36h
  -- freshness alert and any "total touched yesterday" dashboards stay
  -- correct. error_text packs the per-batch breakdown:
  --     storage_deleted=<N>;completed_deleted=<M>
  -- See DECISIONS #1 in the header for the format-extension reasoning.
  INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
  VALUES (
    'prune_expired_resources',
    total_deleted,
    true,
    'storage_deleted=' || storage_deleted::TEXT
      || ';completed_deleted=' || completed_deleted::TEXT
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Preserved verbatim from migration 003: log failure then re-raise so
    -- pg_cron records the failure and Sky's freshness alert fires.
    INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
    VALUES ('prune_expired_resources', 0, false, SQLERRM);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.prune_expired_resources() IS
  '30-day retention sweep (PRIVACY.md D7 + Quinn AC-8 + S6). Three branches: stale reserved/available (status_changed_at/created_at) AND completed (confirmed_at). Sweeps Storage objects BEFORE row delete (migration 003 pattern). Logs total row count to cron_log.rows_affected; per-batch breakdown to cron_log.error_text as ''storage_deleted=<N>;completed_deleted=<M>'' on success. See migration 007.';

-- ============================================================================
-- 2. Permissions — preserved from migration 003 (defensive re-grant)
-- ============================================================================
-- CREATE OR REPLACE preserves existing grants; this re-statement is
-- defensive and harmless. The function is called by pg_cron as the
-- postgres role; no authenticated-user call path exists.

GRANT EXECUTE ON FUNCTION public.prune_expired_resources() TO postgres;

-- ============================================================================
-- TEST STUB — Steve / Gary should extend supabase/__tests__/rls.sql
-- ============================================================================
-- Recommended scenarios (wrap each in BEGIN; ROLLBACK; like the existing
-- T1-T9 + T-CONF-* patterns):
--
--   T-PRUNE-1: completed row aged 31 days from confirmed_at is deleted.
--     1. Insert public.users uid_X is_verified=true.
--     2. Insert public.resources posted_by=uid_X, claimed_by=uid_X,
--        status='completed', confirmed_at = now() - INTERVAL '31 days',
--        confirmed_by = uid_X.
--     3. SELECT public.prune_expired_resources();
--     4. Assert zero rows in public.resources for posted_by=uid_X.
--     5. Assert latest cron_log row has success=true and error_text matches
--        the new format `storage_deleted=\d+;completed_deleted=[1-9]\d*`.
--
--   T-PRUNE-2: completed row aged 29 days from confirmed_at is NOT deleted.
--     1. Insert public.resources with status='completed',
--        confirmed_at = now() - INTERVAL '29 days'.
--     2. SELECT public.prune_expired_resources();
--     3. Assert the row still exists.
--
--   T-PRUNE-3: completed row with NULL confirmed_at (data-bug state) is
--     NOT deleted (IS NOT NULL guard works).
--
--   T-PRUNE-4: storage sweep removes photo for completed row alongside
--     stale row in one cron run.
--     1. Insert one stale-reserved resource with a Storage object.
--     2. Insert one completed resource (confirmed_at = 31d ago) with a
--        Storage object.
--     3. SELECT public.prune_expired_resources();
--     4. Assert both Storage objects gone, both rows gone, cron_log
--        error_text shows `storage_deleted=2;completed_deleted=1`.
--
--   T-PRUNE-5: photo_url NULL on a completed row — row deleted, no error
--     raised (NULL paths must be silently skipped, same as migration 003).
--
--   T-PRUNE-6: per-branch log format. After a run with N stale + M
--     completed rows deleted, assert cron_log.rows_affected = N+M AND
--     error_text matches the documented format.

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- Restores the migration 003 body (two-branch sweep). Completed rows then
-- accumulate forever until a forward re-apply — this reopens the Quinn AC-8
-- + PRIVACY.md D7 gap and should be a deliberate decision, not an accident.
--
-- IMPORTANT: Rolling back the SQL definition does NOT recover storage
-- objects deleted between the apply and rollback (Supabase PITR covers
-- Postgres state only; bucket contents are not snapshotted).
--
-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION public.prune_expired_resources()
-- RETURNS VOID
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   deleted_count INTEGER := 0;
--   storage_deleted INTEGER := 0;
-- BEGIN
--   CREATE TEMP TABLE IF NOT EXISTS _prune_targets (
--     id UUID PRIMARY KEY,
--     photo_url TEXT
--   ) ON COMMIT DROP;
--   TRUNCATE _prune_targets;
--
--   INSERT INTO _prune_targets (id, photo_url)
--   SELECT id, photo_url
--   FROM public.resources
--   WHERE
--     (status = 'reserved'  AND status_changed_at < now() - INTERVAL '30 days')
--     OR (status = 'available' AND created_at        < now() - INTERVAL '30 days');
--
--   WITH storage_swept AS (
--     DELETE FROM storage.objects
--     USING _prune_targets t
--     WHERE storage.objects.bucket_id = 'resource-photos'
--       AND t.photo_url IS NOT NULL
--       AND storage.objects.name = t.photo_url
--     RETURNING storage.objects.id
--   )
--   SELECT COUNT(*) INTO storage_deleted FROM storage_swept;
--
--   WITH deleted AS (
--     DELETE FROM public.resources r
--     USING _prune_targets t
--     WHERE r.id = t.id
--     RETURNING r.id
--   )
--   SELECT COUNT(*) INTO deleted_count FROM deleted;
--
--   INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
--   VALUES (
--     'prune_expired_resources',
--     deleted_count,
--     true,
--     'storage_deleted=' || storage_deleted::TEXT
--   );
-- EXCEPTION
--   WHEN OTHERS THEN
--     INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
--     VALUES ('prune_expired_resources', 0, false, SQLERRM);
--     RAISE;
-- END;
-- $$;
--
-- COMMIT;
--
-- After rollback: completed-row pruning is offline. Quinn AC-8 + PRIVACY.md
-- D7 are open again. Re-apply migration 007 to restore.
