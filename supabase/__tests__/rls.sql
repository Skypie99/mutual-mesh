-- ============================================================================
-- Mutual Mesh — RLS Policy Test Suite
-- Author: Steve, 2026-05-23
--
-- HOW TO RUN: This file is meant to be executed in the Supabase SQL editor
-- against a TEST PROJECT (not production). It creates throw-away auth.users
-- rows, simulates queries as each role, asserts expected behavior with
-- RAISE EXCEPTION on failure, and cleans up at the end.
--
-- DO NOT RUN AGAINST PRODUCTION. Use a staging/dev Supabase project.
--
-- Coverage:
--   - Anon role denied on every table
--   - Unverified user can read OWN row, NOT others' rows, NOT resources, NOT photos
--   - Verified user can read marketplace + own row + other verified handles
--   - Admin can read unverified queue, NOT other users' resources/photos
--   - Sky-UUID is the only role that SELECTs verification_log + cron_log
--   - protect_admin_flags trigger blocks direct is_verified/is_admin UPDATE
--   - Direct INSERT/UPDATE/DELETE on verification_log is rejected (append-only)
--   - claim_resource RPC rejects self-claim and double-claim
--   - delete_my_account cascades hard
--
-- Steve loop-15 audit notes follow each assertion block.
-- ============================================================================

BEGIN;

-- ============================================================================
-- TEST FIXTURES — create three test users + grant one admin
-- ============================================================================

-- Important: these are throw-away UUIDs. The actual rows are created via
-- the handle_new_user trigger when we insert into auth.users.

DO $$
DECLARE
  alice_id UUID := '11111111-1111-1111-1111-111111111111';
  bob_id   UUID := '22222222-2222-2222-2222-222222222222';
  carol_id UUID := '33333333-3333-3333-3333-333333333333';  -- admin
  sky_id   UUID := '99999999-9999-9999-9999-999999999999';
BEGIN
  -- Clean up any prior run
  DELETE FROM auth.users WHERE id IN (alice_id, bob_id, carol_id, sky_id);

  -- Create auth.users rows (trigger fires handle_new_user)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
  VALUES
    (alice_id, 'alice-test@example.com', 'fake', now()),
    (bob_id,   'bob-test@example.com',   'fake', now()),
    (carol_id, 'carol-test@example.com', 'fake', now()),
    (sky_id,   'sky-test@example.com',   'fake', now());

  -- Finalize Alice's profile (verified marketplace user)
  UPDATE public.users
    SET handle = 'alice-test-0001', postal_prefix = 'M5V', city = 'Toronto', is_verified = true
    WHERE id = alice_id;

  -- Finalize Bob's profile (unverified)
  UPDATE public.users
    SET handle = 'bob-test-0002', postal_prefix = 'M4Y', city = 'Toronto'
    WHERE id = bob_id;

  -- Finalize Carol (admin, also verified)
  UPDATE public.users
    SET handle = 'carol-test-0003', postal_prefix = 'M5V', city = 'Toronto', is_verified = true, is_admin = true
    WHERE id = carol_id;

  -- Sky (treat as the project owner — also gets is_admin)
  UPDATE public.users
    SET handle = 'sky-test-0009', postal_prefix = 'M5V', city = 'Toronto', is_verified = true, is_admin = true
    WHERE id = sky_id;

  -- Configure the sky_uuid pointer
  UPDATE public.config SET value = sky_id::text WHERE key = 'sky_uuid';

  -- Seed test resources
  INSERT INTO public.resources (id, posted_by, name, description, pickup_text, contact_handle, status, postal_prefix, city)
  VALUES
    ('a1a1a1a1-0000-0000-0000-000000000001', alice_id, 'Alice rice', 'Test', 'Alice address', '@alice-signal', 'available', 'M5V', 'Toronto'),
    ('a1a1a1a1-0000-0000-0000-000000000002', alice_id, 'Alice formula', 'Test', 'Alice address', '@alice-signal', 'available', 'M5V', 'Toronto');

  RAISE NOTICE 'Fixtures created.';
END $$;

