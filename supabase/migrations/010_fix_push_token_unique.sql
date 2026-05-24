-- Migration 010 — Fix push_tokens UNIQUE constraint (Phase 3 patch)
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24
-- References:
--   Steve audit:  qa-reports/phase-3-steve-push-audit-2026-05-24.md (C2)
--   Quinn spec:   qa-reports/spec-phase-3-push-notifications.md (Revision 2,
--                 AC-4 + "Schema corrections needed" section)
--   Migration 009: supabase/migrations/009_push_notifications.sql
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- 1. DROPs the incorrect UNIQUE (user_id, expo_token) constraint shipped in
--    migration 009.
-- 2. ADDs the correct UNIQUE (user_id, platform) constraint so that
--    register_push_token's UPSERT path is keyed on one-row-per-user-per-
--    platform, not one-row-per-user-per-token.
-- 3. REPLACEs register_push_token() to UPSERT by (user_id, platform):
--    ON CONFLICT (user_id, platform) DO UPDATE SET expo_token, last_used_at.
--    This makes token rotation atomic — a new Expo token on the same
--    platform overwrites the old row in place, no client-side revoke needed.
-- 4. REPLACEs revoke_push_token() to be no-arg (deletes ALL tokens for the
--    caller) per Quinn's revised AC-4: the "Disable all notifications"
--    button is the only revoke path; per-token revoke during rotation is
--    eliminated because the UPSERT handles it.
--
-- WHY
-- ===
-- Steve's security audit (C2) identified that the UNIQUE (user_id,
-- expo_token) constraint from migration 009 makes the UPSERT path
-- ill-defined for token rotation:
--
--   - When a user's Expo token rotates (app reinstall, OS update), the NEW
--     token is a different string. With UNIQUE (user_id, expo_token), the
--     INSERT sees no conflict → inserts a second row → the user now has TWO
--     rows for the same platform. The Edge Function would try to deliver to
--     BOTH, the old one fails (DeviceNotRegistered), and we accumulate stale
--     rows.
--   - With UNIQUE (user_id, platform), the INSERT sees a conflict on the
--     existing (user_id, 'ios') row → updates expo_token in place → exactly
--     ONE row per platform, always. Token rotation is a no-op from the
--     client's perspective: just call register_push_token(new_token, 'ios')
--     on every foreground; the server handles idempotency.
--
-- Quinn's Revision 2 (AC-4) codifies this as the spec-level requirement:
--   "The RPC performs an atomic UPSERT keyed on (user_id, platform)."
--   "The client does NOT compare tokens, does NOT call any revoke RPC
--    during rotation."
--
-- INTERACTION WITH MIGRATION 009
-- ==============================
-- This migration is a PATCH on top of 009. It assumes 009 has been applied
-- (the push_tokens table, the three RPCs, the RLS policies, the cron job
-- all exist). It touches ONLY the UNIQUE constraint and the two RPCs whose
-- behavior depends on it (register_push_token and revoke_push_token). It
-- does NOT touch:
--   - The push_tokens table definition (columns unchanged)
--   - The RLS policies (unchanged — self-only for all four verbs)
--   - The update_push_preferences RPC (unchanged — no constraint dependency)
--   - The prune_stale_push_tokens cron job (unchanged)
--   - The push_preferences column on public.users (unchanged)
--   - The push_tokens_user_last_used_idx index (unchanged — composite on
--     (user_id, last_used_at DESC) still valid)
--
-- DATA MIGRATION NOTE
-- ===================
-- If migration 009 was applied and tokens were registered before this
-- migration runs, there MAY be duplicate (user_id, platform) rows (e.g.,
-- a user who rotated tokens and ended up with two iOS rows). The new
-- UNIQUE constraint will FAIL on those duplicates. The migration handles
-- this with a pre-constraint cleanup: for each (user_id, platform) group
-- with >1 row, keep the row with the latest last_used_at and delete the
-- rest. This is the correct behavior — the latest token is the valid one.
--
-- ROLLBACK
-- ========
-- Commented-out block at the bottom reverses the constraint swap and
-- restores the original RPC signatures from migration 009. Safe to apply;
-- re-running migration 009's RPC definitions (CREATE OR REPLACE) would
-- also work as a manual rollback.
--
-- IDEMPOTENT
-- ==========
-- - Constraint DROP uses a DO block with IF EXISTS on pg_constraint.
-- - Duplicate cleanup uses a CTE that is a no-op when no duplicates exist.
-- - Constraint ADD uses a DO block with IF NOT EXISTS on pg_constraint.
-- - RPC replacement uses CREATE OR REPLACE FUNCTION (always idempotent).
-- - GRANT EXECUTE is idempotent in Postgres.
-- Safe to re-run.
--
-- Constitution Art. 5: This is a FILE. Dana writes; Sky applies via
-- the Supabase dashboard. Never applied to a live database by any agent.
-- ============================================================================

-- ============================================================================
-- 1. Clean up duplicate (user_id, platform) rows before adding constraint
-- ============================================================================
-- If 009 was applied and users registered tokens before this migration,
-- there may be multiple rows per (user_id, platform). Keep the one with
-- the most recent last_used_at; delete the rest.

