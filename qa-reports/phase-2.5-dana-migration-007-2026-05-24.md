# Phase 2.5 — Dana migration 007 (prune completed resources) — 2026-05-24

**Author:** Dana the Backend Engineer
**Branch:** `data/auto-2026-05-24-dana` (file-only; not yet committed by Sky)
**Source spec:** `qa-reports/spec-phase-2-pickup-confirmation.md` — AC-8
**Source briefing carry-forward:** `qa-reports/phase-2-dana-migrations-2026-05-24.md` — DFS-MIG-1 (default chosen: ship 007 as follow-up)
**Source closeout reference:** `qa-reports/phase-2-closeout-2026-05-24.md` — DFS #20 (Sky's recommended default: "Yes — write 007 in Phase 2 closeout")
**Apply:** Sky via Supabase dashboard SQL editor (Dana never applies).

---

## Summary

Single migration file that closes Quinn AC-8 and the PRIVACY.md D7 retention promise for the new `completed` lifecycle state that landed in migration 005. The nightly `prune_expired_resources()` cron job now sweeps a third batch of rows in addition to the two it already handles:

| Branch                  | Predicate                                                                            | Origin                                 |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| (a) stale reserved      | `status='reserved' AND status_changed_at < now() - 30 days`                          | schema.sql + migration 003 (unchanged) |
| (b) stale available     | `status='available' AND created_at < now() - 30 days`                                | schema.sql + migration 003 (unchanged) |
| (c) **completed (NEW)** | `status='completed' AND confirmed_at IS NOT NULL AND confirmed_at < now() - 30 days` | **migration 007 (this file)**          |

Implementation pattern is the same snapshot-then-sweep that migration 003 established: temp tables capture the IDs + photo paths, a single combined storage `DELETE` removes all photos across both batches, then row deletes happen per-batch so per-branch counts are visible. The `cron_log` row format extends migration 003's `storage_deleted=<N>` into `storage_deleted=<N>;completed_deleted=<M>` so any future parser can pull both numbers (and the per-batch breakdown is visible to Sky when reviewing the dashboard).

No schema changes, no new columns, no new tables, no new indexes (migration 005's partial index `resources_confirmed_idx WHERE confirmed_at IS NOT NULL` already supports the new branch's WHERE predicate). No grant changes (migration 003 already granted EXECUTE to postgres; CREATE OR REPLACE preserves it). No new RLS. No new RPC. Purely a function-body replacement.

---

## Sky-apply steps

1. Open Supabase dashboard → SQL Editor → New query.
2. Paste the contents of `supabase/migrations/007_prune_completed_resources.sql`.
3. Run. Expect zero errors. The function is re-installed via `CREATE OR REPLACE`; no DDL on tables/columns/indexes.
4. Verify the function source includes the new branch: `SELECT pg_get_functiondef('public.prune_expired_resources()'::regprocedure);` — expect the body to contain `_prune_completed_targets` and `confirmed_at < now() - INTERVAL '30 days'`.
5. Smoke-test (optional but recommended given the data-deletion blast radius): insert one test resource with `status='completed'`, `confirmed_at = now() - INTERVAL '31 days'`, then `SELECT public.prune_expired_resources();` — confirm the row is gone and the latest `cron_log` row has `success=true` and `error_text` matching `storage_deleted=\d+;completed_deleted=[1-9]\d*`.
6. Verify the pg_cron schedule still exists (no schedule change needed; we only swapped the function body): `SELECT jobname, schedule FROM cron.job WHERE jobname = 'prune_expired_resources_nightly';` — expect one row, schedule `0 3 * * *`.
7. Done. Casey's metric query (`SELECT count(*) FROM public.resources WHERE status='completed' AND confirmed_at > now() - INTERVAL '7 days'`) keeps working; completed rows older than 30 days now auto-prune.

**Apply order vs migrations 004/005/006:** This migration depends on migration 005 (which adds `confirmed_at` and the `'completed'` CHECK value). If 005 hasn't been applied yet, 007 will fail at parse time (the column doesn't exist). Apply 005 first, then 007. No dependency on 004 or 006 either way.

---

## How the format change interacts with existing observability

| Field                           | Pre-007 (after migration 003)                   | Post-007                                      |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------- |
| `cron_log.success`              | `true` on green run, `false` on failure         | Same                                          |
| `cron_log.rows_affected`        | Count of stale rows deleted                     | Count of stale + completed rows deleted (sum) |
| `cron_log.error_text` (success) | `storage_deleted=<N>`                           | `storage_deleted=<N>;completed_deleted=<M>`   |
| `cron_log.error_text` (failure) | `SQLERRM`                                       | Same                                          |
| 36h freshness alert             | Keys off `success + ran_at`, ignores row counts | Same                                          |

Any future parser written against the old `storage_deleted=<N>` format keeps working — the new format is a superset (the prefix `storage_deleted=<N>` still appears at the start of the string).

If Sky later wants the breakdown in dedicated columns rather than packed into `error_text`, that's a Phase 3 schema migration (add `cron_log.stale_deleted INTEGER`, `cron_log.completed_deleted INTEGER`, `cron_log.storage_deleted INTEGER`). Out of scope here.

---

## Why not modify schema.sql?

Per Mutual Mesh convention (Dana role definition + Constitution Art. 1.1 on migrations as files with rollback): once a schema lives in production, mutations ship as numbered migration files with their own rollback. `schema.sql` is the bootstrap-from-scratch script; once migration 002 lands, schema.sql is no longer the source of truth — the migration chain is. Sky may regenerate schema.sql from the dashboard's `pg_dump --schema-only` if a clean-slate setup is ever needed for a new environment, but Dana never touches it after Cycle 0 ships.

---

## DECISIONS FOR SKY

