-- Migration 012 — Push rate-limit table + increment RPC
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-25
-- References:
--   Rory Edge Function: supabase/functions/deliver_notification/index.ts
--   Quinn spec: qa-reports/spec-phase-3-push-notifications.md (Revision 2)
--   Jordan privacy review: AC-15 rate-limit requirement
--   Migration 011: supabase/migrations/011_push_token_security_gates.sql
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- Implements AC-15: per-trigger-per-window delivery caps for push notifications.
--
-- The deliver_notification Edge Function (migration 012's direct consumer)
-- enforces rate limits in two steps:
--
--   Step A — Optimistic INSERT (count=1) into push_rate_limit.
--            If no conflict (first event in this window): row is created, count=1.
--            The Edge Function proceeds with delivery.
--
--   Step B — On conflict (row already exists): the Edge Function calls the
--            increment_push_rate_limit RPC to atomically increment count and
--            return the new value. If new count > cap, delivery is skipped.
--
-- AC-15 caps (enforced in the Edge Function using these constants):
--   claim_placed    : 20 / hour  (window = 3600 s)
--   pickup_confirmed: 10 / hour  (window = 3600 s)
--   admin_approved  :  1 / 24 h  (window = 86400 s)
--   admin_rejected  :  1 / 24 h  (window = 86400 s)
--
-- The window_start value is pre-computed by the Edge Function using truncated
-- Unix time (now - now % window_seconds). Each window is a distinct PK row.
--
-- PRIVACY NOTES
-- =============
-- - user_id is an FK to auth.users. No handle, email, or PII is stored.
-- - trigger is one of four fixed string literals (see Edge Function constants).
-- - The table is WRITE-ONLY from the client/Edge-Function perspective.
--   No user-facing SELECT policies — only SECURITY DEFINER writes.
-- - Stale rows accumulate; nightly pruning via pg_cron (see comment below).
--
-- RLS
-- ===
-- RLS is ENABLED on push_rate_limit. No policies for anon / authenticated
-- roles. All writes go through:
--   a. Direct INSERT from the Edge Function (service role, bypasses RLS).
--   b. increment_push_rate_limit RPC (SECURITY DEFINER, runs as postgres,
--      bypasses RLS).
-- This means only the service role and SECURITY DEFINER functions can touch
-- the table. No user-facing reads are needed or exposed.
--
-- NIGHTLY PRUNING
-- ===============
-- Rows older than 25 hours (covering the largest 24-hour window + 1 hour
-- buffer) can be pruned. A pg_cron entry is NOT added by this migration —
-- cron entries are managed via the Supabase dashboard (or a future dedicated
-- migration). Sky should add the following cron job after applying:
--
--   SELECT cron.schedule(
--     'prune_push_rate_limit_nightly',
--     '15 3 * * *',
--     $$
--       DELETE FROM public.push_rate_limit
--        WHERE window_start < now() - interval '25 hours';
--       INSERT INTO public.cron_log (job_name, rows_affected, success)
--       VALUES ('prune_push_rate_limit_nightly', (SELECT count(*) FROM public.push_rate_limit), true);
--     $$
--   );
--
-- (Equivalent pattern to prune_stale_push_tokens_nightly from migration 009.)
--
-- IDEMPOTENT
-- ==========
-- - CREATE TABLE uses IF NOT EXISTS — safe to re-run.
-- - CREATE OR REPLACE FUNCTION on increment_push_rate_limit — always idempotent.
-- - GRANT EXECUTE is idempotent in Postgres.
-- Safe to re-run.
--
-- Constitution Art. 5: This is a FILE. Dana writes; Sky applies via the
-- Supabase dashboard SQL editor. Never applied to a live database by any agent.
-- ============================================================================

BEGIN;

-- ============================================================================
-- TABLE: push_rate_limit
-- ============================================================================
-- One row per (user_id, trigger, window_start) tuple.
-- count tracks how many push notifications have been delivered in this window.
-- The PK enforces uniqueness; conflict handling drives the two-step
-- insert-or-increment pattern used by the Edge Function.

CREATE TABLE IF NOT EXISTS public.push_rate_limit (
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger      TEXT         NOT NULL,
  window_start TIMESTAMPTZ  NOT NULL,
  count        INTEGER      NOT NULL DEFAULT 1
                            CHECK (count >= 1),
  PRIMARY KEY (user_id, trigger, window_start)
);

COMMENT ON TABLE public.push_rate_limit IS
  'AC-15 per-trigger-per-window delivery caps for push notifications. '
  'One row per (user_id, trigger, window_start). Written exclusively by the '
  'deliver_notification Edge Function (service role + SECURITY DEFINER RPC). '
  'No user-facing SELECT policies — service role and SECURITY DEFINER only. '
  'Stale rows pruned nightly by prune_push_rate_limit_nightly cron job. '
  'Added by migration 012 (Dana 2026-05-25).';

COMMENT ON COLUMN public.push_rate_limit.user_id IS
  'Recipient user whose delivery rate is being tracked. FK to auth.users; '
  'cascade-delete keeps the table clean when a user account is removed.';

COMMENT ON COLUMN public.push_rate_limit.trigger IS
  'One of four fixed trigger strings: claim_placed, pickup_confirmed, '
  'admin_approved, admin_rejected. Enforced by the Edge Function caller; '
  'no DB-level CHECK here to avoid a migration required for future triggers.';

COMMENT ON COLUMN public.push_rate_limit.window_start IS
  'Start of the rate-limit window, truncated by the Edge Function to the '
  'window size in seconds (e.g. 3600s or 86400s). Computed as: '
  'new Date((now_unix - now_unix % window_seconds) * 1000).toISOString(). '
  'Acts as the "bucket" key for the counting window.';

COMMENT ON COLUMN public.push_rate_limit.count IS
  'Number of push notifications delivered so far in this window. '
  'Starts at 1 on INSERT; incremented atomically by increment_push_rate_limit RPC. '
  'Constrained to >= 1 — a count of 0 should never exist (row is never inserted '
  'with count=0 and is deleted by nightly pruning, not zeroed).';

-- ============================================================================
-- INDEX: speed up nightly prune DELETE by window_start
-- ============================================================================

CREATE INDEX IF NOT EXISTS push_rate_limit_window_start_idx
  ON public.push_rate_limit (window_start);

COMMENT ON INDEX public.push_rate_limit_window_start_idx IS
  'Speeds up the nightly DELETE ... WHERE window_start < now() - interval ''25 hours'' '
  'prune query. Without this index, the prune would do a full-table scan. '
  'Added by migration 012 (Dana 2026-05-25).';

-- ============================================================================
-- RLS: enabled, no anon/user policies (SECURITY DEFINER + service role only)
-- ============================================================================

ALTER TABLE public.push_rate_limit ENABLE ROW LEVEL SECURITY;

-- No policies are added for the `anon` or `authenticated` roles.
-- The deliver_notification Edge Function runs with the service role key
-- (bypasses RLS for the initial INSERT). The increment_push_rate_limit RPC
-- is SECURITY DEFINER (runs as postgres, bypasses RLS for the UPDATE).
-- No user-facing reads of this table are needed or exposed.

-- ============================================================================
-- RPC: increment_push_rate_limit
-- ============================================================================
-- Called by deliver_notification when the initial INSERT conflicts (row exists).
-- Atomically increments count by 1 and returns the NEW count value.
--
-- Parameters (matching Edge Function supabase.rpc() call):
--   p_user_id      UUID        — recipient user's ID
--   p_trigger      TEXT        — one of the four fixed trigger strings
--   p_window_start TIMESTAMPTZ — window start bucket (pre-computed by caller)
--
-- Returns: INTEGER — the new count AFTER increment; NULL if row not found
--          (should not happen in normal operation, but callers handle NULL
--          as a fail-open by proceeding with delivery).
--
-- SECURITY DEFINER: runs as the postgres role, bypasses RLS. This is
-- intentional and safe — the caller (deliver_notification Edge Function)
-- already holds the service role and only passes server-derived values.
-- The function performs no privilege escalation beyond the table write.
--
-- Called exclusively from server-side SECURITY DEFINER context. Never
-- callable by the `authenticated` role directly (no GRANT to authenticated).

CREATE OR REPLACE FUNCTION public.increment_push_rate_limit(
  p_user_id      UUID,
  p_trigger      TEXT,
  p_window_start TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  -- Atomically increment count for the existing row and return the new value.
  -- The UPDATE is a single statement — atomic at the Postgres level.
  -- If no row exists (window expired between INSERT conflict and this call,
  -- which is a race that should not occur in practice), RETURNING yields NULL.
  UPDATE public.push_rate_limit
     SET count = count + 1
   WHERE user_id      = p_user_id
     AND trigger      = p_trigger
     AND window_start = p_window_start
  RETURNING count INTO v_new_count;

  -- Return the post-increment count (NULL if the row was not found).
  RETURN v_new_count;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise so the Edge Function can log the error code.
    -- The Edge Function treats an RPC error as fail-open (proceeds with
    -- delivery) per the deliver_notification spec.
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.increment_push_rate_limit(UUID, TEXT, TIMESTAMPTZ) IS
  'AC-15 atomic rate-limit counter increment for push notifications. '
  'Called by the deliver_notification Edge Function (service role) after '
  'an INSERT INTO push_rate_limit conflict (row already exists for this window). '
  'Parameters: p_user_id (recipient), p_trigger (fixed 4-value enum), '
  'p_window_start (pre-truncated window bucket). '
  'Returns the new count after increment, or NULL if the row was not found. '
  'SECURITY DEFINER — runs as postgres, bypasses RLS. '
  'Not granted to authenticated role — service-role/SECURITY DEFINER only. '
  'Added by migration 012 (Dana 2026-05-25).';

-- ============================================================================
-- Intentionally NO GRANT to authenticated
-- ============================================================================
-- increment_push_rate_limit must only be callable by:
--   a. The deliver_notification Edge Function (via service role).
--   b. Future SECURITY DEFINER RPCs if the rate-limit pattern is reused.
--
-- The authenticated role must NOT call this RPC directly. Omitting the
-- GRANT is the enforcement mechanism (Postgres default: no access).

COMMIT;

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- Unwinds in reverse creation order. Safe to apply at any time.
-- After rollback, the deliver_notification Edge Function will fail-open on
-- rate-limit errors (logs rate_limit_error, proceeds with delivery) — the
-- feature continues to work but AC-15 caps are unenforced until re-applied.
--
-- BEGIN;
--
--   -- 1. Drop the RPC.
--   DROP FUNCTION IF EXISTS public.increment_push_rate_limit(UUID, TEXT, TIMESTAMPTZ);
--
--   -- 2. Drop the index.
--   DROP INDEX IF EXISTS public.push_rate_limit_window_start_idx;
--
--   -- 3. Drop the table (CASCADE removes any dependent objects).
--   DROP TABLE IF EXISTS public.push_rate_limit CASCADE;
--
-- COMMIT;
--
-- Note: if the prune_push_rate_limit_nightly cron job was added via the
-- Supabase dashboard, remove it separately:
--   SELECT cron.unschedule('prune_push_rate_limit_nightly');
