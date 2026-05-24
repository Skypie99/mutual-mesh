# Privacy review — Phase 3.2 Map View — Jordan — 2026-05-24

> **NOT A LAWYER DISCLAIMER.** Jordan is the Privacy Advisor role inside Sky's Claude Corp system, not a licensed attorney. Nothing in this document is legal advice. PIPEDA references, "tile-provider privacy posture" claims, and statements about OSM Foundation / Stadia Maps / Statistics Canada / Apple / Google retention behavior are reasoned from publicly-available documentation as of the review date. Before public launch, a qualified Canadian privacy lawyer must independently sign off — see PRIVACY.md D10 and Cycle 7 ship-readiness.

> **Status: APPROVED WITH CONDITIONS.** 4 BLOCKING conditions, 3 PRIVACY.md amendments proposed, 2 DECISIONS FOR SKY.

---

## Scope of this review

This is the FULL privacy review of `qa-reports/spec-phase-3-map-view.md` against:

- `PRIVACY.md` (🟢 APPROVED 2026-05-23, locked) — D3 (FSA-equivalent breadth) is the architectural anchor
- Constitution Art. 7.6 — privacy review mandatory for marginalized-group + location data; Sky approval required before merge
- `research/personas/persona-deb-2026-05-23.md` — anti-goal #1 ("anything that exposes the community fridge's exact address") is load-bearing
- `research/personas/persona-keo-2026-05-23.md` — "their location at any granularity finer than city" is load-bearing
- `research/personas/persona-mara-2026-05-23.md` — implicit: the map must not reveal what she's claimed (anti-goal #4)
- `qa-reports/2026-05-23_threat-model-stride.md` — no direct STRIDE entry for map; the spec adds a new tile-provider trust-boundary surface that the threat model does not currently enumerate

The spec is sound architecturally. The architectural anchor — "FSA-radius polygons only, never GPS pins, never street-level zoom" — directly addresses Deb anti-goal #1, Keo's location-finer-than-city threshold, and Mara's anti-goal #4 (the map shows AVAILABLE resources only, never claimed/reserved, never claim history).

---

## Verdict

**APPROVED WITH CONDITIONS.**

The map view is a privacy-sensitive surface because location precision is the single largest privacy lever in the app. PRIVACY.md D3 settles the data-collection question (3-char FSA, neighborhood-level, never building-level). This spec extends the lever to render-time: the smallest geometric unit visualized must equal the smallest geometric unit collected. Zero precision creep at the render layer.

The spec satisfies this in design. The verdict is conditional because four operational decisions need stronger commitments before merge:

1. The tile provider choice (DFS-1) shifts the trust-boundary surface in ways the spec acknowledges but PRIVACY.md does not yet enumerate. Each option leaks tile-request metadata to a different party.
2. The FSA-radius constraint must be load-bearing in code (max-zoom clamp), not merely a UI affordance.
3. The screen-reader alternative (AC-5) is non-negotiable per Alex AND per the privacy posture (a sighted-only privacy contract is no contract for non-sighted users).
4. The offline behavior must be a graceful fallback to list-view with zero tile-request leakage when offline (i.e., no retry-on-reconnect that emits a queued tile request later).

---

## Concerns and recommendations

### Concern 1 — Tile provider choice leaks request metadata to a third party (BLOCKING)

The spec's AC-3 + Section 5 acknowledge three tile-provider options (Quinn DFS-1):

- **(a) OpenStreetMap raw tiles** (free; OSM Foundation runs servers; documented 14-day request-log retention). Each tile fetch sends a standard HTTP request to `tile.openstreetmap.org` (or a regional mirror) carrying the user's IP address, User-Agent, and the tile coordinates (which leak the user's current map viewport).
- **(b) Stadia Maps** (commercial; privacy-respecting; tiered pricing; documented policy). Each tile fetch goes to `tiles.stadiamaps.com` (or equivalent), same metadata leak surface as (a) but with a different operator.
- **(c) Self-hosted OSM tileserver** (we run it; we control logs). Eliminates the third-party hop entirely. Adds operational cost.

Each of these is a residual privacy risk that Keo's threat model (state actors, immigration, far-right doxxing) takes seriously. The tile coordinates reveal what part of the city Keo is looking at, even if the polygons themselves are FSA-grained. A subpoena to OSM Foundation could produce a log of "this IP requested tiles for these regions at these times" — at minimum, a heat-map of Keo's browsing.

The spec does not currently propose mitigations for this leak beyond choosing the provider with the cleanest policy. The PRIVACY.md "data inventory" table does not currently list tile-provider metadata as a residual disclosure.

