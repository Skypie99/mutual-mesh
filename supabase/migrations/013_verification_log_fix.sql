-- Migration 013 — verification_log applicant_id FK fix
-- Applied: <pending Sky apply>
-- Author: Steve (security), 2026-05-25
-- References:
--   Phase 4 report: qa-reports/morgan-2026-05-25.md
--   Issue: verification_log.applicant_id FK is ON DELETE CASCADE — deleting a
--          user destroys the audit record, undermining append-only guarantee S8
--          and making post-deletion investigations impossible.
--
-- ============================================================================
-- ROLLBACK (run to undo)
-- ============================================================================
--   ALTER TABLE public.verification_log
--     DROP CONSTRAINT IF EXISTS verification_log_applicant_id_fkey;
--   ALTER TABLE public.verification_log ALTER COLUMN applicant_id SET NOT NULL;
--   ALTER TABLE public.verification_log
--     ADD CONSTRAINT verification_log_applicant_id_fkey
--     FOREIGN KEY (applicant_id) REFERENCES public.users(id) ON DELETE CASCADE;
-- ============================================================================
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
--
-- Changes verification_log.applicant_id FK from ON DELETE CASCADE to
-- ON DELETE SET NULL.
--
-- Rationale:
--   The verification_log table is an append-only audit log (S8). When a user
--   account is deleted, CASCADE silently destroys all associated log rows,
--   creating an audit gap. SET NULL preserves the row while clearing the
--   user reference, so the audit record (decision, reason, decided_at,
--   admin_id) survives for post-deletion review.
--
--   This aligns applicant_id with admin_id, which already uses SET NULL
--   (see schema.sql: `admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL`).
--
-- Steps:
--   1. Drop existing FK constraint (idempotent — uses DROP CONSTRAINT IF EXISTS).
--   2. Allow NULL on the column (required for SET NULL to fire on user delete).
--   3. Re-add FK with ON DELETE SET NULL.
--
-- WHAT IT DOES NOT TOUCH
-- ======================
-- - No other columns on verification_log are changed.
-- - admin_id FK (already SET NULL): unchanged.
-- - All RLS policies on verification_log: unchanged.
-- - The append-only guarantee (S8 — no UPDATE/DELETE policies): unchanged.
-- ============================================================================

-- Step 1: Drop the existing FK constraint.
ALTER TABLE public.verification_log
  DROP CONSTRAINT IF EXISTS verification_log_applicant_id_fkey;

-- Step 2: Allow NULL so SET NULL can fire on user deletion.
ALTER TABLE public.verification_log
  ALTER COLUMN applicant_id DROP NOT NULL;

-- Step 3: Re-add FK with ON DELETE SET NULL.
ALTER TABLE public.verification_log
  ADD CONSTRAINT verification_log_applicant_id_fkey
  FOREIGN KEY (applicant_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.verification_log.applicant_id IS
  'User who was reviewed. SET NULL on user delete so the audit row survives '
  'account deletion (S8 append-only guarantee).';
