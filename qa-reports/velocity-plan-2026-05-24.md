# Velocity Build Plan — Mutual Mesh — 2026-05-24

**Author:** Morgan (Project Manager)
**Mode:** Orchestrator velocity build, ACTIVE (Sky-present); Const. 9.4 still applies — NO external sends from any role, including Morgan, inside this run. All output → `qa-reports/` only.
**Scope:** 3 features (Cycles 2 → 3 → 4) stacked onto integration branch `cycle/mutualmesh-velocity-2026-05-24`. Sky merges manually after review.
**Pre-flight:** GREEN per conductor's verification — PRIVACY.md APPROVED 2026-05-23, BACKGROUND_HALT absent, Cycle 0 + 1 merged to main (`66f4e9e`), Const + AGENT_OS at v1.11. The in-flight `privacy/auto-2026-05-24-jordan-phase3` branch is out-of-scope; this session branches off main.

---

## 1. DECISIONS FOR SKY

> Two items need Sky's resolution. **Item D-V-1 must be answered before Cycle 4 starts** (mid-session, not blocking Cycles 2/3). **Item D-V-2 is a post-build action** (after Sky reviews the integration branch).

- [ ] **D-V-1 — Cycle 4 scope mismatch: Map View vs. Resource Detail + Atomic Claim**
  - **Context:** When the conductor asked Sky to lock the velocity scope, the question text labeled Cycle 4 as "Map View" and Sky approved that label. **However, MutualMesh's actual roadmap in `FEATURES.md` lines 63–71 has Cycle 4 = "Resource Detail + Atomic Claim"**, and `FEATURES.md` lines 110–116 explicitly list Map View as **OUT OF SCOPE for v1**: "text/address only in MVP to reduce location-data exposure." Building Map View would require re-spec'ing `PRIVACY.md` (D3 was postal-prefix-only; map markers introduce a new location precision decision) — much bigger lift than this velocity session can absorb, and a privacy-pillar reopen (Const. 7.6).
  - **Recommendation:** Proceed with Cycle 4 = **Resource Detail + Atomic Claim** (the actual roadmap). This completes the marketplace flow (browse → post → view → claim → see contact handle) and matches the MVP's "no map" privacy posture.
  - **Action if Sky approves the recommendation:** No action needed — the velocity session proceeds as planned in this document.
  - **Action if Sky overrides and wants Map View:** Velocity session HALTS at Cycle 4 boundary; Jordan re-opens `PRIVACY.md` D3 with map-marker precision proposals; new orchestrator cycle scheduled after PRIVACY.md re-approval. Cycles 2 + 3 already shipped on `cycle/mutualmesh-velocity-2026-05-24` remain valid as proposals.
  - **Rollback:** None needed; this is a scope decision, not a change to shipped code.
  - **Why deferred:** Const. 5.3 — privacy-pillar scope change requires Sky's explicit call before Cycle 4 builds. Const. 7.6 — privacy-load-bearing app, location precision is in Sky's authority.
  - **Owner:** Morgan (surfaced during Phase 0 plan review)
  - **Severity:** 🟡 Scope-clarification; halts only Cycle 4, not Cycles 2/3.

- [ ] **D-V-2 — Apply `supabase/schema.sql` to live Supabase**
  - **Context:** The schema file (8 tables + 7 RPCs + 4 triggers + RLS coverage) has existed on main since Cycle 1 but has NOT been applied to a live Supabase project. Cycles 2/3/4 code can ship as **proposals only** until applied. Numbered apply steps are documented in `qa-reports/cycle-1-auth-gate-2026-05-23.md`.
  - **Action:** In Supabase dashboard SQL editor — (1) enable extensions `pgcrypto`, `pg_cron`; (2) run `supabase/schema.sql`; (3) run `supabase/realtime.sql`; (4) set `INSERT INTO public.config (key, value) VALUES ('sky_uuid', '<your-auth-uid>')`; (5) promote yourself to admin via `UPDATE public.users SET is_verified=true, is_admin=true WHERE id='<your-auth-uid>'`; (6) generate first invite token via the SQL snippet in the Cycle 1 report.
  - **Rollback:** Run `DROP TABLE` per table in reverse-dependency order; full rollback SQL in `qa-reports/cycle-1-auth-gate-2026-05-23.md`. Schema is idempotent on re-apply.
  - **Why deferred:** Const. 5.3 — live database is irreversible by design (Const. Art. 1: "Never apply anything to a live database"). Sky-only.
  - **Owner:** Dana (originally surfaced in Cycle 1); Morgan re-surfaces here because Cycle 2 first-class-citizen workflow needs it.
  - **Severity:** 🔴 Required for end-to-end run of Cycles 2/3/4; not required for code review.

---

## 2. BLOCKERS / FAIL_FAST

_(Empty. No blockers detected during Phase 0 planning. Halt-sentinel `~/.claude/BACKGROUND_HALT` absent. Const + AGENT_OS at v1.11. PRIVACY.md APPROVED. No concurrent orchestrator session.)_

