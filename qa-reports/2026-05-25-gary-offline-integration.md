# Gary QA Report — HomeScreen Offline Recovery: Integration Tests

**Date:** 2026-05-25  
**Branch:** `qa/auto-2026-05-25-gary-offline-integration`  
**Companion branch:** `qa/auto-2026-05-25-gary-offline-tests` (23 unit tests)  
**Test file:** `src/__tests__/homeScreenOfflineRecovery.test.ts`  
**Result:** 25/25 PASS

---

## What was built

Integration-level contract tests for the HomeScreen offline recovery UX introduced on `feat/auto-2026-05-25-shamus-offline-recovery`. These tests verify the full error-state pipeline logic — state selection, copy safety, FlashBanner content — without rendering any React components.

### Test suites (25 tests total)

| Suite | Tests | Focus |
|---|---|---|
| isNetworkError() integration contract | 5 | Spec-specified patterns: fetch failed, Network request failed, TypeError: network, PGRST200→false, ""→false |
| Error-state selection | 8 | (error, resources) → state enum: network-error, server-error, stale-data, normal, empty |
| FlashBanner stale-data message | 4 | Actual copy from HomeScreen.tsx: "Showing saved resources — couldn't refresh" |
| PII / security contract | 6 | Static copy only — no raw error text, no PGRST codes, no JWT/schema leakage |
| State-transition coherence | 3 | Error clearing → transitions to normal or empty correctly |

---

## Findings

### 1. SHAMUS REFACTOR OPPORTUNITY — isNetworkError not yet exported

**Severity:** Low (clean-up / maintainability)  
**File:** `src/screens/HomeScreen.tsx` on `feat/auto-2026-05-25-shamus-offline-recovery`

`isNetworkError` is currently a private function inside `HomeScreen.tsx`. Gary's `offline-tests` branch already extracted it to `src/lib/networkError.ts` with exports and JSDoc. Until that extraction merges, any new test file must mirror the logic rather than import it.

**Recommendation for Shamus:** When merging `offline-tests` and `offline-recovery`, extract `isNetworkError` to `src/lib/networkError.ts` and remove the inline copy from `HomeScreen.tsx`. The `offline-tests` branch has the correct implementation and full unit coverage already.

### 2. COPY DISCREPANCY — offline-tests branch has stale copy constants

**Severity:** Low (tests pass, but constants are wrong)  
**File:** `src/__tests__/homeScreenOffline.test.ts` on `qa/auto-2026-05-25-gary-offline-tests`

The `COPY.network.description` constant in the unit-test file reads:  
`"We're showing your last known listings. Connect to the internet and pull down to refresh."`

The **actual** copy in HomeScreen.tsx is:  
`"Check your connection and pull down to retry."`

This means the unit-test suite's `selectErrorCopy` helper has drifted from the real component. The `selectErrorCopy` function in offline-tests is also a test-local re-implementation — it's not imported from the component.

**Recommendation:** When Shamus extracts copy strings to a shared constants file (see `DECISIONS FOR SKY` below), Gary will update both test files to import from the canonical source rather than maintaining parallel copies.

### 3. FlashBanner message verified against actual source

The task brief specified `"Some listings may be outdated"` as the expected banner copy. The **actual** message in `HomeScreen.tsx` is `"Showing saved resources — couldn't refresh"`. The integration tests use the real string.

---

## Duplicate-avoidance log

The following were already covered in `qa/auto-2026-05-25-gary-offline-tests` and are NOT repeated:

- isNetworkError full pattern set (12 tests across true/false/null/undefined)
- shouldShowStaleBanner visibility logic (4 tests)
- selectErrorCopy title branching (5 tests)
- network description stale-data language check (1 test)

New coverage added by this file: state enum selection, FlashBanner copy contracts, PII/security contracts, state-transition coherence.

---

## DECISIONS FOR SKY

None blocking. One optional improvement:

**Option — extract error copy to a shared constants file**  
Both HomeScreen.tsx and both test files maintain parallel copies of the error strings. If Shamus creates `src/lib/errorCopy.ts` with exported constants, tests can import them directly and copy drift becomes impossible. Low priority but would eliminate the discrepancy noted in Finding #2.

---

## Test run

```
PASS src/__tests__/homeScreenOfflineRecovery.test.ts
Tests: 25 passed, 25 total
Time:  0.621 s
```

Command: `npm test -- --testPathPattern=homeScreenOfflineRecovery --no-coverage`