**BLOCKING CONDITION 1.1:** PRIVACY.md must be amended to disclose the tile provider as a recipient of tile-request metadata (IP, User-Agent, tile coordinates, timing). See "PRIVACY.md edits proposed" below. This amendment must land BEFORE the map view ships to staging, not as a follow-up.

**BLOCKING CONDITION 1.2:** Sky's resolution of DFS-1 must be considered against Casey's growth-strategy threat model — specifically, whether OSM Foundation's documented policy is acceptable for Keo's persona, given that immigration + far-right adversaries are in scope. Jordan's recommendation (see DECISIONS FOR SKY below): start with Stadia Maps (b), NOT OSM raw (a), because Stadia's commercial relationship gives us a contractual / SLA hook for privacy commitments that OSM Foundation's volunteer governance does not. Alternatively, go straight to self-hosted (c) and accept the operational cost.

**BLOCKING CONDITION 1.3:** Whichever provider is chosen, the Profile screen (or an in-app About page) must disclose the choice in plain language. Recommended copy: `"The map view fetches map images from <provider>. Your phone's IP address and what part of the map you're looking at are visible to that provider. The map is opt-in — if you stay on List view, no map requests are made."` Casey + Will collaborate on the exact wording; Jordan re-reviews before merge.

### Concern 2 — FSA-radius MUST be the smallest geometric precision; never street-level zoom (BLOCKING)

AC-1 + AC-2 lock the precision contract in spec text. AC-2 requires `maxZoom` to be clamped at the FSA polygon scale (zoom 11-13 in OpenStreetMap terms). This is the right design.

What needs reinforcement:

- The `maxZoom` clamp must be enforced at the `MapView` component prop, not in user-toggleable settings. Confirmed in the spec.
- The TILE PROVIDER's tileset (regardless of which provider Sky picks) must NOT serve building-footprint or street-label tiles at the allowed zoom levels. Some OSM tile styles (e.g., the default `osm-bright`) start labeling streets at zoom 11+ in dense urban areas. This is the provider's choice and varies by tile style.
- A polygon fill that's too dark in low-density areas could expose a single-property FSA. Some Canadian FSAs are very small — e.g., M5G (the Toronto Eaton Centre area) is a single block. If the polygon for M5G shows "dark tint = many resources" and only one user lives there, that's a 1-of-1 attack: the resource is theirs. This is a precision-creep risk the spec does not currently address.

**BLOCKING CONDITION 2.1:** The tile style must be selected (or self-hosted style configured) such that street names and building outlines are NOT rendered at any zoom level the user can reach. Confirm at build time by Steve in code review. The provider-specific tile-style URL is a config decision; document the chosen URL in the spec's RPC section / PRIVACY.md.

**BLOCKING CONDITION 2.2:** Single-resident FSAs are a 1-of-1 attack surface. The aggregation logic in `aggregateResourcesByFSA` must NOT render a polygon for an FSA where the count of unique posters is < 2 (i.e., suppress small-cell counts). Specifically: if an FSA has resources from only one poster, suppress the polygon entirely (defer to the list view). Add this to AC-4 as a new bullet. Surface to Quinn for spec amendment. This is the small-cell suppression rule from privacy-preserving cartography; the threshold of 2 is conservative.

### Concern 3 — Screen-reader alternative is non-negotiable (APPROVED, REINFORCE PRIVACY POSTURE)

AC-5 specifies a fully-equivalent LIST view. Alex's pre-audit notes confirm: "The list view IS the canonical content. The map is an alternative visualization, not the primary surface."

This is right both for accessibility AND for privacy. A privacy contract that protects only sighted users is no contract at all. If the map renders aggregated FSA polygons and the list renders the same data, the privacy posture is the same. If the map ever evolves to show data the list doesn't (e.g., a "tap polygon to see who's posting in this neighborhood" feature), the privacy contract diverges by sighted-vs-blind, which is unacceptable.

**RECOMMENDATION (non-blocking, but firm):** Add an explicit rule to the spec: "Any future map feature that surfaces information not available in the list view requires Jordan + Alex re-review." Surface to Quinn for spec amendment. Without this rule, future scope creep could degrade either the privacy contract or the accessibility contract.

The "hidden list below map" accessibility surface (AC-5) — `"Active neighborhoods: M5V, M4W, M6J — 8 resources total"` — also needs the small-cell suppression rule from Concern 2.2 above. Don't enumerate FSAs with < 2 unique posters.

### Concern 4 — Offline behavior MUST be graceful fallback with zero tile-request leakage (BLOCKING)

AC-7 covers the offline case: the map shows an EmptyState ("Map unavailable") with a CTA to switch to list view. This is the right design.

