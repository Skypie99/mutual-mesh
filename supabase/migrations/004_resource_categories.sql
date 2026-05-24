-- Migration 004 — Resource categories (Phase 2 #6)
-- Applied: <pending Sky apply>
-- Author: Dana, 2026-05-24 — implements Quinn's spec:
--   qa-reports/spec-phase-2-resource-categories.md
-- Privacy authority: PRIVACY.md APPROVED 🟢 2026-05-23.
--   Categories are NOT PII; Quinn's spec §"Privacy considerations" expects a
--   one-line Jordan sign-off, not a full review. Filed for completeness per
--   Constitution Art. 7.6 trigger ("privacy-sensitive" check on any user-data
--   field). Threat-model note on the HRT enum value is documented in the spec
--   under DFS-3 and inherited here (single-table HRT, RLS-gated, no change to
--   subpoena risk shape).
--
-- WHAT IT DOES
-- ============
-- Adds a single new column `category` to `public.resources` with a fixed
-- 5-value enum (food / hygiene / baby / hrt / other) enforced by a CHECK
-- constraint. Adds a composite index on (category, status, created_at DESC)
-- that supports the HomeScreen filter-chip query introduced in Phase 2.
-- Existing rows backfill to 'other' automatically via the column's NOT NULL
-- + DEFAULT clause — no separate UPDATE is required.
--
-- WHY
-- ===
-- Quinn's spec AC-1 + AC-2: every existing resource gets `category='other'`
-- on apply; new posts must pick a category from the fixed enum. The index
-- supports the dominant feed query introduced in Phase 2 #6 (HomeScreen
-- "show me only HRT" or "show me food + baby"):
--
--     SELECT *
--     FROM public.resources
--     WHERE status = 'available'
--       AND category IN ($filter_set)
--     ORDER BY created_at DESC
--     LIMIT 500;
--
-- Without this composite index, the planner falls back to the existing
-- (status, created_at) index and post-filters category in memory. At <500
-- rows this is fine (CLAUDE.md gotcha #6) but the index is cheap to maintain
-- and is the right shape for growth. Quinn's spec §"Performance considerations"
-- documents the choice.
--
-- ROLLBACK
-- ========
-- Commented-out block at the bottom drops the index, then drops the column.
-- DROP COLUMN cascades the CHECK constraint and any dependent views/RPCs
-- (none exist today). WARNING: dropping the column hard-deletes every
-- category assignment users made between this migration's apply and the
-- rollback. There is no automatic backup of column data. Treat rollback as
-- one-way for user-supplied category values.
--
-- IDEMPOTENT
-- ==========
-- - `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+) makes the ALTER TABLE
--   re-runnable. Safe to apply multiple times without error.
-- - `CREATE INDEX IF NOT EXISTS` guards the index creation.
-- - The `COMMENT ON COLUMN` is idempotent by definition (overwrites).
-- - Pre-check via pg_attribute (belt-and-braces) wrapped in a DO block; the
--   guard exists to make a re-apply on an older Postgres explicit — no-op
--   on fresh apply, no-op on re-apply.
--
-- DECISIONS / ASSUMPTIONS — FLAGS FOR SKY
-- =======================================
-- 1. (CASING — HRT) Reconciled to UPPERCASE 'HRT' on 2026-05-24 to match
--    the spec's DFS-1 default, the TypeScript `ResourceCategory` type in
--    src/types/database.ts, and persona usage (Keo). Shamus's Phase 2 build
--    flagged this as a real mismatch: the TS layer sends 'HRT' on insert;
--    if the migration shipped 'hrt' lowercase, every createResource with
--    category='HRT' would fail SQLSTATE 23514 against the CHECK constraint.
--    HRT is stored uppercase as the canonical acronym (matches "HIV", "PrEP",
--    etc. — all uppercase acronyms in health-domain enums). UI renders the
--    raw value.
-- 2. (INDEX NAME) Dana's task brief named the index `resources_category_status_idx`.
--    The spec's illustrative sketch used `idx_resources_category_status`.
--    **This migration ships `resources_category_status_idx`** per the task
--    brief. The two existing prefix conventions in schema.sql are mixed
--    (`idx_resources_status_created`, `idx_resources_posted_by`); adopting
--    the `<table>_<cols>_idx` suffix style aligns with Postgres-community
--    convention while not breaking any existing reference (no SQL or code
--    references an index by name).
-- 3. (BACKFILL) The task brief instructs "DEFAULT 'other' + NOT NULL handles
--    backfill; no separate UPDATE." That is the Postgres-standard behavior:
--    `ALTER TABLE … ADD COLUMN NOT NULL DEFAULT 'other'` writes 'other' into
--    every existing row in-place. On large tables this can be a heavy write
--    but Mutual Mesh has <500 rows in staging (CLAUDE.md gotcha #6) so it
--    completes in milliseconds. Documented for future-proofing.
-- 4. (NO NEW RPCs) The spec explicitly says "No new RPCs." The existing
--    `createResource()` helper (src/lib/resources.ts) gains a `category`
--    parameter on the client side; the INSERT still goes through the
--    existing `resources_verified_insert` RLS policy. No RLS changes.
-- 5. (REALTIME) The existing `resources-feed` realtime channel publishes
--    UPDATE / INSERT events on `public.resources` — the new column comes
--    along for free. No realtime config change is needed. Verified against
--    supabase/realtime.sql (publication includes all columns by default).

-- ============================================================================
-- 1. ALTER TABLE — add category column (idempotent, with pg_attribute guard)
-- ============================================================================
-- The DO block belt-and-braces idempotency: even on Postgres versions that
-- don't honor `ADD COLUMN IF NOT EXISTS` consistently (rare), the explicit
-- pg_attribute lookup short-circuits the ALTER. On modern Supabase
-- (Postgres 15+) both guards are no-ops on re-apply.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.resources'::regclass
      AND attname = 'category'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE public.resources
      ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
      CHECK (category IN ('food', 'hygiene', 'baby', 'HRT', 'other'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.resources.category IS
  'Fixed 5-value enum: food | hygiene | baby | HRT | other. Set at post time by the user; never inferred. Backfilled to ''other'' on migration 004 apply. See qa-reports/spec-phase-2-resource-categories.md.';

-- ============================================================================
-- 2. INDEX — supports HomeScreen filter query
-- ============================================================================
-- Query shape supported (HomeScreen filter, src/hooks/useResources.ts after
-- the Phase 2 UI lands):
--   WHERE status = 'available' AND category IN (...) ORDER BY created_at DESC
--
-- Column order per Dana's task brief: (status, category, created_at DESC).
-- HomeScreen always filters to status='available' first, then narrows by
-- category — leading with the most-selective predicate is a small efficiency
-- win. At <500 rows the existing (status, created_at DESC) index also serves;
-- this one is the right shape for growth past 1000 rows when category-IN
-- selectivity becomes the dominant secondary filter.
--
-- NOTE: Quinn's spec sketch (spec line 240) used (category, status,
-- created_at DESC). Both shapes work for the dominant query; the brief's
-- order is shipped here. Flagged in the briefing as DFS-MIG-4 for Sky's
-- confirmation.

CREATE INDEX IF NOT EXISTS resources_category_status_idx
  ON public.resources (status, category, created_at DESC);

COMMENT ON INDEX public.resources_category_status_idx IS
  'Composite index for Phase 2 HomeScreen filter query (status=''available'' AND category IN (...) ORDER BY created_at DESC). Column order: status, category, created_at DESC. See migration 004.';

-- ============================================================================
-- 3. BACKFILL — handled by NOT NULL + DEFAULT 'other' above
-- ============================================================================
-- No explicit UPDATE is needed. Postgres writes 'other' into every existing
-- row during the ADD COLUMN above. To confirm post-apply, Sky / Steve can
-- run:
--
--   SELECT category, count(*) FROM public.resources GROUP BY category;
--
-- Expected output immediately after apply: a single row with
-- category='other' and count = (pre-apply row count). New posts will
-- distribute across the enum as users tag them.

-- ============================================================================
-- TEST STUB — Steve / Gary should add scenarios in supabase/__tests__/rls.sql
-- ============================================================================
-- Recommended scenarios (wrap each in BEGIN; ROLLBACK; like the existing T1-T9
-- patterns so fixtures don't leak):
--
--   T-CAT-1: Insert a resource with category='food' as a verified user → succeeds.
--   T-CAT-2: Insert a resource with category='banana' as a verified user →
--            rejected by the resources_category_check CHECK constraint.
--            Assert SQLSTATE = '23514'.
--   T-CAT-3: Existing row (inserted before the migration in the test setup)
--            has category='other' after ALTER TABLE.
--   T-CAT-4: Filter query EXPLAIN ANALYZE uses resources_category_status_idx
--            for `WHERE status='available' AND category='baby' ORDER BY created_at DESC`
--            at row counts >= 500 (skip on smaller fixtures — planner may
--            choose seq scan and that's fine).
--   T-CAT-5: RLS unchanged sanity — a non-verified user still cannot SELECT
--            from public.resources after the column is added (defense in
--            depth; the policies are unmodified but reconfirming is cheap).

-- ============================================================================
-- ROLLBACK (commented out — apply manually if needed)
-- ============================================================================
-- WARNING: dropping the column hard-deletes every user-assigned category
-- value. There is no automatic backup of column data via Supabase PITR for
-- DROP COLUMN — PITR is timestamp-based and works at the WAL level; a
-- targeted column rollback past any subsequent writes is effectively a
-- restore-the-whole-DB operation. Treat this rollback as one-way for
-- category data.
--
-- BEGIN;
--
--   -- 1. Drop the index first (DROP COLUMN would cascade, but being
--   --    explicit makes the rollback log readable).
--   DROP INDEX IF EXISTS public.resources_category_status_idx;
--
--   -- 2. Drop the column. The CHECK constraint is dropped automatically.
--   ALTER TABLE public.resources DROP COLUMN IF EXISTS category;
--
-- COMMIT;
--
-- After rollback, the spec-phase-2-resource-categories feature is offline.
-- Re-apply migration 004 to re-enable.
