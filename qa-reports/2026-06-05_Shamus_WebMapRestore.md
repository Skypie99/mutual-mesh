# Shamus — Web Map Restore
**Date:** 2026-06-05
**Branch:** `shamus/restore-web-map-2026-06-05`
**Commit:** `e4c0d52`
**Verdict: PASS**

---

## Task

Restore the real react-leaflet web map that was stubbed during the guest-demo ship, and un-hide the Map toggle in the demo navigator.

---

## Files Changed

| File | Change |
|---|---|
| `.npmrc` | **NEW** — `legacy-peer-deps=true` (React 19.1 pin vs react-leaflet's `^19.2` peer dep) |
| `package.json` | Added `leaflet ^1.9.4`, `react-leaflet ^5.0.0` to dependencies; `@types/leaflet ^1.9.14` to devDependencies |
| `package-lock.json` | Updated by npm install |
| `src/components/PlatformMapView.web.tsx` | **Restored** from placeholder stub to real react-leaflet implementation |
| `src/navigation/DemoRootNavigator.tsx` | Un-hidden Map toggle, wired `onOpenMap`, added `ResourceMap` screen |

---

## What Was Done

### 1. Dependencies + .npmrc

Added `leaflet ^1.9.4` and `react-leaflet ^5.0.0` to `package.json` dependencies, and `@types/leaflet ^1.9.14` to devDependencies. Created `.npmrc` with `legacy-peer-deps=true` — required because Expo SDK 54 pins React 19.1.0 and react-leaflet 5's peer dep wants `^19.2`. This is the same pattern AccessMap uses (LEARNINGS 2026-05-25 "Phase 3 web-compat").

### 2. PlatformMapView.web.tsx — real implementation

Replaced the graceful-placeholder stub with a real `react-leaflet` `MapContainer` + `TileLayer` implementation:

- **OSM tiles** via `OSM_TILE_URL` from `@/lib/mapHelpers` (same source as native)
- **`deltaToZoom` helper** converts react-native-maps `latitudeDelta` to a Leaflet zoom integer using `round(log2(360 / latitudeDelta))`, result clamped to `[2, 13]`
- **Zoom clamped `[2, 13]`** — `minZoom` and `maxZoom` props both set on `MapContainer` and `TileLayer`; privacy floor enforced at the Leaflet level
- **`keyboard={false}`** on `MapContainer` — WCAG 2.1.2 no-keyboard-trap
- **`role="img"` + `aria-label`** on the outer `<div>` for screen-reader landmark
- **`onRegionChangeComplete` not wired** on web — per LEARNINGS: FSA chip taps drive navigation, not map panning
- **Lazy-loaded** — `LazyPlatformMapView.web.tsx` wraps it in `React.lazy`, so the 181 kB Leaflet bundle is deferred until the map is first rendered (confirmed in web export output)

### 3. DemoRootNavigator — un-hide toggle + wire map screen

- Changed `showMapToggle={false}` → `showMapToggle={true}`
- Added `onOpenMap={() => navigation.navigate('ResourceMap')}` to `HomeScreen`
- Added `ResourceMap` screen entry to `DemoStack.Navigator` rendering `ResourceMapScreen`
- `ResourceMapScreen` reads `DemoContext` via `useResources()` — the demo guard in that hook returns synthetic fixtures, zero Supabase calls

Updated the JSDoc comment to reflect the restored state.

---

## Privacy Guard Confirmation

**FSA-only, zoom [2,13], no GPS pins — CONFIRMED.**

- `deltaToZoom` clamps output to `[2, 13]` unconditionally
- `MapContainer` sets `minZoom={2}` and `maxZoom={13}`; `TileLayer` also sets `maxZoom={13}`
- No individual resource pins are rendered — the web map is a basemap only; FSA chip overlay and preview sheet are driven by the bottom-panel list elements in `ResourceMapScreen`
- Demo data (`DEMO_RESOURCES`) has `postal_prefix` only (FSA-level geography), never GPS coords
- `ResourceMapScreen.tsx` `groupResourcesByFSA()` aggregates to FSA bucket — no raw coordinate rendering
- Jordan advisory conditions (LEARNINGS 2026-05-25 "FSA aggregation") fully satisfied

---

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` | **GREEN** — 0 errors |
| `npm test` (with `--testPathIgnorePatterns='/.claude/'`) | **GREEN** — 26 suites, 441 passed, 1 todo, 0 failures |
| `npx expo export -p web` | **GREEN** — export completed without error; Leaflet lazy-chunked as `PlatformMapView-0c7fa1df37e2e581ce4abc8b53569024.js` (181 kB), confirming the `React.lazy` split works |

Notes:
- The `act()` warning in `ResourceDetailScreen.race.test.tsx` is pre-existing (present before this branch); not a new failure
- The CSS `url(images/...)` notices from Metro during the web export are Leaflet's layer-control images — they are harmless warnings (Metro can't inline these assets; Leaflet falls back gracefully) and do not block the export

---

## Branch + Commit

- **Branch:** `shamus/restore-web-map-2026-06-05`
- **Commit:** `e4c0d52ad98c4ba0dce8952e835d919343dd2f90`
- NOT merged to main. NOT pushed to origin. Sky merges.

---

## Decisions for Sky

None — this is a self-contained restore of work described in the spec. No schema changes, no Supabase calls added, no new user data handled.
