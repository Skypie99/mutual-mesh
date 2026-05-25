# Morgan Velocity Loop Briefing — Mutual Mesh — 2026-05-24

**Mode:** Direct `/morgan` invocation (ACTIVE)
**Session type:** Velocity self-correcting build loop
**LEARNINGS consulted:** Yes — `LEARNINGS.md` (6 entries through 2026-05-23). Relevant: mounted-ref pattern (Gotcha #5), pure-helper split, PII strip pipeline, `type` not `interface` for DB rows.
**Toolchain at close:** 0 typecheck errors · 365 tests / 20 suites green · 0 lint errors

---

## 1. Dependency Graph

### nodes:

- `stabilization/crash-guards#1` (Morgan-directed, all roles, fix crash risks P1-P6)
- `security/F2-F3#1` (Steve finding, errorReporting.ts — Expo token + HTTP header PII regex)
- `dana/migration-011#1` (Dana, migration — F1 push gate + F4 max-length constraint)
- `jordan/chat-review#1` (Jordan, Phase 3.3 chat privacy review — APPROVED_WITH_CONDITIONS)
- `sky/merge-feat-branch#1` (Sky decision — merge feat/resource-map-screen-2026-05-24 to main)
- `sky/chat-sequence#1` (Sky decision — when to build chat: Phase 3.3 vs Phase 5)
- `sky/contact-email#1` (Sky decision — F5 role-based contact address for policyText.ts)
- `gary/verify-365#1` (Gary, verify 365 tests green after security pass)
- `shamus/chat-build#1` (Shamus, blocked — needs Sky approval + Jordan BLOCKINGs resolved)

### edges:

- `stabilization/crash-guards#1` → `security/F2-F3#1` (gate: clean base before adding heuristics)
- `security/F2-F3#1` → `dana/migration-011#1` (parallel — same security sweep cycle)
- `security/F2-F3#1` → `gary/verify-365#1` (gate: test count must hold after heuristic additions)
- `jordan/chat-review#1` → `shamus/chat-build#1` (safety: Jordan blocking conditions must clear first)
- `sky/chat-sequence#1` → `shamus/chat-build#1` (safety: Sky explicit pre-merge approval required per CLAUDE.md decisions log)
- `sky/merge-feat-branch#1` → (all future cycles) (gate: main must be current before next feature branch)

---

## 2. Reason for Ordering

- **Stabilization first (P0):** `LEARNINGS:2026-05-23 — Mounted-ref pattern in every async screen` — SignInScreen had 4 async handlers, only 2 were guarded after context compaction; completed all 4. Crash guards in photos.ts and type narrowing in resourcesRealtime.ts are load-bearing per `Const. Art. 7.6` (no regression on safety).
- **F2+F3 before F1+F4:** Client-side PII strip is synchronous and self-contained; adding 2 regex entries + tests is a zero-risk, immediate security improvement. Migration 011 required a separate Dana agent invocation (file-write, not code). `LEARNINGS:2026-05-23 — Pure-helper split` confirmed that PII heuristics are pure + testable without external deps — correct to fix inline.
- **Jordan chat review in parallel with security fixes:** Jordan trigger fires on Phase 3.3 (new messaging surface, PII content, RLS change per `Const. Art. 7.6`). Review can proceed in parallel with security fixes because it's read-only. `qa-reports/spec-phase-3-chat.md` was complete. Result: APPROVED_WITH_CONDITIONS — unblocks Shamus once Sky says go.
- **Sky decisions gate chat build:** Per CLAUDE.md decisions log, "MVP scope — No in-app chat" was the Day-0 decision. Phase 3.3 re-enables it. Sky's explicit approval is required before Shamus builds. Quinn's spec itself recommends **Phase 5 (post-launch)** — not building now is the correct call.
- **Branch merge is Sky's action:** `Const. Art. 1` — never modify main; only Sky merges. `feat/resource-map-screen-2026-05-24` is ready for Sky's review.

---

## 3. Blocked Nodes

- {node: `sky/merge-feat-branch#1`, why: 4 commits on feat/resource-map-screen-2026-05-24 await Sky review before merge to main, unblock: Sky reads diff and merges via GitHub, type: DECISION_FOR_SKY}

- {node: `sky/contact-email#1`, why: skylerhalisky@gmail.com is hardcoded in policyText.ts (3 locations) — Steve F5 HIGH. Personal Gmail as public legal contact is a PIPEDA role-separation risk. Cannot be fixed without Sky choosing a dedicated address (e.g. privacy@mutualmesh.ca), type: DECISION_FOR_SKY}

- {node: `sky/chat-sequence#1`, why: Phase 3.3 Chat requires Sky's explicit pre-merge approval per CLAUDE.md decisions log. Jordan APPROVED_WITH_CONDITIONS (privacy only). Quinn + Jordan both recommend deferring to Phase 5 (post-TestFlight). Sky must decide: Phase 3.3 now / Phase 4 / Phase 5 / never., type: DECISION_FOR_SKY}

- {node: `shamus/chat-build#1`, why: blocked by sky/chat-sequence#1 AND 5 Jordan blocking clusters (RLS adversarial tests, delete_my_account cascade, message content log exclusion, push trigger opt-in inheritance, rate_limit_log privacy), unblock: Sky approves sequence + Jordan conditions land in migration, type: BLOCKER}

- {node: `sky/apply-migrations#1`, why: Migrations 002-010 (+ now 011) are FILE ARTIFACTS only — not applied to any live Supabase project. App cannot go live until Sky applies via dashboard using Rory's runbook (qa-reports/phase-4-rory-prod-migration-playbook.md), unblock: Sky follows numbered steps in runbook, type: DECISION_FOR_SKY}

---

## 4. Checkpoint References

- {name: stabilization-pass, role: Morgan-directed, artifact: commit:6a44bcc, qa-report: cycle-2026-05-24-morgan-velocity.md:1}
- {name: security-F2-F3-F1-F4, role: Steve-findings/Morgan-fix/Dana-migration, artifact: commit:4d06b6c, qa-report: phase-3-4-security-sweep-2026-05-24.md:1}
- {name: migration-011-written, role: Dana, artifact: branch:feat/resource-map-screen-2026-05-24, qa-report: phase-3-dana-migration-011 (inline in commit 4d06b6c)}
- {name: jordan-chat-review, role: Jordan, artifact: branch:feat/resource-map-screen-2026-05-24, qa-report: phase-3-jordan-review-chat.md:1}
- {name: resource-map-screen, role: Shamus, artifact: commit:aa8b460, qa-report: feature-2026-05-24-resource-map-screen.md:1}
- {name: phase-3-4-security-sweep, role: Steve, artifact: qa-report:phase-3-4-security-sweep-2026-05-24.md, qa-report: phase-3-4-security-sweep-2026-05-24.md:1}
- {name: gary-365-tests, role: Gary (verified by Morgan toolchain run), artifact: branch:feat/resource-map-screen-2026-05-24#step-verify, qa-report: cycle-2026-05-24-morgan-velocity.md:1}

---

## 5. Duplication Report

No duplications detected this cycle.

Prior 7 days of qa-reports surveyed (2026-05-17 through 2026-05-24, all 30 qa-report files):

- No role was asked to repeat shipped work.
- Dana's migration 011 is additive to migration 010 (no overlap — 010 fixed the UNIQUE constraint; 011 adds security guards to the RPC).
- Jordan's chat review is the first privacy review of Phase 3.3 chat — no prior Jordan pass existed on that spec.
- PII heuristic additions (F2+F3) are new entries to the HEURISTICS array — no overlap with existing entries.
- Background agent stash `data/sync-types-mig-002-009-2026-05-24` is a Dana background sync task — distinct from migration 011, no overlap.

---

## What Shipped This Session

### Committed to `feat/resource-map-screen-2026-05-24` (4 commits ahead of main)

| Commit    | What                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `aa8b460` | ResourceMapScreen (Phase 3.2) — FSA-aggregated map, preview sheet, MapToggle, expo-location stub                             |
| `579d376` | Feature report for ResourceMapScreen                                                                                         |
| `6a44bcc` | Post-build stabilization — 12 fixes across 26 files (crash guards, a11y roles, type safety, privacy markers, key versioning) |
| `4d06b6c` | Security fixes F1-F4: 2 new PII heuristics, 6 new tests, migration 011 (push gate + max-length), Jordan chat review          |

**Toolchain at commit `4d06b6c`:** tsc: 0 errors · jest: 365/20 green · lint: 0 errors

---

## What Is Ready for Next Cycle

1. **Sky merges** `feat/resource-map-screen-2026-05-24` → `main` — this is the green-field handoff
2. **Sky applies** migrations 002-011 via Supabase dashboard (Rory's runbook: `qa-reports/phase-4-rory-prod-migration-playbook.md`)
3. **Sky installs** `npm install expo-location react-native-maps` and flips `MAP_LIBRARY_INSTALLED = true` in ResourceMapScreen.tsx to activate the real map
4. **Sky decides** chat sequence (Phase 3.3 now / Phase 5 / defer) — unblocks or retires Shamus's biggest remaining feature
5. **Sky chooses** a role-based contact address to replace the personal Gmail in policyText.ts (Will makes the text change once Sky decides)

---

## Known Risks and Uncertainties

| Risk                                                         | Severity | Status                                                            |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------- |
| F5: Personal email in policyText.ts                          | HIGH     | DECISION FOR SKY — Will can fix the text once address is chosen   |
| push_token `is_verified` gate missing (Layer 2)              | HIGH     | FIXED in migration 011 — apply via dashboard                      |
| Expo push token + HTTP header token not stripped from errors | HIGH     | FIXED in commit 4d06b6c                                           |
| Branch switch mid-session by background Dana agent           | LOW      | Self-resolved — work recovered and recommitted                    |
| expo-location + react-native-maps not installed              | MEDIUM   | Sky install step — map falls back to chip list UI until installed |
| Migrations 002-011 not applied to any live instance          | CRITICAL | Sky applies via dashboard before any user can sign up             |
| Chat (Phase 3.3) regulatory category change                  | HIGH     | Awaiting Sky sequencing decision — do not build without it        |

---

## Branch Map for Sky (pending merge decisions)

```
main (2 commits — Day 0 only)
├── feat/resource-map-screen-2026-05-24   ← READY FOR MERGE (4 commits, green toolchain)
├── data/sync-types-mig-002-009-2026-05-24  ← Dana background sync (needs review)
├── feat/mutualmesh-2026-05-24-shamus-c1-exif-edge-function  ← EXIF Edge Function
└── privacy/auto-2026-05-24-jordan-phase3  ← Jordan Phase 3 reviews (stashed)
```

Sky merges in order: `feat/resource-map-screen-2026-05-24` first (it's the most complete and passes all checks). Other branches await Sky triage.

---

— Morgan, 2026-05-24