DELETE FROM public.push_tokens
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, platform
             ORDER BY last_used_at DESC, created_at DESC
           ) AS rn
    FROM public.push_tokens
  ) ranked
  WHERE rn > 1
);

-- ============================================================================
-- 2. DROP the incorrect UNIQUE (user_id, expo_token) constraint
-- ============================================================================
-- Postgres auto-names inline UNIQUE constraints as <table>_<col1>_<col2>_key.
-- Migration 009 used: UNIQUE (user_id, expo_token) → push_tokens_user_id_expo_token_key.
-- Guarded with IF EXISTS for idempotency.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_tokens_user_id_expo_token_key'
      AND conrelid = 'public.push_tokens'::regclass
  ) THEN
    ALTER TABLE public.push_tokens
      DROP CONSTRAINT push_tokens_user_id_expo_token_key;
  END IF;
END;
$$;

-- ============================================================================
-- 3. ADD the correct UNIQUE (user_id, platform) constraint
-- ============================================================================
-- One row per user per platform. The register_push_token UPSERT keys on
-- this constraint. Token rotation = same (user_id, platform), new expo_token
-- → ON CONFLICT updates expo_token in place.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_tokens_user_id_platform_key'
      AND conrelid = 'public.push_tokens'::regclass
  ) THEN
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_user_id_platform_key UNIQUE (user_id, platform);
  END IF;
END;
$$;

-- ============================================================================
-- 4. REPLACE register_push_token() — UPSERT by (user_id, platform)
-- ============================================================================
-- Changed from migration 009:
--   - ON CONFLICT target: (user_id, expo_token) → (user_id, platform)
--   - ON CONFLICT action: now also updates expo_token (not just last_used_at)
--
-- This makes token rotation atomic:
--   register_push_token('ExponentPushToken[NEW]', 'ios')
--   → if (caller, 'ios') row exists, update expo_token + last_used_at
--   → if not, insert new row
--   → either way, exactly one row per (user_id, platform)
--
-- The client calls this on every app foreground when any push trigger is ON.
-- No client-side token comparison or revoke needed (Quinn AC-4 Revision 2).

CREATE OR REPLACE FUNCTION public.register_push_token(p_expo_token TEXT, p_platform TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller UUID;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_expo_token IS NULL OR length(p_expo_token) = 0 THEN
    RAISE EXCEPTION 'Token required';
  END IF;

  IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  -- UPSERT keyed on (user_id, platform):
  --   - New platform for this user → INSERT.
  --   - Same platform, same token → bumps last_used_at (idempotent).
  --   - Same platform, different token (rotation) → updates expo_token +
  --     last_used_at in place. Old token gone. One row per platform, always.
  INSERT INTO public.push_tokens (user_id, expo_token, platform, last_used_at)
  VALUES (caller, p_expo_token, p_platform, now())
  ON CONFLICT (user_id, platform) DO UPDATE
    SET expo_token   = EXCLUDED.expo_token,
        last_used_at = now();

  RETURN TRUE;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.register_push_token(TEXT, TEXT) IS
  'Phase 3 push registration (PATCHED by migration 010). UPSERT on (user_id, platform): inserts new row or updates expo_token + last_used_at on existing. One row per user per platform, always. Token rotation is atomic — no client-side revoke needed. See Steve audit C2 + Quinn AC-4 Revision 2.';

-- ============================================================================
-- 5. REPLACE revoke_push_token() — no-arg, deletes ALL caller's tokens
-- ============================================================================
-- Changed from migration 009:
--   - Old signature: revoke_push_token(p_expo_token TEXT) — per-token delete
--   - New signature: revoke_push_token() — no args, deletes ALL caller's rows
--
-- Per Quinn's Revision 2: "revoke_push_token() is no-arg only (used for
-- opt-out per AC-3); it is never called during rotation." The "Disable all
-- notifications" button calls this; the user opts out of everything in one
-- tap.
--
-- NOTE: We must DROP the old single-arg version first, because Postgres
-- treats revoke_push_token() and revoke_push_token(TEXT) as distinct
-- overloads. CREATE OR REPLACE on the no-arg version does NOT remove the
-- old (TEXT) overload.

DROP FUNCTION IF EXISTS public.revoke_push_token(TEXT);

CREATE OR REPLACE FUNCTION public.revoke_push_token()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller UUID;
  rows_deleted INTEGER;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.push_tokens
  WHERE user_id = caller;

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  -- Return TRUE if we deleted any rows; FALSE if the caller had no tokens.
  RETURN rows_deleted > 0;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.revoke_push_token() IS
  'Phase 3 push revocation (PATCHED by migration 010). No-arg: deletes ALL push_tokens rows for auth.uid(). Used by the "Disable all notifications" button (AC-3). Returns TRUE if any rows deleted, FALSE if none. Per-token revoke during rotation is eliminated — register_push_token handles rotation atomically via UPSERT. See Quinn AC-4 Revision 2.';

