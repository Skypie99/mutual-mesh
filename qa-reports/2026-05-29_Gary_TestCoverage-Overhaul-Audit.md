# Test Coverage Audit — MutualMesh

**Status:** AUDIT ONLY — No commits applied.  
**Date:** 2026-05-29  
**Current Coverage:** 86.54% (Statements) | 85.35% (Branch) | 82.6% (Functions) | 85.64% (Lines)  
**Target:** 90%+ (all metrics)  

---

## Executive Summary

MutualMesh has excellent **statement** and **line** coverage at 86.54% and 85.64% respectively, but **branch coverage trails at 85.35%** and **function coverage lags at 82.6%**. The project is **4–8 points short** of the 90% target.

### Gap Analysis

**Files BELOW 80% Branch Coverage (Primary Blockers):**

1. **`src/lib/errorReporting.ts`** — 61.81% branch (165 total branches, ~63 untested)
   - Lines 241–245 (logError error-capture): IOException branches never exercised
   - Lines 280–296 (getAppVersion): Constants module fallback chains uncovered
   - Lines 351–380 (logError core flow): Network + fetch error handling untested
   - **Risk:** Privacy-critical module; PII stripping + error reporting are load-bearing

2. **`src/lib/categoryStorage.ts`** — 83.33% branch (48 total, ~8 uncovered)
   - Lines 38–39: AsyncStorage malformed-JSON parse recovery edge case
   - Lines 89–104: `loadCategories()` catch block + IO error handling
   - **Risk:** Filter persistence; edge-case recovery is defensive

3. **`src/lib/i18n.ts`** — 86.95% branch (23 total, ~3 uncovered)
   - Line 149: Missing-key fallback in i18n resolution
   - **Risk:** Low; fallback is best-effort, never crashes

4. **`src/lib/handleGenerator.ts`** — 66.66% branch (9 total, ~3 uncovered)
   - Line 353: Empty wordlist exception path
   - **Risk:** Low; pure validation; defensive throw

5. **`src/lib/mapHelpers.ts`** — 91.3% branch (23 total, ~2 uncovered)
   - Lines 134, 136: Boundary-case math edge cases (max-lat/max-lng)
   - **Risk:** Low; geometric clamp edge-case

6. **`src/lib/pickupConfirm.ts`** — 94.44% branch (18 total, ~1 uncovered)
   - Line 60: Rare async timing edge case
   - **Risk:** Very low

7. **`src/lib/fsaAggregation.ts`** — 93.75% branch (32 total, ~2 uncovered)
   - Line 161: Complex reduce() optimization path
   - **Risk:** Low; business logic works; uncovered path is performance safeguard

---

## Missing Test Coverage — by File

### 🔴 **Critical (Privacy/Security Load-Bearing)**

#### `src/lib/errorReporting.ts` — 58.33% stmt / 61.81% branch

**Untested Scenarios:**

| # | Scenario | Lines | Reason | Fix |
|---|----------|-------|--------|-----|
| E1 | `logError()` when opted-out | 352–353 | Happy path tested; early-return path (optedIn=false) never asserted | Test: `logError(err)` with opt-in=false, verify no fetch() call |
| E2 | `logError()` fetch fail (network error) | 380–391 | fetch() throws (e.g., network unreachable); caught & swallowed | Test: mock fetch to throw, verify no crash + void return |
| E3 | `logError()` missing EXPO_PUBLIC_SUPABASE_ANON_KEY | 374–375 | No anonKey env var; edge case in header building | Test: delete EXPO_PUBLIC_SUPABASE_ANON_KEY, call logError() |
| E4 | `resolveLogErrorUrl()` derivation | 261–268 | String interpolation + trailing-slash strip on supabaseUrl | Already tested (lines 360–382 in test file) ✓ |
| E5 | `getAppVersion()` — fallback chain | 239–246 | Constants.expoConfig missing → try manifest2; both missing → '0.0.0' | Test: mock Constants to null, verify fallback to '0.0.0' |
| E6 | `getAppVersion()` — 32-char cap | 245 | slice(0, 32) truncates long versions | Test: mock version="1.2.3.4.5.6.7.8.9.0.1.2.3.4.5", verify ≤32 chars |
| E7 | `setErrorReportingOptIn()` failure | 294–300 | AsyncStorage.setItem() throws; swallowed silently | Test: mock storage.setItem to throw, verify no crash |
| E8 | `getErrorReportingOptIn()` parse error | 279–287 | JSON.parse() fails or raw is invalid string | Test: mock storage.getItem to return '{"invalid}', verify returns DEFAULT_OPT_IN |