### DFS-MIG7-1 — cron_log format extension (storage_deleted=N;completed_deleted=M)

The task brief said: "extend the existing format to include `completed_deleted=N` alongside the existing fields." Implemented as a semicolon-separated extension. Alternative shapes considered:

- **Comma-separated** (`storage_deleted=N,completed_deleted=M`) — rejected: comma is more commonly used to separate values within a field; semicolon is cleaner as a field separator.
- **Newline-separated** — rejected: harder to grep, harder to read in a single-row SQL viewer.
- **JSON in error_text** (`{"storage_deleted":N,"completed_deleted":M}`) — rejected: error_text remains a plain string for SQLERRM on failure; mixing JSON and plain text in one column is messy. A real `cron_log.metrics JSONB` column would be the Phase 3 path.
- **Dedicated columns** — out of scope; see "How the format change interacts with existing observability" above.

- [ ] Approve semicolon-separated format (default; shipped)
- [ ] Push back — prefer JSON / comma / dedicated columns (Dana re-edits before Sky applies)

### DFS-MIG7-2 — rows_affected is now the SUM of both batches

Migration 003 set `cron_log.rows_affected` to the count of stale rows. This migration sets it to the SUM (stale + completed). Per-batch counts are preserved in `error_text`.

Tradeoffs:

- ✅ **Pro**: any "how many rows did the prune touch yesterday" query (e.g., a Casey-style operational dashboard) returns the right total.
- ✅ **Pro**: keeps the 36h freshness alert wiring unchanged (the alert keys off success + ran_at, not the count).
- ⚠️ **Con**: if any future observability tool plots `rows_affected` over time, the post-007 line will show a step-change upward as completed-row deletes start landing (~30 days after the first user confirms a pickup on staging).

Mitigation: this briefing serves as the changelog. If Sky reviews `cron_log` directly, the breakdown is visible in `error_text`.

- [ ] Approve SUM semantics (default; shipped)
- [ ] Push back — keep `rows_affected` as just the stale count; surface completed count only in `error_text` (Dana re-edits)

### DFS-MIG7-3 — Combined storage sweep vs two separate sweeps

The task brief said: "Sweep storage paths for both batches (combined or two separate sweeps; pick simpler)." Implemented as a single combined sweep (UNION ALL over both temp tables → one `DELETE` against `storage.objects`). Reasoning:

1. One transaction round-trip instead of two.
2. One log field (`storage_deleted=<N>`) instead of two (`storage_deleted_stale=<X>;storage_deleted_completed=<Y>`).
3. Same atomicity guarantees (the whole function is one statement from PostgREST's perspective).

If Sky strongly prefers per-batch storage counts, the alternative is straightforward (two separate `DELETE` blocks, two counters). Not done by default because the task brief explicitly invited the simpler choice.

- [ ] Approve combined sweep (default; shipped)
- [ ] Edit — split into two separate sweeps with per-batch storage counts (Dana re-edits)

### DFS-MIG7-4 — Future cleanup: schema.sql vs migration chain

Out of scope but noting it here so it's not forgotten: as of migration 007, `schema.sql`'s `prune_expired_resources()` body (lines 430-449) is now THREE migrations stale (003 added storage sweep; 005 added the `completed` state; 007 added completed-row pruning). Anyone bootstrapping a fresh Supabase project from `schema.sql` alone would get the original two-branch sweep without storage cascade — not what we want.

Options:

- (a) **Leave it.** Sky applies migrations after schema.sql when setting up a new project. This is the documented flow.
- (b) **Regenerate schema.sql at a known checkpoint.** `pg_dump --schema-only` from a fully migrated Supabase project; commit as the new schema.sql. Done at end of Phase 3 or before Tier-1 invite as a clean baseline.

Recommended default: **(a) leave it for now.** Sky already applies migrations in the documented order. Regeneration is busywork until there's a fresh-environment use case.

- [ ] Approve "leave it" (default; no action needed this cycle)
- [ ] Schedule schema.sql regeneration for end of Phase 3

---

## Definition of done

- ✅ Migration file written: `supabase/migrations/007_prune_completed_resources.sql`
- ✅ Briefing written: `qa-reports/phase-2.5-dana-migration-007-2026-05-24.md` (this file)
- ✅ Header matches 001-006 format (Applied / Author / Source / Privacy note / What it does / Why / Interactions / Idempotent / Permissions / Decisions / Sections / Rollback)
- ✅ Idempotent (`CREATE OR REPLACE FUNCTION`)
- ✅ Rollback block at bottom (commented; restores migration 003 body)
- ✅ COMMENT ON FUNCTION updated to document the three-branch behavior + new log format
- ✅ Reuses migration 003 pattern (snapshot → storage sweep → row delete → log)
- ✅ Existing reserved + available logic preserved untouched
- ✅ Confirmed-batch snapshot in separate temp table
- ✅ Storage sweep combined (UNION ALL); row deletes split per-batch for clean counts
- ✅ Sky applies (Dana does not)
- ✅ No modification to schema.sql or migrations 001-006
- ✅ No external sends (Const. Art. 9.4)
- ✅ No live DB touched (file-only)
- ✅ DECISIONS FOR SKY surfaced for the 4 places Dana made a defensible-but-changeable call

**Constitution v1.3+v1.10+v1.11 compliance:** No external sends. All artifacts in repo. No live DB touched. No commits pushed. Privacy-touching changes (extends the retention promise to a new lifecycle state) surfaced through this briefing for Morgan pickup (Art. 9.4); Jordan's full review of migration 005 already covered the privacy framing for the completed lifecycle state — this migration adds no new admin surface, no new column, no new RPC, no new RLS, so the privacy footprint is unchanged.

— Dana, 2026-05-24