---

## 3. Summary

This velocity session will ship proposals for three sequential MutualMesh cycles — **Cycle 2 Marketplace Feed** (read-only `resources` browse with realtime), **Cycle 3 Add Resource + Photo Upload** (privacy-heavy: EXIF strip + PRIVATE Storage bucket + contact_handle validation), and **Cycle 4 Resource Detail + Atomic Claim** (race-safe claim via `claim_resource` RPC + contact_handle reveal on claim). All three build on Cycle 1's auth + verification gate, which is merged to main. The session ships ~8 role-prefixed branches stacked onto `cycle/mutualmesh-velocity-2026-05-24`; Sky reviews, applies `supabase/schema.sql` (D-V-2), and merges. Jordan reviews are mandatory per Const. 7.6 (privacy-load-bearing app) and trigger evaluation shows each feature hits ≥2 Jordan triggers (Cycle 3 hits three). One Phase-0 scope clarification (D-V-1, Map View vs. Resource Detail) needs Sky's call before Cycle 4 starts.

---

## 4. Five-Section Spine (Constitution Art. 9.6 — MANDATORY)

### 4.1 Dependency Graph

**Per-feature nodes** (each entry = role-step pair on its role-prefixed branch):

**Cycle 2 — Marketplace Feed:**

- `quinn/product-cycle-2#step-1 (Quinn, light spec polish)`
- `dani/design-cycle-2#step-1 (Dani, ResourceCard variant audit + FAB design spec)`
- `dana/data-cycle-2#step-1 (Dana, src/lib/resources.ts listResources + realtime wrapper)`
- `jordan/privacy-cycle-2#step-1 (Jordan, privacy review T4 RLS exercise + T3 verified-read)`
- `shamus/feat-cycle-2#step-1 (Shamus, HomeScreen FlatList + ResourceCard wiring)`
- `shamus/feat-cycle-2#step-2 (Shamus, FAB → AddResource navigation stub)`
- `shamus/feat-cycle-2#step-3 (Shamus, realtime subscription wire-up via resourcesRealtime.applyResourceDelta)`
- `steve/qa-cycle-2#step-1 (Steve light, RLS exercise verification + secrets scan)`
- `alex/a11y-cycle-2#step-1 (Alex light, FlatList rendering / empty state / loading skeleton / focus order)`
- `dani/design-compile-cycle-2#step-1 (Dani Design Compiler 7-layer COMMIT/BLOCK/POLISH/ESCALATE)`

**Cycle 3 — Add Resource + Photo Upload:**

- `quinn/product-cycle-3#step-1 (Quinn, light spec polish — photo flow + contact_handle entry)`
- `dani/design-cycle-3#step-1 (Dani, AddResourceScreen form layout + photo affordance + handle warning UI)`
- `dana/data-cycle-3#step-1 (Dana, src/lib/photos.ts EXIF strip + upload + Storage RLS path-scheme exercise)`
- `dana/data-cycle-3#step-2 (Dana, src/lib/resources.ts createResource INSERT)`
- `jordan/privacy-cycle-3#step-1 (Jordan, privacy review T1 location pickup_text + T3 contact_handle + T6 Storage bucket write)`
- `shamus/feat-cycle-3#step-1 (Shamus, AddResourceScreen form fields + validation)`
- `shamus/feat-cycle-3#step-2 (Shamus, photo picker → manipulator → upload integration)`
- `shamus/feat-cycle-3#step-3 (Shamus, contact_handle validator wiring + soft-warn UI)`
- `steve/qa-cycle-3#step-1 (Steve light, Storage RLS path-scheme proof + URL-reject test + secrets scan)`
- `alex/a11y-cycle-3#step-1 (Alex light, form label/error live regions + photo a11y description + 44pt targets)`
- `dani/design-compile-cycle-3#step-1 (Dani Design Compiler 7-layer)`

**Mid-session QA checkpoint** (after Cycle 2 + 3, BEFORE Cycle 4):

- `gary/test-mid#step-1 (Gary, unit tests: resourcesRealtime merge + EXIF strip + handleValidator usage + claim_resource wrapper readiness)`
- `peter/perf-mid#step-1 (Peter, perf: pagination cap usage, photo upload size cost, FlatList realtime render cost, query plan review)`

**Mid-session clean-code pass:**

- `steve/qa-clean#step-1 (Steve, clean-code sweep on Cycle 2+3 — Const. 6.7 premature-abstraction + Const. 6.8 drive-by violations; behavior-preserving)`
- `peter/perf-clean#step-1 (Peter, second perf pass on Dana's query patterns — propose indexes, batching, RPC consolidation)`

**Cycle 4 — Resource Detail + Atomic Claim** (gated on D-V-1 resolution):

