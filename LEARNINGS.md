# Mutual Mesh — Learnings

Durable patterns, recipes, and gotchas. Append-only. Each entry is dated. Each entry should be useful to someone reading it cold months from now.

Mirror the AccessMap LEARNINGS.md style: dated headers, ~3–4 paragraphs each, concrete recipes with file paths.

---

## 2026-05-23 — Phase 0a toolchain stack & two fixes worth remembering

The Day-0 scaffold landed with Expo SDK 54 + React Native 0.81.5 + React 19.1 + Supabase JS 2.45 + NativeWind 4 + Jest 29 + TS 5.9 + ESLint 8 + Prettier 3, mirroring AccessMap's tested versions. Two non-obvious pieces had to be patched live before `npm test && npm run typecheck && npm run lint && npm run format:check` was green end-to-end:

**(1) `react-native-worklets` is a required dev-dep for Jest on RN 0.81+.** The `babel-preset-expo` chain transitively requires `react-native/jest/react-native-env.js`, which in turn requires `react-native-worklets/plugin`. Without it, every `npm test` invocation fails with `Cannot find module 'react-native-worklets/plugin'` even if your code has no animations. Fix: `npm install --save-dev react-native-worklets --legacy-peer-deps`. Do not assume worklets is only needed by reanimated — removing reanimated does **not** drop the requirement, because RN itself reaches for it.

**(2) `eslint-config-expo` is incompatible with `@typescript-eslint` v8.** The `expo` preset references `@typescript-eslint/ban-types`, a rule removed in v8 of the TS-ESLint stack. Result: every TS/TSX file fails lint with "Definition for rule '@typescript-eslint/ban-types' was not found". Fix: drop `eslint-config-expo` and use a leaner stack: `eslint:recommended` + `plugin:@typescript-eslint/recommended` + `plugin:react/recommended` + `plugin:react-hooks/recommended`. See `.eslintrc.json` for the working config. Revisit if/when `eslint-config-expo` ships a v8-compatible release.

**Toolchain commands** (from repo root, after `npm install --legacy-peer-deps`):

```bash
npm run typecheck     # tsc --noEmit              — green
npm test              # jest                       — 9/9 passing
npm run lint          # eslint . --ext .ts,.tsx    — clean
npm run format:check  # prettier --check ...       — clean
npm run format        # prettier --write ...       — auto-fix
```

CI runs all four on every PR (see `.github/workflows/ci.yml`). The `--legacy-peer-deps` flag is required because of the React-version pin (Expo SDK 54 pins React 19.1, while some libs want 19.2+).

---

## 2026-05-23 — Pure-helper split (verification, contactHandle, resourcesRealtime)

Three foundational helpers landed before any Supabase wiring. All are PURE — no side effects, no SDK imports. This is the AccessMap pattern from `flagsRealtime.ts`: split the channel adapter from the merge logic so the merge can be unit-tested with plain JS objects.

**The pattern:**

- `src/lib/verification.ts` — `routeForGate({ session, isVerified })` returns `'sign-in' | 'wait' | 'home'`. Strict `=== true` check on `isVerified`; null defaults to `'wait'` (never optimistically expose).
- `src/lib/contactHandle.ts` — `validateContactHandle(input)` returns `{ ok: true } | { ok: false, reason }`. URL_PATTERN rejects `https?:`, `javascript:`, `data:`, `vbscript:`, `tel:`, `mailto:`, `file:`, and `www.` prefixes — Steve loop-6 hardening.
- `src/lib/resourcesRealtime.ts` — `applyResourceDelta(state, event)` returns a new array (or same ref on no-op for React render perf). Handles INSERT/UPDATE/DELETE with idempotency and out-of-order delivery.

**The discipline**: Helpers don't import from `@supabase/supabase-js`. When Phase 0b lands `src/lib/resources.ts`, that file owns the channel subscription and calls these pure helpers on each event. The split keeps test coverage cheap.

47 tests across `errors.test.ts` (9), `verification.test.ts` (6), `contactHandle.test.ts` (18), `resourcesRealtime.test.ts` (14) — all run in <2s with `jest-expo`.

