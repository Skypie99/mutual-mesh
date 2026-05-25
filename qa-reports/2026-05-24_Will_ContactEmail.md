# Will — Contact Email Remediation

**Date:** 2026-05-24
**Branch:** `will/contact-email-2026-05-24`
**Commit:** `e985e73`
**File changed:** `src/lib/policyText.ts`

---

## What changed

Replaced all 3 occurrences of `skylerhalisky@gmail.com` with `privacy@mutualmesh.ca`.

| Line (original) | Context                                         |
| --------------- | ----------------------------------------------- |
| 117             | Privacy Policy — CONTACT section                |
| 186             | Terms of Service — REPORTING BAD ACTORS section |
| 226             | Terms of Service — CONTACT section              |

## Why

Steve's security sweep flagged the personal Gmail as a HIGH-severity PIPEDA role-separation risk. A personal address:

- Ties the contact channel to a specific individual (Sky), not the project
- Does not survive a founder transition
- Signals a non-professional privacy posture to PIPEDA-aware users

`privacy@mutualmesh.ca` is:

- Role-based (not person-tied)
- Domain-anchored (.ca signals correct PIPEDA jurisdiction)
- Category-named (privacy@ is standard for privacy-obligation apps)
- Morgan-approved; no Sky input required for this text-only remediation

## Toolchain state

| Check                                                | Result                               | Notes                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                   | Pre-existing errors only             | 42 error lines all pre-exist on `main` (missing Phase 3/5 modules, Deno types in edge functions) — zero errors introduced by this change                          |
| `npx jest --silent src/__tests__/policyText.test.ts` | 4/4 PASS                             | Direct coverage of the changed file                                                                                                                               |
| `npx jest --silent` (full suite)                     | 189 tests PASS; 3 suites FAIL to run | The 3 failing suites reference missing modules (`fsaAggregation`, `verificationQueue`, `mapHelpers`) — pre-existing WIP from Phase 3/5; not caused by this change |
| `npx eslint src/lib/policyText.ts`                   | 0 errors, 0 warnings                 | Only policyText.ts linted; repo-wide lint has 1 pre-existing error in `errorReporting.ts` (useless escape `\-`) unrelated to this change                          |

## Scope confirmation

Only `src/lib/policyText.ts` was modified. No credentials, no data layer, no auth, no structural PII change — Jordan review not required per task brief (Steve F5 text-replacement classification).
