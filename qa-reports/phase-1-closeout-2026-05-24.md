# Phase 1 Closeout — Morgan briefing — 2026-05-24

**Plan:** `/Users/skypie/.claude/plans/goofy-singing-steele.md`
**Phase:** 1 — Launch readiness (Days 1–10; landed Day 1 — under target)
**Toolchain:** ✅ green at close (typecheck + 133 jest tests in 10 suites + lint + format:check)
**Tests delta:** 91 → 133 (+42)
**Source commits:** none committed yet — work in working tree (Will blocked on `.git/index.lock`)

---

## TL;DR

Phase 1 is functionally complete on Day 1 — the plan budgeted 10 days. The team landed (a) the Cycle 5 Admin Verification UI build, (b) all 5 parallel audits (Quinn spec / Steve security / Alex a11y / Peter perf / Dana auto-suspend migration), (c) Dana's migration 003 fixing 2 of Steve's 3 launch-blockers, (d) Shamus's a11y batch fixing all 7 should-fix items + the 1 ❌, and (e) Quinn's full Phase 2 specs (categories, pickup confirmation, onboarding tour) so Phase 2 starts hot.

**Three things require Sky decisions before Phase 2 can ship to a real community.** All are below in DECISIONS FOR SKY, ordered by urgency.

---

## DECISIONS FOR SKY

### 🛑 Launch-blockers (must resolve before any Tier-1 community invite)

**DFS-P1-A — C1 server-side EXIF strip (Steve audit)**

PRIVACY.md D5 was approved as **two-layer** EXIF strip (client + server). The shipped code only does the client layer — `src/lib/photos.ts` includes a code comment unilaterally deferring the server layer to "Cycle 7" without Sky+Jordan sign-off. Steve's audit recommends restoring per spec.

Two implementation options:

- **Edge Function (Deno):** Triggered on Storage upload; re-encodes the file via sharp/exifr. Cleaner separation; runs in Supabase's edge runtime. ~1 day Shamus + Dana.
- **Postgres trigger:** Can't actually strip EXIF in SQL (EXIF is binary photo metadata, not a column). This option is NOT viable. Defaulting to Edge Function.

Recommendation: **Edge Function.** Approve and I'll spawn Shamus + Dana to implement.

---

**DFS-P1-B — `.git/index.lock` blocks Will from committing**

The stale lock file blocks every git operation. Auto-mode classifier won't let agents `rm` it. Your one-liner:

```bash
rm /Users/skypie/MutualMesh/.git/index.lock
```

After that, Will writes the LEARNINGS.md entry for the RLS-recursion gotcha and commits the full Phase 1 batch (Cowork patches + Admin UI + a11y fixes + migrations 002/003) in clean logical commits.

---

**DFS-P1-C — Tier-1 community invite is gated on the 3 criticals**

Steve recommends NOT inviting any community until C1/C2/C3 are resolved. C2 + C3 are fixed in migration 003 (file written, needs your dashboard apply). C1 is awaiting your design pick above.

When you apply migration 003 + 002 + approve C1's Edge Function approach, the launch gate clears.

---

### 🟡 Decisions piling up (none urgent today; resolve at leisure before respective merges)

