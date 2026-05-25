-- Migration 013 — Fix verification_log.applicant_id FK: CASCADE → SET NULL
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-25
-- References:
--   Steve security sweep finding: MEDIUM — reject_user audit rows silently deleted
--   reject_user RPC: supabase/schema.sql lines ~333–360
--   Original FK definition: supabase/schema.sql line 94
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- Fixes a MEDIUM-severity bug in the reject_user RPC's interaction with the
-- verification_log.applicant_id foreign key constraint.
--
-- THE BUG
-- -------
-- The original schema defines:
--
--   applicant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
--
-- The reject_user RPC operates in this order:
--   1. INSERT into verification_log (applicant_id = the rejected user's UUID)
--   2. DELETE FROM auth.users WHERE id = applicant_id
--
-- Step 2 cascades: auth.users delete → public.users delete (FK cascade) →
-- verification_log delete (FK cascade on applicant_id). The just-inserted
-- audit row is silently wiped out. Rejections leave NO trace in the audit log.
-- Approvals are unaffected (approve_user does not delete the auth.users row).
--
-- THE FIX
-- -------
-- Change the FK to ON DELETE SET NULL. When the public.users row is deleted
-- (via cascade from auth.users), the verification_log.applicant_id column is
-- set to NULL rather than deleting the row. The audit record is preserved.
-- The column must be nullable (NOT NULL removed) to support SET NULL.
--
-- After this migration:
--   - Approved-user log rows: applicant_id = the user's UUID (user still exists)
--   - Rejected-user log rows: applicant_id = NULL (user deleted; audit intact)
--   - decision + admin_id + reason + decided_at columns: all preserved
--
-- Sky can JOIN verification_log to any external user-identity log via
-- decided_at + admin_id if the original UUID is ever needed for forensics.
--
-- WHAT IT DOES NOT TOUCH
-- ======================
-- - reject_user() RPC body: unchanged. The INSERT-then-DELETE order is
--   preserved; the FK change makes that order safe.
-- - approve_user() RPC: unchanged and unaffected.
-- - RLS policies on verification_log: unchanged.
-- - Any other table, function, index, or policy.
--
-- ROLLBACK
-- ========
-- Commented-out block at the bottom restores the original CASCADE behavior.
-- WARNING: rolling back will re-introduce the silent-deletion bug. Only roll
-- back if this migration causes an unexpected issue; fix forward instead.
--
-- IDEMPOTENT
-- ==========
-- Both the DROP CONSTRAINT and ADD CONSTRAINT steps are wrapped in DO blocks
-- that check pg_constraint before acting. Safe to re-run.
--
-- Constitution Art. 5: This is a FILE. Dana writes; Sky applies via the
-- Supabase dashboard SQL editor. Never applied to a live database by any agent.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1 — Make applicant_id nullable
-- ============================================================================
-- The column is currently NOT NULL. ON DELETE SET NULL requires the column to
-- accept NULL. Alter before re-adding the FK.

ALTER TABLE public.verification_log
  ALTER COLUMN applicant_id DROP NOT NULL;

COMMENT ON COLUMN public.verification_log.applicant_id IS
  'UUID of the user who was reviewed. NULL after the user is deleted '
  '(ON DELETE SET NULL — see migration 013). Audit row is retained; '
  'applicant_id becomes NULL when auth.users row is cascade-deleted '
  '(e.g. after reject_user RPC). Decision, admin_id, reason, and '
  'decided_at are always preserved regardless of user deletion.';

-- ============================================================================
-- STEP 2 — Drop the existing CASCADE FK and re-add as SET NULL
-- ============================================================================
-- Postgres auto-names the FK as verification_log_applicant_id_fkey when the
-- table was created with an inline REFERENCES clause (schema.sql line 94).
-- We drop by name and re-add explicitly to control the new behavior.

DO $$
BEGIN
  -- Drop existing FK (named by Postgres convention for inline REFERENCES)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname  = 'verification_log_applicant_id_fkey'
      AND conrelid = 'public.verification_log'::regclass
      AND contype  = 'f'
  ) THEN
    ALTER TABLE public.verification_log
      DROP CONSTRAINT verification_log_applicant_id_fkey;
  END IF;

  -- Re-add as ON DELETE SET NULL
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname  = 'verification_log_applicant_id_fkey'
      AND conrelid = 'public.verification_log'::regclass
      AND contype  = 'f'
  ) THEN
    ALTER TABLE public.verification_log
      ADD CONSTRAINT verification_log_applicant_id_fkey
        FOREIGN KEY (applicant_id)
        REFERENCES public.users(id)
        ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT verification_log_applicant_id_fkey ON public.verification_log IS
  'ON DELETE SET NULL (migration 013). Preserves audit rows when the reviewed '
  'user is deleted. Previously ON DELETE CASCADE, which silently deleted the '
  'reject_user audit row immediately after it was inserted (Steve MEDIUM finding, '
  '2026-05-25). Approvals are unaffected; rejected users leave a NULL applicant_id '
  'row with decision=''reject'', reason, admin_id, and decided_at intact.';

COMMIT;

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- Unwinds in reverse order. After rollback, rejections are silently unlogged
-- again (the Steve MEDIUM finding is un-fixed). Fix forward instead of rolling
-- back whenever possible.
--
-- WARNING: If any verification_log rows already have applicant_id = NULL
-- (i.e., this migration has been live and reject_user has fired), rolling
-- back will not recover the original UUID — it is gone. Roll back ONLY before
-- any user has been rejected through the admin screen.
--
-- BEGIN;
--
--   -- 1. Drop the SET NULL FK.
--   ALTER TABLE public.verification_log
--     DROP CONSTRAINT IF EXISTS verification_log_applicant_id_fkey;
--
--   -- 2. Restore NOT NULL on applicant_id.
--   --    CAUTION: this will FAIL if any rows already have applicant_id = NULL.
--   --    Check first: SELECT COUNT(*) FROM public.verification_log
--   --                 WHERE applicant_id IS NULL;
--   ALTER TABLE public.verification_log
--     ALTER COLUMN applicant_id SET NOT NULL;
--
--   -- 3. Re-add the original CASCADE FK.
--   ALTER TABLE public.verification_log
--     ADD CONSTRAINT verification_log_applicant_id_fkey
--       FOREIGN KEY (applicant_id)
--       REFERENCES public.users(id)
--       ON DELETE CASCADE;
--
-- COMMIT;
--
-- After rollback: reject_user audit rows are silently deleted on user removal.
-- The Steve MEDIUM finding (2026-05-25) is un-fixed. Re-apply migration 013
-- to restore safe audit retention.