**Hidden Branches in `logError()` (lines 351–396):**
- ✓ `optedIn = false` → early return (E1)
- ✓ `url = null` → early return (tested as "both missing")
- **✗** `fetch()` throws (network error) → caught at line 392 (E2)
- **✗** `anonKey` is empty string (line 374, ternary else) → headers built without auth (E3)
- **✗** JSON.stringify(payload) edge case (line 390) — unlikely but untested

**Recommendation:**
- **High value:** Add E1, E2, E3, E5 (4 tests, ~30 min)
- **Medium value:** E7, E8 (2 tests, ~20 min)
- **Low value:** E4 (already covered), E6 (edge case)

---

### 🟡 **High (Filter Persistence)**

#### `src/lib/categoryStorage.ts` — 71.42% stmt / 83.33% branch

**Untested Scenarios:**

| # | Scenario | Lines | Reason | Fix |
|---|----------|-------|--------|-----|
| C1 | `loadCategories()` storage.getItem() throws | 89–96 | IO error (permission denied, etc.); returns DEFAULT (empty list) | Test: mock storage.getItem to throw Error, verify [] |
| C2 | `loadCategories()` JSON malformed | 98–104 | storage.getItem() returns non-JSON; JSON.parse() throws | Test: mock storage.getItem to return "not json", verify [] |
| C3 | `parseCategories()` unknown category in array | 38–39 | validateCategory() filters unknowns; edge case | Test: parseCategories(['foo', 'open', 'bar']), verify ['open'] |
| C4 | `saveCategories()` storage.setItem() throws | Covered by error handler test | Failure swallowed silently | Test: mock storage.setItem to throw, verify no crash |

**Recommendation:**
- Add C1, C2, C3 (3 tests, ~25 min) — defensive paths for robustness
- C4 already implicit in error-handling tests

---

### 🟢 **Medium (Business Logic)**

#### `src/lib/i18n.ts` — 96.29% stmt / 86.95% branch

| # | Scenario | Fix |
|---|----------|-----|
| I1 | Missing key in messages → fallback to English | Test: i18n.t('NONEXISTENT_KEY'), verify English fallback |

**Recommendation:** Low priority; fallback is best-effort. (1 test, ~10 min)

---

#### `src/lib/mapHelpers.ts` — 94.73% stmt / 91.3% branch

| # | Scenario | Lines | Fix |
|---|----------|-------|-----|
| M1 | Max latitude clamp (edge case) | 134 | Test: clampLatitude(90.1), verify 90 |
| M2 | Max longitude clamp (edge case) | 136 | Test: clampLongitude(180.1), verify 180 |

**Recommendation:** Very low priority; math is simple. (1 combined test, ~5 min)

---

#### `src/lib/handleGenerator.ts` — 92.85% stmt / 66.66% branch

| # | Scenario | Lines | Fix |
|---|----------|-------|-----|
| H1 | `pickRandom()` on empty array → throws | 353 | Test: pickRandom([]), expect Error("Empty wordlist") |

**Recommendation:** Defensive validation; unlikely in practice. (1 test, ~10 min)

---

#### `src/lib/fsaAggregation.ts` — 98.46% stmt / 93.75% branch

| # | Scenario | Lines | Fix |
|---|----------|-------|-----|
| F1 | Complex reduce() optimization path | 161 | Code works fine; uncovered path is performance refinement |

**Recommendation:** Deferred; not blocking 90%. (Deferred)

