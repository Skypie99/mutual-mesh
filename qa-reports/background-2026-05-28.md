# Peter — Background Performance Audit
**Date:** 2026-05-28 | **Mode:** BACKGROUND / AUDIT-ONLY
**Role:** Peter (Performance Engineer) | **model_tier:** sonnet
**Project:** MutualMesh | **cycle_id:** background-2026-05-28-peter

---

## Status: AUDIT-ONLY (no changes — Const. 12.5)

---

## Findings

### 1. ResourcesContext shared subscription — RESOLVED ✅
- `src/contexts/ResourcesContext.tsx` lifts the Supabase Realtime subscription and initial fetch into a single Provider (Peter perf audit wave-6, 2026-05-25).
- Both `HomeScreen` and `ResourceMapScreen` call `useResources()` against this shared context — no duplicate channels or duplicate fetches.
- **No action needed.**

### 2. Pagination cap — IN PLACE ✅
- `listResources()` has a `.limit(500)` cap per `CLAUDE.md` gotcha #6.
- FSA aggregation cost is bounded at 500 rows per read.
- At current scale (early Cycle 2): negligible. At 100× scale: cap prevents runaway cost.
- **Cursor-based pagination is the P1 upgrade** when real data volume warrants it.

### 3. FlatList scaling — ACCEPTABLE
- Feed lists use React Native's `FlatList` with windowed rendering.
- At 500-row cap, FlatList performs acceptably. Above ~1000 visible rows, add `getItemLayout` for fixed-height rows or a `windowSize` tuning pass.
- **No action needed today.**

### 4. Realtime merge — CLEAN
- `applyResourceDelta()` in `resourcesRealtime.ts` is a pure helper — testable, no side effects.
- Merge runs once per event (INSERT/UPDATE/DELETE on the `resources` channel).
- No fan-out or recursive merge detected.

---

## Scale Stress (10× / 100×)

| Concern | 10× | 100× |
|---------|-----|------|
| Subscription count | ✅ Singleton | ✅ Singleton |
| Data fetch cost | ✅ Capped 500 | ✅ Capped (cursor-paginate when needed) |
| FlatList render | ✅ Windowed | ⚠️ Add `getItemLayout` above ~1000 rows |

---

## Decisions for Sky
None. MutualMesh is blocked on Cycle 2 prerequisites; performance baseline is solid.
