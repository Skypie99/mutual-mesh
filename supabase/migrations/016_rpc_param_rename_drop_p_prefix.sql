-- ============================================================================
-- Migration 015 — RPC parameter rename: drop p_ prefix
-- ============================================================================
-- Date: 2026-05-25
-- Author: Jordan (legal-privacy role) — routed by Morgan stabilization cycle
-- Approved by: Sky (Morgan qa-report 2026-05-25_Morgan_Stabilization.md)
--
-- PROBLEM
-- The client and src/types/database.ts both use bare parameter names:
--   supabase.rpc('register_push_token', { token, platform })
--   supabase.rpc('update_push_preferences', { prefs: merged })
--
-- Migrations 009 and 010 defined the DB RPCs with a p_ prefix:
--   register_push_token(p_expo_token TEXT, p_platform TEXT)
--   update_push_preferences(p_prefs JSONB)
--
-- PostgREST maps client object keys to RPC parameter names exactly. On apply
-- of migration 009/010, the first push-registration call raises:
--   PGRST202: Could not find the function public.register_push_token(token, platform)
--
-- DECISION (Morgan, 2026-05-25)
-- Option A selected: rename DB parameters to match client + types.
-- Rationale: client and types are already correct; migration is the only
-- misaligned layer; zero client-side churn.
--
-- CANONICAL STANDARD (system-wide, post this migration)
-- RPC parameters use bare names matching the client's object keys. No p_ prefix.
--
-- WHAT CHANGES
--   register_push_token(p_expo_token, p_platform) → register_push_token(token, platform)
--   update_push_preferences(p_prefs)              → update_push_preferences(prefs)
--   revoke_push_token() — no-arg (from mig 010)   → unchanged
--
-- ROLLBACK
-- Re-run migration 011 SQL for register_push_token (restores p_ prefix with
-- all security gates) and migration 009 SQL for update_push_preferences
-- (restores p_prefs). No data is touched — these are pure function redefinitions.
--
-- NOTE ON GRANTS
-- GRANTs reference type signatures (TEXT, TEXT) and (JSONB), not parameter
-- names, so existing grants from migrations 009/010 remain valid. Re-granting
-- here is idempotent and ensures correctness if 009 and 015 are applied
-- without 009's original GRANT.
-- ============================================================================

-- ============================================================================
-- 1. register_push_token(token, platform) — UPSERT on (user_id, platform)
-- ============================================================================
-- Body is migration 011's security-gated version with parameter renames:
--   p_expo_token → token, p_platform → platform.
-- Carries ALL six guards from migration 011 (Steve sweep F1 + F4):
--   Guard 1: authenticated
--   Guard 2: valid platform
--   Guard 3: non-empty token
--   Guard 4 [F4b]: token max-length (≤ 4096)
--   Guard 5 [F1a]: is_verified = true
--   Guard 6 [F1b]: push_preferences.enabled = true
-- Plus FOR SHARE lock on user row for race protection.

CREATE OR REPLACE FUNCTION public.register_push_token(token TEXT, platform TEXT)
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
  IF platform IS NULL OR platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 3 (migrations 009/010): token must be non-NULL and non-empty
  -- -----------------------------------------------------------------------
  IF token IS NULL OR length(trim(token)) = 0 THEN
    RAISE EXCEPTION 'Expo token is required';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 4 [F4b] (migration 011): token must not exceed 4096 characters
  -- -----------------------------------------------------------------------
  -- Provides a structured error before Postgres evaluates the column CHECK.
  -- Steve sweep F4: "4096 gives generous headroom for Expo format evolution."
  -- -----------------------------------------------------------------------
  IF length(token) > 4096 THEN
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
  -- Guard 5 [F1a] (migration 011): caller must be verified
  -- -----------------------------------------------------------------------
  -- Unverified users are in the Waiting Room and must not receive push
  -- notifications. Defense-in-depth for client-side gate.
  -- Steve sweep F1: "An authenticated but unverified user can call
  -- register_push_token and have their device registered as a push target."
  -- -----------------------------------------------------------------------
  IF NOT COALESCE(caller_row.is_verified, false) THEN
    RAISE EXCEPTION 'Account not verified';
  END IF;

  -- -----------------------------------------------------------------------
  -- Guard 6 [F1b] (migration 011): caller must have push notifications enabled
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
  -- UPSERT keyed on (user_id, platform) — unchanged from migration 010/011.
  -- One row per user per platform. Token rotation: same platform, new token →
  -- updates expo_token + last_used_at in place. Atomic.
  -- -----------------------------------------------------------------------
  INSERT INTO public.push_tokens (user_id, expo_token, platform, last_used_at)
  VALUES (caller, token, platform, now())
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
  'Push token registration (PATCHED by migration 015: p_expo_token → token, '
  'p_platform → platform; carries ALL migration 011 security gates). '
  'Guards in order: (1) authenticated, (2) valid platform, (3) non-empty token, '
  '(4) [F4b] token ≤ 4096 chars, (5) [F1a] is_verified = true, '
  '(6) [F1b] push_preferences.enabled = true. FOR SHARE lock on user row. '
  'UPSERT keyed on (user_id, platform). Returns TRUE on success. '
  'Client calls supabase.rpc(''register_push_token'', { token, platform }).';

GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 2. update_push_preferences(prefs) — shallow-merge onto users.push_preferences
-- ============================================================================
-- Body is identical to migration 009's definition. Only p_prefs → prefs.
-- Logic, SECURITY DEFINER, search_path, auth guard, validation, and JSONB
-- merge semantics are unchanged.

CREATE OR REPLACE FUNCTION public.update_push_preferences(prefs JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller UUID;
  merged JSONB;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF prefs IS NULL THEN
    RAISE EXCEPTION 'Preferences required';
  END IF;

  IF jsonb_typeof(prefs) <> 'object' THEN
    RAISE EXCEPTION 'Preferences must be an object';
  END IF;

  -- Shallow merge via ||. Returns the merged result via RETURNING.
  UPDATE public.users
  SET push_preferences = COALESCE(push_preferences, '{}'::jsonb) || prefs
  WHERE id = caller
  RETURNING push_preferences INTO merged;

  IF merged IS NULL THEN
    RAISE EXCEPTION 'User row not found';
  END IF;

  RETURN merged;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.update_push_preferences(JSONB) IS
  'Phase 3 push preference update (PATCHED by migration 015: p_prefs → prefs). Shallow-merges prefs onto users.push_preferences via JSONB || operator. Returns the merged result. Client calls supabase.rpc(''update_push_preferences'', { prefs: merged }).';

GRANT EXECUTE ON FUNCTION public.update_push_preferences(JSONB) TO authenticated;