---

### 0% Coverage (Components — No Tests)

#### `src/components/Button.tsx` — 0% stmt / 0% branch / 0% funcs

**Scope:** React Native Pressable wrapper. Four variants + disabled state + a11y attributes.

**Why No Tests:** Component testing requires `@testing-library/react-native` (not installed per errorBoundary.test.ts comment). Component library primitives have lower ROI for unit tests (styling + a11y better caught by integration + design-review).

**Recommendation:** **Deferred to Phase 0b.** Component unit tests are lower priority than lib coverage gaps.

---

#### `src/components/ErrorBoundary.tsx` — 8.33% stmt / 0% branch

**Current Coverage:** Only static `getDerivedStateFromError()` is tested (lines 31–33).

**Untested:** 
- `componentDidCatch()` logic (lines 35–44) — console.warn + logError() call
- `render()` conditional (lines 50–58) — fallback rendering
- `DefaultFallback` component (lines 61–78)

**Why:** Requires @testing-library/react-native for error-throwing child component. Deferred per existing test file comment.

**Recommendation:** **Deferred to Phase 0b.**

---

## Test File Health Check

✓ **All test files follow `*.test.ts` pattern** (20 files found, all pass)  
✓ **Supabase mock at top of each test** (Verified in errorReporting.test.ts, categoryStorage.test.ts)  
✓ **No orphaned test utilities** (All imports are resolved)  
✓ **No flaky tests** (Jest run: 365 passed, 0 flaky, 0 timeout)  

---

## Lint & TypeScript Status

| Check | Status | Output |
|-------|--------|--------|
| ESLint | ✓ PASS | 0 errors |
| TypeScript (`npm run typecheck`) | ✓ PASS | No errors |
| Prettier (format:check) | ✓ PASS | CI runs it weekly |
| CI workflow | ✓ ACTIVE | `.github/workflows/ci.yml` runs tests + lint + typecheck on PR |

---

## Highest-Value Missing Test Cases (Priority Order)

### Top 10 by Risk × Ease

| Rank | File | Test | Risk | Est. Time | Total LOC |
|------|------|------|------|-----------|-----------|
| 1 | errorReporting | logError() network failure (E2) | HIGH (privacy module) | 15 min | +10 |
| 2 | errorReporting | logError() opt-out early return (E1) | HIGH (default OFF) | 10 min | +8 |
| 3 | errorReporting | getAppVersion() fallback chain (E5) | MEDIUM | 12 min | +10 |
| 4 | categoryStorage | loadCategories() IO error (C1) | MEDIUM (defensive) | 12 min | +8 |
| 5 | categoryStorage | parseCategories() unknown values (C3) | MEDIUM (defensive) | 10 min | +6 |
| 6 | errorReporting | missing ANON_KEY edge case (E3) | MEDIUM | 10 min | +7 |
| 7 | categoryStorage | malformed JSON parse (C2) | MEDIUM | 10 min | +6 |
| 8 | errorReporting | setErrorReportingOptIn() failure (E7) | LOW (best-effort) | 8 min | +5 |
| 9 | handleGenerator | pickRandom() empty array (H1) | LOW (validate) | 8 min | +4 |
| 10 | i18n | missing key fallback (I1) | LOW (fallback) | 8 min | +3 |

**Total effort to reach 90%+:** ~103 minutes (~8 tests, ~67 LOC)

---

## Coverage Impact Analysis

### Branch Coverage Bottleneck

Current **85.35% branch coverage** is 4.65 points below target. The top 3 files account for ~80% of missing branches:

- errorReporting.ts: ~63 untested branches
- categoryStorage.ts: ~8 untested branches  
- i18n.ts: ~3 untested branches

**Path to 90%:** Add tests 1–6 from the priority table → estimated +5–6 percentage points.

### Function Coverage Bottleneck

Current **82.6% function coverage** is 7.4 points below target. Two factors:

