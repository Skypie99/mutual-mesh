---
date: 2026-05-28
author: Gary (QA)
model: haiku-4-5
project: MutualMesh
task: Test coverage gap map for Cycle 7
mode: AUDIT_ONLY
---

# Test Coverage Gap Map — MutualMesh Cycle 7

**Coverage Status:** 71.63% branch coverage overall (target: 80%+).

**Command Run:**
```bash
npm test -- --coverage 2>/dev/null | tail -60
```

---

## Executive Summary

Cycle 7 ships with **10 shipped files** sitting below 80% branch coverage, concentrated in two high-friction zones:

1. **Components folder** (23 files, 42.64% branch) — Foundational UI is under-tested
2. **Screens folder** (2 key screens, ~35% branch) — Complex state machines lack coverage

The **top 5 coverage gaps** map to critical shipped features:

| Rank | File | Type | Branch % | LOC | Feature | Priority |
|------|------|------|----------|-----|---------|----------|
| 1 | `ErrorBoundary.tsx` | Component | 0% | 78 | Error containment layer | 🔴 CRITICAL |
| 2 | `FlashBanner.tsx` | Component | 0% | 102 | Success/error toasts (a11y-announced) | 🔴 CRITICAL |
| 3 | `TextField.tsx` | Component | 0% | 78 | Form input primitive | 🔴 CRITICAL |
| 4 | `ProfileScreen.tsx` | Screen | 34.69% | 361 | User profile, claims, delete account | 🟠 HIGH |
| 5 | `ResourceDetailScreen.tsx` | Screen | 60% | 455 | Resource detail, claim modal, handle reveal | 🟠 HIGH |

---

## Gap Analysis by Coverage Tier

### Tier 1: Zero Branch Coverage (0%)

**3 files, all shipped, all user-facing:**

#### 1. **`ErrorBoundary.tsx`** (78 LOC)
- **Branch Coverage:** 0%
- **Uncovered Lines:** 29–62 (error rendering + fallback UI)
- **Feature:** Error containment layer protecting entire app from crashes
- **Shipped:** Yes — used at `App.tsx` root
- **Risk:** Error fallback branches untested; user may see blank screen on unexpected crashes
- **Reason for Gap:** Error boundaries are hard to unit-test; require throwing from within a component render
- **Recommendation:** Add integration test that triggers an error inside a wrapped component

---

#### 2. **`FlashBanner.tsx`** (102 LOC)
- **Branch Coverage:** 0%
- **Uncovered Lines:** 32–101 (show/hide, animated transitions, accessibility announcement)
- **Feature:** Toast-style success/error notifications with WCAG-announced text
- **Shipped:** Yes — triggered on resource claim, verification, profile actions
- **Risk:** Animation branches + accessibility hooks untested; flash messages may not announce to screen readers
- **Reason for Gap:** Animated transitions (Reanimated or React Native Animated) are difficult to test without timing mocks
- **Recommendation:** Mock `useReducedMotion` hook; test show/hide state transitions with Jest timers

---

#### 3. **`TextField.tsx`** (78 LOC)
- **Branch Coverage:** 0%
- **Uncovered Lines:** 31–60 (focus state, error rendering, disabled state)
- **Feature:** Reusable form input field with error message display
- **Shipped:** Yes — used in SignInScreen, AddResourceScreen, ProfileScreen
- **Risk:** Focus/blur, error states, disabled states untested
- **Reason for Gap:** Controlled component behavior requires event simulation
- **Recommendation:** Add test for focus, blur, onChange, error message rendering

---

### Tier 2: Low Branch Coverage (30–70%)

#### 4. **`ProfileScreen.tsx`** (361 LOC, 34.69% branch)
- **Uncovered Lines:** 70–71 (loading fallback), 99–100 (empty state), 106–109 (error retry), 113–115 (deletion confirm), 119–122 (sign-out), 126–154 (claim card render), 161–172 (edit header), 239–357 (delete account + sign-out logic)
- **Feature:** User profile, my resources, my claims, delete account, sign out
- **Shipped:** Yes — core user-facing screen
- **Risk:** Delete account, sign-out, and claim-list rendering barely tested. Edge case: user deletes account while viewing own claims.
- **Recommendation:** Add tests for delete-account flow (confirm → API call → navigation), sign-out, empty-claims state, claim card rendering

---

#### 5. **`ResourceDetailScreen.tsx`** (455 LOC, 60% branch)
- **Uncovered Lines:** 88–92 (resource not found), 99–101 (loading), 111–112 (error fallback), 144–157 (claim modal submit logic), 188–194 (handle reveal), 213–214 (claim success), 269 (navigation), 361–386 (useEffect cleanup), 451 (optional chaining edge case)
- **Feature:** Resource detail view, claim button, handle reveal on claim, claim confirmation modal
- **Shipped:** Yes — critical user interaction point
- **Risk:** Claim modal branches + async handle-reveal flow are partially untested. Race condition: claim success → handle fetch → state update.
- **Recommendation:** Mock claim RPC; test modal open/close, claim submit with mocked supabase.rpc(), handle fetch race conditions with act()

---

### Tier 3: Mid-Range Coverage (50–70%)

#### 6. **`Card.tsx`** (39 LOC, 50% branch)
- **Uncovered Line:** 22
- **Feature:** Basic card wrapper component
- **Risk:** Low — simple wrapper; line 22 likely an edge case in conditional rendering

