-- Migration 005 — Pickup confirmation (Phase 2 #7)
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24 — implements Quinn's spec:
--   qa-reports/spec-phase-2-pickup-confirmation.md
--
-- ============================================================================
-- PRIVACY NOTE — read before applying
-- ============================================================================
-- This RPC enables tracking WHO confirmed a pickup, WHEN, and WITH WHOM (via
-- the resource's existing posted_by + claimed_by). It is privacy-sensitive
-- under Constitution Art. 7.6 (lifecycle data for marginalized-group users).
--
-- Threat-model summary:
--   - `confirmed_by` is poster-OR-claimant-only. It is NEVER surfaced to
--     admins (Cycle 5 spec Section 5 enumerates 5 admin-visible fields; this
--     adds 0). AC-9 of the spec enforces this.
--   - The existing `verification_log` table audits ADMIN actions; this is
--     poster ↔ claimant data with implicit consent (you opted into the data
--     surface by posting or claiming a resource). No new audit log is
--     introduced for confirmations — the row state IS the audit trail
--     because:
--       (a) The 30-day prune already deletes the row (PRIVACY.md D7).
--       (b) Mara's anti-goal #4 ("anyone — even admins — knowing what she's
--           claimed") would be VIOLATED by adding a separate confirmation log.
--           Keeping confirmation as a column on the resource itself preserves
--           the existing delete-cascade (delete-my-account → resources
--           ON DELETE CASCADE → confirmation gone).
--   - `confirmed_by` is server-set from `auth.uid()` inside SECURITY DEFINER.
--     A malicious client cannot impersonate the other party's confirmation
--     (spec AC-10). The function signature accepts only `p_resource_id`.
--   - One-sided confirmation is sufficient (spec AC-3 + DFS-2). A bad-faith
--     poster could "confirm" a pickup that never happened to inflate Casey's
--     growth metric. Mitigation: no per-user leaderboard exists; Casey reports
--     community-level counts only. Acceptable for v1.
--   - Realtime channel `resources-feed` will publish UPDATE events with the
--     new column values. RLS on public.resources gates SELECT to verified
--     users; realtime inherits the policy. No new leak surface.
--
-- Jordan is flagged for FULL REVIEW per the spec (not the one-line sign-off
-- like migration 004). Sky must read this header + confirm DFS items before
-- applying.
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- 1. Extends the `status` CHECK constraint on `public.resources` to add a
--    third value: `'completed'`. The existing two values (`'available'`,
--    `'reserved'`) are preserved.
-- 2. Adds two new nullable columns:
--      - `confirmed_at TIMESTAMPTZ NULL` — set by the RPC on transition;
--        NULL while reserved or available.
--      - `confirmed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL`
--        — mirrors the `claimed_by` cascade rule. If the confirming user
--        later deletes their account, the column is NULLed (the resource
--        itself stays until the 30-day prune).
-- 3. Adds a partial index supporting the completed-claims query on
--    ProfileScreen and Casey's metric query:
--      `CREATE INDEX resources_confirmed_idx ON public.resources
--         (confirmed_at DESC) WHERE confirmed_at IS NOT NULL;`
-- 4. Creates the new `confirm_pickup(p_resource_id UUID) RETURNS BOOLEAN`
--    RPC (SECURITY DEFINER; modeled on the existing `claim_resource` RPC
--    pattern from supabase/schema.sql lines 397-425).
-- 5. GRANTS EXECUTE on the new RPC to the `authenticated` role.
--
-- WHY
-- ===
-- Quinn's spec covers the rationale exhaustively. The TL;DR:
--   - Casey's #1 growth metric ("successful exchanges per active community
--     per week") is unmeasurable without a "completed" lifecycle stage.
--   - PRIVACY.md D7 retention math is muddied: today every completed pickup
--     sits at `status='reserved'` for 30 days, then gets pruned by the
--     reservation-clock — conflating "successful" with "abandoned".
--   - Riley friction #2 ("stale claims that never went anywhere") is partly
--     resolved by giving users a way to close out their own listings.
--
-- INTERACTION WITH MIGRATION 003 (prune_expired_resources)
-- =========================================================
-- The 30-day prune cron defined in migration 003 currently deletes:
--   (a) status='reserved' AND status_changed_at < now() - 30d
--   (b) status='available' AND created_at < now() - 30d
--
-- After this migration applies, `status='completed'` rows are NOT pruned by
-- the current prune logic — they sit at `status='completed'` indefinitely
-- until prune is extended. **The spec (AC-8) calls for prune to also delete
-- completed rows after 30 days from `confirmed_at`.** Dana's task brief
-- for THIS migration does NOT include the prune extension — only the
-- CHECK constraint, columns, index, and RPC. Reasoning: the prune extension
-- is a separate concern (cron logic vs. row-state transition) and deserves
-- its own migration with a clean rollback story.
--
-- This migration relies on the existing `touch_status_changed_at` trigger
-- (schema.sql line 200-208) firing on the reserved→completed transition,
-- which will set `status_changed_at = now()` automatically. The RPC ALSO
-- sets `status_changed_at = now()` explicitly to be defensive — the trigger
-- runs BEFORE UPDATE and computes the same value, so the trigger's NEW.value
-- and the RPC's SET value agree. No conflict, no double-write race.
--
-- **DECISION FOR SKY (DFS-MIG5-1, see briefing):** Should migration 006
-- extend prune to handle completed rows? Quinn's spec AC-8 says yes; Dana's
-- task brief defers it. Status quo without migration 006: completed rows
-- live until the user manually deletes the listing (resources_owner_delete
-- RLS allows the poster to delete) or until account deletion cascades. This
-- is acceptable for the first week of Phase 2 to validate Casey's metric
-- query before adding more retention logic. Filed in the briefing.
--
-- ROLLBACK
-- ========
-- Commented-out block at the bottom: drops the RPC, drops the index, drops
-- the two columns, then restores the original two-value CHECK constraint.
-- WARNING: rollback fails if any rows already have `status='completed'` —
-- the restored CHECK constraint would reject them. The rollback block
-- includes a guard `IF NOT EXISTS (SELECT 1 FROM public.resources WHERE
-- status='completed')` to surface the issue rather than silently corrupt.
-- If rows exist, Sky must triage (either delete them, or transition them
-- back to 'reserved' before rolling back).
--
-- IDEMPOTENT
-- ==========
-- - `ADD COLUMN IF NOT EXISTS` on both new columns.
-- - `CREATE INDEX IF NOT EXISTS` on the partial index.
-- - `CREATE OR REPLACE FUNCTION` on the RPC.
-- - The CHECK-constraint replacement is wrapped in a DO block that drops
--   the old constraint (by canonical Postgres-generated name
--   `resources_status_check`) and recreates it with the new three-value set.
--   `IF EXISTS` on the DROP makes re-apply safe.
-- - GRANT EXECUTE is idempotent in Postgres (re-applying does not error).
--
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- =======================================
-- 1. (CONSTRAINT NAME) The original CHECK constraint name is the
--    Postgres-generated `resources_status_check` (from `status TEXT NOT NULL
--    DEFAULT 'available' CHECK (status IN (...))` in schema.sql line 134).
--    This migration drops by that name. If Sky's project happens to have a
--    different auto-generated name (rare; Postgres is deterministic about
--    these), the migration will fail loud — Sky can adjust and re-apply.
-- 2. (status_changed_at DOUBLE-SET) The RPC sets `status_changed_at = now()`
--    explicitly in the UPDATE. The existing `touch_status_changed_at`
--    trigger ALSO sets it on any status change. Both compute the same
--    `now()` (the trigger runs BEFORE UPDATE in the same statement so
--    `now()` returns the same `clock_timestamp()` value within the
--    statement). The trigger's `NEW.status_changed_at = now()` wins because
--    BEFORE-row triggers can modify NEW. No conflict, no race. Documented
--    here so future Dana doesn't strip the explicit SET thinking it's dead
--    code — it makes the RPC self-contained and survivable to trigger
--    refactors.
-- 3. (FOR UPDATE LOCK) The RPC SELECT…FOR UPDATE locks the row to serialize
--    two simultaneous confirmation calls (poster + claimant both tap at
--    once). The second call sees `status='completed'` after the first
--    commits and returns FALSE (idempotent — spec AC-3).
-- 4. (ERROR MESSAGE STRINGS) The RPC raises three distinct error messages
--    ("Not authenticated", "Resource not found", "Resource is not reserved",
--    "Not authorized"). These match the spec's error-mapping table
--    (spec §"Error mapping"); the client-side `userFacingErrorMessage`
--    helper (src/lib/errors.ts) keys off these exact strings. Do not change
--    without coordinating with Shamus's UI work.
-- 5. (POSTER vs CLAIMANT) Either may confirm. Task-brief logic step 2:
--    "Check caller is posted_by OR claimed_by; else RAISE EXCEPTION 'Not
--    authorized'." Implemented as `IF caller NOT IN (poster, claimant)
--    THEN RAISE`. NULL safety: if `claimed_by IS NULL` the row's status is
--    'available' which is caught by the earlier status check (raises
--    'Resource is not reserved'). The `NOT IN` against a NULL would yield
--    UNKNOWN; defensive `COALESCE(claimant, '00000000-...'::uuid)` is used
--    to make the check explicit.
-- 6. (PRUNE EXTENSION DEFERRED) See "INTERACTION WITH MIGRATION 003" above
--    and DFS-MIG5-1 in the briefing. The spec's AC-8 prune extension is
--    intentionally NOT in this migration. If Sky wants it now, a follow-up
--    migration 006 is the right shape; this migration's apply does not
--    block on it.
-- 7. (GRANT EXECUTE) Mirrors the schema.sql pattern: the existing
--    `claim_resource` RPC is granted to `authenticated` via the
--    implicit PostgREST grant (no explicit GRANT in schema.sql today).
--    Migration 003 added an explicit `GRANT EXECUTE ON FUNCTION ...
--    TO authenticated` for the two functions it touched. This migration
--    follows that explicit pattern.

-- ============================================================================
-- 1. Extend the status CHECK constraint to include 'completed'
-- ============================================================================
-- Postgres CHECK constraints can't be ALTER'd in place — drop and recreate.
-- The canonical name is `resources_status_check` (Postgres-generated).

ALTER TABLE public.resources
  DROP CONSTRAINT IF EXISTS resources_status_check;

ALTER TABLE public.resources
  ADD CONSTRAINT resources_status_check
  CHECK (status IN ('available', 'reserved', 'completed'));

COMMENT ON CONSTRAINT resources_status_check ON public.resources
  IS 'Allowed status values: available | reserved | completed. ''completed'' added in migration 005 (Phase 2 pickup confirmation).';

-- ============================================================================
-- 2. Add confirmed_at + confirmed_by columns
-- ============================================================================
-- Both are nullable; populated by confirm_pickup() on the
-- reserved → completed transition. `confirmed_by` mirrors `claimed_by`'s
-- ON DELETE SET NULL cascade rule: if the confirming user later deletes
-- their account, the column is NULLed and the resource row survives until
-- the 30-day prune (or the poster's own delete cascade, whichever fires
-- first).

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL;

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS confirmed_by UUID NULL
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.resources.confirmed_at IS
  'Set by confirm_pickup() RPC on reserved→completed transition. NULL for available/reserved rows. See qa-reports/spec-phase-2-pickup-confirmation.md.';

COMMENT ON COLUMN public.resources.confirmed_by IS
  'auth.uid() of the user (poster OR claimant) who called confirm_pickup(). Server-set inside SECURITY DEFINER; never client-supplied (spec AC-10). NULL until confirmed.';

-- ============================================================================
-- 3. Partial index on confirmed_at — supports completed-claims queries
-- ============================================================================
-- Query shapes supported:
--   (a) ProfileScreen "Completed claims (last 30 days)":
--       WHERE claimed_by = $uid
--         AND status = 'completed'
--         AND confirmed_at > now() - INTERVAL '30 days'
--       ORDER BY confirmed_at DESC
--   (b) Casey's growth metric:
--       SELECT count(*) FROM public.resources
--       WHERE status = 'completed'
--         AND confirmed_at > now() - INTERVAL '7 days'
--   (c) Future prune extension (migration 006 if approved):
--       WHERE status = 'completed'
--         AND confirmed_at < now() - INTERVAL '30 days'
--
-- The partial predicate (`WHERE confirmed_at IS NOT NULL`) keeps the index
-- small — only completed rows are indexed, the available/reserved majority
-- is excluded.

CREATE INDEX IF NOT EXISTS resources_confirmed_idx
  ON public.resources (confirmed_at DESC)
  WHERE confirmed_at IS NOT NULL;

COMMENT ON INDEX public.resources_confirmed_idx IS
  'Partial index on confirmed_at (DESC), filtered to non-NULL. Supports ProfileScreen completed-list, Casey''s metric query, and the future completed-row prune extension. See migration 005.';

-- ============================================================================
-- 4. confirm_pickup() RPC — modeled after claim_resource (schema.sql L397-425)
-- ============================================================================
-- Same SECURITY DEFINER + SELECT…FOR UPDATE pattern as claim_resource.
-- The parameter name `p_resource_id` uses the `p_` prefix per a common
-- convention (claim_resource uses `resource_id` without prefix; both are
-- legal). The `p_` prefix avoids any potential shadowing with the column
-- name `id` inside the function body. Sky / Steve may prefer `resource_id`
-- for consistency with claim_resource — easy rename, no callers yet.

CREATE OR REPLACE FUNCTION public.confirm_pickup(p_resource_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller UUID;
  poster UUID;
  claimant UUID;
  current_status TEXT;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the row, read state. Mirrors claim_resource (schema.sql line 412-413).
  SELECT posted_by, claimed_by, status
    INTO poster, claimant, current_status
  FROM public.resources
  WHERE id = p_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource not found';
  END IF;

  -- Authorization: caller must be either the poster or the claimant.
  -- claimant may be NULL if the row was somehow re-set to available
  -- (defensive — current schema prevents this, but COALESCE keeps the
  -- comparison total).
  IF caller NOT IN (poster, COALESCE(claimant, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Status must be 'reserved' to confirm. 'completed' returns false silently
  -- (idempotent — spec AC-3). 'available' raises (wrong state — spec AC-4).
  IF current_status = 'completed' THEN
    RETURN FALSE;
  END IF;
  IF current_status <> 'reserved' THEN
    RAISE EXCEPTION 'Resource not in reserved state';
  END IF;

  -- Transition reserved → completed.
  -- status_changed_at is set explicitly here even though touch_status_changed_at
  -- (schema.sql L200-208) ALSO sets it via BEFORE UPDATE OF status trigger.
  -- The two writes agree (same statement, same now()); the trigger's NEW
  -- assignment overrides this one. Kept here for self-documentation and
  -- to make the RPC survivable if the trigger is ever refactored.
  -- See DECISIONS / ASSUMPTIONS #2 in this migration's header.
  UPDATE public.resources
  SET
    status = 'completed',
    confirmed_at = now(),
    confirmed_by = caller,
    status_changed_at = now()
  WHERE id = p_resource_id;

  RETURN TRUE;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with context. PostgREST converts RAISE to a structured
    -- error the client can match on error.message.
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.confirm_pickup(UUID) IS
  'Phase 2 pickup confirmation (spec qa-reports/spec-phase-2-pickup-confirmation.md). Caller must be poster or claimant. Transitions reserved→completed; sets confirmed_at, confirmed_by, status_changed_at. Idempotent: re-call on a completed row returns FALSE without modifying state. Raises ''Not authenticated'' | ''Resource not found'' | ''Resource not in reserved state'' | ''Not authorized''.';

-- ============================================================================
-- 5. GRANT EXECUTE — same pattern as migration 003
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.confirm_pickup(UUID) TO authenticated;

-- ============================================================================
-- TEST STUB — Steve / Gary should add scenarios in supabase/__tests__/rls.sql
-- ============================================================================
-- Recommended scenarios (wrap each in BEGIN; ROLLBACK; like the existing
-- T1-T9 patterns):
--
--   T-CONF-1: Poster confirms own reserved resource → returns TRUE,
--             status='completed', confirmed_at set, confirmed_by=poster_uid.
--   T-CONF-2: Claimant confirms a resource they claimed → returns TRUE.
--   T-CONF-3: Second confirmation on a completed row → returns FALSE,
--             no row mutation (confirmed_by remains the first caller's uid).
--   T-CONF-4: Third-party verified user calls confirm_pickup on a row
--             they're not on → RAISE 'Not authorized'. Assert SQLSTATE.
--   T-CONF-5: Unauthenticated client → RAISE 'Not authenticated'.
--   T-CONF-6: confirm_pickup on an 'available' (unclaimed) row →
--             RAISE 'Resource not in reserved state'.
--   T-CONF-7: confirm_pickup on a non-existent UUID → RAISE 'Resource not found'.
--   T-CONF-8: Race: two simultaneous calls (poster + claimant). The FOR UPDATE
--             lock serializes; first returns TRUE, second returns FALSE.
--             Hard to write deterministically in SQL — Gary may simulate via
--             pg_advisory_lock or skip with a comment pointing to manual test.
--   T-CONF-9: confirmed_by ON DELETE SET NULL — the user who confirmed
--             deletes their account; their row's confirmed_by is set to NULL;
--             the resource itself is untouched.
--   T-CONF-10: CHECK constraint — INSERT with status='completed' and the
--              existing resources_verified_insert RLS still permits it (the
--              CHECK isn't an RLS gate; the insert path is gated by RLS,
--              and a verified user can in principle insert a row at
--              'completed' from day one — defensible because the use case
--              is admin-only via dashboard, not via client. If this is a
--              concern, add an RLS WITH CHECK clause restricting INSERT
--              status to 'available' in a future migration).

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- WARNING: this rollback will FAIL if any rows already have status='completed'
-- (the restored CHECK constraint would reject them). The guard below surfaces
-- the conflict explicitly.
--
-- BEGIN;
--
--   -- 0. Sanity check — abort if completed rows exist.
--   DO $$
--   BEGIN
--     IF EXISTS (SELECT 1 FROM public.resources WHERE status = 'completed') THEN
--       RAISE EXCEPTION 'Cannot roll back migration 005 — rows with status=''completed'' exist. Triage first: either delete those rows, or UPDATE them back to ''reserved'' before retrying.';
--     END IF;
--   END;
--   $$;
--
--   -- 1. Drop the RPC.
--   DROP FUNCTION IF EXISTS public.confirm_pickup(UUID);
--
--   -- 2. Drop the partial index.
--   DROP INDEX IF EXISTS public.resources_confirmed_idx;
--
--   -- 3. Drop the two columns (CASCADE-safe; nothing depends on them by name).
--   ALTER TABLE public.resources DROP COLUMN IF EXISTS confirmed_by;
--   ALTER TABLE public.resources DROP COLUMN IF EXISTS confirmed_at;
--
--   -- 4. Restore the original two-value CHECK constraint.
--   ALTER TABLE public.resources
--     DROP CONSTRAINT IF EXISTS resources_status_check;
--   ALTER TABLE public.resources
--     ADD CONSTRAINT resources_status_check
--     CHECK (status IN ('available', 'reserved'));
--
-- COMMIT;
--
-- After rollback the Phase 2 pickup-confirmation feature is offline. The UI
-- (Shamus's ResourceDetailScreen Confirm button) will see a missing RPC and
-- error out — Shamus's code should fail-soft (button disappears or shows
-- "feature unavailable"). Re-apply migration 005 to re-enable.
