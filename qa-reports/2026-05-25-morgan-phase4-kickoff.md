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

# Morgan PM Briefing — Phase 4 Kickoff

**2026-05-25 | Handoff acknowledgment | Phase 2–3 complete → Phase 4 execution**

---

## §1 — Dependency Graph

**nodes:**

- `correction/photo-null` (Morgan, immediate) — stale HIGH issue must be cleared from Phase 4 scope before work begins
- `rory/push-notif-device-test` (Rory, validation) — end-to-end push notification on real device
- `rory/error-reporting-e2e` (Rory, validation) — confirm client → log-error Edge Function → DB path fires
- `rory/cron-first-run` (Rory, monitor) — verify 4 cron jobs execute on first nightly fire
- `shamus/resourcemap-polish` (Shamus, product) — ResourceMapScreen UX polish; Design Compiler gate required
- `shamus/lint-cleanup` (Shamus, immediate) — remove unused ResourceRow import, src/lib/resources.ts:21
- `rory/phase4-testflight` (Rory, blocked-on-sky) — TestFlight prep: EAS config, Apple creds, Expo account
- `dana/type-sync-pr` (Dana, unblocked) — push data/sync-types-mig-002-009-2026-05-24, open PR

**edges:**

- `correction/photo-null` → _(resolves before Phase 4 scope is finalized — no blocking edge, just a correction)_
- `shamus/lint-cleanup` → _(independent, no dependencies)_
- `dana/type-sync-pr` → `main` (low-risk, 1 commit; Sky reviews before merge)
- `rory/push-notif-device-test` → `rory/phase4-testflight` (device test must pass before build submission)
- `rory/error-reporting-e2e` → `rory/phase4-testflight` (observability must be confirmed before release sim)
- `rory/cron-first-run` → _(monitor only; no action until first fire occurs)_
- `shamus/resourcemap-polish` → `rory/phase4-testflight` (UX must be stable before release simulation)
- `rory/phase4-testflight` → _(blocked on Sky decision)_

---

## §2 — Reason for Ordering

- **Photo null correction first (CRITICAL — scope integrity):** The handoff lists "photo upload null handling (silent failure path)" as Priority 1. This issue was cleared as STALE on 2026-05-25 during code audit — `AddResourceScreen` properly guards the upload path; errors bubble through the outer try-catch. `ASSUMPTION` — if Sky has observed the silent failure in practice, the bug may exist in a path the audit missed (e.g., `createSignedResourcePhotoUrl` for display rather than upload). Morgan surfaces this as a correction before Rory spends time on a non-existent bug.
- **Lint before ResourceMap polish (Const. Art. 6 — Definition of Done):** A lint warning in a file touched by polish work will cause CI to flag the branch. Clearing it first (Shamus, 2 min) prevents a false CI failure during polish.
- **Device test before TestFlight (LEARNINGS:2026-05-25 — Phase 3.1 push notifications coded but untested):** Client → Edge Function delivery path has never been validated on a physical device. Shipping a TestFlight build without confirming this path would create a silent failure in the release candidate.
- **Error reporting before release sim:** `logError()` → `log-error` Edge Function → DB is the only observability path in the app. Confirming it fires end-to-end before the release simulation means any crash in TestFlight will produce an observable signal.
- **Cron monitor is passive:** 4 jobs registered, 0 executions. No action needed — just watch for first nightly run and report. No dependency on Phase 4 delivery.

---

## §3 — Blocked Nodes

```
{node: rory/phase4-testflight,
 why: "No Expo account linked in app.json (missing owner + projectId), eas.json uses placeholder creds, no Apple/Play credentials configured",
 unblock: "Sky decides: start Phase 4 now (Rory leads EAS setup) or defer until after observability validation",
 type: DECISION_FOR_SKY}

{node: correction/photo-null,
 why: "Handoff lists silent photo failure as Priority 1, but 2026-05-25 code audit found AddResourceScreen properly guarded. Discrepancy unresolved.",
 unblock: "Sky confirms: (A) issue is stale — remove from Phase 4 scope; OR (B) issue exists in a different path (createSignedResourcePhotoUrl display flow) — Rory audits that specific function",
 type: DECISION_FOR_SKY}
```

---

## §4 — Checkpoint References

