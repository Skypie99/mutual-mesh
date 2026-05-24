# Feature Push — Mutual Mesh — 2026-05-24

## Summary

Built the `ResourceMapScreen` (Phase 3.2) — a privacy-safe, FSA-aggregated neighborhood map view that shows available resources grouped by postal prefix, with a slide-up preview sheet when a neighborhood is tapped, and "Center on me" foreground location support. Also wired the `MapToggle` into `HomeScreen` so the map is reachable from the feed. Typecheck was green before (0 errors) and is green after. All 359 tests pass.

---

## Feature spec (as built)

**What it does:** Shows available resources aggregated by FSA (3-char postal prefix). Neighborhoods appear as tappable chips; tapping one opens a preview Card bottom sheet listing up to 3 actual resources — tapping any resource navigates to `ResourceDetailScreen`. A "Center on me" button uses foreground location to center the map region. A `MapToggle` at the top lets users switch back to the list.

**Privacy posture (Jordan-approved):** FSA-polygon granularity only — never GPS pins, never street-level zoom. Location permission is entirely optional and foreground-only. Exact resource counts are never shown — only privacy-safe bucket labels ("a few", "several", "many").

**Where it lives:** `src/screens/ResourceMapScreen.tsx`. Reachable via:
1. `HomeScreen` → MapToggle "Map" tab → `navigation.navigate('ResourceMap')`
2. Any future deep-link to `HomeStack → ResourceMap`

**User flow:**
1. User is on the Feed; sees the MapToggle at the top.
2. Taps "Map" → navigates to `ResourceMapScreen`.
3. Screen fetches resources via `useResources` and groups them by FSA client-side.
4. Chips show each FSA with a color swatch (density) and bucket label.
5. User taps a chip → preview sheet slides up showing the FSA name, bucket label, and up to 3 resource cards.
6. Tap a resource card → sheet closes → `ResourceDetailScreen` opens.
7. Tap "See all N listings →" → sheet closes → Feed (full list).
8. Tap "Center on me" → requests foreground location once → centers map region (or scrolls chip list if map not yet installed).
9. Tapping the sheet scrim or ✕ → sheet closes.
10. Tapping "List" in MapToggle → `navigation.navigate('Feed')`.

**Components & data:**
- `useResources` hook (same as HomeScreen — no new queries)
- `groupResourcesByFSA` + `fsaMapSummary` + `fsaAccessibilityLabel` from `fsaAggregation.ts`
- `BUCKET_FILL_COLORS_LIGHT/DARK`, `DEFAULT_REGION`, `clampRegionZoom` from `mapHelpers.ts`
- `MapToggle` component (existing)
- `Card` component (existing) — used in preview sheet resource rows
- `StatusPill` component (existing)
- `EmptyState` component (existing)
- React Native `Modal` — preview sheet (built-in, no new dep)
- `expo-location` — dynamic require with inline type shim (graceful fallback if not installed)

**Accessibility plan (implemented):**
- `MapToggle` has `tablist`/`tab` roles (built into component)
- Map container: `accessibilityRole="image"` + `accessibilityLabel` = map summary string
- FSA chips: `accessibilityRole="button"`, full label from `fsaAccessibilityLabel()`, `accessibilityHint`
- Preview sheet: `Modal` with `accessibilityViewIsModal`, header has `accessibilityRole="header"`, `accessibilityLiveRegion="polite"` on sheet body
- Resource preview cards: `accessibilityLabel` includes name, description snippet, status, and "tap to view details"
- All interactive elements: `minHeight: TOUCH_TARGET_MIN` (44pt) enforced
- Hidden screen-reader FSA list below map (AC-5 equivalent-data requirement)
- "Center on me" button: `accessibilityState={{ busy: locating }}` while GPS active

**Assumptions:**
1. `expo-location` is not yet installed — used `require()` with an inline type shim so tsc passes. When installed, the button will work live.
2. `react-native-maps` is not yet installed — `MAP_LIBRARY_INSTALLED = false` renders the chip-list fallback. Flip to `true` when installed.
3. `onSelectFsa` in the nav passes `fsa` back — but `Feed` route has no filter param yet. Simplified to `navigate('Feed')` (full list). FSA filtering is Phase 4 scope.
4. The preview sheet uses a Modal (built-in) rather than a third-party bottom-sheet library (no new dep required).

---

## How to try it

