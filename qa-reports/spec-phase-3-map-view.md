# Spec: Phase 3 — Map View (privacy-safe) — Quinn — 2026-05-24

## Summary

Phase 3 Tier 3 Feature #17 adds a **privacy-safe map view** to the Home screen. The map renders **FSA-radius circles only** — never GPS pins, never street-level addresses, never building-precision markers. The map is a visual overlay on the existing marketplace data using `public.users.postal_prefix` (3-char FSA, already in schema per PRIVACY.md D3) — no schema changes.

The single load-bearing rule (from Deb's persona anti-goal #1): **"anything that exposes the community fridge's exact address."** This spec interprets that strictly: the smallest unit the map ever renders is an FSA polygon (~neighborhood-sized, several blocks across). Resources are aggregated and counted per FSA; tap an FSA to drill into a filtered list view. The map NEVER shows a pin for an individual resource. It NEVER zooms below the FSA boundary level.

**Scope:** New component (`src/components/MapView.tsx`) + Map-vs-List toggle on HomeScreen + tile provider integration (OpenStreetMap via Mapbox-style or react-native-maps with OSM overlay — Quinn picks; Sky DFS-1). **Schema is UNCHANGED.** No new tables, no new RPCs, no new migrations. The existing `useResources` hook is reused; aggregation happens client-side from the existing query result.

**Estimated effort:** 2.5 build days + 1.5 hardening days. ~4-5 PRs across Shamus (UI), Dani (tile aesthetics + FSA-polygon styling), Jordan (FULL privacy review — location precision), Alex (FULL review — screen-reader alternative is non-negotiable), Gary (tests).

**READY pending Sky decisions on DFS items and Jordan's review of the tile provider choice.** PRIVACY.md D3 ("postal prefix at 3 characters / FSA-equivalent breadth") is the architectural anchor — the map can never render data at finer granularity than the FSA the user already discloses.

## User story

> _As Deb (community-fridge organizer), I want to see at a glance how many resources are available in nearby neighborhoods so I can decide whether to drive over for a haul — without ever revealing where my community fridge is, or which building any specific resource came from._

> _As Mara (recipient), I want to see if there's formula being shared in my neighborhood without scrolling a list of 100 items — but I do NOT want a "tap to see Mara's claimed item on a map" view, ever. The map is for browsing, not for tracking my activity._

> _As Keo (organizer), I want a visual that respects my anti-goal "their location at any granularity finer than city." The FSA-polygon approach lets me look without disclosing more than I already disclose by signing up. I can stay on the list view if I prefer; the map is opt-in (toggle), not the default._

> _As a screen-reader user, I get a fully equivalent LIST view that renders the same FSA-aggregated data as a sorted text list — the map and list views are content-equivalent, not "the map is the real product and the list is an accessibility fallback." This is non-negotiable per Alex._

## Personas served

- **Deb (poster)** — primary beneficiary. Her bulk-post + community-fridge workflow benefits from seeing which neighborhoods are short on which categories so she can route surplus accordingly. The FSA-aggregation means she never reveals where the fridge is.
- **Mara (recipient)** — secondary beneficiary. The map gives her a faster "is there formula nearby" answer than scrolling the list. Her anti-goal #4 ("anyone — even verification admins — knowing what she's claimed") is preserved: the map shows AVAILABLE resources only, never claimed/reserved ones, and never her past claims.
- **Keo (trans organizer)** — load-bearing CONSTRAINT. Their anti-goal "their location at any granularity finer than city" is the reason this spec exists in its current form. The FSA polygon is several blocks; tap-to-drill goes to a filtered list, not a finer map. **If the spec ever drifts to street-level zoom, Keo deletes the app.**
- **Casey's Tier-1 community admins** — indirectly: the map makes it easier for organizers to identify low-coverage neighborhoods, supporting Casey's "seed the marketplace" mechanic in `community/growth-strategy.md`.

## Why now

Per `~/.claude/plans/goofy-singing-steele.md` Phase 3 Sub-3.2 (Days 33-37) and Tier 3 #17: **"Show resources within an FSA radius, NEVER exact addresses."** Map is sequenced SECOND in Phase 3 (after push, before chat) for three reasons:

1. **Lowest schema risk.** Unlike push (new table, new RPCs) and chat (new table, new RPCs, encryption review), the map view requires NO schema changes. The data is already in `public.users.postal_prefix` and `public.resources.posted_by`. This sequencing lets Phase 3 build confidence with a small-surface feature between push and chat.
2. **Visual storytelling for Casey's outreach.** Casey's Tier-1 outreach to partner networks (in `community/growth-strategy.md`) benefits from a screenshot that says "look how active this network already is" — without naming any resource, user, or location. The aggregated FSA-polygon view is exactly that.
3. **Friction #6 from Riley** (search/filter): the marketplace breaks past ~30 listings without spatial browsing. A map IS the most efficient spatial browser. Combined with category filter chips (Phase 2, already shipped), the map gives users a fast "what's near me, what kind" answer.

The growth-strategy 90-day target — **2-3 seeded communities, 100-300 verified users** — sees most users on a single city. The map's value scales with density. Casey's seed-strategy: a single FSA with 5+ active resources renders as a meaningfully different polygon color than an empty one; this is the visual feedback loop that tells users "yes, the network is real."

## Acceptance criteria

### AC-1: No GPS-level precision (load-bearing — Deb + Keo anti-goals)

- The map MUST NOT render any marker, pin, dot, or shape at GPS-coordinate precision (finer than FSA).
- The map MUST NOT use `expo-location` or any device-location API. The user's device GPS is NEVER read.
- The smallest unit rendered is an FSA polygon. FSA polygon boundary data is loaded from a bundled GeoJSON file (Canada Post / Statistics Canada open data; no live API call).
- Verified by Steve in code review (grep for `expo-location` import in `src/components/MapView.tsx`) + Jordan in privacy review.

### AC-2: No street-level zoom (load-bearing — Keo anti-goal)

- The map's maximum zoom level is clamped to the FSA polygon scale — roughly zoom level 11-13 in OpenStreetMap terms (city-and-neighborhood, not building-and-street).
- The map's `maxZoom` prop is set explicitly; the user cannot pinch beyond it. At max zoom, individual FSA polygons fill the viewport but street names and building outlines are NOT rendered.
- The tile provider's tileset must NOT include building-footprint or street-label tiles at the allowed zoom levels.
- Verified by Alex + Jordan in manual zoom-level testing on the staging build.

### AC-3: Tile provider is NOT Google / Mapbox-as-a-service / Apple

- The map renders tiles from **OpenStreetMap raster tiles** (free, community-run) OR from a privacy-respecting Mapbox-alternative (e.g., Stadia Maps with their privacy posture, or a self-hosted OSM tileserver — DFS-1).
- The map MUST NOT route through Google Maps, Apple Maps, or Mapbox Standard (the analytics-enabled flavor).
- The tile provider does NOT receive the user's user_id, handle, or any identifying header beyond the standard HTTP request from the OSM tile-fetch (which the OSM project documents as not retained).
- `package.json` MUST NOT include `react-native-google-maps`, `@react-native-mapbox-gl/maps`, `react-native-maps-google` or similar. `react-native-maps` is OK only if configured to use OSM tiles via overlay (not its default Google/Apple provider).
- Verified by Jordan in package audit + Steve in network-request inspection.

### AC-4: Aggregated counts only (no individual-resource markers)

- The map renders ONE polygon per FSA that has ≥1 available resource.
- Each polygon is color-graded based on count (e.g., 1-2 resources = light tint, 3-5 = medium, 6+ = dark) — Dani designs the exact gradient.
- Tapping a polygon does NOT show individual resources on the map. It transitions to the LIST view filtered by that FSA + opens the category filter at "All" (so the user sees all resources in that FSA, just like the list).
- The map polygon MUST NOT include a label showing "5 items" / "3 baby supplies" / etc. — too granular; reveals category-specific availability per neighborhood (PII-adjacent). Color gradient only.
- The polygon's `accessibilityLabel` includes the FSA code, the city, and an approximate count bucket (e.g., `"M5V Toronto, a few resources available"` — NOT `"M5V Toronto, 7 resources"`).
- Verified by Alex + Jordan in screen-reader + privacy review.

### AC-5: Screen-reader alternative as list view (non-negotiable per Alex)

- The HomeScreen has a Map/List toggle. The DEFAULT view is List (matches current behavior).
- The List view is the canonical content; the Map view is an alternative visualization of the same data.
- When the user toggles to Map view, the list is still accessible via the toggle. The map is NEVER the only way to access a resource.
- Screen-reader users on iOS / Android using VoiceOver / TalkBack get a clear announcement when the toggle state changes: `"List view"` or `"Map view, accessibility note: tap a region to see the list"`.
- The map's `accessibilityRole` is `"image"` with `accessibilityLabel` describing what's on screen at a high level (e.g., `"Map showing 4 neighborhoods with available resources in Toronto"`).
- Individual FSA polygons are NOT independently focusable by screen reader (would create a maze of nondescript "polygon" targets). Instead, a hidden list of "Active neighborhoods: M5V, M4W, M6J — 8 resources total" sits below the map in the accessibility tree.
- Verified by Alex in a full VoiceOver + TalkBack pass.

### AC-6: Reduced motion respected (no zoom-on-pan animation)

- The user's `useReducedMotion` preference (existing helper at `src/lib/useReducedMotion.ts`) controls map animations:
  - When ON: the map snaps to position on toggle / FSA tap (no animated zoom, no easing).
  - When OFF: default animated transitions (≤300ms).
- The polygon-color-on-tap visual feedback respects reduce-motion (instant color change vs. fade).
- Verified by Alex in manual testing with reduce-motion enabled at OS level.

### AC-7: Offline-safe (graceful fallback)

- If the tile provider is unreachable (no network, provider outage), the map view shows an EmptyState:
  - Title: `"Map unavailable"`
  - Description: `"The map can't load right now. Switch to list view to see resources."`
  - CTA: a button to switch to List view (replaces the broken map).
- The FSA polygon overlay (bundled GeoJSON) is available offline; only the basemap tiles fail. We could render polygons over a blank background as a tertiary fallback — DFS-3.
- The toggle still works in offline mode; the list view itself relies on Supabase data which has its own offline handling (existing).
- Verified by Steve in airplane-mode manual test.

### AC-8: Realtime updates — polygon recoloring

- The map subscribes to the same `public.resources` realtime channel as the existing list view (reuses the `useResources` hook).
- When a resource is added/claimed/deleted in an FSA, the map polygon for that FSA recolors within ~1 second to reflect the new count.
- The mounted-ref pattern (CLAUDE.md gotcha #5) guards the subscription; channel unsubscribes on screen unmount.
- Per Peter's Phase 1 perf audit, total active channels stay ≤2 per client; the map view does NOT open a new channel — it reuses the existing resources channel.

### AC-9: Resource visibility on map = visibility in list

- The map renders ONLY resources visible to the current user in the list (i.e., `status = 'available'`, verified-only RLS gate applies).
- The map MUST NOT render polygons for resources the user wouldn't see in the list (defense against RLS bypass at the map layer).
- The aggregation query is the SAME query the list uses — no new query path. Steve verifies the data flow.
- Verified by Steve in code review (same `useResources` hook, no extra query).

### AC-10: Filtering reuses existing patterns

- Category filter chips (Phase 2 — shipped) STILL APPLY when in Map view. If the user has "Baby supplies" selected, only FSAs with available baby-supplies resources render polygons.
- The Map/List toggle preserves the user's category filter across views.
- Search (Phase 2 #10 — sequenced) extension to the map: if a search term is active, polygons render only for FSAs whose resources match. (Out-of-scope detail for Phase 3.2 if search hasn't shipped yet — DFS-7.)
- Verified by Gary in a component test that toggles filters and views in sequence.

### AC-11: No third-party analytics on tile fetches

- The tile provider's HTTP requests carry no user-identifying headers beyond the standard `User-Agent` (which Expo sets to a generic Expo/React Native string).
- We do NOT enable Mapbox / Stadia / OSM-provider analytics modes.
- We do NOT use a CDN that adds tracking headers.
- `package.json` audit at Cycle 7 ship-readiness (PRIVACY.md D8) re-confirms no analytics-enabled map SDK ever crept in.
- Verified by Jordan in package audit + Steve in network-request inspection.

### AC-12: FSA polygon data is bundled, not fetched at runtime

- The Canadian FSA boundary GeoJSON (publicly available from Statistics Canada / Canada Post) is bundled into the app at build time.
- The bundled file is filtered to ONLY the FSAs covered by the cities in `public.users.city` values we expect (initially Toronto + Hamilton + Vancouver per Casey's seed plan). This keeps the bundle small (~1-2MB compressed for those cities).
- Adding a new city later requires a rebuild + app update; this is acceptable for the v1 cadence.
- No FSA polygon is ever fetched at runtime — eliminates that as a data-leak surface.
- Verified by Steve (no runtime fetch of polygons) + Peter (bundle size impact).

## Screens / layout

One surface change: the HomeScreen gains a Map/List toggle and a Map view as an alternate render.

### Surface 1: HomeScreen — List view (default, unchanged)

```
┌──────────────────────────────────────────┐
│  Home                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │   <- existing category chips
│  │ All  │ │ Food │ │ Baby │ │ HRT  │    │
│  └──────┘ └──────┘ └──────┘ └──────┘    │
│  ┌──────────────┐ ┌──────────────┐      │
│  │  List   ✓    │ │   Map        │       │   <- NEW Map/List toggle
│  └──────────────┘ └──────────────┘      │
│  ┌────────────────────────────────────┐  │
│  │ ResourceCard (existing)            │  │
│  └────────────────────────────────────┘  │
│  ...                                     │
└──────────────────────────────────────────┘
```

### Surface 2: HomeScreen — Map view (new)

```
┌──────────────────────────────────────────┐
│  Home                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│  │ All  │ │ Food │ │ Baby │ │ HRT  │    │
│  └──────┘ └──────┘ └──────┘ └──────┘    │
│  ┌──────────────┐ ┌──────────────┐      │
│  │   List       │ │  Map     ✓   │       │
│  └──────────────┘ └──────────────┘      │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │   <- Map area (50-65% of screen)
│  │   [OSM basemap, clamped zoom]      │  │
│  │                                    │  │
│  │   FSA polygons in color gradient   │  │
│  │   (light to dark, by count)        │  │
│  │                                    │  │
│  │   ┌──────┐                         │  │
│  │   │ M5V  │ (dark tint = many)      │  │
│  │   └──────┘                         │  │
│  │                                    │  │
│  │       ┌──────┐                     │  │
│  │       │ M4W  │ (medium tint)       │  │
│  │       └──────┘                     │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  4 neighborhoods active in Toronto       │   <- text summary below map
└──────────────────────────────────────────┘
```

### Surface 3: Tap an FSA polygon → drill to filtered list

Tapping the M5V polygon transitions to the LIST view, with an active "M5V" filter chip appended. The user sees ResourceCards for resources from posters whose `postal_prefix = 'M5V'`. The Map/List toggle resets to "List" automatically (DFS-5 confirms this is the right UX).

### Surface 4: Map-unavailable EmptyState

```
┌──────────────────────────────────────────┐
│  Home                                    │
│  ...                                     │
│                                          │
│         Map unavailable                  │
│                                          │
│  The map can't load right now.           │
│  Switch to list view to see resources.   │
│                                          │
│   ┌────────────────────────┐            │
│   │   Switch to list view  │            │
│   └────────────────────────┘            │
│                                          │
└──────────────────────────────────────────┘
```

### Component reuse map

| Used component                                      | Where                                                     |
| --------------------------------------------------- | --------------------------------------------------------- |
| `MapView` (NEW)                                     | Map area in HomeScreen — wraps react-native-maps with OSM |
| `Toggle` / `SegmentControl` (NEW or reuse)          | Map/List toggle (if Toggle didn't ship in Phase 3.1 push)  |
| `EmptyState`                                        | Map-unavailable fallback                                  |
| `Button` (secondary variant)                        | "Switch to list view" CTA                                 |
| `Card` (existing)                                   | Filtered list after tapping an FSA                        |
| FSA polygon (NEW)                                   | GeoJSON-rendered overlay; bundled                          |

New components: `MapView` is the primary new surface. Shamus files a `qa-reports/feature-mapview-component.md` proposal with Dani before building (polygon styling, gradient palette, max-zoom clamp).

## Data view (Jordan privacy gate — FULL review required)

This section is privacy-load-bearing. Jordan does a FULL review (not LIGHT) because location precision is the single biggest privacy lever in the app.

### What the map sees (zero new data)

The map's data source is the SAME query the list view runs:

```ts
const { data, error } = await supabase
  .from('resources')
  .select('id, posted_by, status, category, ...')
  .eq('status', 'available')
  .limit(500);
```

…plus an existing JOIN/lookup on `public.users.postal_prefix` for each `posted_by` user. Both are already-shipped queries — RLS-gated, verified-only.

The map adds ZERO new columns to any SELECT. It uses ONLY data the list view already loads.

### Aggregation happens client-side

The client computes `Map<FSA, ResourceCount>` from the loaded resources. The server NEVER computes or returns aggregated counts. This means:
- No new RPC.
- No new query that could leak "show me how many baby-supplies are in M5V" as a stand-alone privacy-sensitive query.
- The server sees the same `SELECT *` it already sees; aggregation is a client-side render concern only.

### FSA polygon data (bundled, not user data)

The FSA GeoJSON is open public-domain data from Statistics Canada / Canada Post. It contains polygon boundary coordinates only — no resident counts, no postal-address mapping. It is bundled into the app binary at build time.

### What is INTENTIONALLY excluded

| Field                                       | Why excluded                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Per-resource GPS coordinates                | Never collected. Not in schema. Not in any query.                                              |
| Per-resource street-level pickup location   | `pickup_text` is free-text per PRIVACY.md; never parsed to coordinates; never rendered on map. |
| Per-resource street-level address           | Same.                                                                                          |
| Per-user GPS coordinates                    | Never collected. `expo-location` is NOT imported.                                               |
| Per-resource posting-time location          | Never collected.                                                                                |
| Per-claim claimant location                 | Never collected.                                                                                |
| FSA-to-resource-count breakdown by category | Not rendered on map (AC-4); not exposed in tooltip/label.                                       |
| Individual resource markers                 | NEVER rendered. The polygon is the smallest unit.                                              |

### Tile provider privacy posture (DFS-1 dependent)

If we use OpenStreetMap raster tiles directly:
- The OSM Foundation runs the tile servers; their privacy policy commits to not retaining individual request logs beyond 14 days for operations purposes.
- The User-Agent header from our app would be the standard Expo / React Native one; no user_id is sent.
- Jordan verifies OSM's current policy at review time.

If we use Stadia Maps or similar (DFS-1 alternative):
- Stadia's privacy policy must be reviewed and matched against our standard.

If we use a self-hosted tile server (DFS-1 strongest):
- Eliminates the third-party hop entirely; we control the logs.
- Adds operational cost (which Casey + Sky weigh against the privacy gain).

## RPC contracts

**No new RPCs.** The map reuses the existing `useResources` hook + the existing realtime channel. This is intentional: zero new RPCs means zero new attack surfaces.

## Tests (Gary writes)

### Unit tests (pure helpers in `src/lib/mapAggregation.ts`)

The helper file exposes:

- `aggregateResourcesByFSA(resources)` — pure function returning `Map<FSA, { count, categories: Set<string> }>`. Tested with table-driven inputs including edge cases: empty array, all in one FSA, FSAs with single resources, FSAs with 10+ resources, mixed-category clusters.
- `fsaCountToColorBucket(count)` — pure function returning a NativeWind color token name. Table-driven test for boundary values (0 → no polygon; 1-2 → light; 3-5 → medium; 6+ → dark).
- `fsaCountToAccessibilityLabel(fsaCode, city, count)` — pure function returning the screen-reader description. AC-4 verifies this NEVER includes the exact count.

Each helper gets its own `*.test.ts` file in `src/__tests__/`.

### Component tests

- HomeScreen renders the Map/List toggle.
- Default toggle state is "List" (current behavior preserved).
- Switching to Map view renders the MapView component.
- Map view shows a static fallback when the tile provider is unavailable (mock the tile fetch failing).
- Category filter chips persist across Map/List toggles.
- Tapping the toggle does not lose user state (filters, scroll position in list).
- Accessibility: VoiceOver/TalkBack hears "List view" / "Map view" on toggle.
- The map's accessibilityLabel reflects current count of active FSAs.

### Integration tests

- Map view's aggregation query matches the list view's query exactly (no extra columns selected).
- The map respects the verified-user RLS gate: an unverified user (impossible by current UI but tested defensively) sees zero polygons.
- Switching to Map view does not open a new Supabase channel (reuses the existing resources channel).

### Manual smoke test (Sky walks through on staging — Phase 3.2 sync point)

1. Sign in as a verified user in Toronto; confirm Home opens to List (unchanged).
2. Tap the "Map" toggle; confirm map renders with OSM tiles and FSA polygons.
3. Confirm zoom is clamped: pinch out → map stops at the city-and-neighborhood scale. No street names visible.
4. Confirm NO pins, NO markers, NO labels showing exact counts or resource names.
5. Tap an FSA polygon (M5V, say); confirm the view switches to List with an active "M5V" filter chip.
6. Switch back to Map; confirm a filter chip (e.g., "Baby supplies") propagates — only FSAs with baby-supplies resources render polygons.
7. Turn off wifi; switch to Map; confirm the "Map unavailable" EmptyState appears with a "Switch to list view" CTA.
8. Enable reduce-motion at OS level; toggle to Map; confirm no animated transitions; polygons snap to position.
9. With VoiceOver active, toggle to Map; confirm the announcement reads "Map view, accessibility note: tap a region to see the list" and the high-level summary "4 neighborhoods active in Toronto" is read.
10. Inspect the network panel during map load; confirm tile requests go ONLY to the chosen tile provider's domain (not Google, not Mapbox); confirm no analytics requests.

## A11y (Alex pre-audit notes — Phase 3.2 build)

- **The list view IS the canonical content.** The map is an alternative visualization, not the primary surface. A user who never toggles to Map never sees a degraded experience.
- **Toggle accessibility**: the Map/List toggle uses `accessibilityRole="tablist"` and each option has `accessibilityRole="tab"` with `accessibilityState={{ selected: true/false }}`.
- **Map accessibilityLabel**: a single high-level description (`"Map showing 4 neighborhoods with available resources in Toronto"`). Individual polygons are NOT focusable.
- **Hidden list below map**: a `View` with `accessibilityElementsHidden={false}` and `accessibilityLabel="Active neighborhoods: M5V, M4W, M6J"` provides the same data as the visual map in a screen-reader-accessible form.
- **Tap targets**: each FSA polygon must be a tap target of at least 44×44 points (WCAG 2.5.5). Small/narrow FSA polygons require extra hit-area padding via overlay invisible buttons.
- **Reduce motion (AC-6)**: all map animations respect the preference.
- **Color contrast**: the polygon gradient's lightest tint must hit WCAG 2.2 AA 3:1 against the basemap. Dani designs with this in mind.
- **No flash / strobe**: polygon transitions on filter change must not flash (epilepsy safety) — fade or snap only.

## Performance considerations (Peter pre-notes)

- The bundled FSA GeoJSON adds ~1-2MB to the app bundle (cities in scope). Acceptable for the v1 trade-off (privacy > bundle size). Re-evaluate if bundle approaches the App Store soft-limit (~100MB).
- Polygon rendering: react-native-maps can struggle with >100 polygons on screen at once. Our FSA-per-city count is well below this (Toronto has ~100 FSAs; we render only those with active resources, typically <20 in a seeded community).
- Tile fetching: caches per device; first map load fetches several tiles (~10-50KB total). Subsequent loads hit the cache.
- Realtime aggregation: when the resources list updates, the aggregation recomputes client-side (O(N) where N = visible resources, typically <500 per CLAUDE.md gotcha #6).
- No new Supabase channel — reuses existing.
- Peter audits before merge to confirm no new performance regressions (FlatList scroll perf, etc.).

## Privacy considerations (Jordan pre-audit + FULL review needed)

This is the section that gates merge. Jordan does a FULL review.

1. **The tile provider choice (DFS-1) is the biggest privacy decision in the spec.** Jordan picks between OSM raw / Stadia / self-hosted based on (a) which has the cleanest privacy posture today, (b) Casey's outreach risk model, (c) operational cost.
2. **AC-1, AC-2, AC-4 are the precision contract.** Any deviation (e.g., a future "show me my friends on the map" feature) goes through Jordan AND Sky AND a PRIVACY.md amendment.
3. **`expo-location` MUST NOT be added to package.json.** Steve grep-checks; Jordan re-verifies in the package audit.
4. **The map is opt-in (toggle), not default.** Users who never toggle to Map never have their device fetch any tiles. This minimizes the tile-fetch hop for privacy-conscious users.
5. **The FSA polygon's color gradient does NOT leak category-specific data per neighborhood (AC-4).** A polygon that's "dark for baby supplies but light for HRT" would reveal sensitive patterns. Color is a single dimension: total count, all categories.
6. **The "hidden list below map" accessibility surface (AC-5) MUST follow the same aggregation rules.** Don't include per-category counts in the screen-reader description.
7. **No new schema or RPC means no new RLS surface.** Steve's existing RLS audit covers everything the map touches.

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 3.2 lands. Default behavior in parentheses is what ships if Sky doesn't override.

### DFS-1: Tile provider — OSM raw / Stadia / self-hosted?

The single biggest privacy decision. Options:

- **(a) OSM raw tiles** (free, community-run, no commercial entity, documented 14-day log retention). Drawback: their tile servers ask non-commercial use; high-volume apps are expected to self-host or pay.
- **(b) Stadia Maps** (commercial, privacy-respecting alternative to Mapbox/Google; tiered pricing; documented privacy posture). Drawback: another third-party hop; legal liability if Stadia ever changes posture.
- **(c) Self-hosted OSM tileserver** (we run it; we control the logs; no third-party). Drawback: operational cost (~$50-100/mo for the cities in scope); Rory has to maintain.
- **(d) react-native-maps default provider** (Google on Android, Apple on iOS). **REJECTED** — both providers have analytics + retention we don't control. Listed for completeness only.

**Quinn's proposal:** **Start with (a) OSM raw with the explicit understanding that we move to (c) self-hosted before public launch if (a) becomes infeasible at our scale.** This defers operational cost while preserving the privacy posture.

- [ ] Approve (a) OSM raw for Phase 3.2; move to (c) self-hosted at Cycle 7 ship-readiness
- [ ] Edit — (b) Stadia from the start (Casey + Sky review Stadia's policy)
- [ ] Edit — (c) self-hosted from the start (Rory writes the runbook)

### DFS-2: Library — react-native-maps vs Mapbox canvas vs WebView?

- **(a) react-native-maps with OSM tile overlay** (npm: react-native-maps + custom tile URL). Native performance; commonly used.
- **(b) Mapbox-style canvas** (e.g., MapLibre GL Native — open-source fork). Native; more rendering control; larger SDK.
- **(c) WebView with Leaflet.js** (lightweight, web-based map). Simplest privacy posture (no native SDK); slower; less native feel.

**Quinn's proposal:** **(a) react-native-maps with OSM tile overlay.** Most common; Shamus is familiar; well-documented; performance is fine for our polygon count.

- [ ] Approve (a) react-native-maps + OSM overlay (default)
- [ ] Edit — (b) MapLibre GL Native (more powerful, larger bundle)
- [ ] Edit — (c) WebView + Leaflet (simplest, weaker UX)

### DFS-3: Admin-defined regions vs all FSAs?

- **(a) Render polygons for ALL Canadian FSAs** in scope cities. Simpler; matches every user's possible postal_prefix.
- **(b) Render polygons only for FSAs an admin has "activated"** (e.g., the partner network's coverage area). Cleaner visual; less noise; but requires a new admin surface to define regions.

**Quinn's proposal:** **(a) all FSAs in scope cities.** Phase 3.2 should not also add an admin region-definition feature. Re-evaluate at Phase 4 if seed communities want curation.

- [ ] Approve (a) all FSAs in scope cities (default)
- [ ] Push back — (b) admin-defined; adds a Phase 3.2.5 admin surface

### DFS-4: Tap polygon → filtered list, or filtered map drill?

- **(a) Tap polygon → switch to List view with that FSA filtered** (Quinn's recommendation in AC-4).
- **(b) Tap polygon → zoom into a deeper map view** of just that FSA (REJECTED — violates AC-2; no street-level zoom allowed).
- **(c) Tap polygon → modal showing the count + categories + a button to "View in list"** (intermediate).

**Quinn's proposal:** **(a) direct to list.** The map is for browsing; the list is for acting. One tap to action is good UX. The modal in (c) adds friction without value.

- [ ] Approve (a) direct to list (default)
- [ ] Edit — (c) intermediate modal
- [ ] Push back — (b) is rejected; reconfirm with Quinn before any drift

### DFS-5: Toggle state — preserve across screens or reset?

- **(a) Toggle resets to "List" when user leaves and returns to HomeScreen** (matches React Navigation default for tab screens).
- **(b) Toggle state persists across navigation via AsyncStorage** (user preference is sticky).

**Quinn's proposal:** **(a) reset to List on return.** Reduces surprise for users who toggle Map once and don't want it as default. Sticky preference is over-engineering for v1.

- [ ] Approve (a) reset to List (default)
- [ ] Edit — (b) persist as user preference

### DFS-6: Categories scope for the map — initial v1 vs all?

The Phase 2 category enum is `food | hygiene | baby | hrt | other` (per Phase 2 spec). Does the map render all categories' aggregations equally, or stratify?

**Quinn's proposal:** **All categories aggregated equally; color is single-dimension (total count).** Per AC-4 / Jordan: per-category neighborhood breakdown is PII-adjacent and dropped from v1.

- [ ] Approve all-categories-equal (default)
- [ ] Push back — surface per-category color (requires Jordan re-review)

### DFS-7: Search interaction with map?

Phase 2 #10 (search/filter) is sequenced but not shipped. If search ships before Phase 3.2:

**Quinn's proposal:** **The search input is hidden in Map view** (search is a list-view affordance). When the user searches, the toggle auto-switches to List. Re-evaluate after Phase 2 #10 lands.

- [ ] Approve hide-search-in-map (default if search ships first)
- [ ] Edit — search persists in Map and filters polygons by matching resources

## Out of scope for Phase 3.2 (Map)

The following are deliberately deferred. Each has a follow-up named so we don't lose track.

- **Per-resource pins on the map.** NEVER ship. Violates Deb anti-goal #1 + Keo anti-goal location-finer-than-city. The polygon is the smallest unit forever.
- **Street-level zoom.** NEVER ship. Violates AC-2.
- **User location pin ("you are here").** NEVER ship. Requires GPS read → violates AC-1.
- **Route-to-pickup directions.** NEVER ship. Requires GPS + third-party routing API → multiple privacy violations.
- **Map-based search ("draw a region to filter").** Defer to Phase 4 polish. The polygon-tap drill (AC-4) is the v1 substitute.
- **Heatmap rendering.** Deferred — heatmaps add visual noise without informing the user better than polygons. Re-evaluate post-launch.
- **Multi-city map view.** Defer — initial cities are bundle-included via DFS-3 (a). Adding cities is a rebuild.
- **Map view for the verification queue (admin surface).** NEVER ship. The verification queue is a private admin surface; rendering it on a map is unnecessary and surface area.

## Cross-spec dependencies

- **Phase 3.1 (Push — Spec #1 above):** If the `Toggle` component was built for push, this spec reuses it. If not, this spec adds the Toggle component (and Phase 3.1 reuses it after).
- **Phase 2 (Categories — shipped):** The map RESPECTS the active category filter (AC-10). Map filtering and list filtering share the same state.
- **Phase 2 #10 (Search — sequenced):** DFS-7 covers the map+search interaction. If search ships first, the spec defaults to hide-search-in-map.
- **Existing `useResources` hook:** The map reuses this hook unchanged. ZERO new query paths.
- **NO dependency on Phase 3.3 (Chat) or Phase 3.4 (i18n).** Map is self-contained.

## Definition of done

- All 12 AC pass manually on staging.
- All unit + component tests pass green.
- All integration tests pass green.
- Jordan signs off on Section 5 (data view + tile provider choice) — FULL privacy review.
- Alex signs off on the screen-reader alternative being content-equivalent (not a fallback) — FULL accessibility review.
- Steve signs off on no new RLS surface + no `expo-location` import + tile-provider network audit.
- Peter signs off on bundle size impact + render perf with N polygons on screen.
- Dani signs off on the polygon color gradient + the Map/List toggle visual design.
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 7 DECISIONS FOR SKY items (DFS-1 through DFS-7) before merge.
- Will updates `CLAUDE.md` "Status" line + adds the "FSA-polygon-only, never GPS pins" rule to the Gotchas section.
- Morgan briefing in `qa-reports/phase-3-map-view-YYYY-MM-DD.md` summarising what shipped + screenshots from staging.

## Privacy review level

**FULL** — location precision is the single biggest privacy lever in the app; Jordan picks the tile provider; Jordan re-affirms PRIVACY.md D3 in the context of a map render.

## Sky-decision gates beyond default DFS

1. **DFS-1 (tile provider)** — operational and legal trade-off; Sky picks among (a/b/c).
2. **OSM Foundation's current policy** — Jordan re-verifies; if drifted since 2026-05-24, Sky decides whether to keep OSM or migrate.
3. **GeoJSON source license** — Statistics Canada / Canada Post FSA data; confirm license terms permit our use; legal flag to Sky.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
