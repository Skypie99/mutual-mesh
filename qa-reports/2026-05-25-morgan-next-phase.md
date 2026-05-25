---
date: 2026-05-25
author: Morgan
mode: ACTIVE (direct /morgan invocation)
model_tier: sonnet-4-6
project: MutualMesh
coherence_score: 0.97
state_consistency: pass
duplicate_work_detected: no
drift_risk: low
---

# Morgan PM Briefing — Next Phase Plan

**2026-05-25 | Direct invocation | Sky directive: "demo-first review + next phase deployment"**

---

## §1 — Dependency Graph

**nodes:**

- `phase-4-testflight` (Sky, decision-gate) — TestFlight prep; requires Expo account, Apple creds, EAS config
- `phase-3.4-i18n` (Sky, decision-gate) — internationalization; independent of Phase 4
- `dana/type-sync` (Dana, staged-local) — `data/sync-types-mig-002-009-2026-05-24`, 1 commit, not pushed
- `shamus/lint-cleanup` (Shamus, immediate) — remove unused `ResourceRow` import, `src/lib/resources.ts:21`
- `will/branch-close` (Will, immediate) — delete `will/contact-email-2026-05-24` (absorbed into PR #2)
- `rory/push-notif-test` (Rory, dependent) — end-to-end push notification device test
- `rory/phase-4-setup` (Rory, blocked-on-sky) — EAS build config, Expo account wiring

**edges:**

- `shamus/lint-cleanup` → _(independent, no blocking edges)_
- `will/branch-close` → _(independent, no blocking edges)_
- `dana/type-sync` → `main` (low-risk merge after push)
- `rory/push-notif-test` → `rory/phase-4-setup` (test first, then ship prep)
- `phase-4-testflight` → `rory/phase-4-setup` (Sky decision unblocks Rory)
- `phase-3.4-i18n` → _(independent of Phase 4, can run in parallel if Sky decides)_

---

## §2 — System State

### Stable (production-ready)

- **Auth + verification gate** — three-layer: UI (App.tsx) → RLS → Storage RLS
- **Resource categories** — CategoryChip, filter logic, DB enum
- **Pickup confirmation** — ConfirmationModal, claim RPC (atomic)
- **Onboarding** — CompleteProfileScreen, OnboardingTourScreen, WaitingRoomScreen
- **Resource map** — OSM tiles, FSA aggregation, MapToggle, preview sheet (ResourceMapScreen)
- **Push notifications** — 6 functions fully implemented, 3-layer AC-8 gate, schema live
- **Error reporting** — `logError()` → `log-error` Edge Function, PII-stripped client-side, opt-in persisted

### Partial (coded, untested end-to-end)

- **Push notifications device path** — client → Supabase token registration → Edge Function delivery; never tested on a physical device
- **dana type-sync branch** — `data/sync-types-mig-002-009-2026-05-24` exists locally, 1 commit, not pushed to origin. Scope: add `VerificationDecision` demote type to database.ts matching mig 002-009.

### Broken

- Nothing critical.

### Unknown

- **4 cron jobs registered, 0 executions recorded.** First nightly run has not occurred. Status unknown until a cycle fires.
- **Branch protection approval_count post-restore** — ruleset 16811700 re-enabled after Sky's direct push; whether required_approvals was restored to 1 is not confirmed (API response was incomplete).

---

## §3 — Blocked Nodes (DECISIONS FOR SKY)

```
{node: phase-4-testflight,
 why: "No Expo account linked in app.json (missing owner + projectId), eas.json uses placeholder creds (YOUR-STAGING-PROJECT, REPLACE-WITH-*), no Apple/Play credentials, no EAS build ever run",
 unblock: "Sky decides: (A) start Phase 4 now — Rory adds owner/projectId to app.json, fills eas.json with real Apple creds + Supabase env vars, runs: eas build --profile preview --platform ios; OR (B) defer to after Phase 3.4 i18n",
 type: DECISION_FOR_SKY}

{node: dana/type-sync,
 why: "Branch data/sync-types-mig-002-009-2026-05-24 exists locally only — was never pushed to origin. Scope unverified against current main (main is 9 commits ahead of branch base).",
 unblock: "Dana pushes branch, opens PR, Sky reviews 1-commit diff (VerificationDecision demote type sync)",
 type: DECISION_FOR_SKY}

{node: ruleset-approval-count,
 why: "PR #2 was merged via direct push after temporary ruleset disable. Whether required_approvals was restored to 1 is unconfirmed.",
 unblock: "Sky verifies at https://github.com/Skypie99/mutual-mesh/settings/rules — confirm required_approvals = 1 on ruleset 16811700",
 type: DECISION_FOR_SKY}
```

---

## §4 — Next Phase Plan

### Immediate (unblocked, no Sky decision needed)

| #   | Task                                                              | Owner  | Effort | Notes                                                          |
| --- | ----------------------------------------------------------------- | ------ | ------ | -------------------------------------------------------------- |
| 1   | Remove `ResourceRow` unused import from `src/lib/resources.ts:21` | Shamus | 2 min  | Clears only open lint warning; unblocks lint-clean CI baseline |
| 2   | Delete `will/contact-email-2026-05-24` branch                     | Will   | 1 min  | Absorbed into PR #2 commit a435556; branch is dead             |
| 3   | Push `data/sync-types-mig-002-009-2026-05-24` + open PR           | Dana   | 10 min | 1-commit type sync; Sky reviews diff before merge              |

### Dependent on Sky decision (Phase 4 go/no-go)

| #   | Task                                     | Owner | Effort                      | Dependency                                                       |
| --- | ---------------------------------------- | ----- | --------------------------- | ---------------------------------------------------------------- |
| 4   | Push notification end-to-end device test | Rory  | 1–2 hr                      | Physical iOS/Android device; AC-8 gate must complete round-trip  |
| 5   | Phase 4 setup: Expo account + EAS config | Rory  | 2–3 hr                      | Sky approval; requires Apple creds + real Supabase prod env vars |
| 6   | Phase 4: first EAS preview build         | Rory  | 30 min (build time ~20 min) | After item 5 complete                                            |

### Deferred

| #   | Task                             | Notes                                                          |
| --- | -------------------------------- | -------------------------------------------------------------- |
| 7   | Phase 3.4 i18n                   | Not started; independent; can run after Phase 4 or in parallel |
| 8   | Phase 3.3 chat                   | LOCKED — Phase 5 post-TestFlight (const. decision)             |
| 9   | Cron job first-fire verification | Monitor after first nightly run; no action needed now          |

---

## §5 — Team Sequencing

**Execute in this order to minimize merge conflicts and maximize throughput:**

1. **Shamus** — lint cleanup (`src/lib/resources.ts:21`). No dependencies, no branch conflicts. Delivers clean CI baseline immediately.
2. **Will** — delete `will/contact-email-2026-05-24` branch. No dependencies, cleans up dead remote state.
3. **Dana** — push + PR for `data/sync-types-mig-002-009-2026-05-24`. After lint lands on main to avoid trivial rebase.
4. **Rory** — push notification device test (independent of Phase 4 decision). After dana PR reviewed.
5. **Rory (Phase 4)** — EAS setup and first preview build. Requires Sky's Phase 4 go-ahead.
6. **Jordan** — standby. No privacy-touching changes in queue. Will be engaged for i18n display strings if they touch user-facing identity fields.

**Do NOT engage in parallel:** Rory items 4 and 5 are sequential (test confirms client is sound before shipping a build).

---

## DECISIONS FOR SKY (summary)

Three decisions. All are Sky-only.

| #   | Decision                                                     | Where                                                  | Time  |
| --- | ------------------------------------------------------------ | ------------------------------------------------------ | ----- |
| 1   | Phase 4 (TestFlight) or Phase 3.4 (i18n) — which goes first? | Reply to this iMessage                                 | 30s   |
| 2   | Dana's branch — push it now or hold?                         | Reply to this iMessage                                 | 30s   |
| 3   | Verify ruleset 16811700 required_approvals = 1               | https://github.com/Skypie99/mutual-mesh/settings/rules | 2 min |

---

## STATE SNAPSHOT

```yaml
updated: 2026-05-25
cycle: next-phase-planning
active_modules:
  - ResourceMapScreen (OSM tiles, FSA aggregation, MapToggle, preview sheet)
  - PushNotifications (tokens, preferences, security gates — client+schema live, device test pending)
  - ErrorReporting (PII strip pipeline, log_error Edge Function — live)
  - PickupConfirmation (live)
  - ResourceCategories (live)
  - OnboardingComplete (live)
completed_this_cycle:
  - iMessage sent to Sky with state brief + decisions
  - Stale photo-null HIGH issue cleared from memory (code was safe)
  - dana branch location confirmed: local only, 1 commit, not pushed
  - Demo link blocker documented: Phase 4 not started, no Expo account linked
decisions_pending:
  - Phase 4 (TestFlight) vs Phase 3.4 (i18n) ordering — DECISION_FOR_SKY
  - Dana branch push — DECISION_FOR_SKY
  - Ruleset approval count verification — DECISION_FOR_SKY
open_risks:
  - Push notifications untested on real device
  - Cron jobs never fired (4 registered, 0 executions)
  - Ruleset approval count post-restore unconfirmed
known_contradictions: none
next_cycle_intent: >
  After Sky's Phase 4/3.4 decision: Shamus removes lint warning,
  Will closes dead branch, Dana pushes type-sync PR.
  Then Rory begins device test + Phase 4 setup per Sky's direction.
```