What needs reinforcement:

- When the device is offline and the user toggles to Map, the map MUST NOT queue tile requests for retry when the network comes back. A queued request that fires later — even minutes after the user has moved on — leaks the user's then-viewport (or attempted viewport) to the tile provider with no user-visible action. This is a subtle leak: the user thinks the map was "unavailable" and forgets; the provider gets a delayed view of their interest.
- The map's tile-fetch layer must use a non-retrying HTTP client for tile requests. The standard `react-native-maps` + tile-overlay approach uses `fetch` under the hood, which respects standard `fetch` retry semantics (none by default). Confirm in code review that no custom retry-with-backoff wrapper is added.
- The bundled FSA polygon GeoJSON (AC-12) IS offline-safe — bundled at build time, no network call. Approved.

**BLOCKING CONDITION 4.1:** Steve verifies in airplane-mode manual testing that toggling to Map → toggling back → re-enabling network results in ZERO tile requests being emitted to the provider. Add this to AC-7 as a new bullet. Test in the manual smoke list.

### Concern 5 — `expo-location` must NEVER be imported (APPROVED, harden the check)

AC-1 + Section 5 + Section 7 all say `expo-location` is NOT imported. Steve verifies via grep. This is right.

**RECOMMENDATION (non-blocking, but recommend):** Add a CI gate that fails if any source file imports `expo-location`. Gary writes a simple grep-based test in `src/__tests__/no-location.test.ts` that asserts no source file under `src/` imports `expo-location`. Surface to Gary. This makes the "never import expo-location" rule load-bearing in CI, not just in code review.

### Concern 6 — Aggregation happens client-side (APPROVED)

Section 5 specifies that aggregation (FSA → count) happens client-side from the existing `useResources` query result. No new RPC, no new query, no new server-side aggregation.

This is exactly the right design. The privacy benefit: no new query path means no new opportunity for the server to expose "show me how many baby supplies are in M5V" as a stand-alone query (which an attacker with anon-key access could otherwise call). Approved.