#### 7. **`ConfirmationModal.tsx`** (90 LOC, 75% branch)
- **Uncovered Line:** 63
- **Feature:** Confirmation dialog (used for delete resource, delete account)
- **Risk:** Low — one edge case untested; core dialog flow is covered

#### 8. **`StatusPill.tsx`** (uncovered lines 17–21, 75% branch)
- **Feature:** Status badge rendering (available, reserved, completed)
- **Risk:** Low — probably theme/color branches for each status

#### 9. **`categoryStorage.ts`** (108 LOC, 83.33% branch)
- **Uncovered Lines:** 38–39, 89–104
- **Feature:** LocalStorage caching of selected category filters
- **Risk:** Low — persistent storage edge cases (parse errors, missing keys)
- **Recommendation:** Add test for corrupted JSON in localStorage

#### 10. **`handleGenerator.ts`** (377 LOC, 66.66% branch)
- **Uncovered Line:** 353
- **Feature:** Random handle generation (adjective + noun + 4-digit)
- **Risk:** Low — likely a deduplication or edge case branch

---

## Coverage Summary by Folder

| Folder | Files | % Stmts | % Branch | % Funcs | % Lines | Status |
|--------|-------|---------|----------|---------|---------|--------|
| `components/` | 7 | 34.24 | 42.64 | 33.33 | 32.85 | 🔴 Low |
| `lib/` | 14 | 88.95 | 88.59 | 84.26 | 88.54 | 🟢 Good |
| `screens/` | 2 | 50.79 | 50.74 | 41.37 | 53.14 | 🟠 Mid |
| **Overall** | — | 72.78 | 71.63 | 62.33 | 71.64 | 🟠 Below target |

---

## Recommended Testing Plan (Priority Order)

### Phase 1: Critical Path (Do First)

**Goal:** Get 3 zero-coverage files to 70%+ branch.

1. **`ErrorBoundary.tsx`** — Add integration test with error thrown in child
   ```typescript
   // Test: Render <ErrorBoundary><ThrowError /></ErrorBoundary> and verify fallback UI
   ```

2. **`FlashBanner.tsx`** — Mock animation, test show/hide + accessibility
   ```typescript
   // Test: Render with message, verify visible, announce to a11y, hide on timeout
   ```

3. **`TextField.tsx`** — Test focus, blur, onChange, error state
   ```typescript
   // Test: Render with error prop, fireEvent.changeText, verify error message
   ```

### Phase 2: High-Value Screens

4. **`ProfileScreen.tsx`** — Add tests for delete-account, sign-out, claim list
   - Mock AuthContext sign-out
   - Mock deleteMyAccount RPC
   - Test empty-claims state rendering

5. **`ResourceDetailScreen.tsx`** — Test claim modal, handle reveal async flow
   - Mock claimResource RPC
   - Mock contactHandle fetch
   - Wrap state updates in act()

### Phase 3: Polish

6. Lower uncovered lines in `categoryStorage.ts`, `handleGenerator.ts`, `ConfirmationModal.tsx`
   - These are low-risk edge cases; 70%+ is acceptable for MVP

---

## Test Infrastructure Notes

### Current Test Suite
- **21 test files** across `src/__tests__/`, `src/lib/__tests__/`
- **371 tests passing** in 1.015s (very fast)
- **Jest + jest-expo** configured with:
  - `testPathIgnorePatterns: ['/.claude/']` (worktree safety)
  - No snapshot testing (unit + integration only)

### Known Testing Friction Points

1. **Screen components are hard to test** — Navigation, auth context mocking, async state updates require careful act() wrapping
2. **Animated components** — react-native-reanimated / Animated API need jest mock clock
3. **Supabase mocking** — Every RPC call needs supabase-js mock set up (currently done in test files with jest.mock())

---

## Files Recommended for Test Debt Paydown

| File | Gap Size | Effort | Impact | Recommendation |
|------|----------|--------|--------|-----------------|
| ErrorBoundary.tsx | 78 LOC, 0% | Low | High | Write integration test this cycle |
| FlashBanner.tsx | 102 LOC, 0% | Medium | High | Mock animation, add this cycle |
| TextField.tsx | 78 LOC, 0% | Low | High | Simple event tests, add this cycle |
| ProfileScreen.tsx | 361 LOC, 65% | Medium | High | Focus on delete/sign-out paths |
| ResourceDetailScreen.tsx | 455 LOC, 40% | Medium | High | Focus on claim modal + handle reveal |
| categoryStorage.ts | 108 LOC, 17% | Low | Low | Low priority; edge cases only |
| handleGenerator.ts | 377 LOC, 34% | Low | Low | Low priority; random dedup edge case |

---

## Decisions for Sky

None — this is audit-only. Coverage gaps are documented; Sky prioritizes which gaps to close based on Cycle 7 timeline and resources.

---

## Sign-Off

**Gary, QA Engineer**  
Cycle 7 coverage baseline established. No blockers. Test suite is green and fast. Recommend Phase 1 (3 critical files) for next cycle if branch coverage target of 80%+ is non-negotiable.

**Artifacts:**
- Command: `npm test -- --coverage 2>/dev/null`
- Current main SHA: 55c10d0
- Test result: 371/371 passing, 1.015s runtime