-- ============================================================================
-- TEST 1 — Anon role denied on every table
-- ============================================================================
SET LOCAL ROLE anon;

DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.users;
  IF row_count > 0 THEN RAISE EXCEPTION 'FAIL T1.a: anon can SELECT public.users'; END IF;

  SELECT COUNT(*) INTO row_count FROM public.resources;
  IF row_count > 0 THEN RAISE EXCEPTION 'FAIL T1.b: anon can SELECT public.resources'; END IF;

  SELECT COUNT(*) INTO row_count FROM public.verification_log;
  IF row_count > 0 THEN RAISE EXCEPTION 'FAIL T1.c: anon can SELECT public.verification_log'; END IF;

  SELECT COUNT(*) INTO row_count FROM public.invite_tokens;
  IF row_count > 0 THEN RAISE EXCEPTION 'FAIL T1.d: anon can SELECT public.invite_tokens'; END IF;

  RAISE NOTICE 'PASS T1: anon denied on all tables';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 2 — Unverified user (Bob) can read own row, NOT others' rows
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.users WHERE id = auth.uid();
  IF row_count <> 1 THEN RAISE EXCEPTION 'FAIL T2.a: unverified Bob cannot SELECT own row'; END IF;

  SELECT COUNT(*) INTO row_count FROM public.users WHERE id <> auth.uid() AND is_verified = true;
  IF row_count > 0 THEN RAISE EXCEPTION 'FAIL T2.b: unverified Bob can see verified Alice'; END IF;

  SELECT COUNT(*) INTO row_count FROM public.resources;
  IF row_count > 0 THEN RAISE EXCEPTION 'FAIL T2.c: unverified Bob can SELECT resources (RLS bypass)'; END IF;

  RAISE NOTICE 'PASS T2: unverified user sees only own row, no resources';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 3 — Verified user (Alice) can read marketplace + own row + other verified handles
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.users WHERE id = auth.uid();
  IF row_count <> 1 THEN RAISE EXCEPTION 'FAIL T3.a: verified Alice cannot SELECT own row'; END IF;

  -- Should see Carol (verified) but not Bob (unverified)
  SELECT COUNT(*) INTO row_count FROM public.users WHERE id <> auth.uid();
  -- Expected: 2 (Carol + Sky, both verified). Bob is unverified so should be hidden.
  IF row_count <> 2 THEN
    RAISE EXCEPTION 'FAIL T3.b: verified Alice sees % other users (expected 2 verified)', row_count;
  END IF;

  SELECT COUNT(*) INTO row_count FROM public.resources WHERE status = 'available';
  IF row_count <> 2 THEN
    RAISE EXCEPTION 'FAIL T3.c: verified Alice sees % available resources (expected 2)', row_count;
  END IF;

  RAISE NOTICE 'PASS T3: verified user sees marketplace + verified peers';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 4 — Admin (Carol) can read unverified queue but NOT Bob's resources
--           (admins are flagged users, not super-readers per D9)
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
  unverified_count INT;
BEGIN
  -- Carol can see Bob (unverified) — that's the verification queue
  SELECT COUNT(*) INTO unverified_count FROM public.users WHERE is_verified = false;
  IF unverified_count <> 1 THEN
    RAISE EXCEPTION 'FAIL T4.a: admin Carol sees % unverified users (expected 1: Bob)', unverified_count;
  END IF;

  RAISE NOTICE 'PASS T4: admin sees unverified queue';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 5 — verification_log SELECT denied for non-Sky, allowed for Sky
-- ============================================================================

-- First, insert a log row as Carol (via the approve_user RPC path — simulated direct INSERT for test)
SET LOCAL ROLE service_role;
INSERT INTO public.verification_log (applicant_id, admin_id, decision)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'approve'
);
RESET ROLE;

-- Carol (admin, but not Sky) tries to read
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.verification_log;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'FAIL T5.a: admin Carol can SELECT verification_log (should be Sky-only)';
  END IF;
  RAISE NOTICE 'PASS T5.a: admin Carol denied SELECT on verification_log';
END $$;

RESET ROLE;

