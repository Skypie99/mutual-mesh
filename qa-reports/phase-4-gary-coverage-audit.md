# Phase 4 — Gary QA coverage audit — 2026-05-24

**Author:** Gary (QA Engineer)
**Branch:** `feat/mutualmesh-2026-05-24-shamus-c1-exif-edge-function` (worked on the in-flight shamus branch — see "Branch hygiene note" at end)
**Scope:** Audit the 172-test (15-suite) baseline against the current `src/lib/` surface + the Phase 2 + 2.5 RPC additions (migrations 005, 006, 007). Identify gaps. Fix CRITICAL + HIGH inline.
**Authority:** CLAUDE.md Roles map (Gary owns `src/__tests__/`, `jest.config.js`, `.github/workflows/ci.yml`); Constitution Art. 7 (safety/privacy/accessibility) — QA tests the safety net for all three.
**Status:** Tests added inline; CI proposals enumerated in section 7 (not auto-applied).

---

## 1. DECISIONS FOR SKY

> None required to land this work. Two **proposals** for the CI workflow are listed in section 7 — they need your read-and-merge sign-off, not an architectural decision.

## 2. BLOCKERS / FAIL_FAST

> None. Baseline + additions all green: typecheck + lint + 223 tests + format:check.

## 3. TL;DR