```
{name: phase4-handoff-received,
 role: morgan,
 artifact: branch:n/a — handoff document,
 qa-report: qa-reports/2026-05-25-morgan-phase4-kickoff.md:1}

{name: photo-null-cleared,
 role: morgan,
 artifact: branch:main#AddResourceScreen.tsx,
 qa-report: qa-reports/2026-05-25-morgan-next-phase.md:1}

{name: governance-amendment-complete,
 role: morgan,
 artifact: commit:~/.claude/CONSTITUTION.md#Art1.2,
 qa-report: qa-reports/2026-05-25-morgan-constitution-amendment.md:1}
```

---

## §5 — Duplication Report

No duplications detected this cycle. Prior 7 days qa-reports surveyed: 2026-05-25-morgan-next-phase.md, 2026-05-25-morgan-release-blockers.md, 2026-05-25-morgan-constitution-amendment.md. No role is being asked to repeat shipped work. Phase 4 scope is new territory (observability validation, device testing, TestFlight prep).

---

## PHASE 4 EXECUTION ORDER

### Immediate (today, no Sky decision needed)

| #   | Task                                      | Owner  | Time   | Notes                                                                     |
| --- | ----------------------------------------- | ------ | ------ | ------------------------------------------------------------------------- |
| 1   | Confirm photo-null scope (stale or real?) | Sky    | 2 min  | DECISION_FOR_SKY — determines if Rory audits createSignedResourcePhotoUrl |
| 2   | Remove ResourceRow unused import          | Shamus | 2 min  | src/lib/resources.ts:21                                                   |
| 3   | Push data/sync-types branch + open PR     | Dana   | 10 min | 1 commit, type sync only                                                  |

### Validation pass (unblocked)

| #   | Task                                             | Owner | Time    | Notes                                             |
| --- | ------------------------------------------------ | ----- | ------- | ------------------------------------------------- |
| 4   | Push notification end-to-end device test         | Rory  | 1–2 hr  | Physical device required; AC-8 round-trip         |
| 5   | Error reporting e2e: client → Edge Function → DB | Rory  | 30 min  | Confirm log_error RPC fires and row appears in DB |
| 6   | Cron job first-run monitor                       | Rory  | passive | Watch; report result after first nightly fire     |

### Polish (after validation)

| #   | Task                          | Owner  | Time | Notes                                           |
| --- | ----------------------------- | ------ | ---- | ----------------------------------------------- |
| 7   | ResourceMapScreen UX polish   | Shamus | TBD  | Design Compiler gate required (Const. Art. 2.4) |
| 8   | Onboarding + auth flow review | Shamus | TBD  | Ensure no silent failure paths remain           |

### Release prep (blocked on Sky + validation)

| #   | Task                                         | Owner | Time   | Notes                                               |
| --- | -------------------------------------------- | ----- | ------ | --------------------------------------------------- |
| 9   | TestFlight: EAS config + first preview build | Rory  | 3–4 hr | Sky go-ahead required; depends on items 4–5 passing |

---

## §6 — STATE SNAPSHOT

```yaml
updated: 2026-05-25
cycle: phase4-kickoff
active_modules:
  - Phase 4 execution planning
  - Governance amendment (complete)
  - Sync router (LOCKED_SAFE — stable)
completed_this_cycle:
  - Constitution Art. 1.2 clarified (Cowork = Sky operating a tool)
  - CLAUDE.md hard prohibitions updated and deployed
  - Phase 2–3 infrastructure complete
  - MutualMesh main stable (13/13 migrations, CI green, 365 tests pass)
decisions_pending:
  - Photo null: stale or real? — DECISION_FOR_SKY
  - Phase 4 / TestFlight go-ahead — DECISION_FOR_SKY
open_risks:
  - Push notifications untested on real device
  - Error reporting DB path unconfirmed
  - Cron jobs never fired (first run pending)
  - Branch protection approval_count post-restore unconfirmed (MutualMesh)
known_contradictions:
  - Handoff lists photo null as Priority 1; code audit says stale. Needs resolution.
next_cycle_intent: >
  After Sky resolves photo-null scope: Shamus clears lint, Dana pushes type-sync,
  Rory begins device test + error reporting validation. Phase 4 delivery sequence
  follows validation results.
```