| #   | Source                  | Question                                                                                                    | Recommended Default                                              | If unanswered                    |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| 1   | Quinn DFS-1 (Cycle 5)   | Admin sees applicant email? PRIVACY.md D6 says yes; data-minimum says no                                    | **No email** (Quinn defaulted to this; ships without email)      | Edit PRIVACY.md D6 to match      |
| 2   | Quinn DFS-2             | Notify rejected users automatically?                                                                        | **Silent**                                                       | Ships silent                     |
| 3   | Quinn DFS-3             | Lint rule on admin column list?                                                                             | **Skip** — already enforced by unit test in `adminQueue.test.ts` | Ships as-is                      |
| 4   | Quinn DFS-4             | Admin tab placement?                                                                                        | **Between Home & Profile**                                       | Ships there                      |
| 5   | Quinn DFS-5             | Realtime queue badge on tab?                                                                                | **Defer to Cycle 5.5** (Peter channel-count audit first)         | Ships with text-under-title only |
| 6   | Shamus DFS-1 (admin UI) | Tab badge wiring approach?                                                                                  | Same as #5                                                       | n/a                              |
| 7   | Shamus DFS-2            | Detail-view container — in-screen state vs stacked nav screen?                                              | **In-screen state** (shipped)                                    | Ships as-is                      |
| 8   | Shamus DFS-3            | Self-suppression on own-action echoes?                                                                      | **Keep** (shipped)                                               | Ships as-is                      |
| 9   | Dana DFS-1 (002)        | `verification_log.decision` literal for demotes — `demote` vs `auto_demote` vs `suspend`?                   | **`demote`**                                                     | Ships as `demote`                |
| 10  | Dana DFS-2 (003)        | `GRANT DELETE ON storage.objects TO postgres` — should it work on your Supabase plan?                       | Verify in dashboard during apply (Step 3 of briefing)            | Apply pauses if NOTICE emitted   |
| 11  | Dana DFS-3 (003)        | `cron_log.error_text` overloaded as success-side notes (`storage_deleted=N`) — accept or add column in 004? | **Accept overload** (keeps freshness alerts wired)               | Ships overloaded                 |
| 12  | Dana DFS-4              | Orphan-cleanup defense-in-depth cron — migration 004?                                                       | **Defer** unless Steve finds orphans during real-world testing   | Skipped this cycle               |
| 13  | Peter DFS-1             | Add React.memo to ResourceCard component?                                                                   | **Yes, Phase 2**                                                 | n/a until Phase 2                |
| 14  | Peter DFS-2             | Cache signed photo URLs across re-renders in ResourceDetail?                                                | **Yes, Phase 2**                                                 | n/a until Phase 2                |
| 15  | Peter DFS-3             | Use `count='exact'` for ProfileScreen counters instead of full row fetches?                                 | **Yes, Phase 2**                                                 | n/a until Phase 2                |
| 16  | Steve H1/H2             | Add DB CHECK constraint on `contact_handle` URL patterns (defense-in-depth)?                                | **Yes** when migration 004 lands (Phase 2)                       | Skipped until then               |
| 17  | Steve H3                | Wrap `useResources` error display in `userFacingErrorMessage`?                                              | **Yes, Phase 2** (1-line fix)                                    | n/a until Phase 2                |
| 18  | Steve H4                | Add per-screen `is_verified` UI guards inside RootNavigator?                                                | **Defer** — RLS holds; UI guard is belt-and-braces               | Ships with App.tsx + RLS only    |
| 19  | Steve L2                | Latent RLS-recursion shape in `cron_log` policy — patch preemptively?                                       | **Patch in Phase 2** when migrations 004+ land                   | n/a until then                   |

---

### 🆕 New constitutional rule — Design Compiler (Const. Art. 2.4 / CLAUDE.md v1.11)

`~/.claude/CLAUDE.md` updated mid-Phase-1 to require a **7-layer Design Compile gate** on every UI-touching change before Shamus marks UI DONE. The Admin UI + a11y batch landed **before** this rule existed, so they bypassed the gate. Two options:

- **Retroactive compile pass** on Admin UI + a11y fixes (Dani runs the gate now). Defensible but extra cycle time.
- **Grandfather** Phase 1 UI work; require compile for all Phase 2 UI changes onward. Clean line; less rework.

Recommendation: **Grandfather Phase 1; enforce from Phase 2 onward.** The Admin UI + a11y fixes already had Alex's audit (which covers most of layers 1, 2, 6) and the typed-confirmation pattern is reusable.

---

## What landed (per loop)

### Loop 1 — Quinn extends Cycle 5 spec

- **File:** `qa-reports/spec-cycle-5-admin-verification-ui.md` (503 lines)
- 10 ACs, 5 DFS items
- Privacy-load-bearing finding: admin column list belongs in a constant + lint rule; surfaced as DFS-3
- Key insight: realtime channel name MUST NOT include applicant identity (subtle privacy leak)