One observation: the existing `useResources` query SELECTs `posted_by` (per the spec's Section 5 example). To aggregate by FSA, the client needs `posted_by` → `users.postal_prefix`. The spec doesn't explicitly say whether this is fetched via JOIN or a separate query. If it's a separate query that enumerates all `users` rows for all current resources, that could be a privacy issue (exposes more user metadata than necessary).

**RECOMMENDATION (non-blocking):** Confirm in code review that the FSA lookup uses a JOIN on the existing query (SELECT including `users.postal_prefix` via the FK), NOT a separate `SELECT * FROM users` query. Specifically, the `useResources` hook should be extended to JOIN-select `users.postal_prefix` in the same query that returns resources. This keeps the data envelope minimal.

### Concern 7 — Color gradient does NOT reveal category-specific patterns per neighborhood (APPROVED)

AC-4 explicitly forbids per-category coloring. The single dimension is total count. Per Section 7 (Privacy considerations): "A polygon that's 'dark for baby supplies but light for HRT' would reveal sensitive patterns. Color is a single dimension: total count, all categories."

This is the right call. Per-category neighborhood breakdown is PII-adjacent in the worst way: it reveals patterns of need by community. Approved.

### Concern 8 — Tap-polygon drill goes to filtered LIST, not deeper map (APPROVED)

AC-4 + DFS-4 settle: tapping an FSA polygon switches to List view with that FSA filter applied. No deeper map view. No street-level drill. This is the right design and directly mitigates the precision-creep risk from Concern 2.

Approved. Note that DFS-4 option (b) — "tap polygon → zoom into a deeper map view" — is explicitly REJECTED in the spec ("violates AC-2; no street-level zoom allowed"). Good.

### Concern 9 — Bundled FSA polygon GeoJSON license + scope (APPROVED, surface to Sky)

AC-12 specifies the FSA polygon GeoJSON is bundled at build time, filtered to Toronto + Hamilton + Vancouver (Casey's seed plan). Adding a new city later requires a rebuild.

The license of the source data matters:
- **Statistics Canada Postal Code Boundary File** is available under the Open Government Licence – Canada (OGL-Canada 2.0), which permits unrestricted use including commercial, with an attribution requirement.
- **Canada Post FSA boundaries** — Canada Post sells FSA polygon data commercially; using their data requires a license. We should NOT use Canada Post's data without a paid license.

The spec's Section 5 says "Canada Post / Statistics Canada open data," conflating two distinct sources. Statistics Canada's data is open; Canada Post's is licensed.

**RECOMMENDATION (non-blocking, but resolve before build):** Sky decides which source. Default to Statistics Canada (OGL-Canada 2.0) per cost + license clarity. Surface in DECISIONS FOR SKY below. Will adds the attribution to an About page / credits surface (Phase 4 polish acceptable).

### Concern 10 — Map is opt-in, default List view (APPROVED)

AC-5 + Surface 1 confirm the default view is List. The map is opt-in via toggle. This minimizes the tile-fetch hop for users who never toggle Map. Approved — and this is the right design for Keo's persona (their preference is pull-only, no automatic location-aware UI).

DFS-5 confirms: toggle state resets to "List" on screen return (not persisted across sessions). This is also right for Keo's persona — surprise-free defaults.

---

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 3.2 lands. Jordan's recommendation in parentheses.

### DFS-MAP-1: Tile provider — OSM raw / Stadia / self-hosted?

Quinn's DFS-1 in the spec offers three options. Jordan's privacy-driven recommendation differs from Quinn's "start with OSM raw."

- **(a) OSM raw tiles.** Free; community-run. Privacy posture: documented 14-day log retention; tile requests carry IP + viewport. Concern: OSM Foundation is volunteer-governed; we have no contractual privacy commitment beyond their public policy.
- **(b) Stadia Maps.** Commercial; privacy-respecting. We can sign a service agreement that contractually binds them to documented retention. Cost: small monthly fee (commercial plan).
- **(c) Self-hosted OSM tileserver.** No third-party hop. We control logs entirely. Cost: ~$50-100/mo infrastructure + Rory's ongoing maintenance.

**Jordan's recommendation:** **(b) Stadia Maps from the start, with a path to (c) self-hosted at Cycle 7 ship-readiness if cost or scale demands.** The privacy-vs-cost trade-off favors Stadia over OSM raw because we get a contractual hook (and SLA) for our privacy commitments — important for Casey's outreach to risk-aware partner networks like Keo's. (a) OSM raw is acceptable for development / staging if Stadia is overkill for that phase.

- [ ] Approve (b) Stadia Maps from the start (Jordan's recommendation; contractual privacy hook)
- [ ] Edit — (a) OSM raw with planned migration to (c) before public launch (Quinn's recommendation)
- [ ] Edit — (c) self-hosted from the start (cleanest; highest operational cost)

### DFS-MAP-2: FSA polygon data source — Statistics Canada or Canada Post?

Per Concern 9 above, the spec conflates two sources.

- **(a) Statistics Canada Postal Code Boundary File** under OGL-Canada 2.0. Free; commercial use OK; attribution required.
- **(b) Canada Post FSA polygon data.** Licensed; requires payment.

**Jordan's recommendation:** **(a) Statistics Canada.** Cost-free, license-clean, attribution is a small Phase 4 polish item. Will adds attribution to an About / credits surface.

- [ ] Approve (a) Statistics Canada (Jordan's recommendation; OGL-Canada 2.0)
- [ ] Edit — (b) Canada Post (requires license + budget; pushes ship date)

---

## PRIVACY.md edits proposed (DO NOT APPLY — Sky approves; Jordan writes via separate PR)

The following are proposed edits to PRIVACY.md. Jordan does NOT apply them in this review (file-only, no PRIVACY.md modification per constraint). Sky reviews these edits and, if approved, Jordan writes them in a follow-up privacy branch.

### Edit 1 — Add new "Map view tile provider — third-party recipients" subsection

Insert after the "Data inventory (final)" section (and after the push-notification recipients subsection from the push review, if that lands first):

```
## Map view tile provider — third-party recipients (Phase 3.2)

When a user toggles to the optional Map view (default is List), the map fetches basemap tiles from a tile provider. We disclose the provider as a recipient of tile-request metadata.

| Party | What they see | What they retain | Why |
| ----- | ------------- | ---------------- | --- |
| <Chosen tile provider — Sky resolves DFS-MAP-1> | Device IP address; User-Agent; tile coordinates (which leak the map viewport); request timing | Per provider's documented policy (OSM Foundation: 14d; Stadia: per service agreement; self-hosted: per our retention policy) | Render basemap tiles under FSA polygons |

**What is never sent to the tile provider:** user_id, handle, email, resource data, claim history, push tokens, or any user-generated content. The HTTP request is a standard tile fetch; we add no custom headers beyond the framework default.

**Render precision:** the map's maximum zoom level is clamped at the FSA polygon scale. Street names and building outlines are NOT rendered at any zoom level the user can reach. The smallest geometric unit visualized equals the smallest collected (3-char FSA per D3). Polygons are suppressed for FSAs with fewer than 2 unique posters (small-cell suppression).

**The map is opt-in.** Users who stay on List view (default) trigger ZERO tile requests. Users can revert to List at any time; the toggle is one tap.

**Offline behavior:** if the network is unavailable, the map shows a fallback EmptyState. No tile requests are queued for retry — the request layer does not retry when the network returns.
```

### Edit 2 — Add row to the "Data inventory (final)" table for `users.postal_prefix` use in map render

The `postal_prefix` row is already in the inventory at row 3. Add a clarifying note in the existing "Who sees it" column for that row:

> **Edit (proposed):** Change "All verified users" to "All verified users; rendered visually on the optional Map view as an FSA-aggregated polygon when ≥2 unique posters have resources in that FSA"

This makes the map render usage explicit in the inventory rather than hidden in a downstream document.

### Edit 3 — Add new decision D12 to "DECISIONS FOR SKY" section

```
### D12: Map view with FSA-radius polygons only (Phase 3.2 — added 2026-05-24)

**Proposal:** Opt-in Map view on the HomeScreen rendering FSA-aggregated polygons (color-graded by count) over basemap tiles from a chosen tile provider. Default view is List. Maximum zoom clamped at FSA scale; never street-level. No GPS, no `expo-location`, no per-resource pins. Small-cell suppression for FSAs with <2 unique posters.

**Why:** Spatial browsing accelerates claim-coordination for Casey's seed-community targets; FSA-polygon-only design preserves Deb's anti-goal (fridge address never exposed) and Keo's location-finer-than-city threshold.

**Trust boundary addition:** the chosen tile provider sees tile-request metadata (IP, viewport, timing). Disclosed in the "Map view tile provider — third-party recipients" subsection above.

**Alternative considered:** No map; list-only as in v1. Rejected because spatial browsing is friction #6 from Riley. Per-resource pins on a map; REJECTED — violates persona anti-goals.
**Rollback:** Toggle is one-tap reversible; users default to List; the map can be feature-flagged off if the tile provider's policy drifts.

- [ ] (Sky reviews after Phase 3.2 amendment lands)
```

---

## What this review does NOT cover

- The exact `maxZoom` value in OpenStreetMap zoom-level units (Shamus picks during build; verified by Steve).
- The exact color gradient palette (Dani designs; verified by Alex for WCAG 2.2 AA contrast).
- The bundle size impact of the FSA GeoJSON (Peter's perf review covers).
- The library choice (Quinn's DFS-2: react-native-maps vs MapLibre GL Native vs WebView). Privacy posture is roughly equivalent across all three; Quinn's (a) react-native-maps + OSM overlay is fine from a privacy standpoint.
- The realtime channel reuse (Peter + Steve cover; AC-8 is right).
- A real Canadian privacy lawyer's PIPEDA analysis (Cycle 7 ship-readiness per PRIVACY.md D10).

---

## Summary table

| Concern # | Topic | Verdict | Blocking? |
| --------- | ----- | ------- | --------- |
| 1 | Tile provider leaks request metadata | Address via PRIVACY.md amendment + microcopy + DFS-MAP-1 | BLOCKING (3 sub-conditions) |
| 2 | FSA-radius = smallest precision, never street-level zoom | APPROVED with two BLOCKING sub-conditions (tile-style configuration + small-cell suppression) | BLOCKING |
| 3 | Screen-reader alternative is non-negotiable | APPROVED, recommend future-feature rule | NO |
| 4 | Offline behavior — graceful fallback, no tile-request queue | APPROVED with one BLOCKING sub-condition (no-retry verification) | BLOCKING |
| 5 | `expo-location` never imported | APPROVED, harden with CI grep test | NO |
| 6 | Aggregation client-side, no new server query | APPROVED with JOIN-not-separate-query check | NO |
| 7 | Color gradient single-dimension only | APPROVED | NO |
| 8 | Tap-polygon → filtered LIST | APPROVED | NO |
| 9 | GeoJSON license — Statistics Canada vs Canada Post | Resolve via DFS-MAP-2 | NO (DECISION) |
| 10 | Map opt-in, default List | APPROVED | NO |

**BLOCKER count: 4 clusters (Concern 1.1/1.2/1.3; Concern 2.1/2.2; Concern 4.1; Concern 9 is a DECISION, not a blocker).**
**PRIVACY.md edits proposed: 3 (1 new tile-provider subsection + 1 inventory clarification + 1 new D12 decision).**
**DECISIONS FOR SKY: 2 (DFS-MAP-1 tile provider, DFS-MAP-2 FSA data source).**

---

**Jordan — 2026-05-24** — file-only privacy review, no PRIVACY.md modification, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
