# Mutual Mesh — Features Backlog

**Owner:** Quinn (Product Manager)
**Status:** Day-0 seed from PRD. Quinn fills in full specs during Cycle 0 once Jordan's `PRIVACY.md` is approved.

## Conventions

- **Born accessible.** Every feature ships with a11y review by Alex against WCAG 2.2 AA.
- **Privacy-first.** Any feature touching identity, location, contact, photos, or admin access routes through Jordan before merge (Constitution Art. 7.6).
- **Match existing patterns.** Mirror AccessMap's screen template, error handling, and pure-helper split.
- **Schema/RLS/auth changes are propose-only.** Dana writes migration files; Sky applies via Supabase dashboard.
- **No external side effects.** Email, push, deploy = Morgan-only on `/morgan` direct invocation (Constitution v1.3 Art. 9).

---

## MVP cycles (Quinn ranks by value/effort during Cycle 0)

### Cycle 0 — Foundation _(no user-facing features; the scaffold)_

- Project scaffold: `package.json`, `tsconfig.json`, `App.tsx`, `app.json`, NativeWind config
- Supabase `schema.sql` (per Jordan's `PRIVACY.md`): `users`, `resources`, RLS policies, `claim_resource` RPC, Storage bucket
- ESLint + Prettier + GitHub Actions CI (typecheck + lint + jest)
- Jest config with `testPathIgnorePatterns: ['/.claude/']`
- `src/lib/supabase.ts` typed client
- `src/types/database.ts` (using `type` NOT `interface`)
- First pure-helper tests
- `DESIGN.md` tokens (WCAG 2.2 AA contrast verified)
- Will-authored `README.md` polish

### Cycle 1 — Auth + Verification Gate + Waiting Room

**Why this first:** Nothing else works until the gate works. Three-layer enforcement: UI, RLS, Storage RLS.

- `SignInScreen` — email/password
- `AuthProvider` with `is_verified` check
- `App.tsx` Gate: `session && is_verified` → RootNavigator; `session && !is_verified` → WaitingRoomScreen; no session → SignInScreen
- `WaitingRoomScreen` — static, no data access, friendly copy
- Tests for `verification.ts` pure helper
- **Privacy: YES** — auth + verification logic. Jordan reviews.

### Cycle 2 — Marketplace Feed (Home)

**Why next:** Read-only view of the marketplace gives verified users immediate value.

- `HomeScreen` — `FlatList` of `resources` where `status='available'`
- `ResourceCard` component (image, name, status)
- FAB linking to AddResourceScreen
- Realtime updates via `resourcesRealtime.ts` pure helper
- Pagination cap (`.limit(500)`) + cursor TODO
- Tests for realtime merge
- **Privacy: LOW** — public-to-verified-users data only

### Cycle 3 — Add Resource + Photo Upload

**Why next:** Posting is half the marketplace. Photo handling is privacy-critical.

- `AddResourceScreen` form (name, description, photo, pickup info)
- Photo upload via `expo-image-picker` → `expo-image-manipulator` (EXIF strip) → Supabase Storage
- `resources.ts` `createResource()` sets `posted_by = auth.uid()`, `status = 'available'`
- Storage RLS path-enforced `<userId>/<timestamp>.<ext>`
- **Privacy: YES** — Jordan reviews EXIF strip pipeline; Steve audits Storage RLS

### Cycle 4 — Resource Detail + Atomic Claim

**Why next:** The other half of the marketplace.

- `ResourceDetailScreen` — image, name, description, status
- Claim button → `supabase.rpc('claim_resource', { resource_id })` (atomic, row-locked)
- On success: show poster's contact handle (no chat; MVP scope)
- Race-condition tests (two clients claiming same item; one wins)
- **Privacy: LOW** — Steve audits race conditions

### Cycle 5 — Verification Admin Tool

**Why later:** Need real users in waiting room to test against.

- Admin role identification (via Supabase claim or separate `admins` table)
- Admin-only screen listing unverified users
- "Approve" action sets `is_verified = true`
- Admin's view of applicant data must be minimum-necessary (per Jordan)
- **Privacy: HIGH** — Jordan + Sky approve admin data access; Steve audits admin RLS

### Cycle 6 — Profile + Delete-My-Account

**Why later:** Required for ship-readiness; lower urgency than core marketplace.

- `ProfileScreen` — my posts, my claims, edit chosen handle
- "Delete my account" flow that actually deletes (cascading deletes on `resources`, Storage photos)
- **Privacy: HIGH** — Jordan verifies deletion is real (not soft-delete)

### Cycle 7 — Safety sweep + ship

- Peter: performance pass (query plans, image sizes, pagination behavior)
- Steve: final security pass (RLS audit, secrets scan, auth flows)
- Alex: final WCAG 2.2 AA audit + dynamic type
- Gary: CI green; test coverage ≥ target
- Will: documentation polish; LEARNINGS.md curation
- Rory: EAS Build profile draft (Sky-applied, not auto-deployed)
- Morgan: ship-readiness briefing → `DECISIONS FOR SKY`

---

## DECISIONS FOR SKY (logged here as they arise)

_(Empty at Day 0. Cycle reports under `qa-reports/` will append items here.)_

---

## Out of scope for v1

- **In-app chat** — claim reveals contact handle (Signal / email alias / etc.). Chat is v2.
- **Map view of pickup locations** — text/address only in MVP to reduce location-data exposure.
- **Push notifications** — pull-only in MVP; notifications add a tracking surface.
- **iOS/Android app store release** — local Expo Go + web build only until Cycle 7.
- **Multi-language support** — English MVP; i18n is v2.
