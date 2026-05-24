-- Migration 009 — Push notifications schema (Phase 3 #16)
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24 — implements Quinn's spec:
--   qa-reports/spec-phase-3-push-notifications.md
--
-- ============================================================================
-- PRIVACY NOTE — read before applying
-- ============================================================================
-- This migration adds the SCHEMA backbone for privacy-safe push notifications.
-- It introduces ONE new table (public.push_tokens), ONE new column on
-- public.users (push_preferences JSONB), THREE new RPCs (register / revoke /
-- update prefs), strict RLS, and a nightly stale-token cleanup cron job.
--
-- The actual push DELIVERY path (Edge Function deliver_notification) is OUT
-- of scope for this migration — Dana writes files only; Sky deploys Edge
-- Functions via Supabase CLI (Constitution Art. 9). This migration is what
-- the Edge Function will READ from once deployed.
--
-- This migration is privacy-LOAD-BEARING under Constitution Art. 7.6:
--   - push tokens are a new external metadata surface (Apple/Google/Expo are
--     all in the trust boundary; the device's notification queue is reachable
--     by parties Mutual Mesh cannot control)
--   - Mara's anti-goal #3 ("a push notification with the resource name in the
--     title visible on lock screen") drives the entire spec; this migration
--     enforces the FOUNDATION (default-off, RPC-gated writes, RLS-gated reads,
--     CASCADE-on-account-delete) on which the title-only rule is built.
--
-- Threat-model summary:
--   - DEFAULT OFF (spec AC-1): public.users.push_preferences defaults to
--     {"enabled": false}. New users and existing users alike start opted-OUT.
--     A push token is registered ONLY when the user explicitly toggles a
--     preference ON in Profile and the client calls register_push_token.
--   - NO third-party push providers (PRIVACY.md D8 + spec AC-9): this
--     migration adds NO npm dependency, NO external service hook, NO webhook.
--     Tokens are stored in our own Postgres, delivered (later) by our own
--     Edge Function calling Apple APNS / Google FCM via Expo's thin proxy.
--   - DELETE means DELETE (PRIVACY.md D6 + spec AC-3): public.push_tokens.
--     user_id has ON DELETE CASCADE → public.users(id). delete_my_account()
--     (defined in schema.sql) cascades through auth.users → public.users →
--     push_tokens automatically. No soft-delete, no tombstone.
--   - RLS posture (spec Section 5): a user can SELECT/INSERT/UPDATE/DELETE
--     only their OWN push_tokens rows. No cross-user reads, no admin read,
--     no aggregate query path from the client. The three RPCs are SECURITY
--     DEFINER so they bypass RLS for trusted operations — the RPCs themselves
--     enforce the auth.uid() check (mirrors claim_resource pattern from
--     schema.sql L397-425).
--   - push_preferences is on public.users → already covered by the existing
--     users_self_read RLS (schema.sql L508-511). Other users do NOT see
--     another user's preferences. Admins do NOT see preferences (Cycle 5
--     admin-visible fields list does not include push_preferences; this
--     migration adds 0 to that count).
--   - Token storage is plaintext (spec DFS-1 default; not a credential, see
--     spec §"Privacy considerations" item 3). The token is rotatable by the
--     user via the OS at any time; hashing would break rotation comparisons.
--   - last_used_at is bumped by the Edge Function on successful delivery
--     (out of scope here). The stale-token cleanup cron (Section 6) deletes
--     tokens not used in 60 days — covers the "user uninstalled the app"
--     case where Expo's DeviceNotRegistered response should have triggered
--     an immediate delete (spec DFS-3) but didn't (defensive belt-and-braces).
--
-- Jordan is flagged for FULL REVIEW per the spec (Section §"Privacy
-- considerations"). Sky must read this header + the spec's DFS section +
-- confirm DFS items before applying.
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- 1. Creates public.push_tokens table:
--      - id UUID PRIMARY KEY
--      - user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
--      - expo_token TEXT NOT NULL
--      - platform TEXT CHECK (platform IN ('ios','android','web'))
--      - created_at TIMESTAMPTZ DEFAULT now()
--      - last_used_at TIMESTAMPTZ DEFAULT now()
--      - UNIQUE (user_id, expo_token)
-- 2. Adds an index on (user_id, last_used_at DESC) for the cleanup query.
-- 3. Adds push_preferences JSONB NOT NULL DEFAULT '{"enabled": false}' on
--    public.users — single source of truth for opt-in state + per-trigger
--    toggles. Spec AC-1 + AC-7. Defaulting at the column level guarantees
--    every existing user is migrated with the opted-OUT state.
-- 4. Enables RLS on push_tokens and adds four self-only policies (SELECT,
--    INSERT, UPDATE, DELETE) — spec §"Data view" / Section 5.
-- 5. Creates three RPCs (SECURITY DEFINER):
--      - register_push_token(p_expo_token TEXT, p_platform TEXT) RETURNS BOOLEAN
--        UPSERT pattern: insert new row or bump last_used_at on existing.
--      - revoke_push_token(p_expo_token TEXT) RETURNS BOOLEAN
--        DELETE own row matching the token.
--      - update_push_preferences(p_prefs JSONB) RETURNS JSONB
--        Merges incoming prefs onto users.push_preferences and returns the
--        merged result.
-- 6. Grants EXECUTE on the three RPCs to the `authenticated` role.
-- 7. Schedules a pg_cron job `prune_stale_push_tokens_nightly` at 03:30 UTC
--    that deletes tokens not used in 60 days, logged to cron_log per S6.
--
-- WHY
-- ===
-- Quinn's spec is the authoritative rationale. The TL;DR:
--   - Phase 3 Sub-3.1 (push) is the foundation for chat (Sub-3.3) and the
--     critical "claim notification" trigger that drives Casey's seed-community
--     metric ("successful exchanges per week").
--   - Mara's lock-screen anti-goal makes the title-only rule load-bearing;
--     this schema is where the title-only rule is bootstrapped (default OFF +
--     RLS + RPC gates + cascade-delete-honesty).
--   - The MVP without push leaves claims sitting unseen for hours; the seed-
--     community metric falters; the entire 90-day plan slips.
--
-- INTERACTION WITH EXISTING MIGRATIONS
-- ====================================
-- - schema.sql (Cycle 1) — adds the public.users table this migration
--   ALTERs and the auth.users CASCADE chain that delete_my_account() relies
--   on. The push_preferences column rides on the existing users_self_read /
--   users_verified_read_others / users_self_update RLS policies (no policy
--   changes needed). The protect_admin_flags trigger does NOT gate the new
--   column (it only guards is_verified and is_admin per L218-234), so the
--   users_self_update policy + WITH CHECK clause is sufficient for a user
--   to toggle their own preferences via update_push_preferences().
-- - Migrations 003 + 007 — establish the pg_cron + cron_log + nightly-job
--   pattern. This migration follows the same shape: nightly cron at a
--   different minute (03:30 vs 03:00 to spread load), logs to cron_log with
--   the same (job_name, rows_affected, success, error_text) format. The
--   <36h freshness alert (schema.sql comment on cron_log) will key off the
--   new job_name and surface stale runs.
-- - Migration 005 (pickup confirmation) — confirm_pickup is the source of
--   trigger 2 ("pickup confirmed") in the Edge Function's switch table.
--   This migration does NOT modify confirm_pickup; the Edge Function will
--   be called by confirm_pickup in a future, separate migration once the
--   Edge Function ships.
-- - No interaction with migrations 001, 002, 004, 006, 008 — all are
--   orthogonal (RLS recursion fix, autosuspend cron, categories, onboarding,
--   prune extension).
--
-- ROLLBACK
-- ========
-- Commented-out block at the bottom unwinds in reverse-dependency order:
--   1. Unschedule the cron job (so it stops trying to call the cleanup fn).
--   2. Drop the three RPCs.
--   3. Drop the RLS policies.
--   4. Drop the push_tokens table (CASCADE on user_id is fine — no inbound FK).
--   5. Drop the push_preferences column from public.users.
-- Rollback is safe (no data loss in the rollback step itself), but the
-- whole feature is offline until re-apply. Existing tokens are dropped at
-- step 4 — users would need to re-opt-in. This is acceptable for an MVP
-- feature with no production users yet.
--
-- IDEMPOTENT
-- ==========
-- - CREATE TABLE IF NOT EXISTS on push_tokens.
-- - CREATE INDEX IF NOT EXISTS on the cleanup index.
-- - ALTER TABLE ... ADD COLUMN IF NOT EXISTS on push_preferences.
-- - CREATE OR REPLACE FUNCTION on all three RPCs and the cleanup function.
-- - DROP POLICY IF EXISTS + CREATE POLICY pattern (mirrors schema.sql).
-- - GRANT EXECUTE is idempotent in Postgres (re-applying does not error).
-- - cron.schedule is wrapped in a DO block that uses cron.unschedule first
--   IF EXISTS, then cron.schedule. Re-applying does not duplicate the job.
-- Safe to re-run.
--
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- =======================================
-- 1. (DEFAULT JSONB SHAPE) The task brief and spec AC-1 + AC-7 disagree
--    slightly on the default shape:
--      - Task brief: '{"enabled": false}' (single bool gate)
--      - Spec AC-7:  '{"claim_placed": false, "pickup_confirmed": false,
--                      "admin_approved": false, "admin_rejected": false}'
--    The task brief explicitly says "single source of truth for opt-in
--    (default OFF per Quinn AC-1) + per-trigger toggles". This migration
--    implements the TASK BRIEF default '{"enabled": false}' as the column
--    default to keep the schema simple and let the application layer (or a
--    follow-up migration once Sky resolves spec DFS items) populate the
--    per-trigger keys via update_push_preferences(p_prefs). The merge
--    semantics of update_push_preferences (jsonb || jsonb) mean clients can
--    introduce new keys without a schema change — the column shape stays
--    flexible. If Sky prefers the full per-trigger default at creation time,
--    a one-line DEFAULT change suffices in a follow-up. Filed as DFS-MIG9-1.
-- 2. (PLATFORM CHECK INCLUDES 'web') The spec's draft CHECK constraint
--    (§"Data view") restricts platform to ('ios','android'). The task brief
--    explicitly says ('ios','android','web'). This migration honors the
--    TASK BRIEF and includes 'web' to future-proof for Expo Web (out-of-
--    scope per spec §"Out of scope" but adding it now costs nothing and
--    avoids a CHECK-constraint migration if Expo Web ships later). Filed as
--    DFS-MIG9-2 in case Sky prefers strict ios/android-only.
-- 3. (last_used_at DEFAULT now()) The spec's draft schema declares
--    last_used_at as nullable with no default. The task brief specifies
--    DEFAULT now(). Going with the task brief: a non-NULL last_used_at at
--    insert time simplifies the cleanup-cron WHERE clause (no IS NOT NULL
--    guard needed) and gives the row a meaningful "first-seen" timestamp
--    even if the Edge Function never gets to bump it. The register_push_token
--    UPSERT path explicitly sets last_used_at = now() on both insert and
--    update branches to be self-documenting.
-- 4. (UPSERT IMPLEMENTATION) register_push_token uses
--    INSERT ... ON CONFLICT (user_id, expo_token) DO UPDATE SET last_used_at
--    = now(). This matches the UNIQUE (user_id, expo_token) constraint and
--    is a single-statement atomic operation. The function returns TRUE on
--    both insert and update branches (the client doesn't need to distinguish).
-- 5. (PLATFORM ROTATION) The spec's AC-4 says: "a rotation event leaves
--    exactly ONE active row per (user_id, platform) pair, never two." The
--    spec's RPC implementation note (§"RPC contracts" → register_push_token)
--    says: "If a row already exists for (user_id, platform) with a DIFFERENT
--    expo_token, the old row is DELETED first." THIS MIGRATION DOES NOT
--    IMPLEMENT THE PLATFORM-LEVEL ROTATION DELETE — only the (user_id,
--    expo_token) UPSERT. Reasoning:
--      (a) The UNIQUE constraint in the task brief is (user_id, expo_token),
--          not (user_id, platform). Two devices on the same platform (e.g.,
--          a phone and a tablet, both iOS) is a legitimate case — the user
--          should receive notifications on both. Enforcing one-row-per-
--          platform would break dual-device users.
--      (b) The "rotation" the spec describes (app reinstall, OS update)
--          produces a NEW expo_token; the OLD token is identifiable only
--          by the client tracking it across a session boundary. The client
--          is the only party that can know "this is my old token, please
--          revoke it" — the server has no way to tell rotation from a new
--          device. The client's existing flow (AC-4: "OLD token is revoked
--          via revoke_push_token(old_token), NEW token is registered") is
--          the right place for this logic.
--      (c) If Sky later wants server-side enforcement of one-row-per-
--          platform, the right shape is a separate ALTER TABLE adding a
--          UNIQUE (user_id, platform) constraint + a rotation logic block
--          in register_push_token. Filed as DFS-MIG9-3.
-- 6. (revoke_push_token PARAMETER) The spec's RPC contract describes
--    revoke_push_token() with NO parameters (deletes ALL tokens for the
--    caller). The task brief specifies revoke_push_token(p_expo_token TEXT)
--    (deletes ONE token). Going with the TASK BRIEF — per-token revoke is
--    more granular and matches the client's natural flow (each device knows
--    its own token; revoke that specific one). The "disable all" UI button
--    can iterate over the user's tokens or call a separate
--    revoke_all_push_tokens() helper if needed (out of scope here). Filed
--    as DFS-MIG9-4. Also: revoke_push_token does NOT modify push_preferences
--    — the client (or update_push_preferences) is responsible for flipping
--    the JSONB toggle. This keeps each RPC single-purpose.
-- 7. (update_push_preferences MERGE SEMANTICS) The function uses jsonb
--    concatenation (||) which merges top-level keys: new keys are added,
--    existing keys are overwritten. Nested keys are replaced wholesale
--    (jsonb || is shallow). This is the simplest, most predictable
--    semantics for a flat preferences object. If nested-merge is ever
--    needed, a future migration can switch to jsonb_set or a recursive
--    merge function. Returning the merged JSONB lets the client confirm
--    the post-merge state without a second SELECT.
-- 8. (STALE CLEANUP THRESHOLD) 60 days per task brief. Reasoning vs other
--    candidates:
--      - 30 days: too aggressive; matches the resource-retention window
--        but a user who opens the app once a month would lose their token
--        and miss the next month's notifications until they next foreground.
--      - 60 days: hits the sweet spot. Spec DFS-3 says auto-delete on
--        Expo's DeviceNotRegistered response (which the Edge Function
--        handles); 60-day cleanup is the belt-and-braces backstop for
--        tokens the Edge Function never tried to deliver to (no recent
--        triggers fired for this user).
--      - 90 days: too long; lets a stale token sit for an entire quarter.
--    The threshold is in INTERVAL '60 days' literal in the SQL — easy to
--    retune. Filed as DFS-MIG9-5 if Sky prefers a different window.
-- 9. (CRON SCHEDULE 03:30 UTC) Spread from the existing prune job (03:00
--    per schema.sql + migrations 003/007) to avoid two large sweeps
--    contending for the same Postgres window. 30-minute offset is
--    arbitrary; could be 04:00 or any other off-peak slot. The job name
--    `prune_stale_push_tokens_nightly` mirrors `prune_expired_resources_
--    nightly` for consistency.
-- 10. (NO ROW-LEVEL AUDIT LOG) Per spec §"Privacy considerations" item 5:
--     cron_log entries for push deliveries (and this cleanup) NEVER contain
--     user-identifying data. Only aggregate counts (rows_affected). The
--     Edge Function will write its own cron_log rows on delivery success/
--     failure with the same shape. No per-recipient identifiers, ever.

