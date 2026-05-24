-- Migration 008 — Self-hosted anonymous error reporting (PRIVACY.md D8)
-- Applied: <pending Sky apply>
-- Author: Steve + Dana pair, 2026-05-24 — Phase 4 Tier 4 item #22
-- Source: ~/.claude/plans/goofy-singing-steele.md §2 Tier 4 #22
-- Privacy authority: PRIVACY.md D8 ("NO third-party SDKs in MVP. No Sentry,
--   no Mixpanel, no analytics. `package.json` audit at every Phase boundary.")
-- STRIDE authority: qa-reports/2026-05-23_threat-model-stride.md I7 (this
--   migration introduces I7 — see DECISIONS / ASSUMPTIONS #1).
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
-- Adds a single hash-only error-reporting table (public.error_reports) plus
-- the RPC (public.log_error) that the `log-error` Edge Function calls to
-- insert (or aggregate via upsert) one row per distinct (message_hash,
-- stack_hash, app_version, platform, severity) tuple.
--
-- The whole point of this table is to give Sky a private,
-- minimum-information signal that crashes are happening — WITHOUT giving
-- anyone (Sky, Supabase, Edge Function logs, a backup) access to the raw
-- error message text or stack trace. Both fields are SHA-256 hashes
-- produced server-side inside the Edge Function (supabase/functions/log-
-- error/index.ts); raw text never reaches this table or any log.
--
-- Aggregation: identical (message_hash, stack_hash) pairs increment a counter
-- on the same row rather than inserting a new row each time. This bounds the
-- table size at the cardinality of distinct error shapes, not the number of
-- crash events — important because a single crash loop on a popular release
-- could otherwise flood the table.
--
-- Retention: a nightly pg_cron job (`prune_error_reports_nightly`) deletes
-- rows where `last_seen_at < now() - INTERVAL '30 days'`. Matches the 30-day
-- ceiling Sky approved for `verification_log` in PRIVACY.md D7 and avoids
-- creating a long-lived crash archive that an attacker could read for
-- fingerprinting.
--
-- ============================================================================
-- WHAT IT DELIBERATELY DOES NOT STORE
-- ============================================================================
-- - No user_id / auth.uid() — anonymous reporting is the entire point.
--   Even verified callers' identity is dropped at the Edge Function.
-- - No session_id — would create a join surface to other tables.
-- - No IP address — the Edge Function strips X-Forwarded-For before any
--   write to this table. Supabase request logs may still record it for
--   their own audit purposes; that is platform-level and out of scope.
-- - No user-agent string — same rationale; stripped at the Edge Function.
-- - No raw message text or raw stack trace — only SHA-256 hashes. The hash
--   is taken server-side inside the Edge Function so even Supabase Edge
--   logs (which capture function logs but not table writes) never see the
--   raw text. The client sends the raw text over TLS; the Edge Function
--   hashes it; the raw text never lands anywhere persistent.
-- - No timestamp finer than `created_at` / `last_seen_at`. Per-event
--   timestamps would let an attacker correlate two reports with a user's
--   known activity window.
--
-- ============================================================================
-- WHY HASH SERVER-SIDE NOT CLIENT-SIDE
-- ============================================================================
-- The Edge Function does the SHA-256 hashing. Reasons:
--   1. Reproducibility — a future server-side regrouping (e.g. "all 500s in
--      this stack frame are one bug") only works if the server can re-hash
--      with a different scheme.
--   2. Defense in depth — a tampered client could send the raw text under a
--      different field name; the Edge Function refuses fields it does not
--      recognize and explicitly hashes the recognized ones. If hashing lived
--      on the client, a tampered client could replace the hash with raw
--      text, and that raw text would reach the DB via the RPC.
--   3. PII heuristic stripping (errorReporting.ts) runs client-side ON the
--      raw text BEFORE it leaves the device. The Edge Function then hashes
--      the (already-PII-scrubbed) text. Two layers, mirror PRIVACY.md D5
--      (two-layer EXIF strip).
--
-- ============================================================================
-- RATE-LIMIT POSTURE
-- ============================================================================
-- The Edge Function rate-limits per IP at 10/min using an in-process Deno
-- cache (see supabase/functions/log-error/index.ts). The DB layer does NOT
-- enforce rate-limiting via pg_advisory_xact_lock — keeping the DB hot path
-- a single INSERT means upstream burst protection lives entirely at the
-- Edge Function layer (where it can reject without a DB hit). This matches
-- Steve S2 (rate-limit invite verification at the Edge) and avoids piling
-- lock contention on the public.users table that the advisory key would
-- collide with.
--
-- ============================================================================
-- IDEMPOTENT
-- ============================================================================
-- - `CREATE TABLE IF NOT EXISTS` — safe to re-run.
-- - `CREATE INDEX IF NOT EXISTS` — safe to re-run.
-- - `CREATE UNIQUE INDEX IF NOT EXISTS` — safe to re-run.
-- - `CREATE OR REPLACE FUNCTION` — re-runs install the same body.
-- - `DROP POLICY IF EXISTS` then `CREATE POLICY` — re-runs cleanly.
-- - `GRANT EXECUTE` — no-op if already granted.
-- - `cron.schedule` is wrapped in a DO block with NOT EXISTS check so
--   re-runs don't duplicate the schedule.
--
-- ============================================================================
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- ============================================================================
-- 1. (STRIDE I7 — NEW RESIDUAL RISK) This migration introduces I7: an
--    attacker who can dump the table sees aggregate crash shapes. They
--    cannot read the message text (hashed) but they CAN observe e.g. "this
--    release has 4,000 crashes of shape X" which is competitive
--    intelligence. Mitigation: RLS is Sky-only SELECT (via config.sky_uuid
--    pointer, same pattern as verification_log). Even Supabase support
--    cannot SELECT without service-role.
-- 2. (UPSERT-STYLE AGGREGATION) The RPC uses ON CONFLICT (message_hash,
--    stack_hash, app_version, platform, severity) DO UPDATE SET
--    count = count + 1, last_seen_at = now(). The unique index below
--    backs this. Choice rationale: rows-as-fingerprints rather than
--    rows-as-events lets us bound the table size and gives Sky the
--    actionable signal ("which bugs are happening most?") without
--    storing per-event timestamps.
-- 3. (NO USER_ID, NO SESSION_ID) Both rejected. The Edge Function strips
--    them from the request before the RPC is called. A future Cycle-7
--    requirement for per-user crash debugging would need a fresh privacy
--    review (D8 + a new D/S decision), not a column addition here.
-- 4. (RETENTION 30D) Matches verification_log (90d) and resources (30d
--    post-status-change) ceilings — 30 days picked as the shortest window
--    that still gives Sky a useful "last month's bugs" signal. If Sky
--    wants 7 or 14, change the INTERVAL literal in prune_error_reports
--    and re-apply.
-- 5. (CRON SLOT) Scheduled at 03:30 UTC, staggered 15 min after the
--    auto_suspend cron (03:15) which is itself staggered 15 min after
--    prune_expired_resources (03:00). No two crons contend.
-- 6. (HASH FORMAT) message_hash and stack_hash are TEXT with a CHECK
--    constraint enforcing 64-char hex (SHA-256 output). This catches an
--    Edge Function regression that might send a base64 or truncated hash.
-- 7. (RPC SECURITY DEFINER → anon-callable) The RPC is GRANT EXECUTE to
--    `anon` because the Edge Function calls it using the project's anon
--    key (the same key any client could fetch). SECURITY DEFINER bypasses
--    the table's RLS so the anon caller can INSERT/upsert without a SELECT
--    grant on the underlying table. The function's body validates inputs
--    so a hand-crafted anon-key request can only insert hash-shaped values
--    (rate-limiting still lives at the Edge Function — see header §rate-
--    limit posture). This is the same pattern as `consume_invite_token`
--    in schema.sql.
-- 8. (NO UPDATE OR DELETE POLICIES) Mirrors verification_log: no anon /
--    authenticated UPDATE or DELETE. Sky can delete via service_role from
--    the dashboard SQL editor if needed (or wait for the nightly prune).
-- 9. (PG_CRON DEPENDENCY) Requires pg_cron extension already enabled
--    (done in schema.sql line 33). If pg_cron is unavailable, the
--    cron.schedule call raises and the migration aborts — that's the
--    correct fail-loud behavior because without the prune the 30-day
--    retention promise breaks silently.
-- 10. (BACKUP HONESTY) Per PRIVACY.md D6, Supabase keeps PITR for ~7
--    days. A row deleted by the nightly prune is still recoverable from a
--    backup for that window. Same caveat as account deletion — disclosed
--    in the README.md alongside this function.

-- ============================================================================
-- 1. public.error_reports — hash-only aggregate table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT NOT NULL CHECK (length(app_version) >= 1 AND length(app_version) <= 32),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')),
  -- SHA-256 of the (PII-stripped) error message text, computed inside the
  -- Edge Function. 64 lowercase hex chars. The CHECK below is a regression
  -- canary against an Edge Function bug that might send raw text.
  message_hash TEXT NOT NULL CHECK (message_hash ~ '^[0-9a-f]{64}$'),
  -- SHA-256 of the (PII-stripped) stack trace. Same shape as message_hash.
  stack_hash TEXT NOT NULL CHECK (stack_hash ~ '^[0-9a-f]{64}$'),
  -- Aggregate counter — incremented via the RPC's ON CONFLICT branch when
  -- the (message_hash, stack_hash, app_version, platform, severity) tuple
  -- has been seen before. Bounded by distinct error shapes, not events.
  count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
  -- Updated every time count increments. Drives the 30-day retention prune.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.error_reports IS
  'Anonymous error report aggregates (PRIVACY.md D8 self-hosted; NO Sentry). Hash-only — message and stack are SHA-256 hashed inside the log-error Edge Function before any DB write. NO user_id, NO session_id, NO IP, NO user-agent. Retention 30d via prune_error_reports cron. Sky-only SELECT via config.sky_uuid pointer.';

COMMENT ON COLUMN public.error_reports.message_hash IS
  'SHA-256 of the PII-stripped error message text. 64 lowercase hex. Raw text never reaches the DB.';
COMMENT ON COLUMN public.error_reports.stack_hash IS
  'SHA-256 of the PII-stripped stack trace. 64 lowercase hex. Raw trace never reaches the DB.';
COMMENT ON COLUMN public.error_reports.count IS
  'Aggregate event count for this (message_hash, stack_hash, app_version, platform, severity) fingerprint. Incremented via ON CONFLICT in log_error RPC.';
COMMENT ON COLUMN public.error_reports.last_seen_at IS
  'Updated each time count increments. Anchor for 30-day retention prune.';

-- Backing index for the upsert ON CONFLICT clause AND the aggregation read
-- path. Without this the RPC's ON CONFLICT would have nothing to match on
-- and the table would degrade to one row per event.
CREATE UNIQUE INDEX IF NOT EXISTS error_reports_fingerprint_uidx
  ON public.error_reports (message_hash, stack_hash, app_version, platform, severity);

-- Secondary index for Sky's dashboard query ("most recent crashes first").
CREATE INDEX IF NOT EXISTS error_reports_last_seen_idx
  ON public.error_reports (last_seen_at DESC);

-- ============================================================================
-- 2. RLS — Sky-only SELECT, no client UPDATE/DELETE
-- ============================================================================
-- Same posture as verification_log + cron_log. The anon caller never reads
-- this table — they only write via log_error() RPC (which is SECURITY
-- DEFINER and bypasses RLS). Sky reads via dashboard SQL editor as
-- service_role OR as the user matching public.config.sky_uuid.

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_reports_sky_select ON public.error_reports;
CREATE POLICY error_reports_sky_select ON public.error_reports
  FOR SELECT TO authenticated
  USING (
    auth.uid()::text = (SELECT value FROM public.config WHERE key = 'sky_uuid')
  );
-- No INSERT/UPDATE/DELETE policies → only the SECURITY DEFINER RPC and
-- service_role can write. The CHECK constraints on message_hash / stack_hash
-- act as a regression canary against an Edge Function bug.

-- ============================================================================
-- 3. public.log_error RPC — SECURITY DEFINER, anon-callable
-- ============================================================================
-- Called by supabase/functions/log-error/index.ts with hashes only. Returns
-- BOOLEAN (true on insert OR aggregate-increment; raises on validation
-- failure). Idempotent: re-sending the same fingerprint just bumps count.
--
-- The function trusts its caller (the Edge Function) to have:
--   (a) hashed the raw text server-side via SHA-256
--   (b) stripped PII heuristics client-side BEFORE sending
--   (c) rate-limited the IP at 10/min before calling
-- The CHECK constraints on the table are the last-ditch validation.

CREATE OR REPLACE FUNCTION public.log_error(
  p_app_version TEXT,
  p_platform TEXT,
  p_severity TEXT,
  p_message_hash TEXT,
  p_stack_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Defensive input validation. The Edge Function already validates these,
  -- but a future direct anon-key caller (or a regression) could bypass.
  -- The table CHECK constraints would also reject, but raising here gives
  -- a clearer error and avoids opaque constraint-violation SQLSTATE.
  IF p_app_version IS NULL OR length(p_app_version) < 1 OR length(p_app_version) > 32 THEN
    RAISE EXCEPTION 'invalid app_version';
  END IF;
  IF p_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'invalid platform';
  END IF;
  IF p_severity NOT IN ('error', 'warning') THEN
    RAISE EXCEPTION 'invalid severity';
  END IF;
  IF p_message_hash IS NULL OR p_message_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid message_hash';
  END IF;
  IF p_stack_hash IS NULL OR p_stack_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid stack_hash';
  END IF;

  -- Upsert: insert a new fingerprint OR increment the existing one.
  -- ON CONFLICT matches the error_reports_fingerprint_uidx unique index.
  INSERT INTO public.error_reports
    (app_version, platform, severity, message_hash, stack_hash, count, last_seen_at)
  VALUES
    (p_app_version, p_platform, p_severity, p_message_hash, p_stack_hash, 1, now())
  ON CONFLICT (message_hash, stack_hash, app_version, platform, severity)
  DO UPDATE SET
    count = public.error_reports.count + 1,
    last_seen_at = now();

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.log_error(TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Anonymous error-report ingest (PRIVACY.md D8). Called by the log-error Edge Function with SHA-256 hashes only. Upserts: identical fingerprints aggregate via count++. SECURITY DEFINER; bypasses RLS. Anon-callable via GRANT EXECUTE TO anon. Raw text never reaches this function.';

GRANT EXECUTE ON FUNCTION public.log_error(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.log_error(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 4. prune_error_reports() — nightly 30-day retention sweep
-- ============================================================================
-- Mirrors the pattern from prune_expired_resources (migration 003) and
-- auto_suspend_inactive_admins (migration 002): SECURITY DEFINER function
-- + cron schedule + cron_log row per run for observability (S6).

CREATE OR REPLACE FUNCTION public.prune_error_reports()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.error_reports
    WHERE last_seen_at < now() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  -- Summary row for cron observability (S6). Most-recent row per job_name
  -- MUST be <36h old per cron_log convention; the freshness alert keys off
  -- success + ran_at, not row count, so a quiet day (0 deletions) still
  -- writes a row.
  INSERT INTO public.cron_log (job_name, rows_affected, success)
  VALUES ('prune_error_reports', deleted_count, true);

EXCEPTION
  WHEN OTHERS THEN
    -- Mirror prune_expired_resources error handling: log failure then
    -- re-raise so pg_cron records the failure and Sky's freshness alert fires.
    INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
    VALUES ('prune_error_reports', 0, false, SQLERRM);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.prune_error_reports() IS
  'Nightly cron: hard-deletes public.error_reports rows older than 30 days from last_seen_at (PRIVACY.md D8 retention). Logs total to cron_log.';

-- ============================================================================
-- 5. Schedule the cron job — 03:30 UTC nightly (staggered)
-- ============================================================================
-- 03:00 prune_expired_resources_nightly
-- 03:15 auto_suspend_inactive_admins_nightly (migration 002)
-- 03:30 prune_error_reports_nightly         (this migration)
-- Each 15 min apart so no two compete for the same cron worker slot.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_error_reports_nightly') THEN
    PERFORM cron.schedule(
      'prune_error_reports_nightly',
      '30 3 * * *',
      $cron$SELECT public.prune_error_reports();$cron$
    );
  END IF;
END;
$$;

-- ============================================================================
-- TEST STUB — Steve / Gary should add scenarios in supabase/__tests__/rls.sql
-- ============================================================================
-- Recommended scenarios (wrap each in BEGIN; ROLLBACK; like the existing
-- T-* patterns):
--
--   T-ERR-1 (insert a fresh fingerprint):
--     1. SET LOCAL request.jwt.claim.role = 'anon';
--     2. SELECT public.log_error('0.1.0', 'ios', 'error',
--        '0000000000000000000000000000000000000000000000000000000000000001',
--        '0000000000000000000000000000000000000000000000000000000000000002');
--     3. Assert exactly one row in public.error_reports with count=1.
--
--   T-ERR-2 (aggregate identical fingerprints):
--     1. Call log_error with the same 5 args from T-ERR-1 again, three times.
--     2. Assert still one row in public.error_reports with count=4 and
--        last_seen_at within the last second.
--
--   T-ERR-3 (distinct fingerprints insert distinct rows):
--     1. Call with two different message_hashes.
--     2. Assert two rows, each count=1.
--
--   T-ERR-4 (validation rejects garbage):
--     1. SELECT public.log_error('0.1.0', 'ios', 'error', 'not-hex', '...');
--     2. Expect EXCEPTION 'invalid message_hash'.
--     3. Repeat for an invalid platform value, severity, app_version length.
--
--   T-ERR-5 (RLS — anon cannot SELECT):
--     1. SET LOCAL request.jwt.claim.role = 'anon';
--     2. SELECT * FROM public.error_reports;
--     3. Assert zero rows (RLS hides everything).
--
--   T-ERR-6 (RLS — Sky CAN SELECT):
--     1. SET sky_uuid via config; SET LOCAL claim.sub to that UUID.
--     2. Assert SELECT returns the row inserted by T-ERR-1.
--
--   T-ERR-7 (prune):
--     1. Insert a row with last_seen_at = now() - INTERVAL '31 days'.
--     2. SELECT public.prune_error_reports();
--     3. Assert the row is gone and a cron_log success row exists.
--
--   T-ERR-8 (prune leaves recent rows alone):
--     1. Insert a row with last_seen_at = now() - INTERVAL '29 days'.
--     2. SELECT public.prune_error_reports();
--     3. Assert the row still exists.

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- To undo this migration entirely:
--
-- BEGIN;
--
--   -- 1. Unschedule the cron job.
--   SELECT cron.unschedule('prune_error_reports_nightly');
--
--   -- 2. Drop the RPC + prune function.
--   DROP FUNCTION IF EXISTS public.log_error(TEXT, TEXT, TEXT, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.prune_error_reports();
--
--   -- 3. Drop the table (CASCADE drops the unique index + secondary index
--   --    + RLS policy). Any rows are lost; this is intentional — the table
--   --    contained only hashes so there is no privacy regression from
--   --    losing them, and reverting the migration means the feature is off.
--   DROP TABLE IF EXISTS public.error_reports;
--
-- COMMIT;
--
-- After rollback: the log-error Edge Function will start returning 500s on
-- every call (the RPC is gone). Sky should either re-apply this migration
-- to restore, OR delete the Edge Function entirely
-- (`supabase functions delete log-error`) to stop client-side calls. The
-- client-side errorReporting.ts helper silently swallows failures so the
-- end-user impact is zero — only the audit signal goes dark.
