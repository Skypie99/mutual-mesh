-- Migration 002 — Inactive-admin auto-suspend (30-day threshold)
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24 — converts Steve's S-CYC1-1 draft into a numbered migration
-- Source: qa-reports/2026-05-23_security-cycle-1.md (finding S-CYC1-1)
-- Privacy authority: PRIVACY.md Q4 (resolved 2026-05-23 by Sky:
--   "auto-suspend after inactivity; Steve drafts the exact threshold + reinstatement flow.
--    Starting point ~30 days no-action → suspended, reinstated on request.")
--
-- WHAT IT DOES
-- ============
-- Adds a nightly pg_cron job (`auto_suspend_inactive_admins_nightly`) that demotes
-- any admin whose `public.users.last_active_at` is older than 30 days. The job
-- runs at 03:15 UTC, staggered 15 minutes after `prune_expired_resources_nightly`
-- (03:00 UTC) so they don't contend for the same cron worker slot.
--
-- A demotion clears `is_admin = false`. It does NOT touch `is_verified` — a
-- demoted admin remains a regular verified user with full marketplace access.
-- Every demotion is recorded twice:
--   1. One row per demoted user in `public.verification_log` (reason='inactive_30d',
--      decision='demote'). This is the per-user audit trail Sky reads.
--   2. One summary row per cron run in `public.cron_log` (rows_affected = count,
--      success = true/false). This is the job-observability signal (S6).
--
-- WHY
-- ===
-- D9 + PRIVACY.md Q4: admin power is a privacy attack surface. An admin who has
-- not opened the app in 30 days is unlikely to be actively verifying users, but
-- their `is_admin = true` still gives them read access to the unverified-user
-- queue (PII: email, chosen handle, postal prefix). Auto-demoting reduces the
-- standing attack surface without disrupting users (they keep marketplace access).
--
-- The `protect_admin_flags` trigger blocks authenticated UPDATE on is_admin, but
-- this function is SECURITY DEFINER and runs as service_role under pg_cron, so it
-- bypasses the trigger by virtue of `auth.role()` not being 'authenticated'.
--
-- REINSTATEMENT — SERVICE-ROLE ONLY (D9 + S-CYC1-1)
-- =================================================
-- There is intentionally NO RPC to re-instate a demoted admin. Re-instatement is
-- service-role only, performed by Sky via the Supabase dashboard SQL editor:
--
--     UPDATE public.users SET is_admin = true WHERE id = '<user-uuid>';
--
-- Mirrors the original admin-promotion path (D9). Adding a self-serve RPC would
-- create a privilege-escalation attack surface: any compromise of an admin
-- account, or any bug in the RPC's caller check, would let a non-Sky user
-- restore admin rights. Service-role-only keeps the trust boundary at Sky.
--
-- ROLLBACK
-- ========
-- See the commented-out block at the bottom of this file. Drops the cron job and
-- the function. The verification_log rows are NOT deleted on rollback — they are
-- append-only audit evidence (S8). The CHECK-constraint change on
-- verification_log is also reverted in the rollback block.
--
-- IDEMPOTENT
-- ==========
-- All CREATE statements use `OR REPLACE` / `IF NOT EXISTS`. The cron.schedule
-- call is guarded by a `WHERE NOT EXISTS` check against cron.job so re-running
-- this file does not raise on a duplicate schedule.
--
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- =======================================
-- 1. Steve's draft used decision='approve|reject|escalate' values in
--    verification_log. The current schema.sql CHECK constraint on
--    verification_log.decision rejects any other value. This migration extends
--    the constraint to include 'demote'. If Sky prefers a different value (e.g.
--    'auto_demote', 'suspend'), change the literal in both the ALTER CONSTRAINT
--    and the INSERT statement before applying. Recommended: 'demote' — concise
--    and parallel to 'approve'/'reject'.
-- 2. Steve's draft named the function `suspend_inactive_admins`. This migration
--    uses `auto_suspend_inactive_admins` per Dana's task brief — the `auto_`
--    prefix signals "machine-driven, not user-callable" and helps Sky tell at a
--    glance that there's no UI surface for this.
-- 3. The function does NOT email/notify demoted admins. Constitution Art. 9
--    restricts external side effects to Morgan-only. If Sky decides demoted
--    admins should be told, that's a Cycle 5+ feature (admin tool) — they would
--    see the demotion the next time they open the app, since their unverified-
--    queue tab would simply not load.
-- 4. The 30-day threshold is hardcoded as an INTERVAL literal. If Sky wants this
--    tunable, the right place is a row in public.config (e.g.
--    `admin_inactivity_days = '30'`) read inside the function. Not done here
--    because the only known caller is Sky, who can change the literal and
--    re-apply this migration in 30 seconds.
-- 5. last_active_at is updated by `touch_my_last_active()` on app foreground.
--    If an admin uses the dashboard SQL editor to approve users instead of the
--    app, their last_active_at will NOT be touched and they may be demoted
--    despite being active. Acceptable per D9 (admin tool ships Cycle 5; until
--    then, Sky is the only admin and Sky can re-instate themselves in one SQL
--    statement).

-- ============================================================================
-- 1. Extend verification_log.decision CHECK constraint to allow 'demote'
-- ============================================================================
-- The schema-applied constraint name is auto-generated by Postgres
-- (typically `verification_log_decision_check`). Drop-and-recreate by name.

ALTER TABLE public.verification_log
  DROP CONSTRAINT IF EXISTS verification_log_decision_check;

ALTER TABLE public.verification_log
  ADD CONSTRAINT verification_log_decision_check
  CHECK (decision IN ('approve', 'reject', 'escalate', 'demote'));

COMMENT ON CONSTRAINT verification_log_decision_check ON public.verification_log
  IS 'Allowed decisions: approve, reject, escalate (admin-actioned) + demote (auto-suspend via auto_suspend_inactive_admins).';

-- ============================================================================
-- 2. auto_suspend_inactive_admins() — SECURITY DEFINER, service-role caller
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_suspend_inactive_admins()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demoted_count INTEGER;
BEGIN
  -- Capture per-user demotions in verification_log (append-only S8).
  -- admin_id is NULL because the actor is the cron job, not a human admin.
  -- decision='demote', reason='inactive_30d' — see DECISIONS / ASSUMPTIONS #1 above.
  WITH demoted AS (
    UPDATE public.users
    SET is_admin = false
    WHERE is_admin = true
      AND last_active_at < now() - INTERVAL '30 days'
    RETURNING id
  ),
  logged AS (
    INSERT INTO public.verification_log (applicant_id, admin_id, decision, reason, decided_at)
    SELECT id, NULL, 'demote', 'inactive_30d', now() FROM demoted
    RETURNING 1
  )
  SELECT COUNT(*) INTO demoted_count FROM logged;

  -- Summary row for cron observability (S6). One row per nightly run.
  INSERT INTO public.cron_log (job_name, rows_affected, success)
  VALUES ('auto_suspend_inactive_admins', demoted_count, true);

EXCEPTION
  WHEN OTHERS THEN
    -- Mirror prune_expired_resources error handling: log failure then re-raise
    -- so the cron worker records the failure and Sky's <36h freshness alert fires.
    INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
    VALUES ('auto_suspend_inactive_admins', 0, false, SQLERRM);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.auto_suspend_inactive_admins() IS
  'Nightly cron: demotes admins whose last_active_at is >30d stale. Logs each demotion to verification_log (reason=inactive_30d, decision=demote) and a summary to cron_log. service_role-only via SECURITY DEFINER; bypasses protect_admin_flags. Re-instatement is service-role manual UPDATE only (see migration 002 header).';

-- ============================================================================
-- 3. Schedule the cron job — 03:15 UTC nightly (staggered from 03:00 prune)
-- ============================================================================
-- Guard the schedule call so re-running this migration does not raise.
-- cron.job is the live job registry; if a row with this jobname already exists
-- the schedule call would fail. Wrap in a DO block with a NOT EXISTS check.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_suspend_inactive_admins_nightly') THEN
    PERFORM cron.schedule(
      'auto_suspend_inactive_admins_nightly',
      '15 3 * * *',
      $cron$SELECT public.auto_suspend_inactive_admins();$cron$
    );
  END IF;
END;
$$;

-- ============================================================================
-- TEST STUB — Steve should add a test scenario in supabase/__tests__/rls.sql
-- ============================================================================
-- Add a new test scenario, e.g. T9, that:
--   1. Inserts a public.users row with is_admin=true and last_active_at=now() - INTERVAL '31 days'
--   2. Calls SELECT public.auto_suspend_inactive_admins();
--   3. Asserts the row now has is_admin=false
--   4. Asserts a verification_log row was inserted with decision='demote' and reason='inactive_30d'
--   5. Asserts a cron_log row was inserted with job_name='auto_suspend_inactive_admins', success=true
--   6. (Negative) Inserts an admin with last_active_at=now() and confirms it is NOT demoted on a second call.
-- Wrap the whole scenario in BEGIN; ROLLBACK; like the other RLS tests so
-- fixtures don't leak. The new 'demote' decision value should also be covered
-- in the existing verification_log append-only test (T8 in cycle-1 suite).

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- To undo this migration entirely:
--
-- BEGIN;
--
--   -- 1. Unschedule the cron job. cron.unschedule by jobname.
--   SELECT cron.unschedule('auto_suspend_inactive_admins_nightly');
--
--   -- 2. Drop the function.
--   DROP FUNCTION IF EXISTS public.auto_suspend_inactive_admins();
--
--   -- 3. Revert the verification_log.decision CHECK constraint to the original
--   --    three-value set. NOTE: This will FAIL if any verification_log rows
--   --    already have decision='demote' — those are audit evidence and must be
--   --    preserved (S8 append-only). If demote rows exist, leave the four-value
--   --    constraint in place; only roll back the function + cron schedule.
--   ALTER TABLE public.verification_log
--     DROP CONSTRAINT IF EXISTS verification_log_decision_check;
--   ALTER TABLE public.verification_log
--     ADD CONSTRAINT verification_log_decision_check
--     CHECK (decision IN ('approve', 'reject', 'escalate'));
--
-- COMMIT;
--
-- Re-apply this migration to re-enable the auto-suspend.
