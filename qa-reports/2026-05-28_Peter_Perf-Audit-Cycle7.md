# Performance Audit — Cycle 7 (2026-05-28)
**Auditor:** Peter  
**Date:** 2026-05-28  
**Scope:** 5 most-recently merged components post-main  
**Status:** PASS — zero critical issues; two minor optimization opportunities noted  

---

## Audit Summary

Audited the 5 most recently merged components on `origin/main` (May 25, 2026):

1. **FlashBanner.tsx** — notification component (43920b7)
2. **ProfileScreen.tsx** — user profile + handle edit (972925d, b0ae100)
3. **ResourceDetailScreen.tsx** — resource detail + claim flow (b0ae100)
4. **AdminVerificationScreen.tsx** — admin queue + approval UI (784fcee)
5. **LazyPlatformMapView.web.tsx** — React.lazy-loaded map (9f7b907)

**Verdict:** All components follow performance best practices. No bundle concerns, re-render issues, or Realtime subscription leaks detected.

---

## Component-by-Component Analysis

### 1. FlashBanner.tsx (43920b7: a11y contrast fix)

**File:** `src/components/FlashBanner.tsx`  
**Recent change:** Dark-mode text color fix (WCAG 1.4.3).

#### Findings

✅ **Animation optimized:** Uses `useNativeDriver: true` on Animated.timing, offloading to native thread.  
✅ **Edge-detection:** Announcement guarded by `announcedRef` — fires exactly once on mount, not every render.  
✅ **Timeout cleanup:** Unmount guard in useEffect return — no dangling timers.  
✅ **No re-render bloat:** Simple local state (opacity ref + announced flag); no downstream dependencies.

**Cost:** Minimal. Animation on native driver; announcement semantic only.

---

### 2. ProfileScreen.tsx (972925d + b0ae100: inline handle edit + clipboard copy)

**File:** `src/screens/ProfileScreen.tsx`  
**Recent changes:** AC-6.1 inline handle edit + copy-to-clipboard + poster-sees-claimant feature.

#### Findings

✅ **Mounted-ref guards:** Lines 67, 82-94, 156. All async setState protected against unmounted component.  
✅ **useFocusEffect for re-fetch:** Lines 102-106. Profile counts reload on focus (AC-6.3), not on every render. Uses `loadCounts` callback which checks `mountedRef` before setState.  
✅ **No expensive list ops:** `listMyPosts` + `listMyClaims` use simple eq + order; no joins or aggregate functions observed in lib/resources.ts.

**Potential minor issue (LOW):**
- Line 86-90: Error-reporting opt-in loaded in an async IIFE inside useEffect. This is fire-and-forget with a mounted guard, so no memory leak, but the pattern is slightly unconventional. Could be extracted to a separate `useEffect(() => { void (async () => { ... })(); }, [])` for clarity. Not a performance problem, just style.