-- ============================================================================
-- 6. Re-GRANT EXECUTE for the changed signatures
-- ============================================================================
-- register_push_token(TEXT, TEXT) signature is unchanged → grant is
-- idempotent (already granted in 009). Re-granting for clarity.
-- revoke_push_token() is a NEW overload (no args) → needs its own GRANT.

GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_push_token()            TO authenticated;

-- ============================================================================
-- TEST STUB — Steve / Gary should add or update in supabase/__tests__/rls.sql
-- ============================================================================
-- Migration 010 changes the behavior of two existing tests and adds new ones:
--
-- UPDATED (from migration 009 stub):
--   T-PUSH-2 (REVISED): register_push_token called twice with SAME token,
--             SAME platform → one row; last_used_at bumped. (Unchanged
--             behavior, but ON CONFLICT target is now (user_id, platform).)
--   T-PUSH-8 (REVISED): revoke_push_token() now takes NO args. Deletes ALL
--             caller's tokens. Returns TRUE if any deleted.
--   T-PUSH-9 (REVISED): revoke_push_token() on a caller with no tokens →
--             returns FALSE (idempotent).
--
-- NEW (migration 010 specific):
--   T-PUSH-19: register_push_token called with DIFFERENT token, SAME
--              platform (token rotation) → still one row; expo_token is
--              the NEW token; last_used_at bumped.
--   T-PUSH-20: register_push_token with token A on 'ios', then token B on
--              'android' → TWO rows (one per platform). Multi-device.
--   T-PUSH-21: Duplicate cleanup: manually insert two rows with the same
--              (user_id, platform) but different expo_tokens. Run the
--              migration's cleanup DELETE. Verify only one row remains
--              (the one with the latest last_used_at).
--   T-PUSH-22: revoke_push_token() deletes ALL tokens for the caller across
--              all platforms (insert ios + android, call revoke, count = 0).
--   T-PUSH-23: The old revoke_push_token(TEXT) overload no longer exists.
--              Calling it raises an error (function does not exist).
--   T-PUSH-24: UNIQUE constraint push_tokens_user_id_platform_key exists;
--              UNIQUE constraint push_tokens_user_id_expo_token_key does
--              NOT exist.

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- Reverses the constraint swap and restores migration 009's RPC signatures.
-- After rollback, the behavior reverts to UNIQUE (user_id, expo_token) +
-- per-token revoke. Token rotation goes back to client-side revoke+register.
--
-- BEGIN;
--
--   -- 1. Drop the no-arg revoke (migration 010 version).
--   DROP FUNCTION IF EXISTS public.revoke_push_token();
--
--   -- 2. Drop the new UNIQUE (user_id, platform) constraint.
--   ALTER TABLE public.push_tokens
--     DROP CONSTRAINT IF EXISTS push_tokens_user_id_platform_key;
--
--   -- 3. Re-add the original UNIQUE (user_id, expo_token) constraint.
--   ALTER TABLE public.push_tokens
--     ADD CONSTRAINT push_tokens_user_id_expo_token_key UNIQUE (user_id, expo_token);
--
--   -- 4. Restore the original register_push_token (ON CONFLICT user_id, expo_token).
--   CREATE OR REPLACE FUNCTION public.register_push_token(p_expo_token TEXT, p_platform TEXT)
--   RETURNS BOOLEAN
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public, auth
--   AS $fn$
--   DECLARE
--     caller UUID;
--   BEGIN
--     caller := auth.uid();
--     IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
--     IF p_expo_token IS NULL OR length(p_expo_token) = 0 THEN RAISE EXCEPTION 'Token required'; END IF;
--     IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android', 'web') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
--     INSERT INTO public.push_tokens (user_id, expo_token, platform, last_used_at)
--     VALUES (caller, p_expo_token, p_platform, now())
--     ON CONFLICT (user_id, expo_token) DO UPDATE SET last_used_at = now();
--     RETURN TRUE;
--   EXCEPTION WHEN OTHERS THEN RAISE;
--   END;
--   $fn$;
--
--   -- 5. Restore the original per-token revoke_push_token(TEXT).
--   CREATE OR REPLACE FUNCTION public.revoke_push_token(p_expo_token TEXT)
--   RETURNS BOOLEAN
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public, auth
--   AS $fn$
--   DECLARE
--     caller UUID;
--     rows_deleted INTEGER;
--   BEGIN
--     caller := auth.uid();
--     IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
--     IF p_expo_token IS NULL OR length(p_expo_token) = 0 THEN RAISE EXCEPTION 'Token required'; END IF;
--     DELETE FROM public.push_tokens WHERE user_id = caller AND expo_token = p_expo_token;
--     GET DIAGNOSTICS rows_deleted = ROW_COUNT;
--     RETURN rows_deleted > 0;
--   EXCEPTION WHEN OTHERS THEN RAISE;
--   END;
--   $fn$;
--
--   -- 6. Re-grant execute on the restored per-token revoke.
--   GRANT EXECUTE ON FUNCTION public.revoke_push_token(TEXT) TO authenticated;
--
-- COMMIT;
--
-- After rollback: migration 009's behavior is restored. The push feature
-- works as originally designed (client-side token rotation via per-token
-- revoke). Re-apply migration 010 to re-enable server-side rotation.
