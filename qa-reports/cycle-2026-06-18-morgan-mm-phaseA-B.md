# Cycle — Morgan — MutualMesh Phase A + B — 2026-06-18

```yaml
role: morgan
mode: ACTIVE (Sky-initiated foreground; Opus session, dispatched subagents forced to Sonnet per no-Opus rule)
scope: Phase A (migration 016 apply) + Phase B (open-PR triage → merge/close)
```

## Phase A — migration 016 applied to staging ✅ (Rory, Sky-authorized)

**Sky authorization (2026-06-18):** "Rory does it all and checks with Morgan if he has any questions or worries — I need this to get moving." Scoped to **`mutualmesh-staging` (`cslvjfewxiowdxfoqzre`, zero real users)** only; production/real-data DBs remain Sky-only.

**Result:**
- Migration file fixed (`supabase/migrations/016_rpc_param_rename_drop_p_prefix.sql`): added `DROP FUNCTION IF EXISTS` before each `CREATE OR REPLACE` (Postgres rejects parameter rename without it — error 42P13) + corrected the stale "Migration 015" header → 016. On branch `data/mm-migration-016-fix-2026-06-18`, **PR #38**.
- Applied to staging via Supabase `apply_migration` → `{"success":true}`, no dependency errors on the DROPs.
- **Verified by Morgan independently (read-only `pg_proc`):** `register_push_token(token text, platform text)` and `update_push_preferences(prefs jsonb)` — `p_` prefixes gone. The `PGRST202` native-push blocker is cleared on staging.
- Rollback: re-run migrations 011 + 009 (pure function redefinitions, no data touched).

**DECISIONS_LOG entry to record:** `[MM-MIGRATION-016-RORY-APPLY]` (2026-06-18) — Sky granted Rory a one-time, scoped authority to fix + apply migration 016 to `mutualmesh-staging` only (zero real users). Production / real-data DB applies remain Sky-only. Recorded so the carve-out is deliberate, not ambient.

## Phase B — open-PR triage (experts decided; "experts decide, Rory merges")

Read-only expert panel (Alex / Gary / Shamus / Jordan+Steve / Will) rendered binding verdicts on the 10 open PRs vs current `main` (`4404538`). **Headline: zero are merge-ready.** All 10 predate the big catch-up merges (#35 local-main-advance, #36 guest-demo, #37 web-map) and sit on stale bases with red CI.

| PR | Title | Verdict | Why |
|----|-------|---------|-----|
| **#22** | AC-6.2/6.5 deleteAccount disclosure + AsyncStorage cleanup | **CLOSE — superseded** | Every line already on `main` (commit `df5a457` via PR #35, 2026-05-29). Verified by `git show origin/main`. No privacy/security gap. |
| #33 | StatusPill dark-mode contrast (AA) | REWORK | Fix is correct + not in main (still `text-white`, 2.25:1), single-file, surgical. CI red on stale base `b0ae100`. **Rebase → green → merge** (cleanest of the 9). |
| #5 | resourcemap viewMode default + dedup labels | REWORK | All 3 fixes still wanted + not in main, but #37 rewrote `ResourceMapScreen` → diff won't apply. Rebase + resolve vs PlatformMapView restructure. |
| #32 | +57 coverage tests (resources.ts 0→100%) | REWORK | High-value, not superseded; CI red (lint/typecheck/test). Diagnose + rebase. |
| #10 | install RTL + AsyncStorage tests | REWORK | RTL already in main (#15); nav changes already in main. Only the AsyncStorage IO tests are new — isolate them on a rebase. |
| #23 | AC-6.3 profile unit tests | REWORK | Bundles production code already merged (`d0360bd`/`012ed24`); isolate only the new tests on a rebase. |
| #34 | empty-feed-state UI | REWORK | Feature genuinely absent, but destructures pagination from `useResources()` that the ResourcesContext refactor (#35) removed. Needs rebase **+ pagination wired into ResourcesContext** before it typechecks. |
| #29 | remove invalid ScrollView a11y role | REWORK | Correct fix, but bundled inside the unmerged pagination feature; target ScrollView doesn't exist in main. Land with #30/#34. |
| #30 | pagination aria-live region | REWORK | Valid, but bundles the whole 54-file pagination feature; only meaningful once pagination lands. Coordinate with #29/#34. |
| #31 | Cycle-7 docs polish | REWORK | LEARNINGS additions + qa-report files are valuable + accurate; but README/CLAUDE.md edits re-introduce stale claims (migration count 14, "pending Sky apply", "Cycle 7 underway"). Salvage LEARNINGS + reports; rewrite the stale status text. |

### Rory's Phase B merge actions (executed this cycle)
1. **Close PR #22** as superseded (cite `df5a457` / PR #35, Jordan+Steve verdict).
2. **Merge PR #38** (migration-016 fix) to `main` — clean, current base, SQL+report only — so `main` matches what's live on staging.
3. Leave the 9 REWORK PRs open as the rework backlog below.

## DECISIONS FOR SKY

1. **Rework backlog strategy (9 PRs).** None merge as-is — all need rebase + CI-green, and three (#29/#30/#34) are a single entangled pagination feature. **Recommendation:** don't bulk-rebase. Triage into:
   - **Quick wins to rebase & merge solo:** #33 (1-file AA contrast), #5 (3 small map fixes), #32 + #10 + #23 (isolate the genuinely-new tests). ~1 focused pass each.
   - **One coordinated feature pass:** #34 + #30 + #29 — rebuild pagination/empty-feed/filter-chips on top of the ResourcesContext refactor, with the two a11y fixes folded in. Bigger; needs Shamus + Alex.
   - **#31 docs:** salvage the LEARNINGS.md additions + qa-report files; discard/rewrite the stale README/CLAUDE.md status edits.
   - Or simpler: **close the stale PRs and re-cut the valuable bits fresh** off current `main` (often cheaper than rebasing 3-week-old branches).
2. **Native path (Phase D) is still the real gap to shipping** — `eas.json` needs your Apple/Play credentials; nothing above unblocks that.

## Sources
Expert panel `wf_3780e6d8-f21` (read-only, 5 agents); Rory apply `a8e55758`; live `pg_proc` on `cslvjfewxiowdxfoqzre`; PRs #38 (open), #22/#5/#10/#23/#29/#30/#31/#32/#33 (open); `main` = `4404538`.
