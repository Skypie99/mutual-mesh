# Gary — Cycle 7 Coverage Tests
**Date:** 2026-05-28
**Branch:** `qa/auto-2026-05-28-gary-coverage-tests`
**Head SHA:** `862cc90`
**Worktree:** `/tmp/mm-coverage-tests` (removed after report)
**Base:** `main` (5b8635b)

---

## Summary

Three new test files added to close the HIGH-priority gaps from
`2026-05-28_Gary_Coverage-Map-Cycle7.md`. All tests pass; typecheck clean.

---

## Tests Added

| File | New Tests | Describes |
|---|---|---|
| `src/__tests__/resources.test.ts` | 37 tests | `createResource`, `listResources`, `listMyPosts`, `listMyClaims`, `getResourceDetail`, `deleteResourceById`, `claimResource`, `deleteMyAccount`, `confirmPickup`, `completeOnboarding`, `getClaimantHandle` |
| `src/__tests__/errorBoundary.render.test.tsx` | 12 tests | Render: no-error children pass-through, default fallback on throw, custom fallback prop, componentDidCatch + logError calls, reset function, static getDerivedStateFromError |
| `src/__tests__/ProfileScreen.counts.test.tsx` | 8 tests | Counts load (listMyPosts/listMyClaims), loading "…" state, null-data defensive path, no-user render, 2- and 3-count display |

**Total new tests:** 57 (suite count went from 23 → 26 suites, 391 → 447 passing tests)

---

## Coverage Before / After

Measured with `--coverage --collectCoverageFrom` targeting only the three files.

| File | Before (statements) | After (statements) | Notes |
|---|---|---|---|
| `src/lib/resources.ts` | 34.78% (report estimate) / **0%** (no test exercised it) | **100%** | All exported functions exercised |
| `src/components/ErrorBoundary.tsx` | 8.33% (static method only) | **100%** (stmts, branches, fns, lines) | Full render coverage via TRTL |
| `src/screens/ProfileScreen.tsx` | **40.86%** (original ProfileScreen.test only) | **43.01%** | Counts load + loading state added; interactive handle-edit + delete-modal paths NOT covered (see below) |

---

## Mock Patterns Used

All three files follow existing project conventions:

- **`resources.test.ts`** — `jest.mock('@/lib/supabase')` with inline `jest.fn()` factory, inner mocks exposed via `__mocks` escape hatch. Pattern taken directly from `updateMyProfile.test.ts`. Circular self-reference in `mockEq` fixed with explicit `jest.Mock` type annotation and `function(){}` bodies (avoids TS7022/TS7024).
- **`errorBoundary.render.test.tsx`** — `jest.mock('@/lib/errorReporting')` to prevent network calls. `console.warn` + `console.error` spied and suppressed (React's own "above error occurred in" lines are expected noise). `UNSAFE_getAllByProps({ accessibilityRole: 'alert' })` used instead of `getByRole('alert')` — the latter doesn't resolve in this version of RNTL for `accessibilityRole="alert"` on a View.
- **`ProfileScreen.counts.test.tsx`** — same mocks as `ProfileScreen.test.tsx`. `render()` called without `act()`, then `findAllByText()` used to await async effects — matches the pattern that works in the original test file. Calls to `render()` inside `act()` caused "Can't access .root on unmounted test renderer" errors; the working pattern avoids that.

---

## What Could NOT Be Easily Tested

### ProfileScreen — handle-edit flow (lines 99-100, 106-109, 113-115, 119-122, 126-154)

The inline handle-edit path requires: (1) a `fireEvent.press` on the ghost Button labeled with the current handle, (2) a `fireEvent.changeText` on the TextField, (3) a second `fireEvent.press` on Save. The TextField component uses NativeWind `className` props and the Button's `onPress` is wired through Pressable with `accessibilityLabel={label}`. The test infra supports this in principle, but the handle validation path (`saveHandle → validateHandle → warning state → second tap`) involves a 3-step state machine that requires careful act() sequencing. Deferred to a dedicated `ProfileScreen.interactive.test.tsx` file. Recommended approach: `fireEvent.press(screen.getByLabelText('brave-fox-4521'))` to open the edit field, then chain through the save flow.

### ProfileScreen — ConfirmationModal + delete-account flow (lines 161-172, 239-357)

The delete-account path requires opening the ConfirmationModal and tapping "Yes, delete". The ConfirmationModal component is a separate render tree and its visibility is gated on `deleteModalOpen` state. Tests for this should live in a dedicated `ProfileScreen.delete.test.tsx` — the mock wiring for `deleteMyAccount` error path is straightforward once the modal interaction is set up.

### ProfileScreen — error display path (line 315-322)

The error state (`setError(...)`) is set inside `handleDeleteConfirm` when `deleteMyAccount()` returns an error. Not covered by the current test set because it requires the modal open + confirm flow described above.

---

## Typecheck Result

```
npm run typecheck → clean (0 errors)
```

Fix applied: `mockEq` self-reference in the Supabase factory caused TS7022/TS7024. 
Solution: explicit `jest.Mock` annotation + `function(){}` bodies (lazy evaluation 
breaks the circularity at type-check time).

---

## Test Suite Result

```
Test Suites: 26 passed, 26 total
Tests:       1 todo, 447 passed, 448 total
Time:        ~8-9s
```

Pre-existing act() warnings from `ResourceDetailScreen.race.test.tsx` — noise, not new failures.

---

## Decisions for Sky

None. All work is contained to new test files; no production code was modified.

---

## Next Steps (propose-only)

1. **ProfileScreen handle-edit interactive test** — `ProfileScreen.interactive.test.tsx`, ~8 tests. Medium effort; requires careful `fireEvent` + `act()` sequencing.
2. **ProfileScreen delete-modal flow** — `ProfileScreen.delete.test.tsx`, ~5 tests. Straightforward once ConfirmationModal interaction is wired.
3. **Raise `ProfileScreen.tsx` coverage threshold** in `jest.config.js` to 50% once #1 and #2 land.
4. **`resources.ts` coverage threshold** — add `'./src/lib/resources.ts': { lines: 90 }` to `coverageThreshold` in `jest.config.js` to guard against regression (currently 100%, but any new untested function would drop it).