**Cost:** Negligible. List loads are O(n) with small n (<100 user's own posts/claims typical); the handle edit flow is synchronous except for the updateMyProfile RPC call which is properly guarded.

---

### 3. ResourceDetailScreen.tsx (b0ae100: claimant handle reveal + clipboard)

**File:** `src/screens/ResourceDetailScreen.tsx`  
**Recent changes:** Inline handle reveal for poster (long-press copy); claimant handle fetch on reserved status.

#### Findings

✅ **Mounted-ref in fetchResource:** Lines 41, 51, 63, 65, 85. All setState guarded; safe on unmount.  
✅ **Callback stable:** `fetchResource` is memoized via useCallback with `[resourceId]` dependency. Single fetch per resourceId change.  
✅ **Photo URL signing:** Signed URL regenerated on every refetch (line 62). Cost is one RPC call per detail-view mount; SSE cost is trivial.

**No issues.** The claimant handle fetch (line 85 in commit b0ae100) happens via `getClaimantHandle()` → single-row SELECT on public.users. RLS enforced; minimal overhead.

**Cost:** Single network round-trip per claim action (atomic, expected).

---

### 4. AdminVerificationScreen.tsx (784fcee: admin queue + focus management + live counter)

**File:** `src/screens/AdminVerificationScreen.tsx`  
**Recent changes:** FlatList memoization, Realtime subscription, a11y focus/busy guards.

#### Findings

✅ **FlatList memoization:** Lines 265-280. `ApplicantCard` is memoized (line 300-328); `renderItem` is a simple arrow function (no inline re-creation).  
✅ **Realtime subscription cleanup:** Lines 118-151. Properly unsubscribed in return statement (line 148-150). No channel leaks.  
✅ **Optimistic removal:** Lines 165-167. Local filter on approve/reject; correctly removes row from list before server echo arrives.  
✅ **useMemo on formatApplicantRow:** Line 301. Formatting is memoized per applicant, avoiding re-work on every render.  
✅ **Mounted-ref guards:** Lines 77, 84-104, 122. All Realtime + fetch operations check before setState.

**Realtime event handling (lines 118-146):**
- Channel name: 'admin-verification-queue' (generic, per privacy spec — Jordan note #5).
- Event filtering: Correctly detects INSERT / UPDATE / DELETE.
- Optimistic removal snapshot (lines 130-135): Detects whether this admin already removed the row locally. Smart pattern to avoid duplicate announcements.

**No issues.** This screen is well-architected for realtime + admin responsiveness.

**Cost:** One Realtime subscription per mount; cleaned up on unmount. ~O(n) row processing on each delta event; n is small (<500 queue).

---

### 5. LazyPlatformMapView.web.tsx (9f7b907: React.lazy code-splitting)

**File:** `src/components/LazyPlatformMapView.web.tsx`  
**Recent change:** Leaflet (~200KB JS + CSS) deferred to on-demand via React.lazy.

#### Findings

✅ **Lazy loading strategy:** `React.lazy()` + `Suspense` defer the entire `PlatformMapView.web.tsx` import until render. Leaflet does NOT load on initial HomeScreen mount; only when user taps the map toggle.  
✅ **Fallback UI:** `MapLoadingFallback` is simple (ActivityIndicator) and announced with `accessibilityLiveRegion="polite"` (line 27). Users on slow connections see feedback.  
✅ **Platform-aware:** Native path (LazyPlatformMapView.tsx) is a transparent re-export (no bundled Leaflet on native — Metro handles tree-shaking).  
✅ **Import resolution:** File name pattern matches Metro's platform resolution: `.web.tsx` on web, `.tsx` (or `.native.tsx`) on iOS/Android.

**Web bundle impact:**
- Initial HomeScreen load no longer includes Leaflet.
- On map tap, Suspense boundary triggers lazy-load.
- Estimated savings: ~200KB deferred from initial HTML / JS payload (per commit message).

**No issues.** Exemplary code-splitting for a web-first optimization.

**Cost:** Lazy-load induces ~300-500ms spinup on first map tap (typical for a 200KB bundle over 4G). Worth the trade-off to keep initial load fast.

---

### 6. Realtime Subscription Cleanup (Across All)

**Pattern verification:** All components using Supabase Realtime (HomeScreen via useResources, AdminVerificationScreen, ResourceDetailScreen) properly unsubscribe.

Examples:
- **useResources** (src/hooks/useResources.ts, lines 78-95): `supabase.removeChannel(channel)` in effect return.
- **AdminVerificationScreen** (lines 118-151): `supabase.removeChannel(channel)` in effect return.

✅ **No leaks detected.** Each subscription is cleaned up on unmount.

---

## Bundle Concerns

### Web Target
- **Initial bundle:** HomeScreen + auth flows now exclude Leaflet (moved to lazy-loaded chunk).
- **Total Realtime subscriptions:** Two channels max (resources-feed, admin-verification-queue). Each is lightweight; no multiplexing issues.

### Native Target (iOS/Android)
- React-native-maps included on native; no lazy-load (Metro handles native bundling differently).
- No Leaflet on native (native map is a different implementation).

**Verdict:** Bundle is well-structured. No critical concerns.

---

## Re-Render & FlatList Memo Usage

### HomeScreen (useResources hook)

✅ **renderItem callback stable:** `useCallback((item) => <ResourceCard />)` (lines 52-55). Dependency: `[onOpenResource]`.  
✅ **keyExtractor stable:** `useCallback((item) => item.id)` (line 50).  
✅ **ResourceCard memoized:** `memo(function ResourceCard(...))` (line 131). Prevents re-render when parent renders but item props unchanged.  
✅ **Separator memoized:** `memo(function Separator())` (line 122).

**FlatList efficiency:**
- Item separator is a simple spacer (height: 12). Memoized to avoid per-item re-creation.
- ResourceCard is memoized per item. Changes to one card don't re-render others.

**Verdict:** FlatList memoization is correct and complete.

### AdminVerificationScreen

✅ **ApplicantCard memoized:** Line 300. `memo(function ApplicantCard(...))`.  
✅ **renderItem callback:** Lines 265-270. Arrow function inline, but because ApplicantCard is memoized, re-renders are blocked if item props don't change.  
✅ **useMemo on formatApplicantRow:** Line 301. Formatting cached per applicant.

**Verdict:** Correct memoization strategy for a small queue (typically <100 rows).

---

## Async/Await Cleanup

All async flows follow the mounted-ref guard pattern (AccessMap LEARNINGS):

```typescript
const mountedRef = useRef(true);

useEffect(() => {
  mountedRef.current = true;
  return () => { mountedRef.current = false; };
}, []);

// In async callback:
if (!mountedRef.current) return;
setState(...);
```

✅ No memory leaks from setState on unmounted components.

---

## Minor Observations (Non-blocking)

1. **ProfileScreen error-reporting opt-in load (lines 86-90):** Fire-and-forget async in IIFE works, but slightly unconventional. Could move to a named useEffect for clarity. No performance impact.

2. **AdminVerificationScreen—limit(500) on admin queue (line 90):** Comment in resources.ts (line 16) mentions this is a hard cap pending cursor pagination (Cycle 7 work). Current approach works for <500 admins, but if queue grows, pagination should be prioritized. Not an issue now.

3. **Resource list queries—no pagination (resources.ts, line 50):** listResources uses `limit(500)`. Works for typical inventory, but very large communities (1000+ available items) may see slower initial load. Cursor pagination planned post-launch per CLAUDE.md gotcha #6 (AccessMap learned the hard way). Not blocking.

---

## Summary Table

| Component | Bundle Impact | Re-renders | Realtime | Async Guards | Score |
|-----------|---------------|-----------|----------|--------------|-------|
| FlashBanner | Minimal | Safe | N/A | ✅ | ✅ PASS |
| ProfileScreen | Negligible | Safe | N/A | ✅ | ✅ PASS |
| ResourceDetailScreen | Negligible | Safe | N/A | ✅ | ✅ PASS |
| AdminVerificationScreen | Negligible | Optimized (memo) | ✅ Clean | ✅ | ✅ PASS |
| LazyPlatformMapView.web | **200KB deferred** | N/A | N/A | N/A | ✅ PASS |

---

## Verdict: **PASS**

All 5 components follow performance best practices. No critical issues, no re-render bloat, no Realtime subscription leaks, and bundle optimizations are well-executed (especially the Leaflet lazy-load).

**Recommend:** Proceed to merge or deploy. Code is production-ready from a performance perspective.

---

## Future Considerations (Propose-Only, Not Blocking)

1. **Cursor pagination** for listResources (Cycle 7 planned). Current `limit(500)` is safe but should move to `PAGE_SIZE=20` + onEndReached pattern if the marketplace grows beyond ~200 items.

2. **Realtime channel consolidation** on AdminVerificationScreen: The generic 'admin-verification-queue' channel is correct per privacy spec, but if admin workloads scale, consider rate-limiting or polling fallback (Cycle 8+).

3. **ProfileScreen opt-in load:** Extract the errorReporting load to a named useEffect for code clarity (not a performance issue, style only).

---

**Auditor:** Peter  
**Completed:** 2026-05-28 23:45 UTC  
**Next audit scheduled:** Post-Cycle 7 merge.