-- ============================================================================
-- 1. push_tokens table
-- ============================================================================
-- One row per (user_id, expo_token) pair. Multiple devices per user → multiple
-- rows. Token rotation handled client-side (AC-4) via register → revoke calls;
-- the UNIQUE constraint serves as the UPSERT key for register_push_token.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expo_token   TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, expo_token)
);

COMMENT ON TABLE public.push_tokens IS
  'Push notification tokens (Expo). One row per (user_id, expo_token). Multiple devices per user allowed. CASCADE on user_id → public.users honors PRIVACY.md D6 (delete-my-account removes all tokens). RLS: self-only for all four verbs. Writes via SECURITY DEFINER RPCs (register/revoke). See migration 009.';

COMMENT ON COLUMN public.push_tokens.id           IS 'Surrogate PK; UUID for client-side reference if ever needed (currently unused — clients reference by expo_token).';
COMMENT ON COLUMN public.push_tokens.user_id      IS 'Owner. CASCADE on delete (PRIVACY.md D6). RLS-gated self-only.';
COMMENT ON COLUMN public.push_tokens.expo_token   IS 'Expo push token (plaintext per spec DFS-1 default — not a credential, rotatable by OS).';
COMMENT ON COLUMN public.push_tokens.platform     IS 'Device platform. CHECK enforces (ios|android|web); web included for future Expo Web support (currently out of scope).';
COMMENT ON COLUMN public.push_tokens.created_at   IS 'First registration timestamp.';
COMMENT ON COLUMN public.push_tokens.last_used_at IS 'Bumped on register_push_token re-call OR by the Edge Function on successful delivery. Drives stale-token cleanup (60d).';

