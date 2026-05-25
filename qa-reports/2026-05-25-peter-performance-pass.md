# Peter — Performance Pass
**Date:** 2026-05-25
**Scope:** HomeScreen, ResourceMapScreen, fsaAggregation.ts, resources.ts, image loading
**VERDICT: PASS** (with two items worth addressing before the first real-data load test)

---

## 1. HomeScreen FlatList — MEDIUM

**File:** `src/screens/HomeScreen.tsx`, lines 89–103

`renderItem` is an inline arrow function: `renderItem={({ item }) => <ResourceCard item={item} onPress={onOpenResource} />}` (line 93). This creates a new function reference on every parent render, which forces FlatList to re-render every visible row on each parent state change (e.g., `refreshing` flip at line 44).

`keyExtractor` is also inline (line 91). Same problem, lower severity — React can cache it, but it's still an unnecessary allocation.

`getItemLayout` is absent. Without it, FlatList cannot fast-jump to an index and must measure every item on scroll, which is slow on budget Android.

`ResourceCard` and `Separator` are plain functions, not `React.memo`-wrapped, so they don't short-circuit when props are stable.

**Proposed fix (do not apply):**
```tsx
const renderItem = useCallback(
  ({ item }: { item: ResourceRow }) => <ResourceCard item={item} onPress={onOpenResource} />,
  [onOpenResource],
);
const keyExtractor = useCallback((item: ResourceRow) => item.id, []);

// In FlatList: renderItem={renderItem} keyExtractor={keyExtractor}
// Wrap ResourceCard + Separator with React.memo
```

If card height is fixed (it appears to be ~80dp from layout), add `getItemLayout` as well.

---

## 2. ResourceMapScreen FSA aggregation — PASS

**File:** `src/screens/ResourceMapScreen.tsx`, line 124

`groupResourcesByFSA` is correctly wrapped in `useMemo`: `const descriptors = useMemo(() => groupResourcesByFSA(resources), [resources])`. All derived values (`summary`, `hiddenListText`, `previewResources`) are also memoized. Handlers use `useCallback`. No issues here.

Map marker stability: no Polygon/Marker components are rendered yet (the MapView only renders `UrlTile` tiles). The FSA chip list re-uses stable `descriptors` array from `useMemo`. Stable.

---

## 3. fsaAggregation.ts complexity — PASS

**File:** `src/lib/fsaAggregation.ts`, lines 214–256

Single-pass O(n) loop over resources into a `Map`. No nested loops, no redundant array passes. `pickDominant` iterates CATEGORY_ORDER (length 5 — effectively O(1)). The final `sort` is O(k log k) where k = number of distinct FSAs, always << n. Algorithm is correct and efficient.

---

## 4. resources.ts pagination cap — PASS

**File:** `src/lib/resources.ts`, lines 23 and 33–39

`LIST_LIMIT = 500` is defined at line 23 and applied to `listResources` (line 39), `listMyPosts` (line 54), and `listMyClaims` (line 65). The `.select('*')` returns all columns — could be narrowed to used fields for lower payload, but not urgent at this scale.

---

## 5. Image loading — LOW

**File:** `src/screens/ResourceDetailScreen.tsx`, line 125–130

`resizeMode="cover"` is correctly set (line 129). No layout thrash risk.

Images are not lazy-loaded in the feed (`HomeScreen`) because `ResourceCard` shows no images — just text. Detail screen loads image on mount after fetching signed URL (line 62–63), which is acceptable single-image behavior. No issue.

Minor: `HomeScreen`'s `ResourceCard` (line 124–156) does not render any `<Image>` at all, so there is nothing to lazy-load in the list.

---

## Summary

| Area | Severity | Status |
|---|---|---|
| FlatList `renderItem` / `keyExtractor` inline | MEDIUM | Fix proposed above |
| Missing `getItemLayout` | LOW-MEDIUM | Propose fix when card height confirmed |
| FSA aggregation memoization | — | PASS |
| fsaAggregation.ts O(n) | — | PASS |
| resources.ts .limit(500) | — | PASS |
| Image resizeMode + lazy loading | — | PASS |

**Only action needed before a real-data load test:** memoize `renderItem` + `keyExtractor` and wrap `ResourceCard` in `React.memo`. Everything else is clean.