1. Start the app: `npm start` (or `npx expo start`)
2. Navigate to the **Feed** tab (bottom bar "Feed").
3. See the **MapToggle** ("List" | "Map") below the "Available now" heading.
4. Tap **Map** → `ResourceMapScreen` pushes onto the stack.
5. If resources exist with `postal_prefix`, FSA chips appear.
6. Tap a chip → preview sheet slides up.
7. Tap a resource card in the sheet → `ResourceDetailScreen` opens.
8. Tap **Center on me** → iOS/Android location prompt appears → map region updates (or silently does nothing if denied).
9. Press back → returns to Feed; back in MapToggle shows "List" selected again.

---

## What was built (branch feat/resource-map-screen-2026-05-24)

**Files modified:**

| File | Change |
|---|---|
| `src/screens/ResourceMapScreen.tsx` | Full rewrite — FSA chips, preview Modal sheet, center-on-me, MapToggle, useResources internal fetch, react-native-maps flag |
| `src/screens/HomeScreen.tsx` | Added `MapToggle` import + `onOpenMap` prop + toggle render above feed |
| `src/navigation/RootNavigator.tsx` | Wired `onOpenMap → navigate('ResourceMap')` on HomeScreen; removed stale `resources={[]}` prop from ResourceMapScreen (now self-fetching) |

**Key new patterns:**

- **Self-fetching screen with injected override:** `ResourceMapScreen` calls `useResources` internally but respects a `resources` prop when non-empty. This lets the nav share a future unified hook (Cycle 6+) without changing the screen's API.
- **Inline type shim for uninstalled native module:** `require('expo-location') as ExpoLocationShim` — gives TS the shape it needs without the real module. The try/catch swallows the runtime `MODULE_NOT_FOUND` error gracefully.
- **Modal bottom sheet (no extra dep):** Native `Modal` with `transparent + animationType="slide"` provides the slide-up sheet. Same pattern used in `ConfirmationModal.tsx`.

---

## Proposals (NOT applied — need your review)

### Install expo-location
When ready for the "Center on me" button to work:
```bash
npx expo install expo-location
```
Then add to `app.json` permissions:
```json
{
  "expo": {
    "plugins": [
      ["expo-location", {
        "locationWhenInUseUsageDescription": "Used to center the map on your neighborhood."
      }]
    ]
  }
}
```
No code changes needed — the dynamic require already handles it.

### Install react-native-maps
When ready for real map tiles:
```bash
npx expo install react-native-maps
```
Then in `ResourceMapScreen.tsx`:
1. Flip `MAP_LIBRARY_INSTALLED` to `true`
2. Add at top: `import MapView, { UrlTile } from 'react-native-maps';`
3. Replace the "Map loading…" placeholder `View` with:
```tsx
<MapView
  style={{ flex: 1 }}
  region={region}
  onRegionChangeComplete={(r) => setRegion(clampRegionZoom(r))}
  accessibilityLabel={summary}
  accessibilityRole="image"
>
  <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={13} />
</MapView>
```
Add `OSM_TILE_URL` import from `mapHelpers.ts`.

### FSA filter on Feed
`HomeStackParamList.Feed` is currently `undefined`. To support the "See all" CTA filtering the feed by FSA, add:
```ts
Feed: { fsaFilter?: string } | undefined;
```
And update `HomeScreen` to read `route.params?.fsaFilter` and pass it to `useResources`.

---

## Suggested next features (1–2)

1. **Push notification preferences screen** — A simple settings screen (in ProfileTab) where verified users toggle which events trigger push alerts (on-claim, on-pickup, on-approve). Backed by the existing `pushPreferences` lib and `PushTokenRow` schema. One screen, 4 toggles, no new data model.

2. **FSA filter on the Feed** — Wire the "See all" CTA in the map preview to actually filter the Feed. Requires adding `fsaFilter?: string` to `HomeStackParamList.Feed` and a filter in `useResources` (client-side on the existing 500-row fetch — no new query). Small change, high UX value for map → list drilldown.

---

## Verification

- **Typecheck before:** ✅ 0 errors
- **Typecheck after:** ✅ 0 errors (`npx tsc --noEmit`)
- **Tests:** ✅ 359/359 passing, 20 suites (no tests broken, no new tests needed — screen has no pure logic to unit-test)
- **Reachable via:** Feed → MapToggle "Map" tab → ResourceMapScreen (nav push)
- **Accessibility implemented:** Yes — tablist/tab, image role, live region, 44pt targets, hidden a11y list, busy state
- **Privacy posture maintained:** FSA-only, no GPS pins, location foreground-only, exact counts hidden

**Files touched:** 3 modified  
**Commit:** `aa8b460` on `feat/resource-map-screen-2026-05-24`

---

## How to review

```bash
git diff main..feat/resource-map-screen-2026-05-24

# merge:   git checkout main && git merge feat/resource-map-screen-2026-05-24
# discard: git branch -D feat/resource-map-screen-2026-05-24
```
