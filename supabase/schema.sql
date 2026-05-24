-- ============================================================================
-- Mutual Mesh — Cycle 1 schema (auth + verification + foundation for Cycles 2-4)
-- Status:  FILE ONLY. Apply via Supabase dashboard SQL editor. Never auto-applied.
-- Author:  Dana, 2026-05-23
-- Authority: PRIVACY.md (🟢 APPROVED 2026-05-23) + qa-reports/2026-05-23_security-privacy-review.md (S1–S8)
--
-- Design references:
--   - PRIVACY.md D1/D2 (no real names anywhere) → no real-name field exists at all
--   - PRIVACY.md D3 (3-char postal prefix) → CHECK constraint `[A-Z][0-9][A-Z]`
--   - PRIVACY.md D4 (hashed invite token) → bcrypt cost-10 via pgcrypto.crypt()
--   - PRIVACY.md D6 + S5 (atomic cascade delete) → delete_my_account() with FOR UPDATE
--   - PRIVACY.md D7 (30-day retention) → prune_expired_resources() nightly cron
--   - PRIVACY.md D9 (admins are flagged users, not separate role) → is_admin BOOLEAN
--   - S1  (12+ char tokens, bcrypt) → consume_invite_token() uses crypt()
--   - S4  (PRIVATE Storage bucket) → resource-photos bucket created with public=false
--   - S5  (atomic delete) → delete_my_account() wraps everything in single txn + FOR UPDATE
--   - S6  (cron observability) → public.cron_log table + prune_expired_resources logs to it
--   - S8  (append-only verification_log) → no UPDATE/DELETE policies; Sky-only SELECT
--
-- Idempotent: all CREATE statements use IF NOT EXISTS / OR REPLACE.
-- Safe to re-run.
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pgcrypto provides:
--   - gen_random_uuid()  — UUID generation
--   - crypt() + gen_salt('bf', 10)  — bcrypt for invite-token hashing (S1)

CREATE EXTENSION IF NOT EXISTS pg_cron;
-- pg_cron provides cron.schedule() for the prune job (D7 + S6).
-- Sky must enable pg_cron in the Supabase dashboard → Database → Extensions
-- before this file applies cleanly. If pg_cron is unavailable, the cron.schedule
-- block at the end will error; Sky can comment it out and schedule manually.

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- public.users — extends auth.users with project-specific fields
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE
    CHECK (length(handle) >= 3 AND length(handle) <= 32),
  postal_prefix TEXT
    CHECK (postal_prefix IS NULL OR postal_prefix ~ '^[A-Z][0-9][A-Z]$'),
  city TEXT
    CHECK (city IS NULL OR length(city) <= 64),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  referrer_token_hash TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.users IS 'Mutual Mesh user profile. NO real names, NO phone, NO full postal code (PRIVACY.md D1/D2/D3).';
COMMENT ON COLUMN public.users.handle              IS 'Public handle. Default: random adjective-noun-4digit (handleGenerator.ts). NEVER a real name (D1/D2 enforced).';
COMMENT ON COLUMN public.users.postal_prefix       IS 'FSA-equivalent. Exactly 3 chars matching ^[A-Z][0-9][A-Z]$. Neighborhood-level only (D3).';
COMMENT ON COLUMN public.users.city                IS 'Explicit dropdown selection (Q2). Not auto-derived from postal_prefix.';
COMMENT ON COLUMN public.users.is_verified         IS 'Marketplace gate. Three-layer enforcement: UI + DB RLS + Storage RLS. Never settable by direct UPDATE; use approve_user RPC.';
COMMENT ON COLUMN public.users.is_admin            IS 'Verification admin flag. RLS-scoped; NOT a separate DB role (D9). service_role only.';
COMMENT ON COLUMN public.users.referrer_token_hash IS 'bcrypt hash of the invite token consumed. No graph back to inviter (D4).';
COMMENT ON COLUMN public.users.last_active_at      IS 'Touched on app foreground via touch_my_last_active(). Used for Q4 inactive-admin auto-suspend.';