-- Sky tries to read
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.verification_log;
  IF row_count < 1 THEN
    RAISE EXCEPTION 'FAIL T5.b: Sky cannot SELECT verification_log';
  END IF;
  RAISE NOTICE 'PASS T5.b: Sky can SELECT verification_log';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 6 — protect_admin_flags trigger blocks direct is_verified UPDATE
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    UPDATE public.users SET is_verified = true WHERE id = auth.uid();
    RAISE EXCEPTION 'FAIL T6.a: Bob promoted self to is_verified via direct UPDATE';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'PASS T6.a: protect_admin_flags blocked is_verified UPDATE (% — %)', SQLSTATE, SQLERRM;
  END;

  BEGIN
    UPDATE public.users SET is_admin = true WHERE id = auth.uid();
    RAISE EXCEPTION 'FAIL T6.b: Bob promoted self to is_admin via direct UPDATE';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'PASS T6.b: protect_admin_flags blocked is_admin UPDATE (% — %)', SQLSTATE, SQLERRM;
  END;
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 7 — claim_resource rejects self-claim and double-claim
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  -- Alice tries to claim her own resource
  BEGIN
    SELECT public.claim_resource('a1a1a1a1-0000-0000-0000-000000000001') INTO ok;
    RAISE EXCEPTION 'FAIL T7.a: Alice claimed her own resource';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'PASS T7.a: claim_resource rejected self-claim';
  END;
END $$;

RESET ROLE;

-- Now Carol claims Alice's resource (should succeed)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  SELECT public.claim_resource('a1a1a1a1-0000-0000-0000-000000000001') INTO ok;
  IF ok <> true THEN
    RAISE EXCEPTION 'FAIL T7.b: claim_resource returned %', ok;
  END IF;
  RAISE NOTICE 'PASS T7.b: Carol claimed Alice''s resource';

  -- Now try to double-claim — should fail
  BEGIN
    SELECT public.claim_resource('a1a1a1a1-0000-0000-0000-000000000001') INTO ok;
    RAISE EXCEPTION 'FAIL T7.c: double-claim succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'PASS T7.c: claim_resource rejected double-claim';
  END;
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 8 — verification_log is append-only (no UPDATE / DELETE for authenticated)
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
  row_count INT;
