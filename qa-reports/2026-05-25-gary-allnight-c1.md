# Gary — QA Cycle Report — All-Night Cycle 1
**Date:** 2026-05-25
**Branch:** `qa/auto-2026-05-25-gary-allnight-c1`
**Role:** Gary (QA Engineer)
**Constitution constraints:** Art. 1 (no main), Art. 9 (no external sends)

---

## Summary

Three tasks executed sequentially on one branch. All three committed and pushed. Pre-push suite: typecheck PASS, lint 0 errors (1 pre-existing warning in `resources.ts`), 371 tests pass, format:check clean.

---

## Task 1 — Jordan Web-Gate File Committed

**Status: DONE**

- File: `qa-reports/2026-05-25-jordan-web-gate.md`
- Was untracked (written by Jordan but never committed)
- Committed on this branch with exact message specified
- Commit SHA: `06f8192`

---

## Task 2 — expo-location CI Grep Check Added

**Status: DONE — CI step added: YES**

- File modified: `.github/workflows/ci.yml`
- Step added to the `lint` job after `npm run format:check`
- Step title: `"Check expo-location not imported in non-native files (Jordan C4)"`
- Grep command checks for `from 'expo-location'` ES module syntax in `src/**/*.ts|tsx` files, excluding `.native.*` files

**Verification of false-positive safety:**
`ResourceMapScreen.tsx` uses `require('expo-location')` (dynamic require inside try/catch), NOT the `from 'expo-location'` ES module form. The grep specifically targets the `from` form — confirmed no false positive:

```
OK — no ES module import of expo-location in non-native files
```

The CI check is safe and will correctly fail only if a future Shamus commit adds a bare ES module import of `expo-location` in a non-native file.

Commit SHA: `10568a1`

---

## Task 3 — @testing-library/react-native Installed + ProfileScreen Tests Written

**Status: DONE**

**Installation:**
- `npm install --save-dev @testing-library/react-native --legacy-peer-deps`
- Installed version: `^13.3.3`
- No `jest.setup.ts` created — tests pass without custom matchers (testing-library's `findByText`, `findByLabelText` work with jest-expo preset out of the box)
- No `setupFilesAfterFramework` change needed

**Test file:** `src/__tests__/ProfileScreen.test.tsx`

Mock strategy:
- `jest.mock('@/lib/auth')` → `useAuth` returns fake profile + user + signOut
- `jest.mock('@/lib/resources')` → `listMyPosts`, `listMyClaims`, `deleteMyAccount` resolve empty
- `jest.mock('@/lib/errorReporting')` → `getErrorReportingOptIn` resolves false
- `react-native-safe-area-context` → `SafeAreaView` stubbed with `jest.requireActual('react-native').View`

**Tests (6 total):**
1. Renders the user handle from mock profile — PASS
2. Renders the postal prefix (neighborhood) from mock profile — PASS
3. Shows "Sign out" button — PASS
4. Shows "Delete my account" button — PASS
5. Renders em-dash fallback when handle is null — PASS
6. Renders em-dash fallback when postal_prefix is null — PASS

**Test count delta:**
- Before: 365 tests in 20 suites
- After: 371 tests in 21 suites
- Delta: +6 tests, +1 suite

Commit SHA: `0855b1e`

---

## Pre-Push Suite Results

| Check | Result |
|---|---|
| `npm run typecheck` | PASS — 0 errors |
| `npm run lint` | PASS — 0 errors (1 pre-existing warning in `resources.ts`) |
| `npm test -- --ci` | PASS — 371/371 |
| `npm run format:check` | PASS — all files clean |

---

## Issues Found

1. **Pre-existing lint warning:** `src/lib/resources.ts` line 22 — `'ResourceRow' is defined but never used`. Not introduced by this cycle. Flagged for Shamus or a follow-up Gary cycle.

2. **Worktree collision:** The main repo working tree (`/Users/skypie/MutualMesh`) was checked out to `product/auto-2026-05-25-quinn-features-update` (another agent's branch) during this cycle. File edits went to the shared working tree and had to be copied to a dedicated Gary worktree (`gary-allnight-c1`) before committing on the correct branch. Resolved safely — no cross-branch leakage.

---

## Commits on Branch

| SHA | Message |
|---|---|
| `06f8192` | chore(qa-reports): commit Jordan web-gate privacy review — APPROVE WITH CONDITIONS |
| `10568a1` | ci(lint): add expo-location non-native import guard (Jordan C4) |
| `0855b1e` | test(qa): install @testing-library/react-native + ProfileScreen component tests |

Branch pushed to: `origin/qa/auto-2026-05-25-gary-allnight-c1`

---

## DECISIONS FOR SKY

None. All tasks completed without ambiguity or blockers.

---

*Gary — QA Engineer, Claude Corp. File-only output. No external side effect. Const. Art. 9.*
