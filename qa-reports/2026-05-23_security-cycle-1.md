# Cycle 1 security audit — Steve — 2026-05-23

## Summary

Audited Dana's `supabase/schema.sql` + Shamus's auth wiring (`supabase.ts`, `auth.tsx`, signup screens). Six findings; three resolved in-loop (test suite, channel filter verification, admin self-promotion attempt test), three documented for Sky's call (Q4 inactive-admin policy draft, S4 dashboard verification step, sky_uuid bootstrap timing).

Cycle 1 leaves all 8 STRIDE high-risk items mitigated to within their documented residuals. RLS test suite at `supabase/__tests__/rls.sql` covers 12+ assertions across 8 test scenarios.

## What I shipped

- **`supabase/__tests__/rls.sql`** — runnable RLS test suite. Tests anon-denied, unverified-isolated, verified-marketplace-read, admin-queue-read, Sky-only `verification_log` access, `protect_admin_flags` blocks self-promotion, `claim_resource` atomic rejection of self/double claims, `verification_log` append-only. Wrapped in `ROLLBACK` so test fixtures don't leak.
- **This audit report.**
- **Q4 policy draft below.**

## Findings (resolved in-loop)

### F1: realtime channel filter correctness (verified)

`src/lib/auth.tsx` subscribes with `filter: id=eq.${uid}`. Verified by code inspection: the filter is interpolated from `session.user.id` at subscription time, not from an attacker-controllable input. RLS would block cross-user leakage even without the filter (STRIDE I3), but the filter avoids wasted realtime bandwidth. **No change needed.**

### F2: protect_admin_flags trigger covers BOTH columns

Verified by RLS test T6: an authenticated user attempting to `UPDATE public.users SET is_verified=true WHERE id=auth.uid()` raises an exception. Same for `is_admin`. Test passes.

### F3: claim_resource atomicity (PRD §3 + S5)

Verified by RLS test T7: self-claim raises, double-claim raises. The `FOR UPDATE` lock + status check inside a single transaction guarantees exactly-one-winner under concurrent claims. Postgres transaction isolation gives us this for free.

## Findings (advisory — DECISIONS FOR SKY)

### S-CYC1-1: Q4 inactive-admin auto-suspend policy (NEW DRAFT)

PRIVACY.md Q4 was resolved as "~30-day inactive admin auto-suspend." Steve drafts the policy:

**Proposal:**

```sql
-- New RPC: suspend_inactive_admins() — runs nightly via pg_cron
CREATE OR REPLACE FUNCTION public.suspend_inactive_admins()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE suspended_count INT;
BEGIN
  WITH suspended AS (
    UPDATE public.users
    SET is_admin = false
    WHERE is_admin = true
      AND last_active_at < now() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO suspended_count FROM suspended;

  INSERT INTO public.cron_log (job_name, rows_affected, success)
  VALUES ('suspend_inactive_admins', suspended_count, true);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_log (job_name, rows_affected, success, error_text)
  VALUES ('suspend_inactive_admins', 0, false, SQLERRM);
  RAISE;
END;
$$;

SELECT cron.schedule('suspend_inactive_admins_nightly', '15 3 * * *',
  $$SELECT public.suspend_inactive_admins();$$);
```

**Re-instatement:** Sky manually flips `is_admin = true` via dashboard SQL after talking to the admin. No in-app reinstatement flow in v1 (matches D9: admin promotion is service_role-only).

**Recommendation:** Approve and append to a follow-up migration file. Not added to `schema.sql` in Cycle 1 because Cycle 5 (admin tool) is when this becomes user-facing-relevant.

### S-CYC1-2: sky_uuid bootstrap timing

`schema.sql` inserts a placeholder `'00000000-...'` into `public.config` for `sky_uuid`. Sky must manually `UPDATE public.config SET value = '<sky's auth.users.id>' WHERE key = 'sky_uuid'` after first signup. Until that step, **no one** can read `verification_log` or `cron_log` (the policies match `auth.uid() = sky_uuid`).

**Recommendation:** Surface this in Morgan's apply-step list as step 3 (and verify in Cycle 7 ship-readiness that the placeholder UUID is gone). Add a check in the post-apply verification:

```sql
-- Sanity check
SELECT value FROM public.config WHERE key = 'sky_uuid';
-- Must NOT be '00000000-0000-0000-0000-000000000000'.
```

### S-CYC1-3: Storage bucket PRIVATE — dashboard verification

`schema.sql` sets `public.buckets.public = false` for `resource-photos`. Steve confirms via code inspection. Sky should verify in the Supabase dashboard UI (Storage → resource-photos → Settings → "Public bucket" toggle is OFF) after applying the schema. The dashboard sometimes overrides SQL-level settings.

**Recommendation:** Step in Morgan's apply-step list: after running schema, navigate to Storage → resource-photos → confirm Public toggle is off.

## Auth-flow audit (Shamus's code)

### Read-through of `src/lib/auth.tsx` — clean

- `getSession` wrapped in try/catch with `finally { setLoading(false) }` — gate doesn't hang.
- `onAuthStateChange` subscription unsubscribed on unmount.
- `mountedRef` guards all async setState — no setState-after-unmount.
- Realtime subscription removed via `removeChannel` on cleanup.
- `consume_invite_token` call inside OTP step is awaited; failures show in UI.

### Read-through of `src/lib/supabase.ts` — clean

- Env vars throw in `__DEV__`, warn in prod — loud failure on misconfiguration.
- AsyncStorage used (matches AccessMap baseline + S7 disclosure).
- No service-role key used in client (correct — only anon key in `EXPO_PUBLIC_*`).
- No secrets logged.

### Read-through of `src/screens/SignInScreen.tsx` — one small concern

- Error messages flow through `userFacingErrorMessage()` — good.
- BUT: if `signUpWithEmail` succeeds and then user closes the app before OTP, they have an orphan unverified account. They can retry signup with the same email — Supabase auth handles this gracefully (re-sends OTP, no duplicate). Verified by reading Supabase docs.

### Read-through of `src/screens/CompleteProfileScreen.tsx` — clean

- `validateHandle` runs on every keystroke; soft warning + hard errors handled.
- Duplicate-handle handling: catches `23505` Postgres error and re-rolls suggestions.
- No SQL injection vector: `supabase.from().update().eq()` is parameterized.

### Read-through of `src/screens/WaitingRoomScreen.tsx` — clean

- `announcedRef` mounted-ref edge detector fires exactly once on verification flip.
- `signOut` from useAuth — proper teardown.

## DECISIONS FOR SKY

None new beyond S-CYC1-1, S-CYC1-2, S-CYC1-3 above. None of these block Cycle 1 shipping; they're operational guidance.

## FAIL_FAST / BLOCKER states

None.

## What's next

- Cycle 7 ship-readiness should run `supabase/__tests__/rls.sql` against the deployed staging environment. Each PASS NOTICE should be in the cycle-7 report.
- The `suspend_inactive_admins` RPC + cron schedule lands in Cycle 5 (admin tool) as a follow-up migration. File should be at `supabase/migrations/2026-XX-XX_inactive_admin_suspend.sql` once Sky approves.
- Penetration test budget for ~Cycle 7: especially testing the I1 (photo URL enumeration) defense in production with real signed URLs.