-- ============================================================================
-- 2. Index on (user_id, last_used_at DESC) for cleanup queries
-- ============================================================================
-- Two query shapes use this index:
--   (a) Cleanup cron:
--       DELETE FROM public.push_tokens WHERE last_used_at < now() - INTERVAL '60 days'
--   (b) Per-user "list my devices" (future Profile screen feature, not in MVP):
--       SELECT * FROM public.push_tokens WHERE user_id = $uid ORDER BY last_used_at DESC
-- The composite (user_id, last_used_at DESC) supports (b) directly and helps
-- (a) via a range scan on last_used_at within each user partition.

CREATE INDEX IF NOT EXISTS push_tokens_user_last_used_idx
  ON public.push_tokens (user_id, last_used_at DESC);

COMMENT ON INDEX public.push_tokens_user_last_used_idx IS
  'Composite (user_id, last_used_at DESC). Supports per-user device listing and the nightly stale-token cleanup. See migration 009.';

-- ============================================================================
-- 3. push_preferences column on public.users
-- ============================================================================
-- Single source of truth for opt-in. Defaults to {"enabled": false} → every
-- existing user and every new user starts opted-OUT (spec AC-1). Per-trigger
-- keys (claim_placed, pickup_confirmed, admin_approved, admin_rejected) are
-- added by the client (or a follow-up migration) via update_push_preferences.
-- See DECISIONS #1 in this migration's header for the shape rationale.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_preferences JSONB NOT NULL DEFAULT '{"enabled": false}'::jsonb;