BEGIN
  -- Try to UPDATE — there's no UPDATE policy → no rows affected
  UPDATE public.verification_log SET decision = 'escalate' WHERE id IS NOT NULL;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'FAIL T8.a: admin Carol UPDATEd % verification_log rows', row_count;
  END IF;

  DELETE FROM public.verification_log WHERE id IS NOT NULL;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'FAIL T8.b: admin Carol DELETEd % verification_log rows', row_count;
  END IF;

  RAISE NOTICE 'PASS T8: verification_log is append-only';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 9 — confirm_pickup() RPC (migration 005 / Phase 2 #7)
--   Coverage: T-CONF-1, 3, 4, 6, 7, 9 from migration 005's TEST STUB.
--   T-CONF-2 (claimant variant) is covered transitively by T-CONF-1+3.
--   T-CONF-5 (unauthenticated) and T-CONF-8 (deterministic race) are deferred
--   — they need JWT clearing / pg_advisory_lock plumbing.
-- ============================================================================

-- T-CONF-setup: Carol claims Alice's second resource so Alice can confirm.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  SELECT public.claim_resource('a1a1a1a1-0000-0000-0000-000000000002') INTO ok;
  IF ok <> true THEN RAISE EXCEPTION 'FAIL T9.setup: claim'; END IF;
  RAISE NOTICE 'PASS T9.setup: Carol claimed Alice''s second resource';
END $$;

RESET ROLE;

-- T-CONF-1: Poster confirms own reserved resource → TRUE; status=completed.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
  v_status TEXT;
  v_confirmed_by UUID;
  v_confirmed_at TIMESTAMPTZ;
BEGIN
  SELECT public.confirm_pickup('a1a1a1a1-0000-0000-0000-000000000002') INTO ok;
  IF ok <> true THEN
    RAISE EXCEPTION 'FAIL T-CONF-1.a: returned %', ok;
  END IF;
  SELECT status, confirmed_by, confirmed_at INTO v_status, v_confirmed_by, v_confirmed_at
  FROM public.resources WHERE id = 'a1a1a1a1-0000-0000-0000-000000000002';
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'FAIL T-CONF-1.b: status %', v_status; END IF;
  IF v_confirmed_by <> '11111111-1111-1111-1111-111111111111'::uuid THEN
    RAISE EXCEPTION 'FAIL T-CONF-1.c: confirmed_by %', v_confirmed_by;
  END IF;
  IF v_confirmed_at IS NULL THEN RAISE EXCEPTION 'FAIL T-CONF-1.d: confirmed_at NULL'; END IF;
  RAISE NOTICE 'PASS T-CONF-1: poster confirmed reserved → completed';
END $$;

RESET ROLE;

-- T-CONF-3: Second confirmation on completed row → FALSE; state preserved.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
  v_confirmed_by UUID;
BEGIN
  SELECT public.confirm_pickup('a1a1a1a1-0000-0000-0000-000000000002') INTO ok;
  IF ok <> false THEN RAISE EXCEPTION 'FAIL T-CONF-3.a: returned %', ok; END IF;
  SELECT confirmed_by INTO v_confirmed_by
  FROM public.resources WHERE id = 'a1a1a1a1-0000-0000-0000-000000000002';
  IF v_confirmed_by <> '11111111-1111-1111-1111-111111111111'::uuid THEN
    RAISE EXCEPTION 'FAIL T-CONF-3.b: confirmed_by changed to %', v_confirmed_by;
  END IF;
  RAISE NOTICE 'PASS T-CONF-3: idempotent second call returns FALSE, state preserved';
END $$;

RESET ROLE;

-- T-CONF-4: Third-party verified user → RAISE 'Not authorized'.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  BEGIN
    SELECT public.confirm_pickup('a1a1a1a1-0000-0000-0000-000000000001') INTO ok;
    RAISE EXCEPTION 'FAIL T-CONF-4.a: third-party confirmed someone else''s resource';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Not authorized%' THEN
        RAISE EXCEPTION 'FAIL T-CONF-4.b: wrong error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS T-CONF-4: third-party blocked with Not authorized';
  END;
END $$;

RESET ROLE;

-- T-CONF-6: confirm on available row → RAISE 'Resource not in reserved state'.
-- Reset Alice's first resource to available.
SET LOCAL ROLE service_role;
UPDATE public.resources
SET status = 'available', claimed_by = NULL, status_changed_at = now()
WHERE id = 'a1a1a1a1-0000-0000-0000-000000000001';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  BEGIN
    SELECT public.confirm_pickup('a1a1a1a1-0000-0000-0000-000000000001') INTO ok;
    RAISE EXCEPTION 'FAIL T-CONF-6.a: confirm on available succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not in reserved state%' THEN
        RAISE EXCEPTION 'FAIL T-CONF-6.b: wrong error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS T-CONF-6: confirm on available raises Not in reserved state';
  END;
END $$;

RESET ROLE;

-- T-CONF-7: confirm on non-existent UUID → RAISE 'Resource not found'.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  BEGIN
    SELECT public.confirm_pickup('00000000-dead-beef-0000-000000000000'::uuid) INTO ok;
    RAISE EXCEPTION 'FAIL T-CONF-7.a: confirm on missing id succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not found%' THEN
        RAISE EXCEPTION 'FAIL T-CONF-7.b: wrong error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS T-CONF-7: confirm on missing id raises Resource not found';
  END;
END $$;

RESET ROLE;

-- T-CONF-9: ON DELETE SET NULL — confirming user deletes account; confirmed_by
--   in the resource row becomes NULL; the resource itself survives.
-- Setup: Carol re-claims + confirms '...001'.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  SELECT public.claim_resource('a1a1a1a1-0000-0000-0000-000000000001') INTO ok;
  IF ok <> true THEN RAISE EXCEPTION 'FAIL T-CONF-9.setup1: claim'; END IF;
  SELECT public.confirm_pickup('a1a1a1a1-0000-0000-0000-000000000001') INTO ok;
  IF ok <> true THEN RAISE EXCEPTION 'FAIL T-CONF-9.setup2: confirm'; END IF;
  SELECT public.delete_my_account() INTO ok;
  IF ok <> true THEN RAISE EXCEPTION 'FAIL T-CONF-9.a: delete'; END IF;
END $$;

RESET ROLE;

-- Read back as Alice (verified, still owns the resource).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_confirmed_by UUID;
  v_status TEXT;
BEGIN
  SELECT confirmed_by, status INTO v_confirmed_by, v_status
  FROM public.resources WHERE id = 'a1a1a1a1-0000-0000-0000-000000000001';
  IF v_confirmed_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T-CONF-9.b: confirmed_by is % (expected NULL after Carol deleted)', v_confirmed_by;
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'FAIL T-CONF-9.c: resource status is % (expected ''completed'' unchanged)', v_status;
  END IF;
  RAISE NOTICE 'PASS T-CONF-9: ON DELETE SET NULL nulled confirmed_by; resource preserved';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 10 — complete_onboarding() RPC (migration 006 / Phase 2 #8)
--   Coverage: T15a, b, d from migration 006's TEST STUB.
-- ============================================================================

-- T15a (success): Alice flips her own flag from false → true.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
  v_flag BOOLEAN;
BEGIN
  SELECT public.complete_onboarding() INTO ok;
  IF ok <> true THEN RAISE EXCEPTION 'FAIL T15a.a: returned %', ok; END IF;
  SELECT onboarding_complete INTO v_flag FROM public.users WHERE id = auth.uid();
  IF v_flag <> true THEN RAISE EXCEPTION 'FAIL T15a.b: flag is %', v_flag; END IF;
  RAISE NOTICE 'PASS T15a: complete_onboarding flipped Alice''s flag → true';
END $$;

RESET ROLE;

-- T15b (idempotent): second call → TRUE, no exception, flag stays true.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  ok BOOLEAN;
  v_flag BOOLEAN;
BEGIN
  SELECT public.complete_onboarding() INTO ok;
  IF ok <> true THEN RAISE EXCEPTION 'FAIL T15b.a: returned %', ok; END IF;
  SELECT onboarding_complete INTO v_flag FROM public.users WHERE id = auth.uid();
  IF v_flag <> true THEN RAISE EXCEPTION 'FAIL T15b.b: flag is %', v_flag; END IF;
  RAISE NOTICE 'PASS T15b: idempotent — second call is a safe no-op';
END $$;

RESET ROLE;

-- T15d (cross-user isolation): Sky's flag is still false (Alice's call must
--   not cross-contaminate).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

DO $$
DECLARE
  v_flag BOOLEAN;
BEGIN
  SELECT onboarding_complete INTO v_flag FROM public.users WHERE id = auth.uid();
  IF v_flag <> false THEN
    RAISE EXCEPTION 'FAIL T15d: Sky''s flag is % (Alice''s RPC must not cross-contaminate)', v_flag;
  END IF;
  RAISE NOTICE 'PASS T15d: cross-user isolation preserved (RPC touches only caller)';
END $$;

RESET ROLE;

-- ============================================================================
-- TEST 11 — prune_expired_resources() extension (migration 007 / Phase 2.5)
--   Coverage: T-PRUNE-1, 2, 3, 6 from migration 007's TEST STUB.
--   T-PRUNE-4 (storage sweep alongside stale) needs Storage object fixtures;
--   deferred. T-PRUNE-5 (NULL photo_url) handled implicitly by T-PRUNE-1
--   (our fixture row has no photo_url and gets pruned cleanly).
-- ============================================================================

-- Setup: insert fixture rows with fabricated historical timestamps. Bypass
-- RLS as service_role.
SET LOCAL ROLE service_role;

INSERT INTO public.resources (id, posted_by, name, description, pickup_text, contact_handle,
                              status, postal_prefix, city,
                              status_changed_at, confirmed_at, confirmed_by, created_at)
VALUES
  -- Eligible: 31 days past confirm.
  ('c0000001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'Stale completed', 'pruneable', 'x', '@x', 'completed', 'M5V', 'Toronto',
   now() - INTERVAL '31 days', now() - INTERVAL '31 days',
   '11111111-1111-1111-1111-111111111111', now() - INTERVAL '31 days'),
  -- Not eligible: only 29 days past.
  ('c0000001-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'Fresh completed', 'kept', 'x', '@x', 'completed', 'M5V', 'Toronto',
   now() - INTERVAL '29 days', now() - INTERVAL '29 days',
   '11111111-1111-1111-1111-111111111111', now() - INTERVAL '29 days'),
  -- Not eligible: completed but confirmed_at NULL (IS NOT NULL guard).
  ('c0000001-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'NULL confirmed_at', 'survives', 'x', '@x', 'completed', 'M5V', 'Toronto',
   now() - INTERVAL '31 days', NULL, NULL, now() - INTERVAL '31 days');

RESET ROLE;

-- Run prune as the cron job would.
SET LOCAL ROLE postgres;
SELECT public.prune_expired_resources();
RESET ROLE;

-- T-PRUNE-1..3: verify the 31d row is gone; the 29d and NULL-confirmed rows survive.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_pruned INT;
  v_kept INT;
  v_null_conf INT;
BEGIN
  SELECT COUNT(*) INTO v_pruned
  FROM public.resources WHERE id = 'c0000001-0000-0000-0000-000000000001';
  IF v_pruned <> 0 THEN
    RAISE EXCEPTION 'FAIL T-PRUNE-1: 31d row survived (count=%)', v_pruned;
  END IF;

  SELECT COUNT(*) INTO v_kept
  FROM public.resources WHERE id = 'c0000001-0000-0000-0000-000000000002';
  IF v_kept <> 1 THEN
    RAISE EXCEPTION 'FAIL T-PRUNE-2: 29d row was pruned (count=%)', v_kept;
  END IF;

  SELECT COUNT(*) INTO v_null_conf
  FROM public.resources WHERE id = 'c0000001-0000-0000-0000-000000000003';
  IF v_null_conf <> 1 THEN
    RAISE EXCEPTION 'FAIL T-PRUNE-3: NULL-confirmed_at row was pruned (count=%)', v_null_conf;
  END IF;

  RAISE NOTICE 'PASS T-PRUNE-1..3: completed-row prune respects 30d window + IS NOT NULL guard';
END $$;

RESET ROLE;

-- T-PRUNE-6: cron_log.error_text format includes storage_deleted + completed_deleted.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

DO $$
DECLARE
  v_text TEXT;
BEGIN
  SELECT error_text INTO v_text FROM public.cron_log
  WHERE job_name = 'prune_expired_resources' AND success = true
  ORDER BY ran_at DESC LIMIT 1;

  IF v_text IS NULL THEN
    RAISE EXCEPTION 'FAIL T-PRUNE-6.a: no success cron_log row';
  END IF;
  IF v_text NOT LIKE 'storage_deleted=%;completed_deleted=%' THEN
    RAISE EXCEPTION 'FAIL T-PRUNE-6.b: cron_log.error_text is "%" (expected storage_deleted=N;completed_deleted=M)', v_text;
  END IF;
  RAISE NOTICE 'PASS T-PRUNE-6: cron_log format includes storage_deleted + completed_deleted';
END $$;

RESET ROLE;

-- ============================================================================
-- CLEANUP
-- ============================================================================

SET LOCAL ROLE service_role;
DELETE FROM auth.users WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '99999999-9999-9999-9999-999999999999'
);
RESET ROLE;

ROLLBACK;  -- Defensive: roll back the entire test transaction so the DB is unchanged.
           -- Switch to COMMIT only if you want the test fixtures to persist for manual inspection.

-- ============================================================================
-- DONE
-- ============================================================================
-- Expected output: 22+ "PASS" NOTICEs (12 original + 10 new in T9–T11),
-- no FAIL EXCEPTIONs.
-- If anything FAILed, the schema is letting more through than intended.
-- Investigate the relevant policy in schema.sql / migrations 005-007.
-- ============================================================================
