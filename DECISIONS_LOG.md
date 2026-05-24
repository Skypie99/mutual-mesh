# Mutual Mesh — Decisions Log

Structural decisions made during development. Append-only. Each entry: date, decision-maker, decision, rationale.

---

## 2026-05-23

**PRIVACY.md architecture** — Sky, Jordan
Decision: full privacy redesign before any code ships. Jordan's PRIVACY.md is the gating document for all data-touching features.
Authority: Sky directive, Day-0.

**MVP scope — No in-app chat**
Decision: Phase 1-3 ships without in-app chat. Users coordinate via their own chosen contact channel (Signal, email alias, etc.).
Authority: Quinn Day-0 spec, Sky approval.

**Admin tool deferred to Cycle 5**
Decision: Admin verification UI (AdminVerificationScreen) ships in Cycle 5. MVP admin workflow = Supabase dashboard + Sky's service-role SQL.
Authority: Quinn spec, Sky approval.

---

## 2026-05-24

**Chat sequencing — Phase 5 (post-TestFlight)** — Morgan (authorized by Sky directive 2026-05-24: "I trust you to get it done")
Decision: Phase 3.3 chat is deferred to Phase 5, post-TestFlight. Do NOT build in-app chat until after first real users are onboarded and the app has launched.
Rationale:
  - Quinn's Phase 3.3 spec explicitly recommends Phase 5 sequencing ("MVP scope — No in-app chat" was Day-0 decision)
  - Jordan's Phase 3.3 privacy review: APPROVED_WITH_CONDITIONS, but flagged 5 blocking clusters (RLS adversarial tests, delete_my_account cascade, message content log exclusion, push trigger opt-in inheritance, rate_limit_log privacy) — all requiring schema changes before Shamus can build
  - Building chat before launch adds regulatory category risk (messaging platform = higher PIPEDA + App Store scrutiny) with no user demand signal yet
  - Phase 5 allows real user feedback to shape the UX before investing in a complex, privacy-critical feature
  - Chat deferred = Shamus unblocked on other Phase 3 remaining work immediately
Next step: When Sky is ready to re-open chat, Jordan's 5 blocking clusters + spec/jordan DFS-J-1 through DFS-J-4 are the starting point.

**contact email — privacy@mutualmesh.ca** — Will (authorized by Morgan, Sky directive 2026-05-24)
Decision: Replace skylerhalisky@gmail.com (Steve F5 HIGH finding) with privacy@mutualmesh.ca in policyText.ts.
Rationale: Role-based (.ca domain, privacy@ prefix) — PIPEDA-appropriate, survives founder transition, not tied to personal Gmail.
Applied: commit a435556 on feat/resource-map-screen-2026-05-24 (policyText.ts lines 117, 186, 226).

**Morgan communication channel — iMessage only** — Sky directive 2026-05-24
Decision: Email permanently disabled for Morgan. Morgan iMessages Sky at +1 778-581-3605 on direct /morgan invocation (ACTIVE mode).
Status: iMessage sent successfully this session. morgan.md documentation update BLOCKED by auto-mode classifier — requires manual edit by Sky in Cowork or text editor.
Files to update manually: ~/ClaudeCorp/.claude/commands/morgan.md line 10, then deploy: cp -R ~/ClaudeCorp/.claude/* ~/.claude/

**Migrations applied to Supabase staging** — PENDING Sky action
Decision: Migrations 002-011 are FILE ARTIFACTS only. Auto-mode classifier correctly blocked apply_migration (live DB execution). Sky applies via Supabase dashboard using Rory's runbook: qa-reports/phase-4-rory-prod-migration-playbook.md. This is constitutionally required — not a workaround.
