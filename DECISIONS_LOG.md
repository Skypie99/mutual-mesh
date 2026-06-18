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
Files to update manually: ~/ClaudeCorp/.claude/commands/morgan.md line 10, then deploy: cp -R ~/ClaudeCorp/.claude/\* ~/.claude/

**Migrations applied to Supabase staging** — PENDING Sky action
Decision: Migrations 002-011 are FILE ARTIFACTS only. Auto-mode classifier correctly blocked apply_migration (live DB execution). Sky applies via Supabase dashboard using Rory's runbook: qa-reports/phase-4-rory-prod-migration-playbook.md. This is constitutionally required — not a workaround.

---

## 2026-06-05 — Guest demo ship (compiled by /new-window)

[GUEST-DEMO-SYNTHETIC] MutualMesh guest demo (`?demo=1`) is zero-network, synthetic-fixtures-only — a Jordan-approved exception to the "no guest mode" rule; never wire it to live Supabase (see qa-reports/2026-06-05_Jordan_DemoMode_Privacy_Gate.md). — 2026-06-05
[PORTFOLIO-COPY-TRUTHFUL] MutualMesh portfolio copy must state the REAL privacy model (RLS deny-anon, invite-only, handle-only, FSA-level location, EXIF strip, hard-delete) — NOT end-to-end encryption or pilot neighbourhoods (those false claims were removed). — 2026-06-05
[REACT-DOM-PIN] react + react-dom pinned to exact 19.1.0; the `^19.1.0` drift to 19.2.6 silently blanked the Expo-web mount (whole app, incl. live site). — 2026-06-05
[WEB-MAP-STUBBED] PlatformMapView.web.tsx is a placeholder; `leaflet`/`react-leaflet` were never declared deps and broke the prod web build. Restore by declaring both + `.npmrc` legacy-peer-deps; Map toggle is hidden in the demo. — 2026-06-05
[TEST-DEPS-DECLARED] `@testing-library/react-native@^13.3.3` + `react-test-renderer@19.1.0` now declared (were used-but-undeclared); `coverage/` untracked + `coverage/`,`qa-reports/` added to `.prettierignore`. — 2026-06-05
[SOLO-MERGE-RULESET] To merge to MutualMesh `main` in this solo repo: disable→merge→re-enable the `protect-main` ruleset (GitHub forbids self-approval; `gh --admin` bypass needs a bypass-list entry). Sky authorized 2026-06-05. — 2026-06-05

---

## 2026-06-05 (later) — Morgan next-actions cycle

[MIGRATION-016-CONFIRMED-UNAPPLIED] Live read-only introspection of `mutualmesh-staging` (`cslvjfewxiowdxfoqzre`) confirms `016_rpc_param_rename_drop_p_prefix.sql` is **unapplied** — push RPCs still carry `p_`-prefixed params and 016 is absent from `list_migrations`. Native push fails `PGRST202` until applied. Applying is **Sky-only** (live-DB write, Const. Art. 1/5); non-blocking for web/demo. NOTE: the file is **016** (renumbered from 015); Dana's audit's `015_rename` reference was stale and is now corrected in that report. — Morgan 2026-06-05
[WEB-MAP-RESTORE-BRANCH-ONLY] Web-map restore dispatched to Shamus as **branch-only** work (`shamus/restore-web-map-2026-06-05`, worktree-isolated) — no merge, no push-to-deploy. Reversible/optional polish; the live demo runs fine on the stub. Sky merges after review (Const. Art. 1 — only Sky merges main). Guard carried to Shamus: preserve the FSA-only `[2,13]` zoom-floor (LEARNINGS 2026-05-25) — restoring already-Jordan-reviewed map behavior, so no new Jordan gate (Const. 4.5.4). — Morgan 2026-06-05 (standing approval: safe + quality + forward momentum)
[SCREENSHOT-GATED-ON-MAP] Dani's portfolio feed re-shoot is deferred until Sky's web-map merge decision — shoot-with-map vs shoot-without-toggle depends on it. Cosmetic; no rush. — Morgan 2026-06-05
[WEB-MAP-RESTORE-RESULT] Shamus returned **PASS** — web map restored on `shamus/restore-web-map-2026-06-05` (e4c0d52+b29aaeb): typecheck + 441 tests + `expo export -p web` all green, Leaflet lazy-chunked (won't re-blank), FSA `[2,13]` zoom-floor verified in code. Branch-only — **AWAITING SKY MERGE**. The worktree-isolated dispatch left the main tree checked out on the branch; Morgan restored `git checkout main` (main ref stayed safe at 8623d78 == origin/main throughout). — Morgan 2026-06-05
[WEB-MAP-MERGED] Sky authorized "yes merge" (2026-06-05). Morgan ran the disable→merge→re-enable `protect-main` dance (ruleset 16811700, all 4 rules captured + preserved + restored): pushed branch → opened PR #37 → disabled enforcement → merged PR (`--merge`, merge commit `4404538`) → re-enabled enforcement (verified active/4 rules; unprotected window closed immediately). origin/main `8623d78`→`4404538`; leaflet/react-leaflet now on main; local main fast-forwarded; my untracked artifacts intact. Vercel auto-deploys main → live `/?demo=1` gets the real map + visible Map toggle. Rollback: `git revert -m 1 4404538` (+ ruleset dance to push). — Morgan 2026-06-05 (Sky-authorized; ship-it-always)

---

## [MM-MIGRATION-016-RORY-APPLY] — 2026-06-18
Sky granted Rory a one-time, scoped authority to fix + apply migration 016 to mutualmesh-staging only (cslvjfewxiowdxfoqzre; zero real users). Production / real-data DB applies remain Sky-only. Verified applied: register_push_token(token, platform) / update_push_preferences(prefs). Rollback: re-run migrations 011 + 009. Ref: qa-reports/cycle-2026-06-18-morgan-mm-phaseA-B.md, PR #38.