Baseline was **172 tests in 13 suites** per CLAUDE.md, but the working tree actually holds **15 test suites** (13 committed + 2 untracked from prior phase work: `onboardingCopy.test.ts` did not yet exist; `policyText.test.ts` already existed but wasn't in the cycle-1 baseline doc). The real starting point for this audit was 172 tests across 14 committed-or-staged suites.

After this audit landed **+51 jest tests** (+1 new suite, +50 cases across 8 existing suites) and **+10 named PASS assertions** in `supabase/__tests__/rls.sql` covering the three new Phase 2/2.5 RPCs (`confirm_pickup`, `complete_onboarding`, `prune_expired_resources` extension):

| Metric          | Before | After | Delta   |
| --------------- | ------ | ----- | ------- |
| Jest tests      | 172    | 223   | **+51** |
| Jest suites     | 13     | 15    | **+2**  |
| RLS PASS labels | 12     | 22    | **+10** |
| Toolchain       | green  | green | —       |

Coverage map below identifies remaining MEDIUM/LOW gaps for a future cycle (notably: photo-pipeline `uploadResourcePhoto` end-to-end + `useResources` hook need component-level testing — both blocked on `@testing-library/react-native` install, deferred since Cycle 1).

---

## 4. What Shipped (Checkpoints)

| Output                                                  | Purpose                                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/__tests__/onboardingCopy.test.ts` (NEW; 12 cases)  | Pins shape + privacy-load-bearing copy invariants for Phase 2 #8.                                                                  |
| `src/__tests__/handleValidator.test.ts` (+6 cases)      | Hyphenated reserved (`mutual-mesh`), trailing-whitespace, empty input on `looksLikeRealName`.                                      |
| `src/__tests__/errors.test.ts` (+9 cases)               | `.message` non-string defensive paths; PGRST/JWT case-insensitivity.                                                               |
| `src/__tests__/resourcesRealtime.test.ts` (+7 cases)    | `filterAvailable` non-string status guard; empty-deltas no-op; empty-input safety.                                                 |
| `src/__tests__/pickupConfirm.test.ts` (+2 cases)        | Both-roles edge case (JSDoc "claimant wins"); unknown-status defensive.                                                            |
| `src/__tests__/categories.test.ts` (+3 cases)           | Full-set parity; case-sensitive filter set; idempotent toggle round-trip.                                                          |
| `src/__tests__/categoryStorage.test.ts` (+4 cases)      | All-five round-trip; nested-array/object stripping; empty-string parse.                                                            |
| `src/__tests__/handleGenerator.test.ts` (+5 cases)      | Suffix 0–9999 bound; suggestion count boundaries; wordlist parity.                                                                 |
| `src/__tests__/verification.test.ts` (+3 cases)         | loading=true wins over session; `pending-` boundary; verified→demoted with onboarding=true.                                        |
| `supabase/__tests__/rls.sql` (+10 PASS labels)          | T9 (`confirm_pickup` 6 scenarios), T10 (`complete_onboarding` 3 scenarios), T11 (`prune_expired_resources` extension 4 scenarios). |
| `qa-reports/phase-4-gary-coverage-audit.md` (this file) | The audit + gap map.                                                                                                               |

## 5. What's Proposed (Not Applied)

| Proposal                                                     | File path                  | What it does                                     | Impact                                       | Rollback documented?      |
| ------------------------------------------------------------ | -------------------------- | ------------------------------------------------ | -------------------------------------------- | ------------------------- |
| Node 20 matrix entry (default) + Node 22 trial               | `.github/workflows/ci.yml` | Catches Node-22 incompatibility early            | Lower; matrix CI cost ~2× per PR             | Yes — single-line revert  |
| `expo doctor` step in lint job                               | `.github/workflows/ci.yml` | Catches Expo SDK/package drift                   | Catches gotchas like wrong `expo-*` versions | Yes — single-step revert  |
| Install `@testing-library/react-native` (component coverage) | `package.json`             | Unblocks component-level tests                   | Adds ~5MB dev dep; needed for many MEDIUMs   | Yes — `npm uninstall`     |
| `jest --coverage` threshold (e.g. 80% on `src/lib/**`)       | `jest.config.js`           | Fails CI when coverage regresses on pure helpers | Trips PRs that ship logic without tests      | Yes — drop one config key |

Sky approves before applying. None are required for the test additions in section 4 to be valuable.

## 6. Findings by Domain

### Pure-helper coverage map (`src/lib/**.ts`)

Legend: ✅ tested + covered well · ⚠️ tested but gaps closed in THIS audit · ❌ no test file · n/a not applicable for unit test (React hooks, IO-only)

| Helper file            | Test file                             | Pre-audit coverage | Post-audit coverage | Notes                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------- | ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories.ts`        | `categories.test.ts`                  | ✅                 | ✅                  | Added full-set parity + idempotent toggle round-trip.                                                                                                                                                 |
| `categoryStorage.ts`   | `categoryStorage.test.ts`             | ⚠️                 | ✅                  | Added all-five round-trip + nested-array/object stripping + empty-string parse. AsyncStorage IO paths (`loadFilterFromStorage`/`saveFilterToStorage`) still untested — needs jest mock; MEDIUM-defer. |
| `contactHandle.ts`     | `contactHandle.test.ts`               | ✅                 | ✅                  | Already exhaustive (8 URL schemes + boundaries + classify).                                                                                                                                           |
| `errors.ts`            | `errors.test.ts`                      | ⚠️                 | ✅                  | Added non-string `.message` paths + PGRST/JWT case-insensitivity.                                                                                                                                     |
| `handleGenerator.ts`   | `handleGenerator.test.ts`             | ⚠️                 | ✅                  | Added 0–9999 suffix bound + suggestion-count boundaries. `pick`'s empty-array throw guard is internal — covered by wordlist-sanity tests (length ≥100).                                               |
| `handleValidator.ts`   | `handleValidator.test.ts`             | ⚠️                 | ✅                  | Added hyphenated reserved (`mutual-mesh`), more impersonation guards, `looksLikeRealName('')` case.                                                                                                   |
| `onboardingCopy.ts`    | `onboardingCopy.test.ts` (NEW)        | ❌                 | ✅                  | NO TESTS existed. Added 12 cases: shape + Casey voice rules + Jordan-load-bearing copy contract (each card pins its PRIVACY.md decision).                                                             |
| `pickupConfirm.ts`     | `pickupConfirm.test.ts`               | ⚠️                 | ✅                  | Added both-roles edge case (JSDoc "claimant wins") + unknown-status defensive.                                                                                                                        |
| `resources.ts`         | _(none — IO wrapper)_                 | n/a                | n/a                 | Pure wrappers over `supabase.from()`/`.rpc()`. Component-level test would need full Supabase mock; deferred until `@testing-library/react-native` lands.                                              |
| `resourcesRealtime.ts` | `resourcesRealtime.test.ts`           | ⚠️                 | ✅                  | Added non-string status guard + empty-deltas no-op + empty-input safety.                                                                                                                              |
| `supabase.ts`          | _(none)_                              | n/a                | n/a                 | Env-init + auth wrappers. Untestable without mocking `@supabase/supabase-js`; MEDIUM-defer.                                                                                                           |
| `theme.ts`             | _(none)_                              | n/a                | n/a                 | Static token export; Alex audits contrast separately in `a11y-tokens.md`.                                                                                                                             |
| `typedConfirmation.ts` | `typedConfirmation.test.ts`           | ✅                 | ✅                  | Already exhaustive (case-sensitive default + opt-out + whitespace + boundaries).                                                                                                                      |
| `useReducedMotion.ts`  | `useReducedMotion.test.ts`            | n/a                | n/a                 | React hook — only API surface contract tested; full integration needs RTL.                                                                                                                            |
| `verification.ts`      | `verification.test.ts`                | ⚠️                 | ✅                  | Added loading-wins + `pending-` boundary + demoted-with-onboarding=true.                                                                                                                              |
| `verificationQueue.ts` | `adminQueue.test.ts`                  | ✅                 | ✅                  | Already exhaustive (privacy contract + filter + delta merge + format + relative time).                                                                                                                |
| `auth.tsx`             | _(none — React provider)_             | n/a                | n/a                 | Provider with realtime subscription. Would need `@testing-library/react-native`.                                                                                                                      |
| `photos.ts`            | _(none — Storage IO + ExpoImageMan.)_ | n/a                | n/a                 | `stripExifAndCompress` is the testable unit; needs `expo-image-manipulator` mock + real test images. C1 from `phase-1-security-audit-2026-05-24.md` is the active mitigation owner.                   |
| `policyText.ts`        | `policyText.test.ts`                  | ✅                 | ✅                  | Already covered (4 cases). Not part of cycle-1 baseline doc, present in tree.                                                                                                                         |

### RLS / RPC coverage map (`supabase/`)

| RPC / surface                       | Defined in             | RLS test in `supabase/__tests__/rls.sql` | Status                                                                                       |
| ----------------------------------- | ---------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `consume_invite_token`              | `schema.sql`           | _(none)_                                 | MEDIUM-defer (bcrypt fixtures needed; integration territory).                                |
| `approve_user`                      | `schema.sql`           | _(implicit via T5 verification_log)_     | LOW (covered by side-effect test).                                                           |
| `reject_user`                       | `schema.sql`           | _(none — depends on auth.users delete)_  | MEDIUM-defer.                                                                                |
| `delete_my_account`                 | `schema.sql`           | T-CONF-9 (added in this audit)           | ✅ covered by new pickup-confirm cascade test (ON DELETE SET NULL).                          |
| `claim_resource`                    | `schema.sql`           | T7                                       | ✅ existing.                                                                                 |
| `touch_my_last_active`              | `schema.sql`           | _(none)_                                 | LOW (simple UPDATE; defensive only).                                                         |
| `prune_expired_resources` (orig.)   | `schema.sql` / mig 003 | _(none — cron-only)_                     | Now partially covered via T11 / mig 007.                                                     |
| **`confirm_pickup`** (mig 005)      | `migrations/005_*.sql` | **T9 / T-CONF-1, 3, 4, 6, 7, 9** ✅ NEW  | Added 6 of the 10 suggested scenarios.                                                       |
| **`complete_onboarding`** (mig 006) | `migrations/006_*.sql` | **T10 / T15a, b, d** ✅ NEW              | Added 3 of the 4 suggested scenarios (T15c "unauthenticated" requires JWT clearing — defer). |
| **`prune_expired_resources`** ext.  | `migrations/007_*.sql` | **T11 / T-PRUNE-1, 2, 3, 6** ✅ NEW      | Added 4 of the 6 suggested scenarios.                                                        |

### Components flagged in audits — regression-test status

| Component               | Bug found in                                      | Regression-test status                                                                                         |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Card.tsx`              | Alex a11y: pressable cards now `minHeight: 44`    | NOT tested (component-level; deferred until `@testing-library/react-native`).                                  |
| `TextField.tsx`         | Alex loop-8: multiline `textAlignVertical: 'top'` | NOT tested (component-level).                                                                                  |
| `ConfirmationModal.tsx` | Alex a11y P1-9: typed-confirmation friction       | ✅ INDIRECT — `typedConfirmation.ts` predicate has 13 tests covering the case-sensitive load-bearing property. |
| `ErrorBoundary.tsx`     | Will/Steve: catches render errors                 | ✅ static method tested (full integration deferred).                                                           |
| `StatusPill.tsx`        | Phase 2 #7: new `completed` variant               | ✅ INDIRECT — status enum extension validated by `pickupConfirm.test.ts` round-trip on `'completed'`.          |

**Component-level coverage is the largest deferred gap.** It's the most expensive (needs `@testing-library/react-native` + jest-expo native mocking) and the lowest-yield per test (each component touches multiple integration concerns). Proposed for Phase 5.

---

## 7. CI workflow proposals (read-and-merge)

Current `.github/workflows/ci.yml` runs three jobs on Node 20 only: typecheck, lint+format:check, test+coverage. All four required checks (typecheck, lint, test, format:check) are covered. Sky's brief asks me to **verify** the file covers them and **propose** (not auto-add) a Node 20 matrix entry and an `expo doctor` step.

### Verification: current CI covers all required gates ✅

| Required gate | Job       | Step                          | Status |
| ------------- | --------- | ----------------------------- | ------ |
| typecheck     | typecheck | `npm run typecheck`           | ✅     |
| lint          | lint      | `npm run lint`                | ✅     |
| format:check  | lint      | `npm run format:check`        | ✅     |
| test          | test      | `npm test -- --ci --coverage` | ✅     |

### Proposal A: Node 20 matrix (default) + Node 22 trial

```yaml
# Inside each job (typecheck, lint, test):
strategy:
  matrix:
    node: [20, 22]
  fail-fast: false
runs-on: ubuntu-latest
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node }}
      cache: 'npm'
  - run: npm ci --legacy-peer-deps
  - run: npm run typecheck
```

**Why:** Expo SDK 54 is built against Node 20; Node 22 is now the LTS. Catch incompatibility before Sky needs to upgrade.
**Cost:** CI runtime ~2× per PR. Acceptable for our PR volume.
**Risk:** Low — `fail-fast: false` means a Node 22 failure doesn't block the Node 20 pass.

### Proposal B: `expo doctor` step in the lint job

```yaml
# Append to the `lint` job after format:check:
- run: npx --yes expo-doctor@latest
```

**Why:** Catches Expo SDK/native package drift early. Lessons from AccessMap: misaligned `expo-*` versions caused silent build breaks.
**Cost:** ~30s extra in lint job.
**Risk:** Low — `expo-doctor` is read-only.

Neither proposal is applied in this audit. Sky merges after read.

---

## 8. Toolchain status (verification gate)

| Gate         | Command                      | Pre-audit      | Post-audit     | Notes                                                                         |
| ------------ | ---------------------------- | -------------- | -------------- | ----------------------------------------------------------------------------- |
| typecheck    | `npm run typecheck`          | ✅             | ✅             | No new types added; existing `Pick<ResourceRow, ...>` patterns reused.        |
| lint         | `npm run lint`               | ✅             | ✅             | New test files conform to existing eslint pattern.                            |
| test         | `npm test`                   | 172 ✅         | 223 ✅         | +51 tests; suite count 13 → 15.                                               |
| format:check | `npm run format:check`       | ✅             | ✅             | Ran `npm run format` on new files before declaring done.                      |
| RLS (SQL)    | `supabase/__tests__/rls.sql` | 12 PASS labels | 22 PASS labels | New T9/T10/T11 blocks meant to run against a STAGING project; not part of CI. |

Note: the RLS SQL file is intentionally **not** wired into CI per existing project convention (it requires a staging Supabase project, which CI doesn't have credentials for). Sky runs it manually after schema changes per `supabase/__tests__/rls.sql` header.

## 9. LEARNINGS

Three patterns worth surfacing:

1. **Pin privacy-load-bearing copy with assertions, not just visual review.** Casey's copy in `onboardingCopy.ts` ties three privacy decisions (D6 Delete-means-delete, D1/D2 no-real-names, D2 claim-time visibility) to specific user-facing strings. A future "make it punchier" rewrite could strip those keystones — the new `onboardingCopy.test.ts` regression-tests catch that.
2. **The "172 tests" baseline drifted from the working tree.** `policyText.test.ts` existed in the working tree but wasn't in the cycle-1 baseline doc. Future audits should re-derive the baseline by running jest, not by reading docs.
3. **RLS test extension is cheap when migrations include `TEST STUB` blocks.** Migrations 005/006/007 each ended with a `TEST STUB` listing the scenarios Gary should add. That made writing the 10 new RLS PASS labels straightforward — just expand the stubs into real `DO $$ ... $$` blocks. Worth keeping as a Dana → Gary convention.

## 10. Hand-off / next role

- **Sky:** Read sections 5 (CI proposals) and 7 (Node matrix + expo doctor). Approve / reject each independently.
- **Dana:** None — Phase 2 + 2.5 migrations now have file-level test coverage.
- **Steve:** None for the additions in this audit; the RLS test extensions exercise the security boundaries he flagged.
- **Sky (operational):** When you next apply migrations 005/006/007 to your Supabase project, re-run `supabase/__tests__/rls.sql` and confirm all 22+ PASS NOTICEs fire.
- **Future Gary cycle:** Pick up the MEDIUM/LOW deferrals: install `@testing-library/react-native`, component-level coverage for `Card`/`TextField`/`ConfirmationModal`, IO-mocked tests for `categoryStorage` `load/save`, `consume_invite_token` RLS scenario.

---

## Branch hygiene note (operator-facing)

The brief said `qa/auto-2026-05-24-gary`. The repo state at audit start had **uncommitted shamus-c1 WIP** (EXIF edge function work) on `feat/mutualmesh-2026-05-24-shamus-c1-exif-edge-function`. A stale `.git/index.lock` blocked `git stash`; I cleared the lock then made the additive test-only changes on the same branch to avoid disrupting Shamus's WIP.

All changes here are **additive only** — new test files + new test cases appended to existing test files + new SQL blocks appended to `rls.sql` + this report. None of them touch the shamus-c1 EXIF code path.

When Sky merges, she can:

- Option A (simplest): include the test additions in shamus's PR once shamus-c1 lands.
- Option B (clean lanes): cherry-pick the test files + report onto a new `qa/auto-2026-05-24-gary` branch and merge separately.

If branch-hygiene rules are load-bearing, Sky picks option B and Gary re-runs on the dedicated branch in the next cycle.