COMMENT ON COLUMN public.users.push_preferences IS
  'Opt-in state for push notifications. Default: {"enabled": false} (spec AC-1 — every user starts opted-OUT). Per-trigger toggles (claim_placed, pickup_confirmed, admin_approved, admin_rejected) added by the client via update_push_preferences RPC; shallow-merge semantics let the shape evolve without schema changes. Self-only RLS via existing users_self_read policy. See migration 009.';

-- ============================================================================
-- 4. RLS on push_tokens — self-only for all four verbs
-- ============================================================================
-- The spec's draft (§"Data view") shows only a SELECT policy and notes:
-- "No INSERT/UPDATE/DELETE policies — only security-definer RPCs write rows".
-- The task brief explicitly asks for all four (SELECT, INSERT, UPDATE, DELETE)
-- as self-only. Going with the TASK BRIEF: explicit self-only policies are
-- belt-and-braces. The SECURITY DEFINER RPCs bypass RLS regardless, but if a
-- direct client write ever happens (bug, future code path, manual SQL by
-- service_role accidentally on the wrong row), the RLS WITH CHECK denies it.
-- Defense in depth.

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_self_select ON public.push_tokens;
CREATE POLICY push_tokens_self_select ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_self_insert ON public.push_tokens;
CREATE POLICY push_tokens_self_insert ON public.push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_self_update ON public.push_tokens;
CREATE POLICY push_tokens_self_update ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_self_delete ON public.push_tokens;
CREATE POLICY push_tokens_self_delete ON public.push_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON POLICY push_tokens_self_select ON public.push_tokens IS
  'Users SELECT their own tokens only. No cross-user reads. No admin read (admins do NOT see push tokens — Cycle 5 admin-visible-fields cap stays unchanged).';

