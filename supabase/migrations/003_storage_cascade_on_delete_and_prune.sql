-- Migration 003 — Storage cascade on account-delete and prune
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24 — fixes Steve's launch-blockers C2 and C3 from
--   qa-reports/phase-1-security-audit-2026-05-24.md
-- Privacy authority: PRIVACY.md D6 ("delete means delete" — true cascade hard delete)
--   and PRIVACY.md data-inventory row 9 ("Storage object cascade-deletes").
--
-- WHAT IT DOES
-- ============
-- Supabase Storage does NOT cascade on row deletes — buckets and tables are
-- separate subsystems. Today the schema.sql delete_my_account() and
-- prune_expired_resources() RPCs delete rows from public.resources but leave
-- the corresponding objects in the `resource-photos` bucket forever. That
-- silently breaks the user-facing "delete means delete" promise (D6) and the
-- 30-day retention promise (D7 + data-inventory row 9).
--
-- This migration replaces both RPCs in-place via CREATE OR REPLACE so that:
--
--   1. delete_my_account() — BEFORE deleting auth.users (and the cascading
--      public.users / public.resources rows), it collects every non-NULL
--      photo_url from public.resources where posted_by = me, then deletes the
--      matching objects from storage.objects (bucket_id = 'resource-photos').
--      Only after the storage sweep succeeds does it run the existing row
--      cascade. Wrapped in a BEGIN…EXCEPTION…ROLLBACK block so any failure
--      undoes the partial work and re-raises (fail-loud, not fail-silent).
--
--   2. prune_expired_resources() — BEFORE the 30-day row sweep, it collects
--      photo_url paths for the rows that ARE about to be pruned (same WHERE
--      clause as the original DELETE). Deletes those objects from
--      storage.objects, then runs the original row DELETE. Logs BOTH counts
--      to cron_log: rows_affected stays as the row count (preserved semantics
--      for any downstream observability), and the storage object count is
--      packed into error_text as 'storage_deleted=<N>' (success=true). This
--      keeps the existing <36h freshness alert wiring intact while making the
--      storage sweep auditable.
--
-- WHY
-- ===
-- Steve's audit finding C2 (HIGH→CRITICAL once compounded): orphan photos
-- after account delete is a "delete means delete" violation of a user-facing
-- trust promise. Mutual Mesh's audience is surveillance-averse; a residual
-- photo in a bucket — even behind RLS + signed URLs — is a privacy leak in
-- spirit and a forever-growing storage bill in practice.
--
-- Steve's audit finding C3 (same root cause, different code path): the
-- nightly cron deletes expired listing rows but leaves orphan storage
-- objects. Over time this is unbounded.
--
-- Steve's recommended fix (audit §3 C2): "RPC must collect resource photo
-- paths first, then call storage.objects DELETE, then row DELETE." This
-- migration implements exactly that, in both RPCs, idempotently.
--
-- ROLLBACK
-- ========
-- Commented-out block at the bottom restores the previous function bodies
-- via CREATE OR REPLACE. NOTE — IMPORTANT: rollback only restores the SQL
-- definitions. Storage objects that were deleted by this migration between
-- the apply time and the rollback time are NOT recoverable from Supabase
-- point-in-time-recovery (PITR). PITR covers Postgres state only; the
-- storage subsystem is a separate service and Supabase does not snapshot
-- bucket contents. Treat this migration as one-way for the storage side.
--
-- IDEMPOTENT
-- ==========
-- Both functions use CREATE OR REPLACE FUNCTION. Safe to re-run; each apply
-- simply re-installs the same body. No new tables, columns, indexes, or
-- cron jobs are introduced, so no IF NOT EXISTS guards are needed.
--
-- PERMISSIONS — DECISION FOR SKY (see DECISIONS / ASSUMPTIONS #1 below)
-- ====================================================================
-- Both functions are SECURITY DEFINER. They are owned by the Postgres
-- superuser role (the default owner when running migrations via the
-- Supabase SQL editor as the project owner). On Supabase, the postgres
-- role normally has full DML on storage.objects — but Sky should verify
-- before applying. GRANT statements are included as a no-op safety net.
--
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- =======================================
-- 1. (PERMISSIONS) On Supabase the `postgres` role typically owns
--    `storage.objects` and has full DML by default. SECURITY DEFINER
--    functions execute as their owner (postgres), so the storage delete
--    should "just work" once Sky applies this migration via the dashboard
--    SQL editor (which runs as postgres). The GRANT DELETE ON
--    storage.objects TO postgres at the bottom is a defensive no-op if
--    the grant already exists. If Sky's project for some reason restricts
--    postgres on storage.objects, apply will raise; report and we'll fix.
-- 2. (NULL photo_url) Resources can be posted without a photo (photo-
--    optional flow per AddResource Cycle 4). The storage sweep filters on
--    `photo_url IS NOT NULL` so a null path never reaches the DELETE.
-- 3. (Malformed path) photo_url is documented as the bucket-relative path
--    `<userId>/<timestamp>.jpg` (storage.foldername(name)[1] = userId).
--    If a caller historically stored a full URL or a junk string in
--    photo_url, the DELETE on storage.objects simply matches zero rows
--    and is a no-op. No exception, no rollback needed — orphans would
--    persist but that's a pre-existing data-shape issue, not a regression.
-- 4. (Concurrent claims/deletes) delete_my_account() already locks
--    auth.users WHERE id = me FOR UPDATE before any work; that lock is
--    preserved and now also serializes the storage sweep so we cannot
--    race with another transaction inserting a new photo for the same user.
-- 5. (prune_expired_resources storage sweep ordering) Storage delete must
--    run BEFORE the row delete. If row delete ran first inside a CTE, the
--    photo_url values would be gone from the visible state by the time we
--    collected them. The CTE pattern below collects paths from a SELECT
--    that targets the SAME WHERE clause the existing DELETE used; then
--    issues storage DELETE; THEN issues the row DELETE. Two-step rather
--    than single-CTE to keep the dependency obvious.
-- 6. (Logging format) cron_log.rows_affected continues to record the row
--    count (so existing dashboards and the 36h freshness alert are
--    unaffected). The storage-object count is packed into error_text as
--    'storage_deleted=<N>' with success=true. error_text is otherwise
--    reserved for SQLERRM on failure; the prefix is unambiguous and
--    parseable. If Sky prefers a dedicated column, that's a Cycle 5
--    schema migration (add cron_log.storage_rows_affected INTEGER).
-- 7. (delete_my_account return value + RAISE NOTICE) The existing
--    function returns BOOLEAN true on success and raises 'Not authenticated'
--    if auth.uid() is NULL. Both behaviors are preserved verbatim. No
--    RAISE NOTICE lines existed in the original; none added (silent
--    success is the established pattern for both RPCs).

-- ============================================================================
-- 1. delete_my_account() — sweeps Storage objects before row cascade
-- ============================================================================
-- Same signature + return type as supabase/schema.sql:365. The body now does
-- the storage sweep before the cascading auth.users delete. All work happens
-- inside a single function body, which is its own implicit transaction when
-- called via the RPC interface; the inner BEGIN…EXCEPTION block lets us
-- fail-loud (re-raise) so PostgREST returns the error to the client and the
-- caller knows the delete did not complete.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  me UUID;
  storage_deleted INTEGER := 0;
BEGIN
  me := auth.uid();
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- S5: lock the row first to serialize concurrent deletes/claims/posts.
  -- Preserved verbatim from schema.sql.
  PERFORM 1 FROM auth.users WHERE id = me FOR UPDATE;

  BEGIN
    -- C2 fix: collect and delete Storage objects FIRST, then row cascade.
    -- A resource may have photo_url IS NULL (photo-optional posts); filter
    -- those out so we don't issue a no-op DELETE on a null path.
    WITH paths AS (
      SELECT photo_url
      FROM public.resources
      WHERE posted_by = me
        AND photo_url IS NOT NULL
    ),
    storage_swept AS (
      DELETE FROM storage.objects
      USING paths
      WHERE storage.objects.bucket_id = 'resource-photos'
        AND storage.objects.name = paths.photo_url
      RETURNING storage.objects.id
    )
    SELECT COUNT(*) INTO storage_deleted FROM storage_swept;

    -- Delete my posted resources (rows). Storage already swept above.
    DELETE FROM public.resources WHERE posted_by = me;

    -- Free up resources I had claimed but not yet picked up.
    -- Preserved verbatim from schema.sql.
    UPDATE public.resources SET claimed_by = NULL, status = 'available'
    WHERE claimed_by = me AND status = 'reserved';

    -- Cascade: auth.users delete → public.users (FK ON DELETE CASCADE) → orphans
    -- Preserved verbatim from schema.sql.
    DELETE FROM auth.users WHERE id = me;

    RETURN true;

  EXCEPTION
    WHEN OTHERS THEN
      -- Fail-loud: if storage sweep OR row cascade fails, roll back the
      -- entire inner BEGIN block and re-raise so the client sees a real
      -- error (rather than a half-deleted account). The outer FOR UPDATE
      -- lock is released when the function exits.
      RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION public.delete_my_account() IS
  'Atomic account hard-delete (PRIVACY.md D6 + S5). Sweeps resource-photos Storage objects for my resources BEFORE the row cascade (Steve C2 fix, migration 003). Returns true on success; raises on auth failure or partial-failure mid-cascade.';

-- ============================================================================
-- 2. prune_expired_resources() — sweeps Storage objects for expired rows
-- ============================================================================
-- Same signature as supabase/schema.sql:430. Storage sweep first, row delete
-- second, log BOTH counts via cron_log (rows_affected = row count;
-- error_text = 'storage_deleted=<N>' on success). On error the existing
-- exception handler still fires.

CREATE OR REPLACE FUNCTION public.prune_expired_resources()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER := 0;
  storage_deleted INTEGER := 0;
BEGIN
  -- C3 fix: snapshot the set of expired rows ONCE so the storage sweep and
  -- the row delete operate on the same set without racing. A temp table is
  -- the cleanest way to share the row set between two separate statements
  -- without re-evaluating the WHERE clause (and risking a row aging in/out
  -- of "expired" between the two reads).
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

  -- Storage sweep BEFORE row delete. Filter out NULL paths.
  WITH storage_swept AS (
    DELETE FROM storage.objects
    USING _prune_targets t
    WHERE storage.objects.bucket_id = 'resource-photos'
      AND t.photo_url IS NOT NULL
      AND storage.objects.name = t.photo_url
    RETURNING storage.objects.id
  )
  SELECT COUNT(*) INTO storage_deleted FROM storage_swept;

  -- Row delete using the same target set.
  WITH deleted AS (
    DELETE FROM public.resources r
    USING _prune_targets t
    WHERE r.id = t.id
    RETURNING r.id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  -- Log both counts. rows_affected preserves prior semantics (downstream
  -- 36h freshness alert keys off success + ran_at, not row count).
  -- error_text carries the storage count when success=true; this is a
  -- documented format (DECISION #6 in migration 003 header).
  INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
  VALUES (
    'prune_expired_resources',
    deleted_count,
    true,
    'storage_deleted=' || storage_deleted::TEXT
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Preserved verbatim from schema.sql: log failure then re-raise so
    -- pg_cron records the failure and Sky's freshness alert fires.
    INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
    VALUES ('prune_expired_resources', 0, false, SQLERRM);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.prune_expired_resources() IS
  '30-day retention sweep (PRIVACY.md D7 + S6). Deletes expired resource Storage objects BEFORE row delete (Steve C3 fix, migration 003). Logs row count to cron_log.rows_affected and storage count to cron_log.error_text as "storage_deleted=<N>" on success.';

-- ============================================================================
-- 3. Permissions safety net — see DECISIONS / ASSUMPTIONS #1
-- ============================================================================
-- Both functions are SECURITY DEFINER and execute as their owner (postgres
-- on Supabase). The postgres role normally has full DML on storage.objects;
-- the GRANT below is a defensive no-op if the grant already exists. If the
-- migration fails on this line, Sky should report the exact error so we can
-- diagnose what storage.objects is locked down to in this project.

DO $$
BEGIN
  -- Best-effort grant; safe if already granted, harmless if not needed.
  EXECUTE 'GRANT DELETE ON storage.objects TO postgres';
EXCEPTION
  WHEN insufficient_privilege THEN
    -- Sky is not running this as the owner of storage.objects. Surface a
    -- NOTICE rather than failing the migration — the functions themselves
    -- still install. If they then fail at call time with permission denied,
    -- Sky knows where to look.
    RAISE NOTICE 'GRANT DELETE ON storage.objects TO postgres skipped (insufficient privilege). Verify owner of storage.objects in Supabase dashboard.';
  WHEN OTHERS THEN
    RAISE NOTICE 'GRANT DELETE ON storage.objects TO postgres skipped (%). Verify in dashboard if storage sweeps fail.', SQLERRM;
END;
$$;

-- Re-affirm EXECUTE on the two functions for authenticated callers
-- (PostgREST). The schema.sql GRANT EXECUTE on these RPCs already covers
-- this for the prior bodies; CREATE OR REPLACE preserves grants, but
-- spelling it out is defensive and harmless.
GRANT EXECUTE ON FUNCTION public.delete_my_account()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.prune_expired_resources()  TO postgres;

-- ============================================================================
-- TEST STUB — Steve / Gary should add a test scenario in supabase/__tests__/rls.sql
-- ============================================================================
-- Add a new scenario (e.g. T10) wrapped in BEGIN; ROLLBACK; like the existing
-- RLS tests, that:
--
--   1. Inserts a public.users row (uid_A) marked is_verified=true.
--   2. Inserts a storage.objects row at bucket_id='resource-photos',
--      name='<uid_A>/123.jpg'.
--   3. Inserts a public.resources row with posted_by=uid_A,
--      photo_url='<uid_A>/123.jpg'.
--   4. SET LOCAL request.jwt.claim.sub = '<uid_A>'  (simulate authenticated)
--   5. SELECT public.delete_my_account();
--   6. Asserts storage.objects has zero rows matching name='<uid_A>/123.jpg'
--      AND public.resources has zero rows for posted_by=uid_A.
--
-- Add a second scenario (T11) for prune_expired_resources:
--   1. Insert a public.users row (uid_B) is_verified=true.
--   2. Insert storage.objects row name='<uid_B>/abc.jpg'.
--   3. Insert public.resources row posted_by=uid_B, photo_url='<uid_B>/abc.jpg',
--      status='available', created_at = now() - INTERVAL '31 days'.
--   4. SELECT public.prune_expired_resources();
--   5. Assert zero storage.objects matching name='<uid_B>/abc.jpg'
--      AND zero public.resources matching posted_by=uid_B
--      AND cron_log has a new row with job_name='prune_expired_resources',
--          success=true, error_text LIKE 'storage_deleted=%'.
--
-- Add T12 (NULL photo_url edge case):
--   1. Insert a resource with photo_url=NULL and an expired created_at.
--   2. SELECT public.prune_expired_resources();
--   3. Assert the row is deleted AND no errors raised (NULL paths must be
--      silently skipped, not RAISE).

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- IMPORTANT: Rolling back the SQL definitions does NOT recover any storage
-- objects deleted between the apply and the rollback. Supabase PITR covers
-- Postgres state only; bucket contents are not snapshotted. Treat the
-- storage side as one-way.
--
-- BEGIN;
--
-- -- Restore delete_my_account() to its supabase/schema.sql:365 body.
-- CREATE OR REPLACE FUNCTION public.delete_my_account()
-- RETURNS BOOLEAN
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, auth
-- AS $$
-- DECLARE
--   me UUID;
-- BEGIN
--   me := auth.uid();
--   IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
--
--   PERFORM 1 FROM auth.users WHERE id = me FOR UPDATE;
--
--   DELETE FROM public.resources WHERE posted_by = me;
--
--   UPDATE public.resources SET claimed_by = NULL, status = 'available'
--   WHERE claimed_by = me AND status = 'reserved';
--
--   DELETE FROM auth.users WHERE id = me;
--
--   RETURN true;
-- END;
-- $$;
--
-- -- Restore prune_expired_resources() to its supabase/schema.sql:430 body.
-- CREATE OR REPLACE FUNCTION public.prune_expired_resources()
-- RETURNS VOID
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   deleted_count INTEGER;
-- BEGIN
--   WITH deleted AS (
--     DELETE FROM public.resources
--     WHERE
--       (status = 'reserved'  AND status_changed_at < now() - INTERVAL '30 days')
--       OR (status = 'available' AND created_at        < now() - INTERVAL '30 days')
--     RETURNING id
--   )
--   SELECT COUNT(*) INTO deleted_count FROM deleted;
--
--   INSERT INTO public.cron_log (job_name, rows_affected, success)
--   VALUES ('prune_expired_resources', deleted_count, true);
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
-- After rollback, Steve C2 / C3 findings are open again. Re-apply migration
-- 003 to re-enable the storage sweep.
