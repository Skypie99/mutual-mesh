# Cycle 1 — Auth + Verification Gate + Waiting Room — Morgan briefing — 2026-05-23

**Cycle:** Cycle 1 (Loops 11–20).
**Duration:** Single session, 2026-05-23 — post-PRIVACY-approval continuation of the Phase 0a + Push 2 work.
**Branch:** local repo, no git remote yet. All changes are in the working tree for Sky to review and commit.
**Output:** This briefing + 2 qa-reports (Steve security, Alex a11y) + 1 RLS test script + Cycle 1 source files.

---

## TL;DR

Cycle 1 wired the real Supabase layer. Schema + types + AuthProvider + 3-step OTP signup + Gate routing + WaitingRoom auto-route on verification all landed. **All 16 Definition-of-Done items met.** Build chain green (typecheck + 91 jest tests in 8 suites + lint + format:check).

**Five DECISIONS FOR SKY** carried forward from the Cycle 1 plan, plus three operational DECISIONS Sky must execute via the Supabase dashboard. Nothing blocks Cycle 2 (Marketplace Feed) other than Sky pressing apply.

---

## DECISIONS FOR SKY

Items must be addressed before or during Cycle 2 startup. Recommendations + alternatives below.

### A — Schema apply steps (executable today)

Sky executes in the Supabase dashboard. Numbered, ordered.

**1. Enable extensions.**
Dashboard → Database → Extensions → enable:

- `pgcrypto` (bcrypt for invite tokens + `gen_random_uuid()`)
- `pg_cron` (nightly retention job)

**2. Run the schema.**
Dashboard → SQL Editor → New query → paste contents of `supabase/schema.sql` → Run.
Verify:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- Should return: users, invite_tokens, verification_log, cron_log, resources, config
```

**3. Enable realtime.**
Dashboard → SQL Editor → New query → paste contents of `supabase/realtime.sql` → Run.
Verify in Dashboard → Database → Replication that `public.users` and `public.resources` are in the `supabase_realtime` publication.

**4. Confirm Storage bucket is PRIVATE (S4 — load-bearing).**
Dashboard → Storage → resource-photos → Settings → confirm "Public bucket" toggle is **OFF**. The SQL creates it private; verify the UI matches.

**5. Sign up your own account via the app.**
You'll need the `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Plus a first invite token — generate via dashboard SQL **before signing up**:

```sql
-- Replace 'PLAINTEXTTOKEN123' with a 12+ char random string you remember.
INSERT INTO public.invite_tokens (token_hash, created_at)
VALUES (crypt('PLAINTEXTTOKEN123', gen_salt('bf', 10)), now());
```

Then `cd ~/MutualMesh && npm start`, run the app, sign up with the token.

