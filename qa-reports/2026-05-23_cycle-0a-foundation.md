# Cycle 0a Foundation — Morgan briefing — 2026-05-23

**Cycle:** Phase 0a — Day-0 scaffold + 10 loops (5 build + 5 clean) + 5 Gary checks.
**Duration:** Single session, 2026-05-23.
**Branch:** local repo, no integration branch yet (Sky has not initialized git remote — that's a Rory task for Phase 0b).
**Output:** This briefing + 4 qa-reports.

---

## DECISIONS FOR SKY

These are the items requiring Sky's explicit action before Phase 0b can begin. **Read top-down.** Approving the lower items without the upper ones creates gaps.

### Action 1 — Approve Jordan's PRIVACY.md (10 items)

**File:** `PRIVACY.md` (status 🟡 READY-FOR-REVIEW)

| #   | Decision                                                 | Rec                                          |
| --- | -------------------------------------------------------- | -------------------------------------------- |
| D1  | Drop real-name and phone collection entirely             | ✅                                           |
| D2  | Per-resource contact handle replaces in-app chat         | ✅                                           |
| D3  | Postal prefix at 3 characters (FSA-equivalent)           | ✅                                           |
| D4  | Referrer is a hashed token, never a name                 | ✅                                           |
| D5  | Two-layer EXIF stripping (client + server)               | ✅                                           |
| D6  | True cascade delete on "Delete my account"               | ✅                                           |
| D7  | Resource retention — 30 days post-status-change          | ✅                                           |
| D8  | No third-party SDKs in MVP                               | ✅                                           |
| D9  | Verification admins are flagged users, not separate role | ✅                                           |
| D10 | PIPEDA draft is for Sky's review, not legal advice       | ✅ (and budget for a real lawyer pre-launch) |

Plus four open questions for Sky's call (email-OTP vs not, explicit-region selector, multi-language timeline, idle-admin policy). See PRIVACY.md "Open questions" section.

### Action 2 — Approve Steve's 8 security additions

**File:** `qa-reports/2026-05-23_security-privacy-review.md`

| #   | Decision                                                            | Rec                                                |
| --- | ------------------------------------------------------------------- | -------------------------------------------------- |
| S1  | Invite token ≥12 chars, bcrypt-hashed                               | ✅                                                 |
| S2  | Rate-limit signup endpoint 10/min/IP                                | ✅                                                 |
| S3  | Sanitize + length-cap `pickup_text` & `contact_handle`; reject URLs | ✅ (already applied at validation layer in Loop 6) |
| S4  | Photos in PRIVATE Storage bucket with 1h signed URLs (load-bearing) | ✅                                                 |
| S5  | `delete_my_account()` wrapped in transaction with `FOR UPDATE`      | ✅                                                 |
| S6  | `cron_log` table + observability for retention jobs                 | ✅                                                 |
| S7  | Disclose AsyncStorage unencrypted at rest (session-on-stolen-phone) | ✅                                                 |
| S8  | `verification_log` append-only at RLS, Sky-only SELECT              | ✅                                                 |

### Action 3 — Sky merges branch / pushes to remote (not done in this cycle)

Repo is local only. Sky decides when to:

- `git init` (or open via a remote — your choice on naming the GitHub repo)
- Push to remote
- Enable GitHub Actions (`.github/workflows/ci.yml` + `secrets-scan.yml` will fire on first push)

Rory's Phase 0b work assumes a remote exists. If you'd like, Casey can be looped in on choosing the public repo name and visibility.

---

## FAIL_FAST / BLOCKER states

**None during the 10-loop run.** Every Gary check came back green:

| Gary check | After loop | typecheck | tests | lint | format              |
| ---------- | ---------- | --------- | ----- | ---- | ------------------- |
| #1         | 2          | ✅        | 9/9   | ✅   | ✅ (after auto-fix) |
| #2         | 4          | ✅        | 9/9   | ✅   | ✅                  |
| #3         | 6          | ✅        | 47/47 | ✅   | ✅                  |
| #4         | 8          | ✅        | 47/47 | ✅   | ✅                  |
| #5         | 10         | ✅        | 47/47 | ✅   | ✅                  |

(Test count: 9 errors + 6 verification + 18 contactHandle + 14 resourcesRealtime = 47.)

---

## What landed in Phase 0a (per loop)

### Loops 1–2: Privacy foundation

- Jordan v1 PRIVACY.md (data inventory, 10 decisions, open questions) — `PRIVACY.md`
- Steve security audit (8 added decisions, focused on entropy, rate-limit, XSS, signed URLs, race conditions, observability, session storage, append-only logs) — `qa-reports/2026-05-23_security-privacy-review.md`

### Loops 3–4: Design system

- Dani DESIGN.md v1 (mission, principles, color tokens with documented contrast, type scale, spacing, motion, primitives spec) — `DESIGN.md`
- `src/lib/theme.ts` + `tailwind.config.js` aligned to design tokens
- Alex independent WCAG verification of all 18 token pairs; **two FAILs found and fixed** (light/dark `borderStrong`) — `qa-reports/2026-05-23_a11y-tokens.md`

### Loops 5–6: Pure helpers

- `src/lib/verification.ts` — `routeForGate` (strict `=== true` check)
- `src/lib/contactHandle.ts` — `validateContactHandle` + classifier
- `src/lib/resourcesRealtime.ts` — `applyResourceDelta` + filters + sort
- 38 new tests (47 total)
- Steve audit: URL_PATTERN expanded to reject 7 scheme prefixes; sortByNewest hardened against NaN — `qa-reports/2026-05-23_security-helpers.md`

### Loops 7–8: Stub screens

- 5 UI primitives: Button, TextField, Card, StatusPill, FAB (all 44pt+, all a11y-labeled)
- 6 stub screens: SignIn, WaitingRoom, Home, ResourceDetail, Profile, AddResource (mock data only)
- Alex WCAG 2.2 AA audit: 2 issues fixed (Card minHeight, TextField placeholder color & multiline alignment) — `qa-reports/2026-05-23_a11y-screens.md`

### Loops 9–10: Navigation + briefing

- `src/types/navigation.ts` + `src/navigation/RootNavigator.tsx` — bottom tabs + Home stack
- `App.tsx` upgraded from splash to RootNavigator (mock data feeds visible on `npm start`)
- LEARNINGS.md +4 entries (pure-helper split, contrast methodology, primitives a11y baseline, navigator orphaning)
- CLAUDE.md + README.md status updates
- This briefing

---

## File ledger (Phase 0a additions)

```
~/MutualMesh/
├─ App.tsx                                              UPGRADED
├─ PRIVACY.md                                           Jordan v1 + Steve notes
├─ DESIGN.md                                            Dani v1 (Alex verified)
├─ CLAUDE.md + README.md + LEARNINGS.md                 Status updated
├─ src/lib/
│  ├─ theme.ts                                          Final tokens (post-Alex)
│  ├─ errors.ts                                         (from Day-0)
│  ├─ verification.ts                                   NEW
│  ├─ contactHandle.ts                                  NEW (post-Steve hardening)
│  └─ resourcesRealtime.ts                              NEW (post-Steve hardening)
├─ src/components/
│  ├─ Button.tsx                                        NEW
│  ├─ TextField.tsx                                     NEW (post-Alex)
│  ├─ Card.tsx                                          NEW (post-Alex)
│  ├─ StatusPill.tsx                                    NEW
│  └─ FAB.tsx                                           NEW
├─ src/screens/
│  ├─ SignInScreen.tsx                                  NEW
│  ├─ WaitingRoomScreen.tsx                             NEW
│  ├─ HomeScreen.tsx                                    NEW
│  ├─ ResourceDetailScreen.tsx                          NEW
│  ├─ ProfileScreen.tsx                                 NEW
│  └─ AddResourceScreen.tsx                             NEW
├─ src/navigation/RootNavigator.tsx                     NEW
├─ src/types/navigation.ts                              NEW
├─ src/__tests__/
│  ├─ errors.test.ts                                    (from Day-0; 9 tests)
│  ├─ verification.test.ts                              NEW (6 tests)
│  ├─ contactHandle.test.ts                             NEW (18 tests after Steve)
│  └─ resourcesRealtime.test.ts                         NEW (14 tests after Steve)
└─ qa-reports/
   ├─ README.md                                         (from groundwork)
   ├─ 2026-05-23_security-privacy-review.md             NEW (Steve)
   ├─ 2026-05-23_a11y-tokens.md                         NEW (Alex)
   ├─ 2026-05-23_security-helpers.md                    NEW (Steve)
   ├─ 2026-05-23_a11y-screens.md                        NEW (Alex)
   └─ 2026-05-23_cycle-0a-foundation.md                 THIS FILE
```

---

## Peter's early performance assessment (Loop 10)

Quick read of the Phase 0a code surface for anticipated 1×/10×/100× performance behavior. No measurements yet — that's Cycle 7's job — but here's what to expect:

- **`HomeScreen` FlatList**: `keyExtractor` set, `numberOfLines` bounded, no inline-style allocation per item. Should comfortably handle ~500 mock items. Real `useResources()` hook in Phase 0b should cap at `.limit(500)` per CLAUDE.md gotcha #6. Above ~500 visible items, cursor pagination becomes mandatory.
- **`applyResourceDelta` reference equality on no-op**: critical for FlatList re-render avoidance. Don't break this contract in Phase 0b.
- **NativeWind class compilation**: runs at metro bundle time. No runtime cost; bundle size impact minimal (~30KB added for the JS runtime).
- **Bundle size delta from this cycle**: +nativewind (~30KB), +@react-navigation/native-stack (~50KB), +react-native-worklets (~80KB). Total ~160KB added on top of the AccessMap baseline. Acceptable.
- **No memoization yet** on screens / components. Acceptable — Peter recommends adding `React.memo` to `ResourceCard` (if/when it's extracted from `HomeScreen`) when row count crosses ~100. Not needed for MVP.
- **`useColorScheme()` triggers component re-render on mode change** — expected; React Native event is rare (only fires when OS theme changes).

**Action items for Cycle 7 (perf pass):** measure cold start time, FlatList scroll FPS on a low-end Android device, bundle-analyzer report. Set budgets: cold start < 3s, list scroll ≥ 55fps.

---

## What's next (Phase 0b prerequisites)

| Item                                                                               | Owner                                | Blocking on           |
| ---------------------------------------------------------------------------------- | ------------------------------------ | --------------------- |
| Sky approves all 18 DECISIONS in `PRIVACY.md`                                      | Sky                                  | —                     |
| Dana writes `supabase/schema.sql` from approved PRIVACY.md                         | Dana                                 | Sky approval          |
| Sky applies schema in Supabase dashboard                                           | Sky                                  | Dana's file           |
| `src/lib/supabase.ts` + `src/types/database.ts`                                    | Shamus                               | Schema applied        |
| `src/lib/auth.tsx` AuthProvider                                                    | Shamus                               | Supabase client wired |
| `src/lib/resources.ts` (real Supabase calls, calling pure helpers from Loop 5)     | Shamus                               | Supabase client wired |
| `src/lib/photos.ts` (EXIF strip + upload)                                          | Shamus, Jordan reviews EXIF pipeline | Schema applied        |
| App.tsx upgraded from RootNavigator-only to Gate-wrapped                           | Shamus                               | AuthProvider exists   |
| RootNavigator wired with real `onSignIn`/`onSignUp`/`onSignOut`/`onClaim` handlers | Shamus                               | Above                 |

---

## Closing notes

**Constitution v1.3 compliance.** No external sends from this run. All artifacts in the repo. Schema is a FILE only; no live DB touched. No PRs opened, no commits pushed. Sky is the only path from here to production.

**Phase 0a moves Mutual Mesh from "spec + folders" to "working app shell + tested foundations" in a single session.** Phase 0b is the data-and-auth wave; everything Phase 0a built consumes the schema cleanly once approved.

— Morgan, 2026-05-23