### Loop 2 — Steve security audit

- **File:** `qa-reports/phase-1-security-audit-2026-05-24.md`
- 16 findings: 3 CRITICAL / 4 HIGH / 5 MEDIUM / 4 LOW
- All 3 criticals address the photo/delete-cascade promise (C1 server-side EXIF, C2 delete cascade, C3 prune cascade)
- Verified clean: signed URL TTL = 1h ✅; bucket PRIVATE ✅; path scheme enforced server-side ✅; atomic claim RPC ✅; realtime filter sourced from `session.user.id` (server-controlled) ✅; contactHandle covers all 8 URL patterns ✅

### Loop 3 — Alex a11y audit

- **File:** `qa-reports/phase-1-a11y-audit-2026-05-24.md`
- 4 screens × 11 criteria = 44 cells: 34 ✅ / 9 ⚠️ / 1 ❌
- 0 launch-blockers
- Token discipline holds — zero raw hex in screens or components
- Cycle 1 baseline (announce-once, EmptyState, reduce-motion) preserved across the new screens

### Loop 4 — Peter performance audit

- **File:** `qa-reports/phase-1-perf-audit-2026-05-24.md`
- 0 launch-blockers / 3 optimize-soon / 5 future-cycle / 18 OK
- All 3 required DB indexes already present (`status, created_at DESC`; `posted_by`; `claimed_by`)
- Channel count clean (2 active per client: own-row + resources-feed)
- Should-do soon: React.memo on ResourceCard, post-merge filter optimization, signed-URL cache

### Loop 5 — Dana auto-suspend migration (002)

- **File:** `supabase/migrations/002_inactive_admin_autosuspend.sql`
- **Briefing:** `qa-reports/phase-1-dana-autosuspend-2026-05-24.md`
- 30-day inactive-admin auto-demotion via pg_cron @ 3:15 UTC
- Re-instate is service-role only (no RPC = no privilege-escalation surface)
- Extends `verification_log.decision` CHECK to allow `'demote'` (Dana DFS-1)

### Loop 6 — Shamus Admin Verification UI (Cycle 5)

- **3 new files:** `AdminVerificationScreen.tsx`, `verificationQueue.ts` (pure helpers), `adminQueue.test.ts` (29 tests)
- **2 modified:** `RootNavigator.tsx` (conditional Admin tab on `is_admin`), `navigation.ts` (typed)
- Test count: 91 → 120 (+29)
- Privacy contract enforced via `ADMIN_VIEWABLE_USER_FIELDS` constant + regression test that fails on any addition (incl. email)
- Realtime channel name is generic `admin-verification-queue` (no per-applicant identity leak)

### Loop 7 — Dana Storage cascade migration (003)

- **File:** `supabase/migrations/003_storage_cascade_on_delete_and_prune.sql`
- **Briefing:** `qa-reports/phase-1-dana-storage-cascade-2026-05-24.md`
- CREATE OR REPLACE on `delete_my_account()` and `prune_expired_resources()` — sweeps Storage paths before row deletes
- Fixes Steve C2 + C3 launch-blockers
- Defensive `GRANT DELETE ON storage.objects TO postgres` with NOTICE fallback (Dana DFS-2)
- 7 edge cases documented (NULL paths, malformed paths, concurrent INSERT, mid-prune row aging, pre-existing orphans, high-volume deletes, pg_cron disabled)

### Loop 8 — Shamus a11y batch

