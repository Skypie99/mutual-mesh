-- Migration 012 — Push rate limit
-- Applied: <pending Sky apply>
-- Author: Peter (performance), 2026-05-25
-- References:
--   Phase 4 report: qa-reports/morgan-2026-05-25.md
--   Context: edge function deliver_notification needs server-side rate limiting
--             to prevent push floods — max 10 pushes per user per hour.
--
-- ============================================================================
-- ROLLBACK (run in reverse order to undo)
-- ============================================================================
--   DROP TABLE IF EXISTS public.push_rate_limit;
--   DROP FUNCTION IF EXISTS increment_push_rate_limit(uuid);
-- ============================================================================
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
--
-- 1. Creates table public.push_rate_limit
--    One row per user. Tracks push count within the current 1-hour window.
--    Fields:
--      user_id        — PK, FK → public.users(id) ON DELETE CASCADE
--      count          — number of pushes sent in the current window
--      window_start   — when the current window opened
--
-- 2. Creates RPC increment_push_rate_limit(p_user_id uuid) → boolean
--    Called by the deliver_notification edge function before dispatching.
--    Logic:
--      a. Upsert a row for p_user_id (INSERT … ON CONFLICT DO NOTHING style
--         handled via INSERT … ON CONFLICT DO UPDATE).
--      b. If now() > window_start + interval '1 hour': reset count to 0,
--         update window_start to now() — window is stale, fresh start.
--      c. If count >= 10: return false (caller must abort push).
--      d. Increment count by 1, return true (caller may proceed).
--    SECURITY DEFINER owned by postgres; edge function calls it with its
--    service-role key.
--
-- 3. Enables Row Level Security on push_rate_limit.
--    Policy: a user may SELECT/UPDATE their own row only.
--    The SECURITY DEFINER RPC bypasses RLS, so edge functions are unaffected.
--
-- WHAT IT DOES NOT TOUCH
-- ======================
-- - push_tokens, push_preferences, register_push_token(): unchanged.
-- - deliver_notification edge function: caller must be updated separately
--   to call this RPC and honour the boolean return value.
-- ============================================================================

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_rate_limit (
  user_id      UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  count        INT         NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.push_rate_limit IS 'Per-user push notification rate limit: max 10 per hour. One row per user.';
COMMENT ON COLUMN public.push_rate_limit.count IS 'Pushes sent in the current window.';
COMMENT ON COLUMN public.push_rate_limit.window_start IS 'Start of the current 1-hour window. Resets when now() > window_start + 1h.';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.push_rate_limit ENABLE ROW LEVEL SECURITY;

-- Users may only read/write their own row.
DROP POLICY IF EXISTS push_rate_limit_self ON public.push_rate_limit;
CREATE POLICY push_rate_limit_self
  ON public.push_rate_limit
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- RPC
-- ============================================================================

DROP FUNCTION IF EXISTS increment_push_rate_limit(uuid);

CREATE OR REPLACE FUNCTION increment_push_rate_limit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count        INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Ensure a row exists for this user.
  INSERT INTO public.push_rate_limit (user_id, count, window_start)
  VALUES (p_user_id, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  -- Read current state.
  SELECT count, window_start
    INTO v_count, v_window_start
    FROM public.push_rate_limit
   WHERE user_id = p_user_id;

  -- Reset window if stale (>1 hour old).
  IF now() > v_window_start + INTERVAL '1 hour' THEN
    UPDATE public.push_rate_limit
       SET count = 0, window_start = now()
     WHERE user_id = p_user_id;
    v_count := 0;
  END IF;

  -- Enforce limit.
  IF v_count >= 10 THEN
    RETURN false;
  END IF;

  -- Increment and allow.
  UPDATE public.push_rate_limit
     SET count = count + 1
   WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION increment_push_rate_limit(uuid) IS
  'Rate-limit guard for push notifications. Returns true if the push is allowed '
  '(count was < 10 within the current hour window) and increments the counter. '
  'Returns false if the limit is reached. Resets automatically when the window expires.';

GRANT EXECUTE ON FUNCTION increment_push_rate_limit(uuid) TO authenticated;