---

## 2026-05-23 — Design tokens with documented contrast ratios

DESIGN.md v1 lists every color token alongside its computed WCAG contrast ratio against its canonical paired background. Alex independently re-computed all 18 pairs using the WCAG sRGB → linear → relative-luminance formula and found two pairs (`light.borderStrong` and `dark.borderStrong`) below the 3:1 non-text minimum. Both replaced (`#A8957D` → `#8B6F4E`; `#5E4A33` → `#8A7659`) and verified to clear AA.

**Recipe for future Dani/Alex passes:** When proposing a token, compute the ratio yourself and put it in DESIGN.md _at the same time you write the hex_. Don't ship "looks right" colors — ship "passes AA with X:1 headroom" colors. The Node one-liner for batch verification lives in `qa-reports/2026-05-23_a11y-tokens.md`.

Mode-pair tokens are sufficient for v1. APCA (the algorithm WCAG 3 is moving toward) is on the Cycle 7 list — current AA-passing pairs may sit closer to APCA thresholds than the WCAG numbers suggest.

---

## 2026-05-23 — Component primitive set + a11y baseline

Built five primitives (Button, TextField, Card, StatusPill, FAB) that every screen consumes. Each one bakes in WCAG 2.5.5 (44pt hit target via `TOUCH_TARGET_MIN`), `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, and `accessibilityState`. The TextField's error message uses `accessibilityLiveRegion="polite"` so screen readers announce validation failures without the user re-focusing.

**The rule baked into Card**: when `onPress` is set, the Pressable variant enforces `minHeight: TOUCH_TARGET_MIN`. When `onPress` is unset, no minimum — non-interactive cards are not targets. This prevents accidental sub-44pt hit boxes without bloating decorative cards.

**Multiline TextField gotcha:** Android defaults multiline TextInput `textAlignVertical` to `'center'`, which puts the caret in the middle of an empty field. We override to `'top'` only when `multiline` is true. iOS already top-aligns; the override is a no-op there.

---

## 2026-05-23 — Navigator orphaned by design until Phase 0b

`src/navigation/RootNavigator.tsx` is wired into `App.tsx` so `npm start` boots into the marketplace feed (mock data). The real Gate logic (`routeForGate` + AuthProvider) is **deliberately not** wired in — that crosses the privacy gate that's blocked until Sky approves PRIVACY.md.

When Phase 0b lands, the wiring is two lines in App.tsx:

```tsx
const route = routeForGate(useAuth());
if (route === 'sign-in') return <SignInScreen onSignIn={...} onSignUp={...} />;
if (route === 'wait') return <WaitingRoomScreen onSignOut={signOut} />;
return <RootNavigator />;
```

The HomeStack inside RootNavigator wires Feed → Detail (push) → AddResource (modal). Tab navigator has HomeTab + ProfileTab. NavigationContainer theme pulls from `colors.light`/`colors.dark` via `useColorScheme()` so react-navigation's chrome (header, tab bar) matches the rest of the design system without a second source of truth.

Glyphs in the tab bar are plain Unicode characters (`◧`, `◉`) because no icon-font dep is installed yet. Phase 0b or Cycle 6 picks one (`react-native-vector-icons` or `@expo/vector-icons`) and replaces.

---

## 2026-05-23 — Push 2: research + community + Cycle 1 spec + threat model + missing primitives

Phase 0a complete + a follow-on push adding the work that wasn't strictly required to ship but is required to ship _well_:

**Research layer.** Riley landed three composite personas (Mara — recipient, Keo — trans organizer, Deb — community poster), two journey maps (Mara claiming, Deb posting), and a cross-persona friction analysis. Top friction: **empty marketplace in early days**, which makes Casey's seed-drive plan load-bearing for retention. See `research/`.

**Community layer.** Casey filled in `community/mission.md`, `onboarding.md`, `growth-strategy.md` with real narrative grounded in Riley's personas. Headline principle: **Mutual Mesh grows by serving small dense networks, not by going broad.** No social-media virality; no paid acquisition; no referral rewards.

**Cycle 1 ready.** Quinn wrote the full spec for the Auth + Verification Gate + Waiting Room cycle (`qa-reports/2026-05-23_spec-cycle-1-auth-gate.md`). When Sky approves PRIVACY.md, Cycle 1 can start without re-spec'ing.

**Threat model.** Steve wrote a STRIDE-style threat model (`qa-reports/2026-05-23_threat-model-stride.md`) covering 21 distinct threats. Three highest residual risks: backup retention (platform-limited, disclosed), handle impersonation (recommend v2 timestamp indicator), credential theft (recommend v2 2FA). All others mitigated to low/negligible with the Jordan v1 + Steve S1-S8 model.

**Five new UI primitives** — `useReducedMotion` hook, `FlashBanner`, `EmptyState`, `LoadingSkeleton` / `FeedSkeleton`, and `ErrorBoundary`. All gate animation on `useReducedMotion`. ErrorBoundary wraps RootNavigator in App.tsx so a render-time crash anywhere shows a friendly fallback instead of a blank screen.

**Pattern locked in: announce-once via mounted-ref.** `FlashBanner` calls `AccessibilityInfo.announceForAccessibility(message)` exactly once on mount (using a `useRef(false)` edge-detector). This is the AccessMap pattern — see qa-reports there too. Any future component that announces something (toast, banner, modal entry) MUST use the same pattern: announce on the false→true transition, not on every render.

**Pattern locked in: skip animation when `useReducedMotion()` is true.** Components animate via `Animated.timing` ONLY when `reducedMotion === false`. When true, the animated value is set directly (no easing). Future contributors: don't try to provide a "lighter" animation when reduce-motion is on. Just skip. The signal is "don't move things at all," not "move them more softly."

**Pattern locked in: NO third-party error tracking.** ErrorBoundary logs to `console.warn` only. No Sentry, no Bugsnag. Per Jordan D8. If we ever need crash analytics, host them ourselves with the same privacy posture as the rest of the data.

Tests: 51 across 6 suites (added `useReducedMotion.test.ts` + `errorBoundary.test.ts` — contract-only since RTL isn't installed; deferred component-level tests to Phase 0b).

---

_Phase 0a + Push 2 complete. Next entries land when Cycle 1 ships post-Sky-approval._

---

## 2026-05-23 — Cycle 1: Real Supabase wiring (auth + verification gate + waiting room)

Cycle 1 lands the first real user-data layer. Six load-bearing patterns emerged that future cycles must follow:

**(1) The Gate is a pure function.** `src/lib/verification.ts` exports `decideGateRoute({ loading, session, profile })` returning one of 5 states (`splash | sign-in | complete-profile | wait | home`). `App.tsx`'s Gate component does ZERO routing logic itself — it calls `decideGateRoute` and switches on the result. This makes the entire app-level routing testable without React Testing Library; see `src/__tests__/verification.test.ts` for 9 routing scenarios including defensive demotion. Future cycles that add gate states (e.g., "banned", "deactivated") extend this enum + add tests.

**(2) Profile starts "pending-XXX", not email-local-part.** The `handle_new_user()` trigger in `supabase/schema.sql` creates a `public.users` row with `handle = 'pending-' || substr(uuid, 1, 12)`. The Gate detects `pending-` prefix via `isProfilePending(handle)` and routes to `CompleteProfileScreen`. This is the load-bearing D1/D2 enforcement — the handle is NEVER derived from the email (which would leak real names like `jane.smith`). Random adjective-noun-4digit is what the user picks in step 3 (with re-roll button + soft-warn on real-name shape).

**(3) Realtime subscription on the user's own row with filter.** `AuthProvider` subscribes via `supabase.channel(`user-row-${uid}`).on('postgres_changes', { filter: `id=eq.${uid}` })`. The filter is **required defense-in-depth** for STRIDE I3, even though RLS would already block cross-user leakage. When `is_verified` flips true, `WaitingRoomScreen`'s mounted-ref edge detector fires `AccessibilityInfo.announceForAccessibility` once, then the Gate auto-routes to RootNavigator.

**(4) Security-definer RPCs are the ONLY path for privileged operations.** Direct UPDATE on `is_verified` or `is_admin` is rejected by the `protect_admin_flags()` trigger. Admins approve/reject via `approve_user(id)` / `reject_user(id, reason)` RPCs (security definer, admin-check, log append). Atomic claim goes through `claim_resource(resource_id)` (FOR UPDATE + status check). Account deletion goes through `delete_my_account()` (FOR UPDATE + cascade). Never let the client write to a privileged column.

**(5) bcrypt invite tokens via pgcrypto.** Invite codes are 12+ char alphanumeric, bcrypt-hashed cost-10 via `crypt(token, gen_salt('bf', 10))`. The plaintext never sits in the DB. `consume_invite_token(plain)` does `crypt(plain, stored_hash) = stored_hash` for the verify step, then marks the token used atomically via `FOR UPDATE`. The Cycle 1 spec / Cowork prompt generates the FIRST token via dashboard SQL — Sky inserts manually with their own UUID as `created_by`.

**(6) Append-only audit log via RLS absence.** `public.verification_log` has only a SELECT policy (Sky-only via `config.sky_uuid`). No UPDATE policy, no DELETE policy. The admin's INSERT happens via security-definer RPC. An admin with database access via compromise CANNOT modify their own decision history — confirmed in `supabase/__tests__/rls.sql` test T8.

**Toolchain validation at end of Cycle 1:** 91 tests across 8 suites (handleGenerator + handleValidator + decideGateRoute + isProfilePending added in this cycle); typecheck clean; lint clean; prettier clean. The pure-helper + tested-routing pattern means we caught a defensive-demotion edge case (admin flips verified → false; UI must route back to WaitingRoom) before it could ship.

**Apply step Sky must do**: see `qa-reports/cycle-1-auth-gate-2026-05-23.md` for the numbered Supabase dashboard list (enable extensions, run schema, set `config.sky_uuid`, promote Sky to `is_admin`, generate first invite token, apply realtime.sql, verify pg_cron).

---

_Cycle 1 complete. Cycle 2 (Marketplace Feed wired to real Supabase + resourcesRealtime integration) starts the moment Sky applies the schema._

---

## 2026-05-25 — EXIF strip pipeline: client + server are both load-bearing

The EXIF strip is two layers because neither layer alone is sufficient. The client-side strip in `src/lib/photos.ts` uses `expo-image-manipulator` to re-encode the image at 0.75 quality and max 2048px, which discards the EXIF container as a side effect of re-encoding. That's the first layer. But a forked or tampered client could bypass it — so there's a second layer: a Deno Edge Function at `supabase/functions/exif-strip/index.ts` that fires on every `storage.objects` INSERT via a Storage Webhook, downloads the uploaded file, runs `imagemagick_deno`'s explicit `img.strip()` call, and overwrites the object in place.

Three things tripped us up building this:

**(1) The tsconfig must explicitly exclude `supabase/functions/`.** The Edge Function uses Deno-style URL imports (`https://deno.land/x/imagemagick_deno@0.0.31/mod.ts`) that don't exist in the Node module graph. Without the exclude, every URL import breaks `npm run typecheck`. Fix: add `"supabase/functions"` to the `exclude` array in `tsconfig.json` and `"supabase/functions/"` to `ignorePatterns` in `.eslintrc.json`. Prettier is fine with the Deno file — it doesn't resolve imports, it just formats tokens.