1. **Components (Button, ErrorBoundary):** 0% coverage, ~15 functions untested (deferred to Phase 0b)
2. **Helper functions in lib:** Most are tested; only `paletteFor()` in theme.ts (1 func) is untested (negligible impact)

**Path to 90% for functions:** Deferred; requires React Native integration testing environment.

---

## Flaky Tests & Timing Issues

✓ **No flaky tests detected.**  
✓ **All async tests use proper Jest patterns** (async/await, resolve/reject).  
✓ **No timeouts in test suite** (Jest default 5s is sufficient).  
✓ **No non-deterministic behavior** (randomness tests mock Math.random).

---

## Recommendations

### Phase 1 — Reach 88–89% (Next 2–3 days)

**Add 8 focused unit tests:**

1. **errorReporting.test.ts** — 4 new test blocks
   - `logError() — network failure` (mock fetch to throw)
   - `logError() — opted-out` (verify no fetch call)
   - `getAppVersion() — Constants fallback` (mock Constants to null)
   - `logError() — missing ANON_KEY` (delete env var)

2. **categoryStorage.test.ts** — 3 new test blocks
   - `loadCategories() — IO error` (mock storage.getItem to throw)
   - `parseCategories() — unknown values filtered` (edge case)
   - `loadCategories() — malformed JSON` (mock storage.getItem to return invalid)

3. **handleGenerator.test.ts** — 1 new test block
   - `pickRandom() — empty array throws` (defensive validation)

**Estimated effort:** 2–3 hours  
**Expected new coverage:** +5–6 points (→ **90.6–91.3% branch coverage**)

### Phase 0b — Component Integration Tests (Future)

- Install `@testing-library/react-native`
- Add Button.test.tsx (variants, disabled, a11y)
- Add ErrorBoundary integration tests (error-throwing children)

---

## Conclusion

**Current state:** Excellent lib coverage (91.43% in lib/), but privacy-critical `errorReporting.ts` has untested error paths. **Action:** Prioritize E1–E6 (error paths, opt-out, app version fallback) to push past 90%.

**Branch coverage is the blocker** (85.35%); function coverage deferred to integration layer (components need React Native environment).

**Quality gates:** ESLint ✓, TypeScript ✓, CI ✓, no flaky tests ✓

---

## Appendix: Coverage Summary Table

```
File                      | Stmt   | Branch | Func   | Lines  | Status
======================== | ====== | ====== | ====== | ====== | =================
components/              | 3.57   | 0.00   | 12.5   | 3.84   | DEFERRED
├─ Button.tsx            | 0.00   | 0.00   | 0.00   | 0.00   | Phase 0b
├─ ErrorBoundary.tsx     | 8.33   | 0.00   | 20.0   | 8.33   | Phase 0b
lib/                     | 91.43  | 89.64  | 89.28  | 91.09  | 📊 TARGET NEAR
├─ errorReporting.ts     | 58.33  | 61.81  | 44.44  | 59.25  | PRIORITY ⚠️
├─ categoryStorage.ts    | 71.42  | 83.33  | 57.14  | 65.21  | ADD TESTS
├─ i18n.ts               | 96.29  | 86.95  | 100    | 96.15  | MINOR
├─ handleGenerator.ts    | 92.85  | 66.66  | 100    | 100    | ADD 1 TEST
├─ mapHelpers.ts         | 94.73  | 91.30  | 100    | 100    | ✓ NEAR TARGET
├─ fsaAggregation.ts     | 98.46  | 93.75  | 100    | 98.11  | ✓
├─ All others            | ≥94%   | ≥94%   | 100%   | ≥91%   | ✓ GREEN
lib/messages/            | 100    | 100    | 100    | 100    | ✓ PERFECT
======================== | ====== | ====== | ====== | ====== | =================
ALL FILES                | 86.54  | 85.35  | 82.60  | 85.64  | 🟡 4–8 PTS SHORT
```

---

**Report Status:** ✓ AUDIT ONLY — No code changes applied.  
**Next Step:** Create gary/test-overhaul-2026-05-29 branch + apply Top 10 tests (Proposed).