- `quinn/product-cycle-4#step-1 (Quinn, light spec polish — claim flow + contact reveal copy)`
- `dani/design-cycle-4#step-1 (Dani, ResourceDetailScreen layout + claim CTA + post-claim reveal state)`
- `dana/data-cycle-4#step-1 (Dana, src/lib/resources.ts claimResource wrapper for supabase.rpc('claim_resource'))`
- `jordan/privacy-cycle-4#step-1 (Jordan, privacy review T3 contact_handle reveal + T4 RPC RLS exercise)`
- `shamus/feat-cycle-4#step-1 (Shamus, ResourceDetailScreen + Claim button + claim result + contact_handle reveal flow)`
- `steve/qa-cycle-4#step-1 (Steve light, race-condition test pair via two-client simulation + RPC RLS audit)`
- `alex/a11y-cycle-4#step-1 (Alex light, focus management on claim success + announce-once for contact reveal)`
- `dani/design-compile-cycle-4#step-1 (Dani Design Compiler 7-layer)`

**Final safety sweep** (across whole integration branch):

- `steve/qa-final#step-1 (Steve, final security & robustness pass across integration)`
- `alex/a11y-final#step-1 (Alex, final WCAG 2.2 AA across all UI — Const. 7.5 BLOCKER if violated)`
- `gary/test-final#step-1 (Gary, typecheck + lint + jest all GREEN + CI workflow runs locally)`
- `will/docs-final#step-1 (Will, README/CLAUDE.md update + LEARNINGS.md new entries per LEARNINGS_TEMPLATE)`
- `morgan/briefing-final#step-1 (Morgan, cycle-velocity-2026-05-24.md with five-section spine, DECISIONS FOR SKY at top, NO external sends)`

**Edges** (`type` ∈ {data, gate, safety, merge}):

Cycle 2:

- `quinn/product-cycle-2#step-1 → dani/design-cycle-2#step-1 (gate: spec-ready)`
- `dani/design-cycle-2#step-1 → dana/data-cycle-2#step-1 (gate: design-spec-ready)`
- `dana/data-cycle-2#step-1 → jordan/privacy-cycle-2#step-1 (data: schema-touched-by-code)`
- `jordan/privacy-cycle-2#step-1 → shamus/feat-cycle-2#step-1 (gate: jordan-approved)`
- `shamus/feat-cycle-2#step-1 → shamus/feat-cycle-2#step-2 (data: HomeScreen wired)`
- `shamus/feat-cycle-2#step-2 → shamus/feat-cycle-2#step-3 (data: nav wired)`
- `shamus/feat-cycle-2#step-3 → steve/qa-cycle-2#step-1 (gate: feature-typecheck-green)`
- `steve/qa-cycle-2#step-1 → alex/a11y-cycle-2#step-1 (safety: security-pass-clean)`
- `alex/a11y-cycle-2#step-1 → dani/design-compile-cycle-2#step-1 (gate: a11y-pass-ready)`
- `dani/design-compile-cycle-2#step-1 → [Cycle 3 start] (gate: COMMIT decision required to advance)`

Cycle 3:

- `[Cycle 2 compile COMMIT] → quinn/product-cycle-3#step-1 (gate: prev-cycle-done)`
- `quinn/product-cycle-3#step-1 → dani/design-cycle-3#step-1 (gate: spec-ready)`
- `dani/design-cycle-3#step-1 → dana/data-cycle-3#step-1 (gate: design-spec-ready)`
- `dana/data-cycle-3#step-1 → dana/data-cycle-3#step-2 (data: photos.ts pre-req for createResource)`
- `dana/data-cycle-3#step-2 → jordan/privacy-cycle-3#step-1 (data: EXIF + Storage + contact_handle paths)`
- `jordan/privacy-cycle-3#step-1 → shamus/feat-cycle-3#step-1 (gate: jordan-approved — HEAVY review, 3 triggers)`
- `shamus/feat-cycle-3#step-1 → shamus/feat-cycle-3#step-2 (data: form scaffold)`
- `shamus/feat-cycle-3#step-2 → shamus/feat-cycle-3#step-3 (data: photo flow before handle wiring)`
- `shamus/feat-cycle-3#step-3 → steve/qa-cycle-3#step-1 (gate: feature-typecheck-green)`
- `steve/qa-cycle-3#step-1 → alex/a11y-cycle-3#step-1 (safety: security-pass-clean)`
- `alex/a11y-cycle-3#step-1 → dani/design-compile-cycle-3#step-1 (gate: a11y-pass-ready)`

Mid-session:

- `dani/design-compile-cycle-3#step-1 → gary/test-mid#step-1 (gate: COMMIT decision required to enter checkpoint)`
- `gary/test-mid#step-1 → peter/perf-mid#step-1 (safety: tests-green)`
- `peter/perf-mid#step-1 → steve/qa-clean#step-1 (safety: perf-baseline-known)`
- `steve/qa-clean#step-1 → peter/perf-clean#step-1 (safety: clean-code-ready)`

Cycle 4 (gated on D-V-1):