**(2) Idempotency via a user-metadata marker, not a re-check of the bytes.** Webhook redelivery is real. The function checks the object's `user_metadata` for an `x-exif-stripped: v1` header before doing any work. If the marker is present, it returns 200 immediately. On successful strip + re-upload, it sets the marker. Two webhook deliveries racing on the same path both re-encode from the already-stripped bytes, both write the marker — wasteful but correct. Without the marker, a redelivery would strip an already-stripped file, which works but logs noise.

**(3) Keep-on-failure vs delete-on-failure is a real decision, not an obvious default.** If the function fails (oversized file, corrupt decode, re-upload error), the current choice is to leave the original in place — the post still works, and the client-side strip still applies. Delete-on-failure would silently remove the photo and confuse the poster. The right monitoring response is a weekly bucket scan for objects missing the `x-exif-stripped` marker. Any unmarked object in the `resource-photos` bucket is a signal worth investigating. See `qa-reports/phase-2.5-c1-exif-edge-function.md` §3.2 for the full edge-case table.

---

## 2026-05-25 — FSA aggregation: the map is private because of what it never shows

The resource map renders neighborhood-level polygons — Canadian FSAs (the first three characters of a postal code, roughly several blocks). It never shows GPS pins, building addresses, or exact counts. That design choice is load-bearing for Deb's persona (anti-goal: anything that exposes the community fridge's exact address) and Keo's persona (anti-goal: location at any granularity finer than city).

