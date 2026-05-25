# Gary QA — AC-6.1 Handle Edit Tests + Coverage Threshold
**Date:** 2026-05-25  
**Branch:** `qa/auto-2026-05-25-gary-handle-edit-tests`  
**Shamus source:** `feat/mutualmesh-2026-05-25-shamus-profile-handle-edit` (commit `ea84cc3`)  
**Role:** Gary — QA Engineer

---

## Summary

Wrote unit tests for `updateMyProfile()` (introduced in AC-6.1 by Shamus), added a `test:coverage` script to `package.json`, and configured coverage thresholds in `jest.config.js`. All 384 tests pass; thresholds verified passing.

---

## TASK 1 — updateMyProfile() Tests

**File:** `src/__tests__/updateMyProfile.test.ts` (new, 13 tests)

Shamus's AC-6.1 commit introduced `updateMyProfile(updates)` in `src/lib/resources.ts`. The function:
1. Calls `supabase.auth.getUser()` to confirm the caller is signed in
2. Calls `supabase.from('users').update(updates).eq('id', user.id)` 
3. Returns `{ error: null }` on success, or a user-facing error string on failure

**Test cases written:**

| Describe block | Cases |
|---|---|
| `not signed in` | Returns "Not signed in." error; does not call `supabase.from()` |
| `success path` | Returns `{ error: null }`; calls `from("users")`; passes correct `update()` payload; calls `.eq('id', user.id)`; handles `postal_prefix`; handles both fields together |
| `error path` | Returns non-null string on DB error; does not expose PGRST codes; uses "Could not save your profile." fallback for PGRST-coded errors |
| `empty updates object` | Does not crash; still calls `.update({})` |

**Mock approach:**  
Mocked `@/lib/supabase` inside `jest.mock()` factory with inner mock functions exposed via `supabase.__mocks` to avoid jest hoisting limitations. Chain mocks (`mockFrom → mockUpdate → mockEq`) are reset in each `beforeEach` block.

**Test delta:** +13 tests (371 → 384 total)

---

## TASK 2 — Coverage Threshold + test:coverage script

### package.json

Added `"test:coverage": "jest --coverage"` to the scripts block.

### jest.config.js

Added `coverageThreshold` block. Design decisions:

**Why not `'./src/lib/**': { lines: 80 }`?**  
Jest's `coverageThreshold` globs are per-file, not directory aggregates. Many `src/lib/` files (`supabase.ts`, `auth.tsx`, `photos.ts`, `pushNotifications.ts`) are native/integration wrappers that cannot be unit-tested without the Expo runtime — their line coverage is intentionally 0%. A directory glob would fail CI on those files.

**Strategy chosen:** Conservative global floor + explicit per-file guards on the pure helpers that already have 100% coverage.

```js
coverageThreshold: {
  global: { lines: 40 },                        // realistic floor across all files
  './src/lib/errors.ts': { lines: 100 },
  './src/lib/handleValidator.ts': { lines: 100 },
  './src/lib/handleGenerator.ts': { lines: 90 },
  './src/lib/resourcesRealtime.ts': { lines: 100 },
  './src/lib/verification.ts': { lines: 100 },
  './src/lib/contactHandle.ts': { lines: 100 },
  './src/lib/categories.ts': { lines: 100 },
  './src/lib/policyText.ts': { lines: 100 },
  './src/lib/onboardingCopy.ts': { lines: 100 },
  './src/lib/typedConfirmation.ts': { lines: 100 },
}
```

**Current baseline (2026-05-25, 384 tests):**

| Scope | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| All files (imported) | 74.62% | 73.31% | 63.04% | 73.19% |
| src/lib/** (imported) | 87.34% | 86.72% | 76.00% | 86.61% |

The global threshold is set at 40% (conservative) because when `--coverage` collects from all files on disk, many untested native wrappers drag the number down to ~36%.

---

## TASK 3 — Pre-push Checks

```
npm run typecheck   ✅  (0 errors)
npm run lint        ✅  (0 errors)
npm run test:coverage ✅  (384 tests, 22 suites, thresholds passing)
npm run format:check  ✅  (new files formatted correctly; unrelated qa-reports/coverage warn pre-existed)
```

---

## Test Count Delta

| Before | After | Delta |
|---|---|---|
| 371 tests | 384 tests | +13 |

---

## Files Changed

| File | Change |
|---|---|
| `src/__tests__/updateMyProfile.test.ts` | NEW — 13 unit tests for `updateMyProfile()` |
| `jest.config.js` | ADD — `coverageThreshold` block |
| `package.json` | ADD — `"test:coverage"` script |

---

## DECISIONS FOR SKY

None — no new data collection, no schema changes, no privacy-sensitive changes. All changes are test infrastructure only.

**Optional future raise:** once `resources.ts` has more coverage (currently 44% lines — untested functions include `listResources`, `createResource`, `claimResource`, etc. because they need Supabase integration), the `global: { lines: 40 }` floor can be raised. Recommend incrementing by 5% per major test sprint.