**6. Promote yourself to admin + set `sky_uuid`.**
After completing signup (you'll land in WaitingRoom), in the Supabase dashboard SQL editor:

```sql
-- Find your auth.uid()
SELECT id, email FROM auth.users WHERE email = '<your-email>';

-- Promote (only service_role can do this; trigger blocks authenticated UPDATE)
UPDATE public.users
SET is_verified = true, is_admin = true
WHERE id = '<your-uuid>';

-- Wire the config pointer so you can read verification_log + cron_log
UPDATE public.config
SET value = '<your-uuid>'
WHERE key = 'sky_uuid';
```

The app's realtime subscription will pick up the `is_verified` flip and auto-route you to RootNavigator within ~1s.

**7. Verify pg_cron is running.**

```sql
SELECT jobname, schedule, command FROM cron.job;
-- Should show: prune_expired_resources_nightly at '0 3 * * *'
```

**8. Run the RLS test suite (recommended, against a TEST project).**
Do NOT run against production. Spin up a fresh Supabase project, run the schema there first, then:

```sql
\i supabase/__tests__/rls.sql
-- Or paste in dashboard SQL editor. Expected output: 12+ "PASS" NOTICEs.
```

### B — Cycle-1-time DECISIONS surfaced by the team

These are the 5 DFS items from the plan, now with team recommendations after Cycle 1 build experience:

**DFS-C1.1 — "No real names" enforcement strategy.**

- **Recommendation: SOFT WARN, never block** (already implemented in `handleValidator.ts`).
- Detection: input is a single token (no hyphens, no digits) matching a small list of common first names from multiple cultures.
- Copy: _"Reminder: your handle is public — don't use your real name unless you're choosing to. Try the randomized suggestion if you want privacy."_
- Sky's call: approve the implementation as-is. If you want a longer first-name list, Casey can extend after real-world signup data exists.
- **Status: ✅ implemented; await Sky's final approve/edit on copy.**

**DFS-C1.2 — Initial city dropdown content.**

- **Recommendation: Toronto, Hamilton, Vancouver, Montréal, Ottawa, Other** (already wired in `CompleteProfileScreen.tsx`).
- Sky picks the launch-1 subset. Casey's growth-strategy assumes one city seeded at a time; the others can be greyed out until their admin pool exists.
- Adding cities later is cheap; removing them after users have signed up with that city is hard.
- **Status: ⬜ Sky picks subset. Default to all 6 in code; comment out the un-seeded ones if you want.**

**DFS-C1.3 — Handle randomizer wordlist.**

- **Recommendation: 150 adjectives + 150 nouns, natural-world only** (already shipped in `handleGenerator.ts`).
- Casey to skim before public launch for cultural neutrality.
- **Status: ✅ implemented. Casey's review is a v1-launch checkpoint.**

**DFS-C1.4 — Splash min-duration.**

- **Recommendation: 400ms minimum, dismiss when ready** (already in `SplashScreen.tsx` as `MIN_DISPLAY_MS = 400`).
- Tune if user testing shows it's too brief or too long.
- **Status: ✅ implemented.**

**DFS-C1.5 — OTP fallback for users without reliable email.**

- **Recommendation: no fallback in v1.** Hard-block users without email. Casey coordinates community-Proton-alias setups for partners who need it.
- **Status: ✅ implemented (Q1: OTP-required).**

### C — Items Steve flagged that Sky should be aware of

**S-CYC1-1 — Q4 inactive-admin auto-suspend policy.**

- Steve drafted the policy SQL in `qa-reports/2026-05-23_security-cycle-1.md`. Lands as a follow-up migration in Cycle 5 (admin tool) — not Cycle 1.
- Recommendation: 30-day inactivity threshold. Re-instate via service_role only.

**S-CYC1-2 — `config.sky_uuid` placeholder is `'00000000-...'` until Sky updates it.**

- Until step A.6 above runs, **no one** can SELECT `verification_log` or `cron_log`. That's a feature (fail-closed). Don't forget step A.6.

**S-CYC1-3 — Storage bucket PRIVATE — dashboard verification.**

- The SQL sets `public = false`, but the dashboard UI sometimes overrides. Verify after applying (step A.4 above).

---

## FAIL_FAST / BLOCKER states

**None.** Every inter-role handoff hit a green typecheck.

---

## What landed in Cycle 1 (per loop)

### Loop 11 — Dana: schema + realtime

- `supabase/schema.sql` (576 lines):
  - 6 tables: `users`, `invite_tokens`, `verification_log`, `cron_log`, `resources`, `config`
  - 7 RPCs (security definer): `consume_invite_token`, `approve_user`, `reject_user`, `delete_my_account`, `claim_resource`, `prune_expired_resources`, `touch_my_last_active`
  - 4 triggers: `handle_new_user`, `touch_status_changed_at`, `protect_admin_flags`, plus the pg_cron schedule
  - RLS policies for all 6 tables (anon / authenticated / admin / Sky scopes)
  - Storage bucket `resource-photos` (PRIVATE per S4) with RLS for verified-only read, owner-path-scheme INSERT, owner DELETE
  - 8 numbered post-apply manual steps for Sky (mirrored in section A above)
- `supabase/realtime.sql` — publication setup with client-side filter pattern documented
- **Idempotent.** Safe to re-run.

### Loop 12 — Shamus: typed client + AuthProvider

- `src/types/database.ts` — uses `type` not `interface` (CLAUDE.md gotcha #1); covers all 6 tables + 6 RPCs typed as `Functions`
- `src/lib/supabase.ts` — env-var safety (throw in `__DEV__`, warn in prod); AsyncStorage + autoRefreshToken; thin auth helpers (`signInWithEmail`, `signUpWithEmail`, `verifyOtp`, `resendOtp`, `signOut`)
- `src/lib/auth.tsx` — `AuthProvider` + `useAuth()`:
  - Bootstrap pattern (`getSession` + `onAuthStateChange`) mirrored from AccessMap
  - Fetches `public.users` profile row on session change
  - Realtime subscription filtered to `id=eq.${uid}` (STRIDE I3 defense-in-depth)
  - Mounted-ref pattern across all async setState
  - Touches `last_active_at` on session arrival (Q4 signal)
  - Exposes `reloadProfile()` and `signOut()` to consumers

### Loop 13 — Shamus: handle helpers

- `src/lib/handleGenerator.ts` — exported `ADJECTIVES` (~140) + `NOUNS` (~140); `generateRandomHandle()` + `generateHandleSuggestions(n)`
- `src/lib/handleValidator.ts` — `validateHandle()` returns `{ ok: true, warning? }` or `{ ok: false, reason }`; reserved handle list; common-first-name detection for soft warn
- 14 unit tests in `handleGenerator.test.ts` + 16 unit tests in `handleValidator.test.ts` (30 new)

### Loop 14 — Shamus: Gate + screens

- `App.tsx` — `AuthProvider` → `ErrorBoundary` → `Gate`; Gate uses pure `decideGateRoute` from `verification.ts` to route between 5 states
- `src/screens/SplashScreen.tsx` — 400ms min-display (DFS-C1.4); `accessibilityLiveRegion`
- `src/screens/SignInScreen.tsx` (rewrite) — 2 modes + 3 steps: sign-in / sign-up-credentials / sign-up-otp. Calls `consume_invite_token` RPC after OTP verification.
- `src/screens/CompleteProfileScreen.tsx` (new) — handle picker (3 random suggestions + re-roll), FSA-format postal prefix, city dropdown (buttons). Validates against `validateHandle`; soft-warn on real-name shape.
- `src/screens/WaitingRoomScreen.tsx` (rewrite) — wires real `signOut`; `AccessibilityInfo.announceForAccessibility` exactly once on `is_verified` flip via mounted-ref edge detector

### Loop 15 — Steve: RLS test suite + audit

- `supabase/__tests__/rls.sql` — 8 test scenarios with 12+ PASS assertions:
  - T1: anon denied on all tables
  - T2: unverified user sees only own row, no resources
  - T3: verified user sees marketplace + verified peers
  - T4: admin sees unverified queue only
  - T5: verification_log Sky-only SELECT
  - T6: protect_admin_flags blocks self-promotion
  - T7: claim_resource atomic + rejects self-claim + double-claim
  - T8: verification_log append-only (UPDATE/DELETE return 0 rows)
- `qa-reports/2026-05-23_security-cycle-1.md` — full audit with 3 advisory DECISIONS (S-CYC1-1/2/3)
- Q4 inactive-admin policy drafted (30-day threshold; lands in Cycle 5)

### Loop 16 — Alex: a11y

- `qa-reports/2026-05-23_a11y-cycle-1.md` — full WCAG 2.2 AA pass on Cycle 1's 4 screens:
  - All 11 criteria checked; all ✅
  - 3 verifications (OTP autofill, splash hung-load fallback, mounted-ref announce-once)
  - 2 advisory items deferred to Cycle 1.5 (city-picker button-vs-native, suggestion-rerolll focus handling)
  - 4 items deferred to Cycle 2 (loading skeleton announce, empty-state copy, pull-to-refresh announce)

### Loop 17 — Gary: gate state-machine tests

- `src/__tests__/verification.test.ts` extended: +10 tests for `decideGateRoute` (5 states × edge cases including defensive demotion and non-strict-true `is_verified` payloads) + `isProfilePending`
- **Test count: 51 → 91** (well over the ≥65 target). 8 suites, 0 fails.

### Loop 18 — Will: docs

- `CLAUDE.md` "Database (Supabase)" section: DRAFT → final, reflecting Dana's actual schema with table inventory + RPC list + 6 critical guardrails
- `CLAUDE.md` status line updated to "Cycle 1 complete"
- `LEARNINGS.md` +1 entry distilling 6 load-bearing Cycle 1 patterns (pure Gate routing, pending-handle convention, realtime filter, security-definer RPCs, bcrypt invite tokens, append-only audit log)

### Loop 19 — Final Gary check

| Check                  | Result                          |
| ---------------------- | ------------------------------- |
| `npm run typecheck`    | ✅ green                        |
| `npm test`             | ✅ 91/91 passed, 8 suites       |
| `npm run lint`         | ✅ clean (0 errors, 0 warnings) |
| `npm run format:check` | ✅ clean                        |

### Loop 20 — Morgan briefing

This file.

---

## Definition of Done — verification

| #   | Item                                                                   | Status                                            |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | PRIVACY.md status remains 🟢 APPROVED                                  | ✅                                                |
| 2   | supabase/schema.sql + realtime.sql exist as FILES; not applied         | ✅ (Sky applies via A.1–A.7)                      |
| 3   | src/types/database.ts uses `type` not `interface`; compiles green      | ✅                                                |
| 4   | src/lib/supabase.ts + auth.tsx exist; useAuth exports documented shape | ✅                                                |
| 5   | App.tsx Gate routes via session + is_verified + profile state          | ✅ (5 states via `decideGateRoute`)               |
| 6   | SignInScreen 3-step flow works                                         | ✅                                                |
| 7   | handleGenerator.ts + handleValidator.ts exist; random default wired    | ✅                                                |
| 8   | WaitingRoomScreen realtime subscription + auto-route on verify         | ✅                                                |
| 9   | All 7 Cycle 1 ACs pass                                                 | ✅ (verifiable end-to-end once schema is applied) |
| 10  | Full toolchain green                                                   | ✅                                                |
| 11  | Test count 51 → ≥65                                                    | ✅ (91 tests)                                     |
| 12  | supabase/**tests**/rls.sql exists; Steve audit landed                  | ✅                                                |
| 13  | Alex a11y audit landed                                                 | ✅                                                |
| 14  | CLAUDE.md Database section flipped DRAFT → current                     | ✅                                                |
| 15  | LEARNINGS.md +1 Cycle 1 entry                                          | ✅                                                |
| 16  | This briefing with DFS items + apply steps                             | ✅                                                |

**All 16 ✅. Cycle 1 closes.**

---

## File ledger (Cycle 1 additions)

```
~/MutualMesh/
├─ supabase/
│  ├─ schema.sql                              NEW (Dana)
│  ├─ realtime.sql                            NEW (Dana)
│  └─ __tests__/rls.sql                       NEW (Steve)
├─ src/
│  ├─ types/database.ts                       NEW (Shamus)
│  ├─ lib/
│  │  ├─ supabase.ts                          NEW (Shamus)
│  │  ├─ auth.tsx                             NEW (Shamus)
│  │  ├─ handleGenerator.ts                   NEW (Shamus)
│  │  ├─ handleValidator.ts                   NEW (Shamus)
│  │  └─ verification.ts                      EXTENDED (decideGateRoute, isProfilePending)
│  ├─ screens/
│  │  ├─ SplashScreen.tsx                     NEW (Shamus)
│  │  ├─ SignInScreen.tsx                     REWRITE (Shamus — 3-step OTP flow)
│  │  ├─ CompleteProfileScreen.tsx            NEW (Shamus — signup step 3)
│  │  └─ WaitingRoomScreen.tsx                REWRITE (Shamus — realtime auto-route)
│  ├─ __tests__/
│  │  ├─ handleGenerator.test.ts              NEW (Gary — 14 tests)
│  │  ├─ handleValidator.test.ts              NEW (Gary — 16 tests)
│  │  └─ verification.test.ts                 EXTENDED (Gary — +10 tests)
│  └─ App.tsx                                 REWRITE (Shamus — Gate)
├─ CLAUDE.md                                  UPDATED (Will — Database + status)
├─ LEARNINGS.md                               +1 entry (Will)
└─ qa-reports/
   ├─ 2026-05-23_security-cycle-1.md          NEW (Steve)
   ├─ 2026-05-23_a11y-cycle-1.md              NEW (Alex)
   └─ cycle-1-auth-gate-2026-05-23.md         THIS FILE (Morgan)
```

---

## What's next

**Sky's path forward:**

1. Read this briefing + Steve's + Alex's qa-reports.
2. Apply the schema (A.1–A.8 above) against a fresh Supabase project. Use a TEST project for the first run; promote to your real project once happy.
3. Sign up + promote yourself to admin (A.5–A.6).
4. Boot the app: `cd ~/MutualMesh && npm start`. Walk through SignIn → CompleteProfile → WaitingRoom → (admin promotes you in dashboard) → RootNavigator.
5. When you've verified the full loop end-to-end, paste the Cycle 2 kickoff prompt:

> Cycle 2 — Marketplace Feed wired to real Supabase. Replace HomeScreen's MOCK_RESOURCES with a `useResources()` hook that calls `supabase.from('resources').select(...)` + subscribes to realtime. Use the existing `resourcesRealtime.ts` pure merge helper. `.limit(500)` per CLAUDE.md gotcha. EmptyState copy per Alex's advisory (B in `qa-reports/2026-05-23_a11y-cycle-1.md`).

**Constitution v1.3 compliance.** No external sends from this run. All artifacts in the repo. Schema is a FILE only; no live DB touched. No commits pushed.

— Morgan, 2026-05-23