The aggregation lives in `src/lib/fsaAggregation.ts` as a set of pure functions. `groupResourcesByFSA` takes the existing `resources` array (already in memory from the marketplace feed), groups by the first three characters of `postal_prefix`, and returns `FsaDescriptor` objects — one per FSA with at least one available resource. The descriptor carries a `bucket` (none / light / medium / heavy) rather than an exact count. The bucket is what the map renders and what the screen-reader label speaks. The exact count is internal to the descriptor and is never shown in the UI.

Two implementation rules to follow forever: (1) `postal_prefix` inputs are normalized to 3-char uppercase before grouping — user-entered postal codes are inconsistent in casing and sometimes include the trailing half. (2) Resources without a `postal_prefix` are silently dropped from the map, not bucketed into a catch-all FSA. A resource with no location data should not appear to have a location. See the `extractFsa` helper for the exact normalization and `src/__tests__/fsaAggregation.test.ts` for boundary cases. The accessibility label format (`"M5V, Toronto, a few resources available"`) is the public surface — never include raw counts in labels.

---

## 2026-05-25 — Push notification consent: three places, not one

Push notifications touch three separate layers of enforcement and all three must be present. The pattern came out of Jordan's Phase 3.1 privacy review and Steve's Phase 3+4 security sweep.

**Layer 1 — client gate.** `src/lib/pushNotifications.ts` checks `hasAnyTriggerEnabled(prefs)` before calling `registerForPushNotificationsAsync`. If all triggers are off (the default for every user), the client never asks the OS for permission and never calls Expo's push API. The Expo push token is read fresh on each session foreground and is never written to `AsyncStorage` — a stolen device does not yield a usable token.