-- ============================================================================
-- 5. RPCs (SECURITY DEFINER — bypass RLS for trusted operations)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- register_push_token(p_expo_token, p_platform) — UPSERT pattern
-- ----------------------------------------------------------------------------
-- Inserts a new (user_id, expo_token, platform) row OR bumps last_used_at if
-- a row already exists for (user_id, expo_token). Returns TRUE on both
-- branches (caller doesn't need to distinguish insert vs update).
--
-- Authorization: requires auth.uid() (authenticated session).
--
-- Validation:
--   - p_expo_token must be non-NULL and non-empty.
--   - p_platform must match the CHECK constraint values; the raw constraint
--     handles this — explicit error message kept generic to avoid leaking
--     the allowed-values list (defense against fingerprinting).
--
-- NOTE: this RPC does NOT enforce the spec's AC-8 "at least one
-- push_preferences.* = true" server-side check. Reasoning:
--   (a) The default push_preferences shape is {"enabled": false} (DECISIONS
--       #1) — a flat single-key gate. The spec's per-trigger key list is the
--       application's responsibility, not the schema's. Forcing a specific
--       JSONB shape in this RPC would couple schema and application layer.
--   (b) The client-side check (push.ts helper per spec §AC-8 client layer)
--       is the primary gate. The Edge Function's pre-send re-check (spec
--       §AC-8 Edge Function layer) is the last line of defense.
--   (c) If Sky wants server-side enforcement here, a follow-up migration
--       can add: IF NOT (caller_prefs->>'enabled')::boolean THEN RAISE ...
--       — but only after the JSONB shape is locked. Filed DFS-MIG9-6.

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

  -- UPSERT: insert new row OR bump last_used_at on existing (user_id, expo_token).
  -- See DECISIONS #4 + #5 in the header for why we don't enforce one-row-per-
  -- platform here (legitimate dual-device case).
  INSERT INTO public.push_tokens (user_id, expo_token, platform, last_used_at)
  VALUES (caller, p_expo_token, p_platform, now())
  ON CONFLICT (user_id, expo_token) DO UPDATE
    SET last_used_at = now();

  RETURN TRUE;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise so PostgREST surfaces a structured error to the client.
    -- Per spec AC-5 the Edge Function (out of scope here) must not log user-
    -- identifying data on failure — this RPC's RAISE is fine because it goes
    -- to the client's error path, not to a persistent log.
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.register_push_token(TEXT, TEXT) IS
  'Phase 3 push registration. UPSERT on (user_id, expo_token): inserts new row or bumps last_used_at on existing. Returns TRUE. Raises ''Not authenticated'' | ''Token required'' | ''Invalid platform''. Does NOT enforce server-side preference-on check (DECISIONS #4 in migration 009; client + Edge Function enforce). See spec qa-reports/spec-phase-3-push-notifications.md.';

-- ----------------------------------------------------------------------------
-- revoke_push_token(p_expo_token) — DELETE own row
-- ----------------------------------------------------------------------------
-- Deletes the (auth.uid(), p_expo_token) row. Returns TRUE if a row was
-- deleted, FALSE if no matching row existed (idempotent — calling on an
-- already-revoked token is safe).
--
-- Does NOT touch push_preferences — the client (or update_push_preferences)
-- is responsible for flipping the JSONB toggle separately. This keeps each
-- RPC single-purpose. See DECISIONS #6 in the header.

CREATE OR REPLACE FUNCTION public.revoke_push_token(p_expo_token TEXT)
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

  IF p_expo_token IS NULL OR length(p_expo_token) = 0 THEN
    RAISE EXCEPTION 'Token required';
  END IF;

  DELETE FROM public.push_tokens
  WHERE user_id = caller AND expo_token = p_expo_token;

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  -- Return TRUE if we deleted a row; FALSE if no matching row (idempotent).
  RETURN rows_deleted > 0;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.revoke_push_token(TEXT) IS
  'Phase 3 push revocation. DELETE own (auth.uid(), expo_token) row. Returns TRUE if deleted, FALSE if no matching row. Does NOT modify push_preferences. Raises ''Not authenticated'' | ''Token required''. See migration 009.';

-- ----------------------------------------------------------------------------
-- update_push_preferences(p_prefs) — merge prefs onto users.push_preferences
-- ----------------------------------------------------------------------------
-- Shallow-merges p_prefs onto the caller's users.push_preferences via the
-- JSONB || operator. New keys are added; existing keys are overwritten.
-- Returns the merged JSONB so the client can confirm the post-merge state.
--
-- See DECISIONS #7 in the header for merge semantics rationale.

CREATE OR REPLACE FUNCTION public.update_push_preferences(p_prefs JSONB)
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

  IF p_prefs IS NULL THEN
    RAISE EXCEPTION 'Preferences required';
  END IF;

  IF jsonb_typeof(p_prefs) <> 'object' THEN
    RAISE EXCEPTION 'Preferences must be an object';
  END IF;

  -- Shallow merge via ||. Returns the merged result via RETURNING.
  UPDATE public.users
  SET push_preferences = COALESCE(push_preferences, '{}'::jsonb) || p_prefs
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
  'Phase 3 push preference update. Shallow-merges p_prefs onto users.push_preferences via JSONB || operator. Returns the merged result. Raises ''Not authenticated'' | ''Preferences required'' | ''Preferences must be an object'' | ''User row not found''. See migration 009.';

-- ============================================================================
-- 6. GRANT EXECUTE — mirrors migrations 003/005 pattern
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_push_token(TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_push_preferences(JSONB)  TO authenticated;

-- ============================================================================
-- 7. Stale-token cleanup — nightly cron at 03:30 UTC (60-day threshold)
-- ============================================================================
-- Function definition first; then unschedule any existing cron job by the
-- same name and re-schedule (idempotent re-apply).

CREATE OR REPLACE FUNCTION public.prune_stale_push_tokens()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM public.push_tokens
    WHERE last_used_at < now() - INTERVAL '60 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  -- Per spec §"Privacy considerations" item 5 + AC-5: no per-recipient
  -- identifiers in the log. Just the aggregate count.
  INSERT INTO public.cron_log (job_name, rows_affected, success)
  VALUES ('prune_stale_push_tokens', deleted_count, true);
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
    VALUES ('prune_stale_push_tokens', 0, false, SQLERRM);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.prune_stale_push_tokens() IS
  '60-day stale-token cleanup. DELETEs public.push_tokens rows where last_used_at < now() - INTERVAL ''60 days''. Belt-and-braces backstop for tokens the Edge Function''s DeviceNotRegistered handler missed. Logs aggregate count to cron_log; NO per-recipient identifiers (spec AC-5). See migration 009.';

GRANT EXECUTE ON FUNCTION public.prune_stale_push_tokens() TO postgres;

-- Schedule the cron job at 03:30 UTC (offset from the 03:00 resource prune
-- to spread load). Idempotent re-apply via unschedule-then-schedule.
DO $$
DECLARE
  existing_jobid BIGINT;
BEGIN
  SELECT jobid INTO existing_jobid
  FROM cron.job
  WHERE jobname = 'prune_stale_push_tokens_nightly';

  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'prune_stale_push_tokens_nightly',
    '30 3 * * *',
    $cron$SELECT public.prune_stale_push_tokens();$cron$
  );
END;
$$;

-- ============================================================================
-- TEST STUB — Steve / Gary should add scenarios in supabase/__tests__/rls.sql
-- ============================================================================
-- Recommended scenarios (wrap each in BEGIN; ROLLBACK; like the existing
-- T1-T9 + T-CONF-* + T-PRUNE-* patterns):
--
--   T-PUSH-1: register_push_token with auth.uid() set → returns TRUE, row
--             appears in push_tokens with (caller, token, platform, now(),
--             now()).
--   T-PUSH-2: register_push_token called twice with same token → only one
--             row exists; last_used_at on the second call > first call.
--   T-PUSH-3: register_push_token with unauthenticated client →
--             RAISE 'Not authenticated'.
--   T-PUSH-4: register_push_token with NULL or empty token → RAISE 'Token
--             required'.
--   T-PUSH-5: register_push_token with invalid platform (e.g., 'desktop') →
--             RAISE 'Invalid platform'.
--   T-PUSH-6: register_push_token by user A; user B SELECT push_tokens →
--             zero rows (RLS push_tokens_self_select blocks).
--   T-PUSH-7: register_push_token by user A; user A SELECT push_tokens →
--             one row.
--   T-PUSH-8: revoke_push_token deletes the matching row; returns TRUE.
--   T-PUSH-9: revoke_push_token on a non-existent token → returns FALSE
--             (idempotent).
--   T-PUSH-10: revoke_push_token by user A on user B's token → zero rows
--              deleted (RLS-equivalent — auth.uid() in the RPC WHERE clause).
--   T-PUSH-11: update_push_preferences with {"enabled": true, "claim_placed":
--              true} → returns the merged JSONB; users.push_preferences
--              reflects the merge.
--   T-PUSH-12: update_push_preferences merges on top of existing keys (e.g.,
--              start with {"enabled": true}, call with {"enabled": false} →
--              result is {"enabled": false}).
--   T-PUSH-13: update_push_preferences with NULL or non-object → RAISE.
--   T-PUSH-14: delete_my_account on a user with push_tokens rows → zero
--              rows remain for that user_id (CASCADE check; spec AC-3).
--   T-PUSH-15: prune_stale_push_tokens deletes rows with last_used_at older
--              than 60 days; logs aggregate count to cron_log; the log row
--              contains NO user_id, NO expo_token text (regex assertion).
--   T-PUSH-16: prune_stale_push_tokens skips rows with last_used_at within
--              the 60-day window.
--   T-PUSH-17: Direct INSERT into push_tokens by an authenticated client
--              via PostgREST → RLS allows ONLY if user_id = auth.uid()
--              (push_tokens_self_insert policy); attempting to insert for
--              another user_id → 401/policy-violation.
--   T-PUSH-18: push_preferences column on public.users defaults to
--              '{"enabled": false}'::jsonb for new auth.users INSERTs
--              (handle_new_user trigger does NOT need updating — the column
--              default applies on the INSERT that the trigger emits).

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- Unwinds in reverse-dependency order. Safe rollback (no data loss in the
-- rollback step itself), but the entire push feature is offline until re-
-- apply. Existing tokens are dropped at step 4 — users must re-opt-in.
--
-- BEGIN;
--
--   -- 1. Unschedule the cron job.
--   DO $$
--   DECLARE
--     existing_jobid BIGINT;
--   BEGIN
--     SELECT jobid INTO existing_jobid
--     FROM cron.job
--     WHERE jobname = 'prune_stale_push_tokens_nightly';
--     IF existing_jobid IS NOT NULL THEN
--       PERFORM cron.unschedule(existing_jobid);
--     END IF;
--   END;
--   $$;
--
--   -- 2. Drop the cleanup function.
--   DROP FUNCTION IF EXISTS public.prune_stale_push_tokens();
--
--   -- 3. Drop the three RPCs.
--   DROP FUNCTION IF EXISTS public.update_push_preferences(JSONB);
--   DROP FUNCTION IF EXISTS public.revoke_push_token(TEXT);
--   DROP FUNCTION IF EXISTS public.register_push_token(TEXT, TEXT);
--
--   -- 4. Drop the RLS policies + table (CASCADE handles policies + index).
--   DROP TABLE IF EXISTS public.push_tokens CASCADE;
--
--   -- 5. Drop the push_preferences column from public.users.
--   -- WARNING: this drops user preference state. If any user has flipped
--   -- preferences ON, that state is lost. Acceptable for an MVP feature with
--   -- no production users yet; revisit if rollback is ever attempted post-launch.
--   ALTER TABLE public.users DROP COLUMN IF EXISTS push_preferences;
--
-- COMMIT;
--
-- After rollback the Phase 3 push notifications feature is offline. The UI
-- (Shamus's Profile notifications section + push.ts helper) will see a
-- missing RPC and error out — Shamus's code should fail-soft. The Edge
-- Function (when deployed) will have no schema to read from and should be
-- undeployed via Supabase CLI as part of the rollback. Re-apply migration
-- 009 to re-enable.
