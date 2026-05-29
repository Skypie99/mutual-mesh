# Gary Coverage Tests v2 — Cherry-Pick Audit

**Date:** 2026-05-28  
**Auditor:** Gary (QA)  
**Project:** MutualMesh  
**Task:** Clean coverage tests branch via cherry-pick of c74547a onto main

---

## Summary

**Status:** BLOCKED — Typecheck Failure

Created a clean worktree on main (80237ca1) and cherry-picked commit c74547a (test coverage commit) without conflicts. Diff verified as test-only (3 new test files). However, the test suite has import errors and fails typecheck.

---

## Steps Executed

1. ✅ Git fetch + worktree cleanup
2. ✅ `git worktree add -b qa/auto-2026-05-28-gary-coverage-tests-v2 /tmp/mm-coverage-clean main`
3. ✅ `git cherry-pick c74547a` — **no conflicts**
4. ✅ Diff audit: **test-only confirmed**
   - src/__tests__/ProfileScreen.counts.test.tsx (new)
   - src/__tests__/errorBoundary.render.test.tsx (new)
   - src/__tests__/resources.test.ts (new)
5. ❌ `npm run typecheck` — **FAILED**

---

## Typecheck Error

```
src/__tests__/resources.test.ts(72,3): error TS2305: Module '"@/lib/resources"' has no exported member 'getResourceDetail'.
src/__tests__/resources.test.ts(78,3): error TS2305: Module '"@/lib/resources"' has no exported member 'getClaimantHandle'.
```

### Analysis

The test file imports two functions that do not exist:

| Imported | Actual in resources.ts | Status |
|---|---|---|
| `getResourceDetail(id)` | `getResourceById(id)` | ❌ Name mismatch |
| `getClaimantHandle(userId)` | N/A | ❌ Not exported |

The test was written against a different API surface than what currently exists in `src/lib/resources.ts`.

---

## Root Cause Options

1. **Test ahead of implementation:** The test file was written for a planned refactor that hasn't landed yet (e.g., renaming `getResourceById` → `getResourceDetail`, adding new `getClaimantHandle` function).
2. **Stale test:** The commit was based on an older version of resources.ts that had these exports; they were later removed or renamed.

---

## Blockers

- Cannot proceed to npm test without fixing imports.
- Cannot merge without typecheck passing.

---

## Updated Merge Queue

Entry `qa/auto-2026-05-28-gary-coverage-tests` replaced with v2 entry:
- **Branch:** qa/auto-2026-05-28-gary-coverage-tests-v2
- **Head SHA:** 8fc3f4d
- **Status:** BLOCKED — Typecheck Failure
- **Main SHA at stamp:** 80237ca1
- **Timestamp:** 2026-05-28T23:35:00Z
- **Diff:** 3 new test files (test-only, no source code)

---

## Next Steps

Requires Gary clarification:
1. Is the test intentionally written for a planned refactor to resources.ts?
2. If so, are those API changes queued in a separate branch that should land first?
3. Or should the test imports be corrected to match the current API?

Once clarified, branch can be fixed and re-audited.
