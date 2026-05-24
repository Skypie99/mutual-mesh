-- Migration 006 — Onboarding tour completion flag + complete_onboarding RPC
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24 — implements Quinn's Phase 2 Stream C spec
-- Source: qa-reports/spec-phase-2-onboarding-tour.md
-- Privacy authority: PRIVACY.md (no new PII; flag is self-only readable
--                    via existing users_self_read policy) + Constitution
--                    Art. 7.6 (Jordan LIGHT REVIEW REQUIRED because the
--                    tour COPY is privacy-load-bearing — copy review is the
--                    UI cycle's concern, not this migration's).
--
-- WHAT IT DOES
-- ============
-- Adds a single boolean column `onboarding_complete` to public.users with
-- DEFAULT false. Adds the SECURITY DEFINER RPC `complete_onboarding()`,
-- callable by any authenticated user, which flips the caller's flag to true.
-- Idempotent at the user level — calling when already true is a no-op (the
-- UPDATE matches the row but writes the same value).
--
-- NOTE: This migration ships ONLY the spec's primary RPC `complete_onboarding`
-- per the brief's deliverables list. The companion `reset_onboarding()` RPC
-- (spec AC-9 — the "See intro again" link on ProfileScreen) is NOT included
-- here. It's flagged as DECISION FOR SKY in the briefing — Shamus' UI work
-- needs it, but the brief asked for just one RPC. Sky can confirm whether to
-- add reset_onboarding() as a follow-up migration or fold it in before merge.
--
-- WHY
-- ===
-- Phase 2 Stream C (expansion plan Tier 2 #8). Riley's #1 friction
-- ("empty marketplace in early days") and #4 ("first-time confusion about
-- claims") together cost early-adopter retention. A 3-card tour shipped
-- once per user reduces both. Lowest-risk schema change (one boolean column,
-- no RLS impact).
--
-- BACKFILL BEHAVIOR
-- =================
-- Per Quinn AC-1 + brief direction: existing users get onboarding_complete =
-- false on apply (via the column DEFAULT). They see the tour exactly once on
-- their next login. Per Quinn DFS-1 default this is intentional — staging
-- has ~5–10 test accounts and seeing the tour once is fine. A follow-up
-- UPDATE to backfill true is a one-liner if Sky pushes back. See DECISIONS
-- FOR SKY in the briefing.
--
-- IDEMPOTENT
-- ==========
-- - `ADD COLUMN IF NOT EXISTS` for the new column.
-- - `CREATE OR REPLACE FUNCTION` for the RPC.
-- - `GRANT EXECUTE` is a no-op if already granted.
-- Safe to re-run.
--
-- ROLLBACK
-- ========
-- See commented-out block at the bottom. Drops RPC + column.
--
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- =======================================
-- 1. (No backfill to true) See BACKFILL BEHAVIOR above. Quinn DFS-1 default.
-- 2. (RPC is idempotent at the user level) Calling complete_onboarding when
--    onboarding_complete is already true matches the row and writes true
--    again. No exception is raised; no error is returned. The Gate router
--    re-route is a no-op (gate already returns 'home').
-- 3. (No reset_onboarding here) See NOTE above. Shamus' UI cycle needs the
--    companion RPC for the "See intro again" link in ProfileScreen. Either
--    fold it into this migration (re-edit + re-apply) or land as 007 once
--    Sky confirms.
-- 4. (No RLS policy change) The column is read via the existing
--    users_self_read policy (SELECT id, ... WHERE id = auth.uid()). Writes
--    go through the SECURITY DEFINER RPC, which bypasses RLS for its
--    targeted UPDATE. No new policy is needed.
-- 5. (No protect_admin_flags interaction) The existing protect_admin_flags
--    trigger blocks direct authenticated UPDATE of is_verified and is_admin
--    only. It does NOT touch onboarding_complete; the trigger body uses
--    `IS DISTINCT FROM` against those two columns specifically. So the RPC's
--    UPDATE (running as security definer / postgres role) works
--    unobstructed, and even direct authenticated UPDATE on
--    onboarding_complete would pass the trigger — but it's still blocked at
--    the application level because the AuthProvider only exposes the flag
--    via the RPC.

-- ============================================================================
-- 1. Add onboarding_complete column with DEFAULT false + NOT NULL
-- ============================================================================
-- The DEFAULT + NOT NULL combination backfills every existing row to false.
-- Per Quinn DFS-1 + brief direction, staging users will see the tour once.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.onboarding_complete IS
  'Phase 2 #8: true after the user completes or skips the 3-card onboarding tour. Flipped by complete_onboarding() RPC. Read via users_self_read policy.';

-- ============================================================================
-- 2. complete_onboarding() — SECURITY DEFINER RPC
-- ============================================================================
-- Any authenticated user flips their OWN flag. The function uses auth.uid()
-- so the caller cannot affect another user's row. Idempotent: calling when
-- the flag is already true is a no-op.

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotent: if the flag is already true this is a no-op UPDATE
  -- (matches the row, writes true again, no exception). The Gate router
  -- re-route triggered by the AuthProvider realtime subscription is also
  -- a no-op (gate already returns 'home' when onboarding_complete is true).
  UPDATE public.users
  SET onboarding_complete = true
  WHERE id = caller;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.complete_onboarding() IS
  'Phase 2 #8: flips public.users.onboarding_complete = true for auth.uid(). SECURITY DEFINER; idempotent. Called from OnboardingTourScreen on Skip OR Get-started tap.';

-- ============================================================================
-- 3. Grant EXECUTE to authenticated callers (PostgREST)
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;

-- ============================================================================
-- TEST STUB — Steve / Gary should add a scenario in supabase/__tests__/rls.sql
-- ============================================================================
-- Add scenarios (e.g. T15a–T15c) wrapped in BEGIN; ROLLBACK; that:
--
--   T15a (success): Insert a verified user. SET LOCAL request.jwt.claim.sub
--     = '<user>'. SELECT public.complete_onboarding(). Assert: returned TRUE,
--     SELECT onboarding_complete FROM public.users WHERE id = '<user>'
--     returns true.
--
--   T15b (idempotent): After T15a, call again. Assert: returned TRUE,
--     flag still true, no exception raised.
--
--   T15c (unauthenticated rejected): Without a JWT, expect EXCEPTION
--     'Not authenticated'.
--
--   T15d (cross-user isolation): Insert users A and B. SET LOCAL claim.sub
--     = '<A>'. Call complete_onboarding. Assert: A's flag is true, B's flag
--     is still false (the RPC only ever touches the caller's row).
--
-- The existing users_self_read RLS policy is not modified by this
-- migration; no policy-change tests are needed.

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- BEGIN;
--
-- -- 1. Drop the RPC.
-- DROP FUNCTION IF EXISTS public.complete_onboarding();
--
-- -- 2. Drop the column (the DEFAULT and the column comment go with it).
-- ALTER TABLE public.users
--   DROP COLUMN IF EXISTS onboarding_complete;
--
-- COMMIT;
--
-- After rollback, the gate router must be reverted to its pre-Phase-2 state
-- (Shamus' branch). Re-apply migration 006 to restore the column + RPC.
