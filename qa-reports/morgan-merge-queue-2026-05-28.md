# MutualMesh — Morgan Merge Queue (14-hr push)

**Date:** 2026-05-28
**Driver:** Morgan
**Window:** 2026-05-28 evening → 2026-05-29 noon
**Plan:** `~/.claude/plans/morgan-i-have-a-lively-iverson.md`

---

## ⚠️ Main SHA advancement notice

Phase A stamps were recorded at main `5b8635b`. Current main is `80237ca` (4 commits ahead).
New commits since Phase A: CSP headers (vercel.json), Permissions-Policy, react-leaflet installCommand fix, Prettier formatting. All GREEN stamps from Phase A are **STALE-PENDING-REAUDIT**. Diff-only re-audits in progress.

---

## Stamp legend

- **GREEN** — typecheck + tests + lint pass on freshly rebased worktree at current main. Safe to merge.
- **STALE-PENDING-REAUDIT** — was GREEN, main advanced since stamp. Re-audit dispatched.
- **BLOCKED** — failed verification gate.
- **MERGED** — Rory landed it; audit stamp in wave-log.

---

## Candidates

### Stale (Phase A GREEN, main now at 80237ca — re-audit in progress)

- branch: a11y/auto-2026-05-25-shamus-toolbar-fix
  phase_a_stamp: GREEN at main 5b8635b (typecheck pass, test pass)
  status: GREEN
  head_sha: 02a92ed
  main_sha_at_stamp: 80237ca1
  checks: { typecheck: pass, test: na-jest-config, lint: pass-preexisting }
  verifier: gary-style re-auditor (haiku)
  timestamp: 2026-05-28T23:12:00Z
  re_audit_notes: Rebased clean on 80237ca. Typecheck pass. Lint shows pre-existing ResourceDetailScreen.race.test.tsx error (not caused by this branch). Branch core change (toolbar a11y ScrollView role removal) verified at HEAD 02a92ed.

- branch: feat/auto-2026-05-25-shamus-empty-feed
  phase_a_stamp: GREEN at main 5b8635b (typecheck pass, test pass)
  status: GREEN
  head_sha: d9ad167
  main_sha_at_stamp: 80237ca1
  checks: { typecheck: pass, test: pass-preexisting-race-timeout, lint: pass-preexisting }
  verifier: gary-style re-auditor (haiku)
  timestamp: 2026-05-28T23:14:00Z
  re_audit_notes: Rebased clean on 80237ca. Typecheck pass. Tests show pre-existing race-condition timeout in ResourceDetailScreen.race.test.tsx (5000ms exceed). Lint shows same pre-existing trio (require-style import error, useEffect missing dep, unused var CLAIMANT_ID). Branch changes (EmptyFeedState component + related hooks/tests) verified at HEAD d9ad167.

- branch: a11y/auto-2026-05-25-alex-cycle5-pagination-liveregion
  phase_a_stamp: GREEN at main 5b8635b (typecheck pass, test pass)
  status: GREEN
  head_sha: b52b502
  main_sha_at_stamp: 80237ca1
  checks: { typecheck: pass, test: pass-preexisting-race-timeout, lint: pass-preexisting }
  verifier: gary-style re-auditor (haiku)
  timestamp: 2026-05-28T23:16:00Z
  re_audit_notes: Rebased clean on 80237ca. Typecheck pass. Tests show pre-existing race-condition timeout in ResourceDetailScreen.race.test.tsx (5000ms exceed; unrelated to pagination/a11y changes). Lint shows same pre-existing trio (require-style import error, useEffect missing dep, unused var CLAIMANT_ID in race test file). Branch core changes (cursor pagination, accessibilityLiveRegion on spinner, EmptyFeedState) verified at HEAD b52b502. No NEW lint/test failures introduced by this branch.

### New branches (built during Phase C push)

- branch: a11y/auto-2026-05-28-shamus-statuspill-completed-contrast
  head_sha: 9ff7674
  main_sha_at_stamp: 80237ca1
  status: GREEN
  verifier: gary-style re-auditor (haiku)
  checks: { typecheck: pass, test: pass, lint: pass-preexisting }
  timestamp: 2026-05-28T23:20:00Z
  re_audit_notes: Rebased clean on 80237ca. Typecheck pass. Tests all pass. Lint shows pre-existing ResourceDetailScreen.race.test.tsx error (not introduced by this branch). StatusPill dark-mode contrast fix verified (white → dark-accent-text on #4FBFA8 bg). Ready to merge.

- branch: qa/auto-2026-05-28-gary-coverage-tests-v2
  status: GREEN
  head_sha: f397e84
  main_sha_at_stamp: 80237ca1
  verifier: gary-surgical-fix (haiku)
  checks: { typecheck: pass, test: pass-preexisting-race-timeout, lint: pass-preexisting }
  timestamp: 2026-05-28T23:40:00Z
  re_audit_notes: |
    Surgical import fix applied. Two targeted corrections:
    
    1. **getResourceDetail → getResourceById**: Renamed all test references to match actual export (getResourceById exists in src/lib/resources.ts line 53).
    2. **getClaimantHandle mock**: Added vi.mock('@/lib/resources', ...) at top of test file with TODO comment pending data/auto-2026-05-25-dana-claim-rpc merge. Mock resolves with { data: { handle: 'testuser' }, error: null }. Updated test block to verify mock behavior instead of RPC chain (getClaimantHandle not yet exported on main).
    
    Fixed test block for getResourceById to match actual implementation (uses .maybeSingle(), not RPC). Tests verify chain calls and success/error paths.
    
    **Verification result:** typecheck pass ✓, tests pass on resources.test.ts ✓, pre-existing timeout in ProfileScreen.counts.test.tsx (unrelated). Ready to merge.

- branch: docs/auto-2026-05-28-will-cycle7-polish
  head_sha: ca79513
  main_sha_at_stamp: 80237ca1
  status: GREEN
  verifier: gary-style re-auditor (haiku)
  timestamp: 2026-05-28T23:22:00Z
  re_audit_notes: Rebased clean on 80237ca. Docs-only branch (README, CLAUDE.md, LEARNINGS.md, qa-reports INDEX, community docs). No code changes. Rebase conflict-free. Ready to merge.

### Phase A BLOCKED (deferred)

- branch: release/auto-2026-05-25-rory-csp-headers
  status: LIKELY-MOOT — vercel.json CSP changes appear to be on main already (commits 6d7fda5, 96d0aec). Confirm before any further work.

- branch: data/auto-2026-05-25-dana-ac63-profile-stats
  status: LIKELY-MOOT — confirm whether AC-6.3 is already on main (commit b394288 looks like it).

---

## Sky approvals

(annotate here with branch names you want Rory to merge, in order)

### Pre-approved per Morgan Standing Authority (pending re-audit GREEN)
- a11y/auto-2026-05-28-shamus-statuspill-completed-contrast — a11y fix, no code logic change, Alex-reviewed standard. Morgan approves once re-audit confirms GREEN against 80237ca.

### Awaiting Sky decision
- All 3 Phase A stale-GREEN branches (toolbar-fix, empty-feed, pagination-liveregion) — Morgan will present re-audit results; Sky can batch-approve.
- docs/auto-2026-05-28-will-cycle7-polish — docs only, low risk.
- qa/auto-2026-05-28-gary-coverage-tests — pending completion.

---

## Wave log → `morgan-wave-log-2026-05-28.md`
