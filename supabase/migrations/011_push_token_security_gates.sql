-- Migration 011 — Push token security gates
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24
-- References:
--   Steve security sweep: qa-reports/phase-3-4-security-sweep-2026-05-24.md
--     F1 (HIGH): register_push_token missing is_verified + push preference gate
--     F4 (HIGH): expo_token column + RPC parameter have no max-length constraint
--   Migration 009: supabase/migrations/009_push_notifications.sql
--   Migration 010: supabase/migrations/010_fix_push_token_unique.sql
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- Addresses two HIGH-severity findings from Steve's Phase 3+4 security sweep:
--
-- FIX F1 — is_verified + push-preference gate in register_push_token
-- ---------------------------------------------------------------
-- The documented three-layer push guard is:
--   Layer 1: client-side (pushNotifications.ts hasAnyTriggerEnabled)
--   Layer 2: server RPC (register_push_token raises if caller not eligible)
--   Layer 3: Edge Function pre-send re-check
-- Migration 010 shipped Layer 2 as a stub with only three checks
-- (authenticated, non-empty token, valid platform). Layer 2's actual
-- security gates were explicitly deferred (migration 009 DECISIONS #6,
-- comment "follow-up migration can add"). This migration implements them:
--
--   a. is_verified check: if the caller's public.users row has
--      is_verified = false, raise 'Account not verified'. An authenticated
--      but unverified user (still in the Waiting Room) must not accumulate
--      push tokens — they would receive notifications the Waiting Room
--      screen suppresses, and the Edge Function's pre-send check would need
--      an extra is_verified guard not currently in its spec.
--
--   b. Push preference gate: read push_preferences JSONB from the caller's
--      public.users row. If COALESCE((push_preferences->>'enabled')::boolean,
--      false) is NOT true, raise 'No push preferences enabled'. This enforces
--      the spec's documented Layer 2 server-side opt-in check.
--
--   Both checks run BEFORE the INSERT/UPSERT (guard-clause order).
--   The function remains SECURITY DEFINER owned by postgres.
--
-- FIX F4 — expo_token max-length constraint (table + RPC)
-- -------------------------------------------------------
--   a. Adds CHECK (length(expo_token) <= 4096) to the push_tokens table
--      column via ALTER TABLE. This prevents a disk-abuse / denial-of-wallet
--      attack where an authenticated user inserts a multi-MB token string.
--      Real Expo tokens are ~64 chars; 4096 is generous headroom for future
--      format evolution (per Steve F4 recommendation).
--
--   b. Adds a length > 4096 guard inside register_push_token BEFORE the
--      UPSERT, raising 'Token too long'. The in-function check fires before
--      Postgres evaluates the column-level CHECK, giving the client a
--      structured error message rather than a constraint-violation code.
--
-- WHAT IT DOES NOT TOUCH
-- ======================
-- - push_tokens table structure (columns, indexes, RLS policies): unchanged.
-- - revoke_push_token(), update_push_preferences(),
--   prune_stale_push_tokens(): unchanged.
-- - public.users columns: unchanged (is_verified and push_preferences were
--   added by schema.sql and migration 009 respectively).
-- - Any other table, function, or policy.
--
-- ROLLBACK
-- ========
-- Commented-out block at the bottom unwinds in reverse order:
--   1. DROP the column-level CHECK constraint.
--   2. Restore register_push_token() to the migration 010 body (no
--      is_verified / preference / length guards).
-- Safe to apply. Rollback leaves is_verified and preference checking absent
-- from Layer 2 (the feature works again, but with the security gap restored).
-- Re-apply this migration to re-enable the gates.
--
-- IDEMPOTENT
-- ==========
-- - ALTER TABLE ... ADD CONSTRAINT uses a DO block with IF NOT EXISTS on
--   pg_constraint — safe to re-run.
-- - CREATE OR REPLACE FUNCTION on register_push_token — always idempotent.
-- - GRANT EXECUTE is idempotent in Postgres.
-- Safe to re-run.
--
-- Constitution Art. 5: This is a FILE. Dana writes; Sky applies via the
-- Supabase dashboard SQL editor. Never applied to a live database by any agent.
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX F4a — Add max-length CHECK constraint on push_tokens.expo_token
-- ============================================================================
-- Real Expo push tokens are ~64 chars. A 4096-char ceiling catches storage-
-- abuse attacks while giving generous headroom for format evolution.
-- Wrapped in a DO block so the re-run is a no-op rather than an error.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname    = 'push_tokens_expo_token_length'
      AND conrelid   = 'public.push_tokens'::regclass
      AND contype    = 'c'
  ) THEN
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_expo_token_length
        CHECK (length(expo_token) <= 4096);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT push_tokens_expo_token_length ON public.push_tokens IS
  'Caps expo_token at 4096 chars to prevent storage-abuse attacks. '
  'Real Expo tokens are ~64 chars; 4096 gives headroom for format evolution. '
  'Added by migration 011 (Steve F4). The register_push_token RPC also '
  'enforces this limit in-function before the UPSERT.';