- `peter/perf-clean#step-1 → quinn/product-cycle-4#step-1 (gate: mid-session-checkpoint-clean + D-V-1-resolved)`
- (subsequent edges follow the same Quinn → Dani → Dana → Jordan → Shamus → Steve → Alex → Design Compiler pattern)

Final sweep:

- `dani/design-compile-cycle-4#step-1 → steve/qa-final#step-1 (gate: all-cycles-compiled)`
- `steve/qa-final#step-1 → alex/a11y-final#step-1 (safety: final-security-clean)`
- `alex/a11y-final#step-1 → gary/test-final#step-1 (safety: WCAG-AA-clean — Const. 7.5 BLOCKER if not)`
- `gary/test-final#step-1 → will/docs-final#step-1 (gate: CI-green-locally)`
- `will/docs-final#step-1 → morgan/briefing-final#step-1 (gate: docs-distilled)`
- `morgan/briefing-final#step-1 → [merge to cycle/mutualmesh-velocity-2026-05-24] (merge: integration-complete)`

### 4.2 Reason for Ordering

- **Quinn → Dani → Dana → Jordan → Shamus → Steve → Alex → Design Compiler is Const. 4.5.4 only-needed-roles applied to a privacy-load-bearing app.** Jordan inserted mid-graph BEFORE Shamus per Const. 7.6 and `commands/jordan.md` v1.11.4 — every MutualMesh feature hits ≥2 triggers (see Jordan trigger map in section 4.3).
- **Mid-session QA checkpoint after Cycles 2+3, before Cycle 4** matches the velocity prompt's "after every 2 features" cadence. Catching perf/test debt at the midpoint is cheaper than at the end. Cite: velocity prompt section "Mid-session QA checkpoint."
- **Jordan reviews are file-by-file MANDATORY, not advisory.** `commands/jordan.md` (read 2026-05-24) lines 12–13: "Morgan checks these during planning and adds you as a Phase-0 reviewer BEFORE Shamus builds. Your review can BLOCK (privacy-sensitive change not approved) or APPROVE WITH CONDITIONS." Cycle 3 hits T1+T3+T6 — heaviest review of the session.
- **Born accessible** discipline (`LEARNINGS.md:2026-05-23 — Component primitive set + a11y baseline`) means Shamus's vertical slices ship with `accessibilityRole`/`accessibilityLabel`/contrast/44pt-targets/reduced-motion from first commit — Alex's per-feature pass is a verification, not a retrofit. Cite: `LEARNINGS:2026-05-23 — Component primitive set + a11y baseline`.
- **Pure-helper split** (`LEARNINGS:2026-05-23 — Pure-helper split (verification, contactHandle, resourcesRealtime)`) means Cycle 2's realtime wiring layers atop the existing tested `resourcesRealtime.applyResourceDelta` — no new merge logic, just channel-adapter glue in `src/lib/resources.ts`. Gary's test in mid-session covers the adapter, not the merge (already 14 tests).
- **Cycle 1 already shipped real Supabase wiring** (`LEARNINGS:2026-05-23 — Cycle 1: Real Supabase wiring`), so Cycles 2/3/4 inherit the AuthProvider + Gate + RLS posture without re-spec. Cycle 2's `resources` table reads are gated by the existing three-layer `is_verified` defense (UI / DB RLS / Storage RLS) per `CLAUDE.md` Gotcha #8.
- **EXIF stripping is load-bearing in Cycle 3** per `PRIVACY.md` D5 — two-layer (client `expo-image-manipulator` re-encode + server Edge Function re-process). Dana writes the upload pipeline; Jordan validates against D5; Steve audits Storage RLS path-scheme per Gotcha #10. Cite: `PRIVACY.md:48–52` (D5) and `CLAUDE.md` Gotchas #7 + #10.
- **PRIVATE Storage bucket with 1h signed URLs** per `PRIVACY.md` S4 (Steve security audit). Cycle 3's photo upload writes to this bucket; Cycle 2's display fetches signed URLs. Never public. Cite: `PRIVACY.md:267` (S4 approval).
- **Atomic Claim is an RPC** (`CLAUDE.md` Gotcha #9, `LEARNINGS:2026-05-23 — Cycle 1` load-bearing pattern #4) — Cycle 4 uses `supabase.rpc('claim_resource')`. Direct UPDATE is racy and rejected. Steve's race-condition test is a two-client simulation. Cite: `CLAUDE.md:250` (Gotcha #9) and `LEARNINGS:2026-05-23 — Cycle 1` pattern (4).
- **No real names anywhere** (D1/D2 EDITED per `PRIVACY.md:138–143`) — `handleValidator.ts` (Cycle 1) already soft-warns; Cycle 3 wires the same validator into the `contact_handle` field at posting time, plus Steve's S3 length-cap (64) + URL rejection. Cite: `PRIVACY.md:138–143` (D1/D2 EDITED) and `PRIVACY.md:281` (S3 approval).
- **Pagination cap from day one** (`CLAUDE.md` Gotcha #6) — `listResources` ships with `.limit(500)` + JSDoc cursor-pagination TODO. Cite: `CLAUDE.md` Gotcha #6.
- **Mounted-ref pattern in async screens** (`CLAUDE.md` Gotcha #5, `LEARNINGS:2026-05-23 — Push 2: announce-once via mounted-ref`) — Cycle 2's HomeScreen + Cycle 3's AddResource + Cycle 4's Detail all use it. `FlashBanner`'s announce-once edge-detector applies to Cycle 3 (post-upload toast) and Cycle 4 (post-claim contact reveal). Cite: `CLAUDE.md` Gotcha #5 + `LEARNINGS:2026-05-23 — Push 2`.
- **`useReducedMotion` skip-not-soften** (`LEARNINGS:2026-05-23 — Push 2: skip animation when reducedMotion is true`) — Cycle 3's photo-upload progress animation + Cycle 4's claim success animation respect this. No "lighter" animation; just set values directly.
- **No third-party SDKs** (`PRIVACY.md` D8, `LEARNINGS:2026-05-23 — Push 2: NO third-party error tracking`) — Cycle 3's error handling logs `console.warn` only; no Sentry, no analytics. Cite: `PRIVACY.md:226` (D8 approval) and `LEARNINGS:2026-05-23 — Push 2`.
- **Toolchain gotchas are fully captured in LEARNINGS** — `worklets` dev-dep + `eslint-config-expo` drop both already resolved in Cycle 0. Gary's mid-session test step inherits the green baseline. Cite: `LEARNINGS:2026-05-23 — Phase 0a toolchain stack & two fixes worth remembering`.
- **Database type `type` not `interface`** (`CLAUDE.md` Gotcha #1, AccessMap inherited LEARNINGS) — Dana's new `database.ts` additions for any new Row/Insert/Update shapes MUST use `type`. Already correct in current `src/types/database.ts`; Dana's new additions extend the same pattern. Cite: `CLAUDE.md:216` (Gotcha #1).
- **NativeWind tokens only, no raw hex** (`CLAUDE.md` Gotcha #2, Const. Art. 2.2) — all Cycle 2/3/4 colors flow through `src/lib/theme.ts`. Dani's design tokens already cleared WCAG 2.2 AA (`LEARNINGS:2026-05-23 — Design tokens with documented contrast ratios`). Cite: `CLAUDE.md:218` + Const. Art. 2.2.
- **Cycle 4 = Resource Detail + Atomic Claim, NOT Map View** — `FEATURES.md:63–71` defines Cycle 4 explicitly; `FEATURES.md:110–116` lists Map View as out-of-scope for v1 because of location-data exposure. Building Map View is a PRIVACY.md re-open (D3 was postal-prefix-only). **ASSUMPTION** flagged: Sky's earlier "Map View" answer was based on conductor's incorrect labeling; surfaced as **D-V-1** for Sky to confirm. Plan proceeds with Resource Detail + Atomic Claim unless Sky overrides.
- **Const. 9.4 NO EXTERNAL SENDS** applies to ALL roles in this run, including Morgan. Final briefing goes to `qa-reports/cycle-velocity-2026-05-24.md` only. No email, no Slack, no push. Cite: Const. 9.4 + `commands/morgan.md` (skill brief read 2026-05-24).
- **Design Compiler gates each UI-touching cycle's DONE** per Const. Art. 2.4. Output is `qa-reports/2026-05-24_DesignCompile_<feature>.md` with COMMIT / BLOCK / POLISH / ESCALATE. Shamus cannot mark cycle DONE without COMMIT. Cite: Const. Art. 2.4 + `~/ClaudeCorp/docs/DESIGN_COMPILER.md`.

**Jordan trigger map (per Const. 7.6 + `commands/jordan.md` v1.11.4):**

| Cycle | Feature                 | T1 location                                                               | T2 disability | T3 PII beyond auth                 | T4 RLS/auth/session            | T5 external API | T6 new persistence             | Verdict                      |
| ----- | ----------------------- | ------------------------------------------------------------------------- | ------------- | ---------------------------------- | ------------------------------ | --------------- | ------------------------------ | ---------------------------- |
| 2     | Marketplace Feed        | —                                                                         | —             | ✓ (read user-supplied content)     | ✓ (exercise verified-only RLS) | —               | —                              | 2 triggers, expected APPROVE |
| 3     | Add Resource + Photo    | ✓ (pickup_text — but D3 postal-prefix-only and user controls granularity) | —             | ✓ (contact_handle + photo)         | — (RLS exists from Cycle 1)    | —               | ✓ (Storage bucket first write) | 3 triggers, HEAVY review     |
| 4     | Resource Detail + Claim | —                                                                         | —             | ✓ (contact_handle reveal on claim) | ✓ (RPC RLS exercise)           | —               | —                              | 2 triggers, expected APPROVE |

### 4.3 Blocked Nodes

- `{node: cycle-4-build-start, why: "Sky must confirm Cycle 4 scope = Resource Detail + Atomic Claim (per FEATURES.md), not Map View (out-of-scope per PRIVACY.md D3 + FEATURES.md:110)", unblock: "Sky's call on D-V-1 in this plan", type: DECISION_FOR_SKY}`
- `{node: cycle-2-3-4-end-to-end-run, why: "supabase/schema.sql not yet applied to live Supabase project", unblock: "Sky applies schema via dashboard per D-V-2 in this plan", type: DECISION_FOR_SKY}`

### 4.4 Checkpoint References

- `{name: cycle-1-baseline, role: prior-cycle, artifact: commit:66f4e9e, qa-report: qa-reports/cycle-1-auth-gate-2026-05-23.md:line-1}`
- `{name: privacy-approved, role: jordan, artifact: branch:main#PRIVACY.md, qa-report: PRIVACY.md:3}`
- `{name: design-tokens-locked, role: dani, artifact: branch:main#DESIGN.md, qa-report: qa-reports/2026-05-23_a11y-tokens.md:1}`
- `{name: pure-helpers-tested, role: gary, artifact: commit:66f4e9e#src/__tests__/, qa-report: LEARNINGS.md:30-43}`
- `{name: cycle-2-shamus-done, role: shamus, artifact: branch:feat/auto-mutualmesh-2026-05-24#cycle-2-final, qa-report: TBD (Shamus writes after build)}`
- `{name: cycle-2-design-compile, role: dani, artifact: branch:design/auto-mutualmesh-2026-05-24#compile-cycle-2, qa-report: qa-reports/2026-05-24_DesignCompile_marketplace-feed.md:1}`
- `{name: cycle-3-shamus-done, role: shamus, artifact: branch:feat/auto-mutualmesh-2026-05-24#cycle-3-final, qa-report: TBD}`
- `{name: cycle-3-design-compile, role: dani, artifact: branch:design/auto-mutualmesh-2026-05-24#compile-cycle-3, qa-report: qa-reports/2026-05-24_DesignCompile_add-resource.md:1}`
- `{name: mid-session-qa-green, role: gary+peter, artifact: branch:test/auto-mutualmesh-2026-05-24#mid + branch:perf/auto-mutualmesh-2026-05-24#mid, qa-report: TBD}`
- `{name: cycle-4-shamus-done, role: shamus, artifact: branch:feat/auto-mutualmesh-2026-05-24#cycle-4-final, qa-report: TBD}`
- `{name: cycle-4-design-compile, role: dani, artifact: branch:design/auto-mutualmesh-2026-05-24#compile-cycle-4, qa-report: qa-reports/2026-05-24_DesignCompile_resource-detail-claim.md:1}`
- `{name: final-safety-sweep-green, role: steve+alex+gary, artifact: branch:qa/auto-mutualmesh-2026-05-24#final + branch:a11y/auto-mutualmesh-2026-05-24#final + branch:test/auto-mutualmesh-2026-05-24#final, qa-report: TBD}`
- `{name: morgan-final-briefing, role: morgan, artifact: branch:cycle/mutualmesh-velocity-2026-05-24, qa-report: qa-reports/cycle-velocity-2026-05-24.md:1}`

### 4.5 Duplication Report

**Surveyed:** last 7 days of `~/MutualMesh/qa-reports/` (29 files, latest 2026-05-24 04:02). Reviewed `phase-1-a11y-audit-2026-05-24.md`, `phase-1-security-audit-2026-05-24.md`, `phase-1-perf-audit-2026-05-24.md`, `phase-2-closeout-2026-05-24.md`, `phase-3-jordan-review-*.md`, `2026-05-23_spec-cycle-1-auth-gate.md`.

**No duplications detected this cycle.**

Reasoning:

- The in-flight `privacy/auto-2026-05-24-jordan-phase3` branch is adding **Phase 2+** features (onboarding tour, resource categories, pickup confirmation, i18n spec, map spec, push-notifications spec, admin queue, policies/TOS) — these are Cycle 5+ scope per `FEATURES.md`, separate from the Cycle 2/3/4 work in this velocity session.
- Cycles 2, 3, 4 specs in `FEATURES.md` lines 41–71 have not been built yet (Cycle 1 is on main; Cycles 2–7 are roadmap).
- No prior `cycle-velocity-*.md` or `velocity-plan-*.md` exists in qa-reports.
- The phase audits (a11y / security / perf) from 2026-05-24 covered Cycle 1's shipped code, not Cycle 2/3/4 work — those will be re-touched on the new feature surface in mid-session and final sweeps, which is intentional incremental coverage, not duplication.

---

## 5. Per-Feature Pipeline Details

### Cycle 2 — Marketplace Feed (Home)

**Source spec:** `FEATURES.md:41–51`
**Files Shamus writes** (new or modified, all on `feat/auto-mutualmesh-2026-05-24`):

- `src/screens/HomeScreen.tsx` — FlatList of `resources` where `status='available'`, FAB → AddResource (Cycle 3), loading + empty + error states
- `src/components/ResourceCard.tsx` — image (signed URL), name, status pill, press → ResourceDetail (Cycle 4)
- `src/lib/resources.ts` (Dana) — `listResources()`, `subscribeResourcesRealtime()` channel adapter
- `src/__tests__/resources.test.ts` (Gary mid-session) — adapter behavior; merge tested already

**Jordan review focus:** verified-only RLS exercise (T4); signed-URL display of user-supplied photos (T3 read).

**Design Compiler (Dani Layer 7):** must hit ≥75 Visual Entropy, ≥15/20 Cohesion, parity matrix clean.

### Cycle 3 — Add Resource + Photo Upload

**Source spec:** `FEATURES.md:53–61`
**Files Shamus writes** (new or modified):

- `src/screens/AddResourceScreen.tsx` — form (name 64ch / description 280ch / pickup_text 280ch / contact_handle 64ch validated), photo picker integration, submit flow
- `src/lib/photos.ts` (Dana) — `pickAndStripPhoto()`, `uploadResourcePhoto(userId, localUri)` enforcing `<userId>/<ts>.<ext>` Storage path
- `src/lib/resources.ts` (Dana) — `createResource()` INSERT (posted_by = auth.uid(), status = 'available')
- `src/__tests__/photos.test.ts` (Gary mid-session) — assert manipulated EXIF empty before upload (PRIVACY.md D5 test gate)

**Jordan review focus:** EXIF strip D5 conformance + Storage S4 PRIVATE bucket + signed URLs only + contact_handle D2/S3 validation + pickup_text S3 sanitization + Storage RLS path-scheme. **HEAVY review — 3 triggers.**

**Steve audit:** Storage RLS path-scheme proof (file written to `<other-user-id>/...` rejected by RLS); URL-reject in `contact_handle`; length caps enforced; no secrets committed.

**Design Compiler:** form layouts pass tokenization (Layer 1), error live regions pass A11y Parity (Layer 2), photo affordance consistent with existing primitives (Layer 3).

### Cycle 4 — Resource Detail + Atomic Claim

**Source spec:** `FEATURES.md:63–71` (NOT Map View)
**Files Shamus writes** (new or modified):

- `src/screens/ResourceDetailScreen.tsx` — image, name, description, pickup_text, status, Claim button (gated on `status='available' && posted_by !== auth.uid()`)
- `src/lib/resources.ts` (Dana) — `claimResource(resourceId)` wraps `supabase.rpc('claim_resource', { resource_id })`; returns `{ ok: true, contact_handle } | { ok: false, reason }`
- `src/__tests__/resources-claim.test.ts` (Steve / Gary) — two-client race simulation (one winner; loser sees `already-reserved`)

**Jordan review focus:** contact_handle reveal flow (T3) — only to claimant, only on success, never logged. RPC exercise of existing RLS (T4).

**Steve audit:** race-condition test pair; RPC security-definer behavior; rejection of self-claim and double-claim.

**Design Compiler:** post-claim contact reveal state passes Regression Safety (Layer 6) — no animations during reduced-motion; announce-once via mounted-ref.

---

## 6. Hard Rules Enforced (Const. v1.11 — non-negotiable, surfaced for every role)

- **NO live Supabase apply** — schema is FILE only (Const. Art. 1; `CLAUDE.md`:267).
- **NO external sends** (Const. 9.4) — no email, Slack, push, deploy, app-store inside this orchestrator run, including Morgan.
- **NO secrets in commits** — Steve halts + escalates via Morgan as DECISION FOR SKY.
- **Typecheck GREEN at every handoff** — red = FAIL_FAST (Const. 8.1) → Orion local recovery first (max 3 attempts, NEW EVIDENCE per retry per Const. 8.7.4) → halt feature if no safe path.
- **Jordan can BLOCK any privacy-touching feature** (Const. 7.6) → move to next, surface as DECISION.
- **NO subagent spawning inside the orchestrator** (Const. 1.1) — exception: Morgan's Phase 0 (≤3 parallel `Explore`).
- **NEVER modify `main`** — Sky merges.
- **NEVER touch `~/.claude/**`or`~/ClaudeCorp/.claude/**`** (Const. 12.6 hard exclusion).
- **Database types use `type` not `interface`** (`CLAUDE.md` Gotcha #1; AccessMap inherited LEARNINGS).
- **NativeWind tokens only** — no raw hex, no ad-hoc spacing (Const. 2.2; `CLAUDE.md` Gotcha #2).
- **EXIF strip mandatory on every photo upload** (`PRIVACY.md` D5; `CLAUDE.md` Gotcha #7).
- **PRIVATE Storage bucket + 1h signed URLs** (`PRIVACY.md` S4).
- **Atomic Claim is an RPC, not a client UPDATE** (`CLAUDE.md` Gotcha #9).
- **Pagination cap from day one** — `.limit(500)` + cursor-pagination TODO (`CLAUDE.md` Gotcha #6).
- **Mounted-ref + announce-once for async UI** (`LEARNINGS:2026-05-23 — Push 2`).
- **Skip-not-soften for `useReducedMotion`** (`LEARNINGS:2026-05-23 — Push 2`).
- **No third-party SDKs** (`PRIVACY.md` D8; `LEARNINGS:2026-05-23 — Push 2`).

---

## 7. Effort Routing (AGENT_OS v1.11 MODEL ROUTING)

- **Opus (think hardest):** This Phase 0 plan (Morgan); Jordan trigger evaluation per feature; Jordan privacy reviews (T1+T3+T6 Cycle 3 is the deepest); Dana RLS + claim_resource race-condition analysis (Cycle 4); Steve security findings; Dani Design Compiler Layer 7 decisions.
- **Sonnet (normal):** Quinn spec polish; Shamus vertical slice builds; Alex per-feature WCAG passes; Peter behavior-preserving optimizations.
- **Haiku (lighter):** Gary mechanical lint/test setup; Will docs updates.
- **Safety / privacy / a11y default UP one tier — never down.**

---

## 8. Stop Conditions (per velocity prompt)

Stop cleanly when ANY:

- 3 features complete + safety sweep done + Morgan briefing written.
- Capacity is low (Const. 8.5.3 — finish current role to green typecheck, run sweep, write briefing).
- No safe forward work remains (e.g., Jordan blocks the remaining features → triage time).
- A pillar finding (Const. 7) requires Sky's input before any other feature can proceed.
- Sky's call on D-V-1 (Map View vs. Resource Detail) is "Map View" — HALT at Cycle 4 boundary, ship Cycles 2+3 only, surface PRIVACY.md re-open in Morgan's final briefing.

---

## 9. Verification (post-session, for Sky)

1. **Read `qa-reports/cycle-velocity-2026-05-24.md` first** (Morgan's final briefing). Walk the **DECISIONS FOR SKY** list top to bottom.
2. **Resolve D-V-1** (Map View vs. Resource Detail) if not already resolved during the run.
3. **Resolve D-V-2** — apply `supabase/schema.sql` via Supabase dashboard (numbered steps in `qa-reports/cycle-1-auth-gate-2026-05-23.md`).
4. **Inspect integration branch:** `cd ~/MutualMesh && git diff main..cycle/mutualmesh-velocity-2026-05-24`.
5. **Verify tests:** `npm run typecheck && npm run lint && npm test` — all GREEN per Gary's final sweep.
6. **Run app:** `cd ~/MutualMesh && npx expo start` — exercise auth gate (Cycle 1), marketplace feed (Cycle 2), add resource flow (Cycle 3), claim flow (Cycle 4) — post-schema-apply.
7. **Spot-check Design Compiler reports** — each cycle's `2026-05-24_DesignCompile_*.md` should be COMMIT or POLISH; BLOCK = Sky decides.
8. **Merge selectively:** `git checkout main && git merge cycle/mutualmesh-velocity-2026-05-24` for whole-cycle, or `git cherry-pick` per role branch (`feat/`, `data/`, `design/`, `a11y/`, `qa/`, `perf/`, `test/`, `privacy/`).

---

## 6.5 Process Self-Check (Const. 9.6 + Patch 3)

### Efficiency Check

Phase 0 planning used: 5 Read calls (FEATURES, PRIVACY, LEARNINGS, jordan.md, CLAUDE.md) + 2 Bash calls (template peek, git survey) in parallel. The conductor's earlier 2 parallel Explore agents (`MutualMesh state` + `Claude Corp runtime`) already covered the project + governance state; this phase did NOT re-survey what they covered. **Subagent budget respected** — 0 additional subagents used in Phase 0; well under the 3-agent cap.

### Coverage Check

- Const. 9.6 five-section spine — present and structurally valid (Dependency Graph nodes + edges, Reason for Ordering bullets with cites, Blocked Nodes tuples, Checkpoint References tuples, Duplication Report explicit).
- `LEARNINGS.md` consulted — 6 entries cited by date + title in section 4.2.
- Jordan triggers — evaluated per feature in section 4.2 trigger map; ≥2 triggers each, Cycle 3 hits 3 (HEAVY).
- D-V-1 scope discrepancy surfaced as DECISIONS FOR SKY at top — caught Phase-0, before any code work.
- D-V-2 schema-apply prerequisite surfaced — caught Phase-0.

### Drift Check

No prior `velocity-plan-*` or `cycle-velocity-*` exists in qa-reports — this is the first velocity session for MutualMesh, no drift from prior runs. Cycle 1's shipped patterns (pure-helper split, mounted-ref announce-once, skip-not-soften, NativeWind tokens, `type` not `interface`, .limit(500)) are inherited and cited in section 4.2 — Cycle 2/3/4 work extends, doesn't drift.

---

**End of Phase 0 plan. Awaiting conductor's call to begin Phase 1 (Cycle 2 Marketplace Feed — Quinn first).**

---

_Filed by Morgan, 2026-05-24. No external sends (Const. 9.4)._
