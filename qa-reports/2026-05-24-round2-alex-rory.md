# Round 2 QA — Alex A11y + Rory E2E

**Date:** 2026-05-24 · **Branch:** `feat/mutualmesh-2026-05-24-shamus-resourcemap-polish`
**Roles:** Alex (M4 a11y) + Rory (M5 e2e) · **Mode:** ACTIVE (Morgan-routed, direct session)

---

## M4 — Alex A11y Audit: ResourceMapScreen Overlay EmptyState

### Issue Found — MEDIUM (fixed inline)

**File:** `src/screens/ResourceMapScreen.tsx` · Map-installed path, lines ~369–378

**Problem:** The empty-state overlay (`absolute inset-0 z-10`) visually covers the map using CSS z-index. React Native's accessibility tree ignores z-index — VoiceOver/TalkBack could still navigate to the `MapView` (`accessibilityRole="image"`) and center-on-me `Pressable` while they were visually hidden behind the overlay.

**Behavior:** Not a focus-trap (the spec concern was that the overlay would trap focus). The actual issue was the opposite: focus leaked THROUGH the overlay to obscured elements.

**Fix applied (commit `00128ba`):**

- `accessibilityViewIsModal={true}` added to the overlay `View` — signals to VoiceOver/TalkBack that this is the modal surface while visible
- `importantForAccessibility="no-hide-descendants"` added to the `flex-1` map wrapper when `descriptors.length === 0` — hides the map + FAB from the a11y tree when the overlay is active
- `accessibilityLiveRegion="polite"` added to the overlay — announces the empty state when descriptors drop to zero

**Verification:** typecheck clean · lint clean · 369/369 tests pass

### EmptyState component — PASS

`src/components/EmptyState.tsx` has no a11y issues:

- `Text` nodes are implicit inline — correct for RN
- `Button` CTA is interactive — relies on Button's own a11y attrs (audited separately in Phase 1)
- No focus trap possible — EmptyState renders inside the parent tree, no Modal wrapper

### Deferred (require @testing-library/react-native — not yet installed)

- Unit test for `viewMode` initial state = `'list'` (hook test)
- Unit test for empty `descriptors` → EmptyState visible (component render test)

These require `@testing-library/react-native` (Phase 0b). Current test coverage for ResourceMapScreen is via pure helper tests (`bucketLabel` — see M1).

---

## M5 — Rory E2E: Error Reporting Code Path Audit

### Static audit result: PASS (live validation pending Sky)

**Code path verified:**

| Step               | File                                                                                                  | Status |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ------ |
| Client opt-in gate | `src/lib/errorReporting.ts:276` — reads `OPT_IN_STORAGE_KEY`                                          | ✅     |
| PII strip + fetch  | `src/lib/errorReporting.ts:347` — `logError()`, strips PII, POST to Edge Function URL                 | ✅     |
| Edge Function      | `supabase/functions/log-error/index.ts` — rate-limit → validate → SHA-256 hash → call `log_error` RPC | ✅     |
| DB types           | `src/types/database.ts:228` — `error_reports` table + `log_error` RPC typed                           | ✅     |
| Migration file     | `supabase/migrations/008_error_reports.sql` — exists, implements `log_error` SECURITY DEFINER RPC     | ✅     |

**No code defects found.** The hash → RPC → DB row path is correct. The Edge Function never logs or stores raw message/stack, IP, or UA.

### BLOCKER for live validation

Migration `008_error_reports.sql` has NOT been applied to the live Supabase project (migrations 002–011 pending Sky — see DECISIONS FOR SKY below). The Edge Function also hasn't been deployed.

TestFlight prep cannot begin until these are applied.

---

## DECISIONS FOR SKY

> **MutualMesh migrations 002–011** — Sky applies via Supabase dashboard SQL editor. This unblocks:
>
> - Live e2e validation of the error reporting path (M5)
> - Push notification flow (migration 010+)
> - TestFlight prep
>
> **log-error Edge Function deploy** — `supabase functions deploy log-error`. Sky runs after migrations applied.
>
> **Push `data/sync-types-mig-002-009-2026-05-24`** — Dana's type-sync branch (1-file patch, verified clean) is local-only. Sky push approval needed.
>
> **Merge `feat/mutualmesh-2026-05-24-shamus-resourcemap-polish`** — 5 commits ahead of main, all green. Full list: viewMode default fix, bucketLabel extraction + tests, a11y overlay fix. Ready for Sky review → merge → PR.

---

## Round 1 Recap (all complete)

| Task                                   | Status                                  | Commit    |
| -------------------------------------- | --------------------------------------- | --------- |
| M3 — Will: commit qa-reports           | ✅ Done (prior session)                 | `91de2d6` |
| A1 — Will: commit AccessMap qa-reports | ✅ Done                                 | `785c863` |
| M2 — Dana type-sync branch             | ✅ Done (local, awaiting push approval) | `f216b6d` |
| M1 — Gary: bucketLabel tests           | ✅ Done, 369/369                        | `be45e9c` |
| A2 — Shamus: placeholder sweep         | ✅ Done (local branch, awaiting merge)  | `9a6a16a` |

## Round 2 Recap

| Task                                               | Status                                     | Commit    |
| -------------------------------------------------- | ------------------------------------------ | --------- |
| M4 — Alex: overlay a11y fix                        | ✅ Done, 369/369                           | `00128ba` |
| M5 — Rory: error reporting audit                   | ✅ Static pass; live blocked on migrations | —         |
| A3 — Alex: AccessMap placeholder sweep a11y review | ✅ Pass (reviewed diff; patterns correct)  | —         |