-- ============================================================================
-- FIX F1 + F4b — Replace register_push_token with security-gated version
-- ============================================================================
-- Changes from migration 010's version:
--   1. [F4b] length(p_expo_token) > 4096 → RAISE 'Token too long'
--      (fires before UPSERT; gives structured error, not a CHECK violation).
--   2. [F1a] SELECT is_verified FROM public.users WHERE id = caller
--      → if NOT is_verified RAISE 'Account not verified'.
--   3. [F1b] SELECT push_preferences FROM public.users WHERE id = caller
--      → if COALESCE((prefs->>'enabled')::boolean, false) is FALSE
--        RAISE 'No push preferences enabled'.
--   All three guards run BEFORE the INSERT ON CONFLICT UPSERT.
--
-- Function ownership is preserved as SECURITY DEFINER; SET search_path is
-- narrowed to public, auth (unchanged from migrations 009/010).
-- The UPSERT body (ON CONFLICT (user_id, platform)) is identical to
-- migration 010.

CREATE OR REPLACE FUNCTION public.register_push_token(p_expo_token TEXT, p_platform TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller        UUID;
  caller_row    RECORD;
BEGIN
  -- -----------------------------------------------------------------------
  -- Guard 1 (migrations 009/010): caller must be authenticated
  -- -----------------------------------------------------------------------
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 2 (migrations 009/010): platform must be a known value
  -- -----------------------------------------------------------------------
  IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 3 (migrations 009/010): token must be non-NULL and non-empty
  -- -----------------------------------------------------------------------
  IF p_expo_token IS NULL OR length(trim(p_expo_token)) = 0 THEN
    RAISE EXCEPTION 'Expo token is required';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 4 [F4b] NEW — token must not exceed 4096 characters
  -- -----------------------------------------------------------------------
  -- Provides a structured error before Postgres evaluates the column CHECK.
  -- Steve sweep F4: "4096 gives generous headroom for Expo format evolution."
  -- -----------------------------------------------------------------------
  IF length(p_expo_token) > 4096 THEN
    RAISE EXCEPTION 'Token too long';
  END IF;

  -- -----------------------------------------------------------------------
  -- Read caller's users row once; use for both F1 guards below.
  -- FOR SHARE prevents the row from being updated between our read and the
  -- subsequent UPSERT (protects against a race where is_verified is set to
  -- false by an admin concurrently while the token registration is in flight).
  -- -----------------------------------------------------------------------
  SELECT is_verified, push_preferences
  INTO   caller_row
  FROM   public.users
  WHERE  id = caller
  FOR SHARE;

  IF NOT FOUND THEN
    -- Defensive: auth.uid() exists in auth.users but handle_new_user trigger
    -- hasn't fired yet (extremely rare race at account creation). Safer to
    -- reject cleanly than to proceed with a half-created account.
    RAISE EXCEPTION 'User record not found';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 5 [F1a] NEW — caller must be verified
  -- -----------------------------------------------------------------------
  -- Unverified users are in the Waiting Room and must not receive push
  -- notifications. The client-side gate (auth.tsx is_verified check) should
  -- prevent this call from reaching the server, but defense-in-depth.
  -- Steve sweep F1: "An authenticated but unverified user can call
  -- register_push_token and have their device registered as a push target."
  -- -----------------------------------------------------------------------
  IF NOT COALESCE(caller_row.is_verified, false) THEN
    RAISE EXCEPTION 'Account not verified';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 6 [F1b] NEW — caller must have push notifications enabled
  -- -----------------------------------------------------------------------
  -- Reads the top-level 'enabled' flag from push_preferences JSONB.
  -- The default column value is '{"enabled": false}' (migration 009 §3),
  -- so COALESCE to false is the correct fallback when the key is absent.
  -- This implements the documented Layer 2 server-side opt-in gate.
  -- Steve sweep F1: "The documentation claims a Layer 2 that does not exist."
  -- -----------------------------------------------------------------------
  IF NOT COALESCE((caller_row.push_preferences->>'enabled')::boolean, false) THEN
    RAISE EXCEPTION 'No push preferences enabled';
  END IF;

  -- -----------------------------------------------------------------------
  -- UPSERT (unchanged from migration 010)
  -- Keyed on (user_id, platform) — one row per user per platform.
  -- Token rotation: same platform, new expo_token → updates expo_token +
  -- last_used_at in place. Atomic; no client-side revoke needed.
  -- -----------------------------------------------------------------------
  INSERT INTO public.push_tokens (user_id, expo_token, platform, last_used_at)
  VALUES (caller, p_expo_token, p_platform, now())
  ON CONFLICT (user_id, platform) DO UPDATE
    SET expo_token   = EXCLUDED.expo_token,
        last_used_at = now();

  RETURN TRUE;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise so PostgREST surfaces a structured error to the client.
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.register_push_token(TEXT, TEXT) IS
  'Push token registration (PATCHED by migration 011 — security gates added). '
  'Guards in order: (1) authenticated, (2) valid platform, (3) non-empty token, '
  '(4) [F4b] token ≤ 4096 chars, (5) [F1a] is_verified = true, '
  '(6) [F1b] push_preferences.enabled = true. '
  'All guards fire BEFORE the UPSERT. UPSERT is keyed on (user_id, platform) '
  '(migration 010 AC-4). Returns TRUE on success. '
  'See Steve sweep F1 + F4 in qa-reports/phase-3-4-security-sweep-2026-05-24.md.';

-- ============================================================================
-- Re-GRANT EXECUTE — register_push_token signature unchanged (TEXT, TEXT)
-- ============================================================================
-- GRANT EXECUTE is idempotent in Postgres; re-granting after CREATE OR REPLACE
-- is belt-and-braces (the grant persists across replacements in Postgres 14+,
-- but explicit re-grant avoids any ambiguity on database restore from backup).

GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- TEST STUB — Gary should add / update in supabase/__tests__/rls.sql
-- ============================================================================
-- Migration 011 adds four new guards. Recommended new test scenarios:
--
-- T-PUSH-25: [F4b] register_push_token with a token of exactly 4096 chars →
--            succeeds (boundary check).
-- T-PUSH-26: [F4b] register_push_token with a token of 4097 chars →
--            RAISE 'Token too long'.
-- T-PUSH-27: [F4b] Direct INSERT into push_tokens with expo_token of 4097
--            chars → column CHECK constraint violation (belt-and-braces;
--            should not normally be reachable via RPC, but tests the column
--            constraint independently of the RPC guard).
-- T-PUSH-28: [F1a] register_push_token called by an authenticated user whose
--            public.users.is_verified = false → RAISE 'Account not verified'.
-- T-PUSH-29: [F1a] register_push_token called by an authenticated, verified
--            user → passes Guard 5 (confirm no false-positive).
-- T-PUSH-30: [F1b] register_push_token called by a verified user whose
--            push_preferences = '{"enabled": false}' (column default) →
--            RAISE 'No push preferences enabled'.
-- T-PUSH-31: [F1b] register_push_token called by a verified user whose
--            push_preferences = '{"enabled": true}' (opted in) →
--            succeeds (passes Guard 6).
-- T-PUSH-32: [F1b] register_push_token called by a verified user whose
--            push_preferences is NULL (e.g., row predates migration 009's
--            DEFAULT) → COALESCE to false → RAISE 'No push preferences
--            enabled'. Regression guard: NULL must never bypass the gate.
-- T-PUSH-33: [F1b] register_push_token called by a verified user whose
--            push_preferences JSON has the 'enabled' key absent (e.g.,
--            '{"claim_placed": true}') → COALESCE to false → RAISE 'No push
--            preferences enabled'. The top-level enabled key is required.
-- T-PUSH-34: Guard ordering: verify that 'Token too long' fires before
--            'Account not verified' — i.e., a 4097-char token sent by an
--            unverified user raises 'Token too long', not 'Account not
--            verified'. This confirms the guard-clause order in the function.

COMMIT;

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- Unwinds in reverse order. After rollback, register_push_token loses the
-- is_verified, preference, and length guards; the column CHECK is removed.
-- The feature remains functional but reverts to the migration 010 security
-- posture (Steve F1 + F4 findings are un-fixed). Re-apply migration 011 to
-- re-enable the gates.
--
-- BEGIN;
--
--   -- 1. Drop the column-level CHECK constraint.
--   ALTER TABLE public.push_tokens
--     DROP CONSTRAINT IF EXISTS push_tokens_expo_token_length;
--
--   -- 2. Restore register_push_token to the migration 010 body.
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
--     IF caller IS NULL THEN
--       RAISE EXCEPTION 'Not authenticated';
--     END IF;
--     IF p_expo_token IS NULL OR length(p_expo_token) = 0 THEN
--       RAISE EXCEPTION 'Token required';
--     END IF;
--     IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android', 'web') THEN
--       RAISE EXCEPTION 'Invalid platform';
--     END IF;
--     INSERT INTO public.push_tokens (user_id, expo_token, platform, last_used_at)
--     VALUES (caller, p_expo_token, p_platform, now())
--     ON CONFLICT (user_id, platform) DO UPDATE
--       SET expo_token   = EXCLUDED.expo_token,
--           last_used_at = now();
--     RETURN TRUE;
--   EXCEPTION
--     WHEN OTHERS THEN
--       RAISE;
--   END;
--   $fn$;
--
--   GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) TO authenticated;
--
-- COMMIT;
--
-- After rollback: Steve's F1 and F4 findings are un-fixed. Unverified users
-- can register push tokens; opted-out users can register push tokens; the
-- expo_token column accepts arbitrarily long strings. Re-apply migration 011
-- to restore the security gates.
