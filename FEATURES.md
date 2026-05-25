# Mutual Mesh — Features Backlog

**Owner:** Quinn (Product Manager)
**Status:** Updated 2026-05-25 (Quinn Cycle 6 update). Cycles 0–4 complete. Cycle 5 in progress. Cycle 6 acceptance criteria prioritized (BLOCKER/HIGH/MEDIUM). Web demo items added (WEB-1–3). Phase 2–3 extensions shipped.

## Conventions

- **Born accessible.** Every feature ships with a11y review by Alex against WCAG 2.2 AA.
- **Privacy-first.** Any feature touching identity, location, contact, photos, or admin access routes through Jordan before merge (Constitution Art. 7.6).
- **Match existing patterns.** Mirror AccessMap's screen template, error handling, and pure-helper split.
- **Schema/RLS/auth changes are propose-only.** Dana writes migration files; Sky applies via Supabase dashboard.
- **No external side effects.** Email, push, deploy = Morgan-only on `/morgan` direct invocation (Constitution v1.3 Art. 9).

---

## MVP cycles (Quinn ranks by value/effort during Cycle 0)

### Cycle 0 — Foundation ✅ COMPLETE

- Project scaffold: `package.json`, `tsconfig.json`, `App.tsx`, `app.json`, NativeWind config
- Supabase `schema.sql` (per Jordan's `PRIVACY.md`): `users`, `resources`, RLS policies, `claim_resource` RPC, Storage bucket
- ESLint + Prettier + GitHub Actions CI (typecheck + lint + jest)
- Jest config with `testPathIgnorePatterns: ['/.claude/']`
- `src/lib/supabase.ts` typed client
- `src/types/database.ts` (using `type` NOT `interface`)
- First pure-helper tests
- `DESIGN.md` tokens (WCAG 2.2 AA contrast verified)
- Will-authored `README.md` polish

### Cycle 1 — Auth + Verification Gate + Waiting Room ✅ COMPLETE

**Why this first:** Nothing else works until the gate works. Three-layer enforcement: UI, RLS, Storage RLS.

- `SignInScreen` — email/password ✅
- `AuthProvider` with `is_verified` check ✅
- `App.tsx` Gate: `session && is_verified` → RootNavigator; `session && !is_verified` → WaitingRoomScreen; no session → SignInScreen ✅
- `WaitingRoomScreen` — static, no data access, friendly copy ✅
- `CompleteProfileScreen` — three-step signup with OTP + handle generation ✅
- Tests for `verification.ts` pure helper ✅ (91 jest tests, 8 suites at Cycle 1 close)
- **Privacy: YES** — auth + verification logic. Jordan reviewed ✅

### Cycle 2 — Marketplace Feed (Home) ✅ COMPLETE

**Why next:** Read-only view of the marketplace gives verified users immediate value.

- `HomeScreen` — `FlatList` of `resources` where `status='available'` ✅
- `ResourceCard` component (image, name, status) ✅
- FAB linking to AddResourceScreen ✅
- Realtime updates via `resourcesRealtime.ts` pure helper ✅
- Pagination cap (`.limit(500)`) + cursor TODO ✅
- Tests for realtime merge ✅
- **Privacy: LOW** — public-to-verified-users data only ✅

### Cycle 3 — Add Resource + Photo Upload ✅ COMPLETE

**Why next:** Posting is half the marketplace. Photo handling is privacy-critical.

- `AddResourceScreen` form (name, description, photo, pickup info) ✅
- Photo upload via `expo-image-picker` → `expo-image-manipulator` (EXIF strip client-side) → Supabase Storage ✅
- `resources.ts` `createResource()` sets `posted_by = auth.uid()`, `status = 'available'` ✅
- Storage RLS path-enforced `<userId>/<timestamp>.<ext>` ✅
- **Privacy: YES** — Jordan reviewed EXIF strip pipeline ✅; Steve audited Storage RLS ✅
- **Note:** Server-side EXIF Edge Function (DFS-P1-A) pending Sky approval — client strip in place as first layer

### Cycle 4 — Resource Detail + Atomic Claim ✅ COMPLETE

**Why next:** The other half of the marketplace.

- `ResourceDetailScreen` — image, name, description, status ✅
- Claim button → `supabase.rpc('claim_resource', { resource_id })` (atomic, row-locked) ✅
- On success: show poster's contact handle (no chat; MVP scope) ✅
- Pickup confirmation flow: either poster OR claimant marks pickup complete → `status='completed'` ✅
- Race-condition tests (two clients claiming same item; one wins) ✅
- **Privacy: LOW** — Steve audited race conditions ✅

### Cycle 5 — Verification Admin Tool 🔄 IN PROGRESS

**Why later:** Need real users in waiting room to test against.

- Admin role identification via `is_admin` column in `public.users` ✅
- `AdminVerificationScreen` listing unverified users ✅
- "Approve" action → `approve_user(applicant_id)` RPC (logs to `verification_log`) ✅
- "Reject" action → `reject_user(id, reason?)` RPC (logs + cascade-deletes) ✅
- Admin tab wired behind `is_admin` gate in bottom navigation ✅ (PR #4 `feat(nav): wire admin tab`)
- Admin's view shows minimum-necessary data (handle + postal_prefix + city; no email) ✅
- **Privacy: HIGH** — Jordan reviewed admin data access ✅ (`2026-05-25-jordan-admin-verification-review.md`); Steve audited admin RLS ✅ (`2026-05-25-steve-admin-security-pass.md`)
- **Open:** Deep-link navigation wiring from WaitingRoom → Admin tab (in PR)

### Cycle 6 — Profile + Delete-My-Account 🔲 NEXT

**Why later:** Required for ship-readiness; lower urgency than core marketplace.

**What's already built (as of 2026-05-25):**

- `ProfileScreen` exists with: handle display, postal_prefix, city, posted count, active claims count, sign-out, delete-account button ✅
- `deleteMyAccount()` in `src/lib/resources.ts` calls `delete_my_account` RPC (atomic cascade: resources + Storage photos + auth.users row) ✅
- ConfirmationModal with honest backup-retention disclosure ✅
- Anonymous error-reporting opt-in toggle (PRIVACY.md D8 — opt-in, not opt-out) ✅

**Acceptance criteria (what Cycle 6 still needs to ship):**

> Priority key: **BLOCKER** = nothing else in Cycle 6 merges until this clears · **HIGH** = must ship with Cycle 6 · **MEDIUM** = ships with Cycle 6 if no time pressure

1. **AC-6.1 — Handle edit flow** _(Priority: HIGH — Shamus building 2026-05-25 tonight)_: A verified user can tap "Edit handle" on ProfileScreen, enter a new value, and have it validated by `handleValidator.ts` (soft-warn on real-name patterns); on save the `public.users.handle` column updates and the UI reflects the new value within one render cycle.
2. **AC-6.2 — Delete confirms Storage removal** _(Priority: HIGH — Jordan review required before merge, see AC-6.4)_: The `delete_my_account` RPC cascade-deletes all Storage objects at `<userId>/*` in the `resource-photos` bucket (not just DB rows). Gary verifies with a test that the bucket path is empty after RPC execution.
3. **AC-6.3 — Profile stats accuracy post-claim** _(Priority: MEDIUM)_: After a pickup is confirmed (`status='completed'`), the "Active claims" count on ProfileScreen decrements; a "Completed" count increments. Both reflect DB state within one `loadCounts` call.
4. **AC-6.4 — Jordan privacy review for Cycle 6 scope** _(Priority: BLOCKER — gates AC-6.2 merge)_: Jordan reviews the full Cycle 6 scope: handle-edit path (no real-name leak), `deleteAccount()` Storage cascade (hard-delete, not soft), and the delete-account modal body matching PRIVACY.md D6 spec (honest disclosure of Supabase 7-day backup window; no promise of immediate purge from backups). Jordan signs off in a qa-report before AC-6.2 merges.
5. **AC-6.5 — Session + AsyncStorage clear on account delete** _(Priority: HIGH)_: On successful `delete_my_account` RPC, `signOut()` runs, AsyncStorage is cleared, and the gate routes to SignInScreen — no stale auth state remains in memory or on-device storage.

- **Privacy: HIGH** — Jordan verifies handle-edit path does not leak real names; Jordan verifies deletion is real (hard-delete, not soft). AC-6.4 is the explicit BLOCKER gate.

### Cycle 7 — Safety sweep + ship

- Peter: performance pass (query plans, image sizes, pagination behavior)
- Steve: final security pass (RLS audit, secrets scan, auth flows)
- Alex: final WCAG 2.2 AA audit + dynamic type
- Gary: CI green; test coverage ≥ target
- Will: documentation polish; LEARNINGS.md curation
- Rory: EAS Build profile + TestFlight (Phase 4 — requires Sky Expo account linkage)
- Morgan: ship-readiness briefing → `DECISIONS FOR SKY`

---

## Web Demo (Vercel) — shipped 2026-05-25

Items added to support the live web demo deployment alongside the native build.

- **WEB-1 — Live web demo on Vercel** ✅ SHIPPED: `https://mutual-mesh.vercel.app` — auth-gated (no guest mode); vercel.com project linked to the MutualMesh repo. Intended for stakeholder review and accessibility auditing only; not a production surface for real user data.
- **WEB-2 — Jordan Condition 4 advisory (expo-location CI check)** 🔄 IN PROGRESS _(Gary adding 2026-05-25 tonight)_: `expo-location` permission requests are a privacy-sensitive surface. Gary adds a CI lint check that flags any new call to `Location.*` or `requestForegroundPermissionsAsync` without a corresponding Jordan qa-report reference. Implements Jordan's Condition 4 from the Phase 3 map review.
- **WEB-3 — Web a11y audit** 🔄 IN PROGRESS _(Alex 2026-05-25 tonight)_: WCAG 2.2 AA audit of the Vercel web demo — focus order, ARIA labels, color contrast against the web-rendered NativeWind tokens, keyboard navigation. Output: `qa-reports/a11y-web-2026-05-25-alex.md`. Blocker for any public demo link being shared externally.

---

## Phase 2–3 Extension Features ✅ SHIPPED (beyond original MVP scope)

These features shipped during Phase 2–3 velocity loops (2026-05-24) before Cycle 5–7 completed. All passed Jordan privacy review + Steve security audit.

### Resource Categories (Phase 2)

- 5-value category enum: `food`, `hygiene`, `baby`, `HRT`, `other` (migration 004)
- CategoryChip filter chips on HomeScreen (client-side + server filter hook)
- `categoryStorage.ts` — AsyncStorage persistence of last-selected filter
- ResourceCard category tag
- AddResource category picker
- **Privacy:** Jordan reviewed (`phase-2-jordan-review-categories.md`) ✅

### Pickup Confirmation (Phase 2)

- `confirm_pickup()` RPC — either poster OR claimant can confirm; prevents double-confirm (migration 005)
- `pickupConfirm.ts` pure helpers: `canConfirm()`, role-aware copy
- StatusPill `completed` variant
- 30-day retention: `prune_expired_resources()` nightly cron also prunes `status='completed'` rows older than 30 days
- **Privacy:** Jordan reviewed (`phase-2-jordan-review-pickup-confirmation.md`) ✅

### Onboarding Tour (Phase 2)

- `OnboardingTourScreen` — 3-card FlatList, swipe + button navigation, reduced-motion-aware
- Gate route `'onboarding'` wired in `verification.ts` + `App.tsx`
- `complete_onboarding()` RPC + `users.onboarding_complete` column (migration 006)
- Profile "See intro again" via ProfileStackNavigator
- `useReducedMotion.ts` pure helper (respects `AccessibilityInfo.isReduceMotionEnabled`)
- **Privacy:** Jordan reviewed (`phase-2-jordan-review-onboarding-tour.md`) ✅

### Resource Map View (Phase 3)

- `ResourceMapScreen` — OSM tile map, FSA-aggregated cluster pins, MapToggle between feed and map
- `mapHelpers.ts` — FSA postal-prefix aggregation (privacy-preserving: no lat/lon stored, only postal prefix)
- `fsaAggregation.ts` pure helper (testable)
- Preview sheet on pin tap links to ResourceDetailScreen
- **Privacy:** Jordan reviewed (`phase-3-jordan-review-map.md`) ✅

### Push Notifications (Phase 3)

- `pushNotifications.ts` — 6 functions: `registerForPushNotifications`, `savePushToken`, `sendPushNotification`, `getPushPreferences`, `setPushPreference`, `unsubscribeAll`
- `pushPreferences.ts` — per-notification-type opt-in (default OFF per PRIVACY.md)
- Three-layer AC-8 gate: platform permission → user preference → server send
- Expo Push Token registration → Supabase `push_tokens` table (migration 009)
- `log-error` Edge Function for server-side delivery
- **Privacy:** Jordan reviewed (`phase-3-jordan-review-push.md`) ✅; Steve audited (`phase-3-steve-push-audit-2026-05-24.md`) ✅
- **Note:** End-to-end device test (physical device) still pending (Rory DFS)

### Anonymous Error Reporting (Phase 3/4)

- `errorReporting.ts` — `logError()` strips PII client-side before sending
- Opt-in persisted via AsyncStorage (default OFF — PRIVACY.md D8)
- Toggle surfaced in ProfileScreen
- `log-error` Edge Function receives only crash type + count (no stack traces with user data)

### Legal Screens (Phase 4)

- `PrivacyPolicyScreen` — full policy text from `policyText.ts`
- `TermsOfServiceScreen` — full ToS text from `policyText.ts`
- `SplashScreen` — branded launch screen

---

## DECISIONS FOR SKY (logged here as they arise)

_(See `qa-reports/` for the full decision log. Key open items as of 2026-05-25:)_

- **DFS-P1-A** — Server-side EXIF Edge Function (second layer of D5). Awaiting Sky approval to build.
- **DFS-Phase4** — TestFlight / EAS Build: requires Sky to link Expo account + Apple credentials in `eas.json`.
- **Phase 3.4** — i18n (`src/lib/i18n.ts` scaffolded; Jordan reviewed `phase-3-jordan-review-i18n.md`). Sky decides go/no-go.

---

## Out of scope for v1

- **In-app chat** — claim reveals contact handle (Signal / email alias / etc.). Chat is v2.
- **iOS/Android app store release** — local Expo Go + TestFlight (Cycle 7) before any public listing.
- **Multi-language support** — English MVP; i18n scaffolded (`src/lib/i18n.ts`) but not wired. English MVP ships first.