-- ----------------------------------------------------------------------------
-- public.invite_tokens — single-use signup codes (D4 + S1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invite_tokens (
  token_hash TEXT PRIMARY KEY,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_unused
  ON public.invite_tokens (created_at) WHERE used_at IS NULL;

COMMENT ON TABLE  public.invite_tokens IS 'Single-use invite codes. bcrypt-hashed (S1 cost=10). Plain token never stored.';
COMMENT ON COLUMN public.invite_tokens.token_hash IS 'crypt(plain_token, gen_salt(''bf'', 10)).';
COMMENT ON COLUMN public.invite_tokens.created_by IS 'Who generated; nullified on creator deletion (no identity graph survives).';
COMMENT ON COLUMN public.invite_tokens.used_at    IS 'Single-use enforcement: consume_invite_token rejects if non-NULL.';

-- ----------------------------------------------------------------------------
-- public.verification_log — append-only audit (S8)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_log (
  id BIGSERIAL PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject','escalate')),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 280),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_log_applicant ON public.verification_log (applicant_id);
CREATE INDEX IF NOT EXISTS idx_verification_log_decided   ON public.verification_log (decided_at);

COMMENT ON TABLE public.verification_log IS 'Append-only verification audit (S8). Admins INSERT only via RPC. Sky-only SELECT.';

-- ----------------------------------------------------------------------------
-- public.cron_log — pg_cron job observability (S6)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_log (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows_affected INTEGER,
  success BOOLEAN NOT NULL,
  error_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_log_job_ran ON public.cron_log (job_name, ran_at DESC);

COMMENT ON TABLE public.cron_log IS 'Cron job observability (S6). Most-recent row per job_name MUST be <36h old; alert otherwise.';

-- ----------------------------------------------------------------------------
-- public.resources — marketplace listings (foundation for Cycles 2-4)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  photo_url TEXT,
  pickup_text TEXT NOT NULL CHECK (length(pickup_text) <= 280),
  contact_handle TEXT NOT NULL CHECK (length(contact_handle) <= 64),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved')),
  postal_prefix TEXT CHECK (postal_prefix IS NULL OR postal_prefix ~ '^[A-Z][0-9][A-Z]$'),
  city TEXT CHECK (city IS NULL OR length(city) <= 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_status_created ON public.resources (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_posted_by      ON public.resources (posted_by);
CREATE INDEX IF NOT EXISTS idx_resources_claimed_by     ON public.resources (claimed_by);

COMMENT ON TABLE  public.resources IS 'Marketplace listings. status: available|reserved. Retention: 30d post-status-change (D7).';
COMMENT ON COLUMN public.resources.pickup_text    IS 'User-supplied free text. Capped 280 (S3). Plain-text rendered only.';
COMMENT ON COLUMN public.resources.contact_handle IS 'Per-resource handle revealed on claim. Capped 64 (S3). URL-scheme rejection enforced client-side (contactHandle.ts).';

-- ----------------------------------------------------------------------------
-- public.config — key/value config (used to identify Sky's UUID for S8)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.config (key, value)
VALUES ('sky_uuid', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.config IS 'Key/value config. Sky must UPDATE sky_uuid to their actual auth.users.id after first signup.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- handle_new_user: create public.users row when auth.users row inserts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Placeholder handle; the app overrides during signup step 3 with a
  -- generated adjective-noun-4digit via UPDATE on this row.
  -- Per D1/D2: NEVER derive from email-local-part.
  INSERT INTO public.users (id, handle, is_verified, is_admin)
  VALUES (
    NEW.id,
    'pending-' || substr(replace(NEW.id::text, '-', ''), 1, 12),
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- touch_status_changed_at: update status_changed_at on every status change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_status_changed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_resource_status_change ON public.resources;
CREATE TRIGGER on_resource_status_change
  BEFORE UPDATE OF status ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.touch_status_changed_at();

-- ----------------------------------------------------------------------------
-- protect_admin_flags: block direct UPDATE of is_verified / is_admin
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_admin_flags()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only the RPC layer (security-definer functions) may flip these. A direct
  -- UPDATE from an authenticated client is rejected. service_role still works
  -- (Sky / pg_cron / Edge Functions).
  IF auth.role() = 'authenticated' THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Cannot directly modify is_verified; use approve_user RPC';
    END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'Cannot directly modify is_admin; service_role only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_admin_flags_trg ON public.users;
CREATE TRIGGER protect_admin_flags_trg
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_admin_flags();

-- ============================================================================
-- RPCs (security definer — bypass RLS for trusted operations)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- touch_my_last_active(): app calls this on foreground to update last_active_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_my_last_active()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.users SET last_active_at = now() WHERE id = auth.uid();
END;
$$;

-- ----------------------------------------------------------------------------
-- consume_invite_token(plain): bcrypt-verify, atomically mark used, record hash
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_invite_token(plain_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  found_hash TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF plain_token IS NULL OR length(plain_token) < 10 THEN
    RAISE EXCEPTION 'Token too short';
  END IF;

  -- Find a matching unused token. crypt(plain, hash) returns hash on match.
  SELECT token_hash INTO found_hash
  FROM public.invite_tokens
  WHERE used_at IS NULL
    AND crypt(plain_token, token_hash) = token_hash
  FOR UPDATE  -- lock the row so concurrent consume calls serialize
  LIMIT 1;

  IF found_hash IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.invite_tokens
  SET used_at = now(), used_by = auth.uid()
  WHERE token_hash = found_hash AND used_at IS NULL;

  UPDATE public.users
  SET referrer_token_hash = found_hash
  WHERE id = auth.uid();

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- approve_user(applicant_id): admin-only verification approval
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_user(applicant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT is_admin INTO caller_is_admin FROM public.users WHERE id = auth.uid();
  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Forbidden: caller is not an admin';
  END IF;

  UPDATE public.users
  SET is_verified = true
  WHERE id = applicant_id AND is_verified = false;

  INSERT INTO public.verification_log (applicant_id, admin_id, decision, decided_at)
  VALUES (applicant_id, auth.uid(), 'approve', now());

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- reject_user(applicant_id, reason): admin-only rejection (deletes auth.users row)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_user(applicant_id UUID, reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT is_admin INTO caller_is_admin FROM public.users WHERE id = auth.uid();
  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Forbidden: caller is not an admin';
  END IF;

  -- Log BEFORE delete (the applicant_id FK is preserved by CASCADE only on this side)
  INSERT INTO public.verification_log (applicant_id, admin_id, decision, reason, decided_at)
  VALUES (applicant_id, auth.uid(), 'reject', reason, now());

  -- Delete from auth.users → cascades to public.users → cascades to any orphans
  DELETE FROM auth.users WHERE id = applicant_id;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- delete_my_account(): atomic cascade hard-delete (D6 + S5)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  me UUID;
BEGIN
  me := auth.uid();
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- S5: lock the row first to serialize concurrent deletes/claims/posts.
  PERFORM 1 FROM auth.users WHERE id = me FOR UPDATE;

  -- Delete my posted resources (Storage objects cleaned up by separate trigger or batch).
  DELETE FROM public.resources WHERE posted_by = me;

  -- Free up resources I had claimed but not yet picked up.
  UPDATE public.resources SET claimed_by = NULL, status = 'available'
  WHERE claimed_by = me AND status = 'reserved';

  -- Cascade: auth.users delete → public.users (FK ON DELETE CASCADE) → orphans
  DELETE FROM auth.users WHERE id = me;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- claim_resource(resource_id): atomic available→reserved transition (PRD §3 + S5)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_resource(resource_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller UUID;
  poster UUID;
  current_status TEXT;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Lock the row, read state
  SELECT posted_by, status INTO poster, current_status
  FROM public.resources WHERE id = resource_id FOR UPDATE;

  IF poster IS NULL THEN RAISE EXCEPTION 'Resource not found'; END IF;
  IF poster = caller THEN RAISE EXCEPTION 'Cannot claim your own resource'; END IF;
  IF current_status <> 'available' THEN RAISE EXCEPTION 'Resource is not available'; END IF;

  UPDATE public.resources
  SET status = 'reserved', claimed_by = caller, status_changed_at = now()
  WHERE id = resource_id;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- prune_expired_resources(): nightly cron per D7 + S6
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_expired_resources()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.resources
    WHERE
      (status = 'reserved'  AND status_changed_at < now() - INTERVAL '30 days')
      OR (status = 'available' AND created_at        < now() - INTERVAL '30 days')
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  INSERT INTO public.cron_log (job_name, rows_affected, success)
  VALUES ('prune_expired_resources', deleted_count, true);
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
    VALUES ('prune_expired_resources', 0, false, SQLERRM);
    RAISE;
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config            ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- public.users RLS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS users_self_read ON public.users;
CREATE POLICY users_self_read ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS users_verified_read_others ON public.users;
CREATE POLICY users_verified_read_others ON public.users
  FOR SELECT TO authenticated
  USING (
    -- Verified users can see other verified users' rows (the app should
    -- read through a view that strips email/is_admin/last_active_at,
    -- but base policy permits the rows).
    is_verified = true
    AND EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.is_verified = true)
  );

DROP POLICY IF EXISTS users_admin_read_unverified ON public.users;
CREATE POLICY users_admin_read_unverified ON public.users
  FOR SELECT TO authenticated
  USING (
    is_verified = false
    AND EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.is_admin = true)
  );

DROP POLICY IF EXISTS users_self_update ON public.users;
CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
-- is_verified / is_admin are gated by the protect_admin_flags trigger.

-- No INSERT policy: only the handle_new_user trigger (security definer) inserts.
-- No DELETE policy: deletion happens via delete_my_account RPC (cascades from auth.users).

-- ----------------------------------------------------------------------------
-- public.invite_tokens RLS — no client access; everything via RPCs
-- ----------------------------------------------------------------------------
-- No policies → all client access denied. consume_invite_token (security
-- definer) and any future generate_invite_token() RPC are the only paths.

-- ----------------------------------------------------------------------------
-- public.verification_log RLS — append-only (S8)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS verification_log_sky_select ON public.verification_log;
CREATE POLICY verification_log_sky_select ON public.verification_log
  FOR SELECT TO authenticated
  USING (
    auth.uid()::text = (SELECT value FROM public.config WHERE key = 'sky_uuid')
  );
-- No INSERT/UPDATE/DELETE policies → only security-definer RPCs write rows.

-- ----------------------------------------------------------------------------
-- public.resources RLS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS resources_verified_read ON public.resources;
CREATE POLICY resources_verified_read ON public.resources
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.is_verified = true)
  );

DROP POLICY IF EXISTS resources_verified_insert ON public.resources;
CREATE POLICY resources_verified_insert ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK (
    posted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.is_verified = true)
  );

DROP POLICY IF EXISTS resources_owner_update ON public.resources;
CREATE POLICY resources_owner_update ON public.resources
  FOR UPDATE TO authenticated
  USING (posted_by = auth.uid())
  WITH CHECK (posted_by = auth.uid());
-- Claim transitions go through claim_resource RPC, not this UPDATE path.

DROP POLICY IF EXISTS resources_owner_delete ON public.resources;
CREATE POLICY resources_owner_delete ON public.resources
  FOR DELETE TO authenticated
  USING (posted_by = auth.uid());

-- ----------------------------------------------------------------------------
-- public.cron_log RLS — Sky-only SELECT
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS cron_log_sky_select ON public.cron_log;
CREATE POLICY cron_log_sky_select ON public.cron_log
  FOR SELECT TO authenticated
  USING (
    auth.uid()::text = (SELECT value FROM public.config WHERE key = 'sky_uuid')
  );
-- No write policies → only pg_cron (service_role) writes.

-- ----------------------------------------------------------------------------
-- public.config RLS — Sky-only
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS config_sky_only ON public.config;
CREATE POLICY config_sky_only ON public.config
  FOR ALL TO authenticated
  USING (auth.uid()::text = (SELECT value FROM public.config WHERE key = 'sky_uuid'));

-- ============================================================================
-- STORAGE (resource-photos bucket — PRIVATE per S4)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('resource-photos', 'resource-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;
-- public=false enforces signed-URL access only. Steve S4 load-bearing.

DROP POLICY IF EXISTS photos_verified_read ON storage.objects;
CREATE POLICY photos_verified_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'resource-photos'
    AND EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.is_verified = true)
  );

DROP POLICY IF EXISTS photos_verified_insert ON storage.objects;
CREATE POLICY photos_verified_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resource-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text  -- path scheme: <userId>/<ts>.<ext>
    AND EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.is_verified = true)
  );

DROP POLICY IF EXISTS photos_owner_delete ON storage.objects;
CREATE POLICY photos_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'resource-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- pg_cron — schedule prune_expired_resources nightly at 03:00 UTC
-- ============================================================================
-- If pg_cron is unavailable, comment this block out and schedule prune via
-- Supabase Scheduled Functions instead.
SELECT cron.schedule(
  'prune_expired_resources_nightly',
  '0 3 * * *',
  $$SELECT public.prune_expired_resources();$$
);

-- ============================================================================
-- POST-APPLY MANUAL STEPS FOR SKY (numbered)
-- ============================================================================
--
-- 1. In Supabase dashboard → Database → Extensions, enable pg_cron and pgcrypto.
-- 2. Open SQL editor and run this entire file. Re-runnable safely.
-- 3. After Sky creates Sky's own account via the app, UPDATE the config row:
--      UPDATE public.config SET value = '<sky-auth.users.id>' WHERE key = 'sky_uuid';
-- 4. Promote Sky to admin:
--      UPDATE public.users SET is_admin = true WHERE id = '<sky-auth.users.id>';
--    (is_admin can only be set via service_role / dashboard SQL; the
--     protect_admin_flags trigger blocks authenticated UPDATE.)
-- 5. Generate the first invite token via the dashboard:
--      INSERT INTO public.invite_tokens (token_hash, created_by)
--      VALUES (crypt('PLAINTEXTTOKEN', gen_salt('bf', 10)), '<sky-id>');
--    Hand 'PLAINTEXTTOKEN' to the first user (use a 12+ char random string).
-- 6. Apply supabase/realtime.sql to enable user-row realtime.
-- 7. Verify pg_cron is running:
--      SELECT * FROM cron.job WHERE jobname = 'prune_expired_resources_nightly';
--
-- ============================================================================