- **6 modified:** `EmptyState.tsx`, `HomeScreen.tsx`, `AddResourceScreen.tsx`, `ResourceDetailScreen.tsx`, `ConfirmationModal.tsx`, `ProfileScreen.tsx`
- **2 new:** `src/lib/typedConfirmation.ts` (pure helper), `typedConfirmation.test.ts` (13 tests)
- Test count: 120 → 133 (+13)
- All 8 items shipped:
  - A-P1-1 EmptyState `role="alert"` opt-in via `variant="error"`
  - A-P1-2 FlatList `role="list"` + pluralizing label
  - A-P1-3 nested photo Pressable label collision fixed (FAB-pattern hiding)
  - A-P1-4 "Photo attached" mounted-ref announce
  - A-P1-7 "Resource details loaded" + "Claim successful" announces
  - A-P1-8 ConfirmationModal `returnFocusRef` + best-effort Android focus trap
  - A-P1-9 typed-confirmation gate on delete-my-account (case-sensitive "DELETE")
- The typed-confirmation pattern is now reusable for any future destructive flow

### Loop 9 — Quinn Phase 2 specs (3 files)

- **Files:**
  - `qa-reports/spec-phase-2-resource-categories.md`
  - `qa-reports/spec-phase-2-pickup-confirmation.md`
  - `qa-reports/spec-phase-2-onboarding-tour.md`
- 10 ACs + 5 DFS per spec
- Privacy: categories = light (abbreviated); pickup confirmation = full Jordan review (Const. 7.6); onboarding tour = light (copy review)
- Cross-spec dependency map: Categories ↔ Pickup Confirmation are independent (migrations don't conflict); ProfileScreen + StatusPill are intersection points Shamus must serialize on; HomeScreen contention with Phase 2 search/filter flagged

---

## Definition of Done — verification

| #   | Item                                                            | Status                                                      |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | All 5 Phase 1 audits complete                                   | ✅                                                          |
| 2   | All Steve criticals addressed (C1 design / C2 fixed / C3 fixed) | 🟡 C1 pending design                                        |
| 3   | All Alex blockers and should-fixes resolved                     | ✅                                                          |
| 4   | Auto-suspend migration 002 written                              | ✅                                                          |
| 5   | Cycle 5 Admin UI built + tested                                 | ✅                                                          |
| 6   | Test count ≥ 100                                                | ✅ (133)                                                    |
| 7   | Toolchain green at close                                        | ✅                                                          |
| 8   | Phase 2 specs ready                                             | ✅ (3 specs)                                                |
| 9   | LEARNINGS entry on RLS-recursion                                | ❌ (blocked on lock for commit; entry drafted in next loop) |
| 10  | Phase 1 closeout briefing                                       | ✅ (this file)                                              |

**8 of 10 done. The 2 incomplete items both wait on Sky** (C1 design pick + git lock clear). Neither blocks future work — Phase 2 spec-writing already completed in this Phase 1 batch.

---

## What's next

**Sky's path forward (in order):**

1. **Read this briefing.** Make decisions on the 3 launch-blockers + the 19 lower-priority DFS items.
2. **Clear `.git/index.lock`** — one command. Unblocks Will.
3. **Decide C1 approach** — recommend Edge Function for server-side EXIF strip.
4. **Apply migrations 002 + 003 via dashboard** (numbered steps in Dana's two briefings). Production-safe; idempotent.
5. **Approve Phase 2 kickoff** — say "start Phase 2" and the team picks up Quinn's 3 specs in parallel.

**Team's recommended Phase 2 starting order:**

- Stream A (Shamus + Dana): Resource categories — schema migration 004 + AddResource picker + HomeScreen filter chips
- Stream B (Shamus + Dana + Jordan): Pickup confirmation — schema migration 005 + new RPC + ResourceDetail UI + ProfileScreen update
- Stream C (Shamus + Dani + Casey + Alex): Onboarding tour — new screen + Gate integration + reduce-motion respect
- Stream D (Will): LEARNINGS entry + Phase-1 commit batch (depends on git lock clear)
- Stream E (Shamus + Dana + Jordan, after Sky approval): C1 server-side EXIF strip via Edge Function

**Constitution v1.3+v1.10+v1.11 compliance:** No external sends from this run. All artifacts in repo. No live DB touched. No commits pushed. Privacy-touching work surfaced to Sky via this Morgan briefing (Constitution Art. 9.4).

— Morgan, 2026-05-24
