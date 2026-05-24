# Spec: Cycle 1 — Auth + Verification Gate + Waiting Room — Quinn — 2026-05-23

## Summary

Cycle 1 wires the real auth + verification gate. After Cycle 1, signed-out users see SignIn; signed-in-but-unverified users see WaitingRoom; verified users see the RootNavigator with mock data still (real resources land in Cycle 2). This is the first cycle where user identity actually exists.

**READY — schema lockable.** PRIVACY.md was APPROVED and locked 2026-05-23 (all 18 D/S decisions + 4 open questions resolved). Dana can write `supabase/schema.sql` from the approved model. Confirmed open-question answers that touch this spec: Q1 = OTP-required (AC-2 stands), Q2 = explicit city/region dropdown (add alongside the AC-3 postal-prefix step), handle default = random adjective+noun (per Jordan/Quinn privacy note below). D1 & D2 were edited to enforce "no real names anywhere" — the handle generator and the per-resource contact handle must both reject/​warn against real names.

**Estimated effort:** 2 build days + 1 hardening day. ~6-8 PRs across Dana, Shamus, Steve, Alex, Gary.

## User story

> _As a new user with an invite code, I can create an account using a chosen handle and a Proton-style email alias, get verified within 24 hours, and reach the marketplace feed — with no real-name, phone, or location-finer-than-FSA collection at any step._

> _As an existing verified user, signing in takes me to the feed immediately._

> _As a verified user, signing out clears my session and re-routes me to the SignIn screen._

> _As an unverified user, my screen tells me what's happening and offers a sign-out, but exposes no marketplace data._

## Personas served

- **Mara** (recipient): primary user; the SignIn → wait → marketplace flow IS her onboarding.
- **Keo** (trans organizer): tests the privacy-defaults claim. Email-OTP via Proton alias must work without SMS.
- **Deb** (poster): expects fast sign-in on subsequent sessions; "remember me" via Supabase session storage.

## Acceptance criteria

### AC-1: Email + password signup with invite code

- Given a valid invite token (12+ chars, base32-alphabet per Steve S1)
- When the user enters email + password + invite code
- Then the account is created with: `auth.users.email`, `public.users.handle` (defaults to email-local-part; editable post-signup), `public.users.postal_prefix` (collected in a second step), `public.users.referrer_token_hash`, `public.users.is_verified = false`, `public.users.is_admin = false`.
- And the invite token is marked used (single-use enforcement at the database level — `UNIQUE` constraint or RPC).
- And the user is shown the WaitingRoom immediately.

### AC-2: Email OTP verification (per Jordan open Q1)

- Signup triggers Supabase email magic-link / OTP.
- Until the user clicks the link / enters the code, signin is blocked.
- This is in addition to admin verification — anti-throwaway-email layer.

### AC-3: Postal prefix collection

- Collected in a second signup step (after email/password/invite, before WaitingRoom).
- Validated: exactly 3 chars; alphanumeric (Canadian FSA format `[A-Z][0-9][A-Z]` — case-insensitive); cap at one prefix per user in v1.
- Stored as uppercase 3-char string.

### AC-4: Sign in for existing users

- Email + password → Supabase auth.
- On success, `useAuth()` returns `{ session, user }`.
- AuthProvider fetches `public.users` row by `auth.uid()` to populate `{ handle, postal_prefix, is_verified, is_admin }`.
- Gate routes based on `routeForGate({ session, isVerified })` from `src/lib/verification.ts` (already tested in Loop 5).

### AC-5: Waiting Room behavior

- Static screen with copy from current `WaitingRoomScreen` (verified copy in Cycle 1).
- No data fetches happen here. (RLS will reject queries anyway; the UI proactively skips them.)
- "Sign out" button works.
- If `is_verified` flips to `true` while the screen is visible (via realtime subscription on `public.users` row), the screen auto-routes to the feed.

### AC-6: Sign out

- Clears Supabase session.
- AuthProvider resets `{ session: null }`.
- Gate routes to SignIn.

### AC-7: Three-layer gate enforcement (load-bearing)

- **UI layer**: `routeForGate` returns `'sign-in' | 'wait' | 'home'`. Already exists.
- **DB layer**: RLS on every SELECT and write to `public.resources` requires `auth.uid()` ∈ `(SELECT id FROM public.users WHERE is_verified = true)`. Dana writes the policy in schema.sql.
- **Storage layer**: bucket `resource-photos` RLS requires same check. Dana writes the policy.

If any one layer fails (UI bypass via deep-link, JWT spoof, Storage direct-URL guess), the other two hold.

## Schema dependencies (Dana writes)

```sql
-- public.users (per Jordan v1 + Steve hardening)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE
    CHECK (length(handle) >= 3 AND length(handle) <= 32),
  postal_prefix TEXT
    CHECK (postal_prefix ~ '^[A-Z][0-9][A-Z]$'),
  referrer_token_hash TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to auto-populate on auth.users insert (matches AccessMap pattern)
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER ...

-- Invite tokens (per Jordan D4 + Steve S1)
CREATE TABLE public.invite_tokens (
  token_hash TEXT PRIMARY KEY,           -- bcrypt(token, 10)
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- NULLed on creator deletion
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,                   -- single-use
  used_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Verification log (per Jordan D9 + Steve S8)
CREATE TABLE public.verification_log (
  id BIGSERIAL PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject','escalate')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies (lots — see Dana's schema.sql proposal)
```

Plus three RPCs:

- `consume_invite_token(token_plain)` — bcrypt-verify, mark used atomically.
- `approve_user(applicant_id)` — admin-only, sets `is_verified = true`, inserts verification_log row.
- `reject_user(applicant_id, reason)` — admin-only, removes user from `auth.users` (cascades).

## Component changes (Shamus)

1. **`src/lib/supabase.ts`** — create typed client. Uses `Database` type from `src/types/database.ts`.
2. **`src/types/database.ts`** — use `type` NOT `interface` (CLAUDE.md gotcha #1). Mirrors schema.
3. **`src/lib/auth.tsx`** — `AuthProvider` + `useAuth()`. Fetches `public.users` row on session change. Returns `{ session, user, profile: { handle, postal_prefix, is_verified, is_admin }, signIn, signUp, signOut, loading }`.
4. **`App.tsx`** — replace direct RootNavigator render with the Gate:
   ```tsx
   const { session, profile, loading, signOut } = useAuth();
   if (loading) return <SplashScreen />;
   const route = routeForGate({ session, isVerified: profile?.is_verified ?? null });
   if (route === 'sign-in') return <SignInScreen onSignIn={...} onSignUp={...} />;
   if (route === 'wait') return <WaitingRoomScreen onSignOut={signOut} />;
   return <RootNavigator />;
   ```
5. **`SignInScreen`** — wire `onSignIn` / `onSignUp` to real Supabase calls. Show validation errors via `userFacingErrorMessage()` from errors.ts.
6. **`WaitingRoomScreen`** — wire `onSignOut`. Subscribe to `public.users` row via realtime; auto-refresh on `is_verified` flip.
7. **`SplashScreen`** (new) — shown during initial `loading=true`. Just the wordmark; no data.
8. **`PostalPrefixScreen`** (new) — second-step of signup, captures `postal_prefix`. Reuses `TextField` primitive.

## Tests (Gary)

### Pure helper tests (extend existing)

- `auth.test.ts` — mock Supabase client, verify Gate routing under all session/profile states.
- `inviteToken.test.ts` (new helper) — pure validator for invite token format.

### Component tests

- Add React Native Testing Library setup if not present. Test:
  - SignInScreen toggles between Sign in / Create account.
  - PostalPrefixScreen validates FSA format.
  - WaitingRoomScreen renders sign-out button.

### Integration tests

- Mock Supabase client returning each profile state; assert App.tsx renders the right screen.
- Mock realtime subscription firing `is_verified: true`; assert Gate re-routes.

### Database tests (manual or via supabase-js)

- RLS: an unverified user's SELECT on `public.resources` returns 0 rows.
- RLS: an unverified user's INSERT on `public.resources` is rejected.
- Storage: an unverified user cannot generate a signed URL on `resource-photos`.
- RPC: `consume_invite_token` rejects a used token.

## A11y (Alex pre-audit notes for Cycle 1 build)

- Loading state needs `accessibilityRole="alert"` so screen readers announce it.
- The "is_verified flipped to true" auto-transition should `AccessibilityInfo.announceForAccessibility("You're verified. Loading the feed.")` exactly once (mounted-ref pattern from AccessMap LEARNINGS).
- Error messages on SignInScreen need `accessibilityLiveRegion="polite"` (already done in TextField).
- Splash screen should be brief (<2s); if longer, show a textual "Loading…" so non-sighted users know what's happening.

## Privacy considerations (Jordan pre-audit)

- The handle defaults to email-local-part. **Verify this isn't leaky** — if a user's email is `jane.smith@gmail.com` and the handle becomes `jane.smith`, we've leaked their real name. **Recommendation: handle default is a random adjective+noun pair (`brave-otter`, `quiet-bear`). User edits to whatever they want.**
- Invite tokens are bcrypt-hashed at rest. Plaintext appears only in the consume_invite_token RPC's argument; never logged.
- The verification_log table is RLS-locked: only Sky can SELECT. Admins INSERT only.
- Realtime subscription on `public.users` row — verify the channel doesn't leak data of OTHER users. Should be filtered to `auth.uid()` only.

## Performance considerations (Peter pre-notes)

- AuthProvider fetches `public.users` row on every session change. Cache locally (in context), refresh on app foreground.
- Realtime subscription on `is_verified` — cancel when the WaitingRoom unmounts. Mounted-ref pattern (AccessMap).
- The Gate component should NOT re-render the whole tree on session state changes; React's default referential stability is enough if AuthProvider's value is memoized.

## Out of scope for Cycle 1

- Password reset / forgot-password flow (Cycle 1.5 or wait for v2).
- "Edit handle" UI (Profile tab — but the schema supports it now).
- Admin verification UI (Cycle 5 — see FEATURES.md).
- Email verification UI (the in-app flow that walks a user through clicking the magic link — for v1, defer to Supabase's hosted page or basic in-app embed).
- Multi-language (English only in v1).
- SSO (Google/Apple/etc.) — deliberately rejected per privacy posture.

## Definition of done

- All AC pass manually.
- All tests above pass green.
- Steve hardening audit landed (mounted-ref, error-message safety, RLS verified).
- Alex a11y audit landed (focus order, announce-on-transition, contrast in context).
- Will has updated CLAUDE.md "Database" section from DRAFT to current.
- Will has updated LEARNINGS.md with anything load-bearing this cycle taught us.
- Morgan briefing in `qa-reports/cycle-1-auth-gate-YYYY-MM-DD.md`.
