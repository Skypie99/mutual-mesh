# QA Report — Cursor Pagination (Shamus 2026-05-25)

**Branch:** `feat/auto-2026-05-25-shamus-pagination`
**Commit:** `e48b462`
**Date:** 2026-05-25

---

## Summary

Replaced the `.limit(500)` hard cap on the resource feed (`listResources()`) with
proper `PAGE_SIZE=20` cursor pagination using Supabase's `.range()` API. Wired
`FlatList.onEndReached` infinite scroll into `HomeScreen`, with a bottom loading
spinner and pull-to-refresh reset.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/resources.ts` | `listResources(page=0)` — replaces `.limit(500)` with `.range(from, to)`; returns `{ data, error, hasMore }`; exports `PAGE_SIZE = 20` constant |
| `src/hooks/useResources.ts` | Adds `loadMore()`, `loadingMore`, `hasMore` state; `pageRef` for page tracking; `reload()` resets to page 0 |
| `src/screens/HomeScreen.tsx` | Wires `onEndReached → loadMore()`, `ListFooterComponent` spinner (`accessibilityLabel="Loading more resources"`), pull-to-refresh still resets to page 0 |
| `src/__tests__/listResources.pagination.test.ts` | 18 new tests — new file |

---

## Old vs New Fetch Behavior

| Aspect | Before | After |
|--------|--------|-------|
| Fetch shape | `.limit(500)` — all in one shot | `.range(0, 19)` → page 0; `.range(20, 39)` → page 1; etc. |
| Data returned per request | Up to 500 rows | 20 rows per page |
| Return value of `listResources()` | Standard Supabase `{ data, error }` | `{ data, error, hasMore }` |
| `useResources` surface | `{ resources, loading, error, reload }` | `{ resources, loading, loadingMore, hasMore, error, reload, loadMore }` |
| Infinite scroll | None — all data loaded at once | `onEndReached` appends next batch when `hasMore && !loadingMore` |
| Pull-to-refresh | Resets resources | Still resets resources, now also resets `page → 0` |
| Column select | Explicit (no contact_handle) | Identical explicit column list — no change |

---

## Jordan Trigger Check (mandatory)

**YES/NO on each condition — all must be NO to proceed without Jordan review:**

| Condition | Status | Notes |
|-----------|--------|-------|
| New PII collected | **NO** | Same explicit column select as before; `contact_handle` still excluded |
| New location data | **NO** | No new location fields; `postal_prefix` already in existing select |
| New disability data | **NO** | No disability fields touched |
| Auth change | **NO** | No auth layer touched |
| New persistence layer | **NO** | Client-side page counter only (`useRef`); nothing persisted to storage |
| New data exposed beyond existing RLS | **NO** | `.range()` paginates the same RLS-filtered result set; server controls what rows are visible |

**Jordan trigger: CLEAR. No Jordan review required for this change.**
Pagination batches existing data without expanding the exposure surface.

---

## Typecheck

```
npx tsc --noEmit
```
**Result: PASS — 0 errors.**

---

## Test Results

```
npx jest --ci --passWithNoTests
Test Suites: 25 passed, 25 total
Tests:       1 todo, 425 passed, 426 total  (18 new pagination tests included)
```

**Result: PASS**

The 1 `todo` and the `act()` warning are pre-existing (ResourceDetailScreen claim flow) — not related to this change.

---

## New Test Coverage (18 tests)

File: `src/__tests__/listResources.pagination.test.ts`

| Describe block | Tests |
|----------------|-------|
| PAGE_SIZE constant | is 20 |
| Range calculation | page 0 → 0–19; page 1 → 20–39; page 2 → 40–59; default to page 0 |
| hasMore flag | true at exactly PAGE_SIZE rows; false at <PAGE_SIZE; false at 1 row; false at 0 rows (empty DB); false when data is null |
| Data passthrough | returns data array on success; returns `[]` when data is null |
| Error propagation | error returned; data is `[]` on error; `hasMore: false` on error |
| Query shape | queries `resources` table; filters `status='available'`; orders `created_at` descending |

---

## Edge Cases Covered

| Edge case | Handling |
|-----------|----------|
| Empty DB (0 rows on page 0) | `hasMore: false` immediately; no infinite scroll trigger |
| Single-page result (<20 rows total) | `hasMore: false` after page 0; `loadMore()` no-ops |
| Last page (partial result) | `hasMore: false` when `data.length < PAGE_SIZE` |
| Error on fetch | Error surface unchanged; `hasMore: false` so scroll stops |
| Rapid `onEndReached` fires | `loadingMore` guard prevents duplicate in-flight requests |
| Unmount during fetch | `mountedRef` guard prevents setState on unmounted component |
| Realtime INSERT during paginated scroll | `applyResourceDelta` merges new row into existing list as before |

---

## Accessibility

- Loading spinner at list bottom has `accessibilityLabel="Loading more resources"` and `accessible` prop.
- New page loads do NOT announce to screen readers (VoiceOver/TalkBack) — would be noisy on infinite scroll. Only the loading indicator state is accessible, not each individual page fetch.
- `onEndReached` fires silently; no visual change until `loadingMore` state triggers the spinner.

---

## Schema Changes

**NONE.** No migrations, no new tables, no new columns, no RLS changes.

---

## Decisions for Sky

None. This feature is self-contained, Jordan-clear, and ready for review.

**Do NOT merge to main** — Sky merges after reading this report.
