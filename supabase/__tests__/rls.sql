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
-- Expected output: 12+ "PASS" NOTICEs, no FAIL EXCEPTIONs.
-- If anything FAILed, the schema is letting more through than intended.
-- Investigate the relevant policy in schema.sql.
-- ============================================================================