**Layer 2 — server RPC gate.** `register_push_token` in `supabase/migrations/011_register_push_token_pref_gate.sql` checks `is_verified = true` AND `push_preferences.enabled = true` before inserting the token row. Without this, an authenticated-but-unverified user in the Waiting Room could register as a push target, and a stale client could register tokens for a user who has since opted out. The JSDoc in `pushNotifications.ts` documents all three layers — if Layer 2 is pending deployment, the comment must say so explicitly rather than claiming it is in place.

**Layer 3 — Edge Function pre-send check.** The `deliver_notification` Edge Function re-reads `push_preferences` from the database before sending to Expo. Even if Layer 2 were bypassed, a token registered for an opted-out user would be caught here. This is the last-line defense.

The privacy rules that apply forever: push notification payloads contain a title (one of four fixed generic strings per trigger, never the resource name) and an empty body. The body-empty contract is enforced by a runtime assertion at the Edge Function layer. The four title strings are reviewed by Jordan before any new trigger is added — the list is not open-ended. Geofence-triggered push is permanently out of scope for any version; the smallest location unit the app communicates is an FSA, and push notifications that fire based on location would violate that contract. See `qa-reports/phase-3-jordan-review-push.md` for the full conditions and `qa-reports/phase-3-4-security-sweep-2026-05-24.md` for Steve's F1–F4 findings.
