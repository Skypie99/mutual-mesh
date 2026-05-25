/**
 * Pure map helpers — Phase 3.2 Resource Map.
 *
 * Coordinate math, region defaults, and clustering utilities for the
 * FSA-aggregated map view. Zero React, zero Supabase, zero native deps.
 * Fully unit-tested in `src/__tests__/mapHelpers.test.ts`.
 *
 * Privacy posture (Quinn AC-1, AC-2 + Jordan review):
 *   - The map's default region is a fixed city center (Kelowna v1 launch).
 *   - Max zoom is clamped at the FSA-polygon scale (~zoom 12). NEVER
 *     street-level.
 *   - No GPS, no expo-location, no device coordinates.
 *   - All coordinate computation is approximate (sufficient for FSA-scale;
 *     no building-level precision needed or wanted).
 */

import type { FsaDescriptor } from './fsaAggregation';

// ============================================================================
// Region type — matches react-native-maps Region shape
// ============================================================================

/**
 * A map region (center + span). Compatible with react-native-maps'
 * `Region` type so we can pass this directly to `<MapView region={...}>`.
 */
export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

// ============================================================================
// Defaults — privacy-safe, no GPS
// ============================================================================

/**
 * Default map region: Kelowna, BC — the v1 launch city.
 * Center: ~49.888 N, ~119.496 W.
 * Delta sized for a city-wide view (FSA-polygon scale).
 */
export const DEFAULT_REGION: MapRegion = {
  latitude: 49.888,
  longitude: -119.496,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

/**
 * Maximum zoom level for the map in OpenStreetMap terms.
 * Clamped at 13 — neighborhood scale. NEVER street-level (which starts
 * at ~15-16). Jordan BLOCKING CONDITION 2.1.
 *
 * For react-native-maps, this translates to a minimum latitudeDelta
 * below which we clamp the region.
 */
export const MAX_ZOOM_LEVEL = 13;

/**
 * Minimum delta (max zoom) — roughly zoom level 13 in OSM terms.
 * At this delta, FSA polygons fill the viewport but individual streets
 * and buildings are NOT visible. Enforced as a floor on latitudeDelta.
 */
export const MIN_DELTA = 0.02;

/**
 * OpenStreetMap tile URL template. Privacy-safe: OSM Foundation servers,
 * no Google/Apple/Mapbox analytics. Standard raster tiles.
 *
 * Jordan DFS-MAP-1: Sky picks the final provider. This default is OSM
 * raw per Quinn's spec. Swap to Stadia or self-hosted URL before launch.
 */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// ============================================================================
// Region helpers
// ============================================================================

/**
 * Clamp a region's zoom so it never goes below FSA-polygon scale.
 * If the user pinches to zoom in past our floor, we snap back.
 *
 * Pure. Returns a new region; never mutates input.
 */
export function clampRegionZoom(region: MapRegion): MapRegion {
  if (region.latitudeDelta >= MIN_DELTA && region.longitudeDelta >= MIN_DELTA) {
    return region;
  }
  return {
    ...region,
    latitudeDelta: Math.max(region.latitudeDelta, MIN_DELTA),
    longitudeDelta: Math.max(region.longitudeDelta, MIN_DELTA),
  };
}

/**
 * Compute a bounding region that fits all given FSA descriptors.
 * Falls back to DEFAULT_REGION when the list is empty.
 *
 * The region is sized with 20% padding around the bounding box so
 * edge polygons aren't clipped.
 *
 * NOTE: This uses approximate FSA center coordinates derived from
 * the FSA code itself. Canadian FSAs starting with specific letters
 * map to known provinces. For v1 we use a simple lookup table of
 * known FSA centroids for the launch cities. If the FSA is unknown,
 * we fall back to DEFAULT_REGION.
 *
 * @privacy-load-bearing PRIVACY.md §D3 — computes map viewport from FSA
 * centroids (postal prefix only, not GPS coordinates). Do not replace FSA
 * centroids with user coordinates without Jordan review.
 */
export function regionForDescriptors(
  descriptors: readonly FsaDescriptor[],
  fsaCentroids: ReadonlyMap<string, { lat: number; lng: number }>,
): MapRegion {
  if (descriptors.length === 0) return DEFAULT_REGION;

  const coords: { lat: number; lng: number }[] = [];
  for (const d of descriptors) {
    const center = fsaCentroids.get(d.fsa);
    if (center) coords.push(center);
  }

  if (coords.length === 0) return DEFAULT_REGION;

  let minLat = coords[0]!.lat;
  let maxLat = coords[0]!.lat;
  let minLng = coords[0]!.lng;
  let maxLng = coords[0]!.lng;

  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }

  const latDelta = Math.max((maxLat - minLat) * 1.2, MIN_DELTA);
  const lngDelta = Math.max((maxLng - minLng) * 1.2, MIN_DELTA);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

/**
 * Check whether two regions are "close enough" that we don't need to
 * animate a transition. Used to debounce region changes.
 */
export function regionsAreClose(a: MapRegion, b: MapRegion, threshold = 0.001): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < threshold &&
    Math.abs(a.longitude - b.longitude) < threshold &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) < threshold &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) < threshold
  );
}

// ============================================================================
// FSA centroid placeholders — v1 launch cities
// ============================================================================

/**
 * Placeholder FSA centroids for v1 launch cities.
 * In production, these come from the bundled GeoJSON (AC-12).
 * For now, a hand-curated set for Kelowna-area FSAs.
 *
 * Format: Map<FSA code, { lat, lng }>
 */
export const LAUNCH_CITY_CENTROIDS: ReadonlyMap<string, { lat: number; lng: number }> = new Map([
  // Kelowna, BC area
  ['V1V', { lat: 49.886, lng: -119.496 }],
  ['V1W', { lat: 49.907, lng: -119.477 }],
  ['V1X', { lat: 49.87, lng: -119.44 }],
  ['V1Y', { lat: 49.888, lng: -119.496 }],
  // Toronto area (for testing + future)
  ['M5V', { lat: 43.641, lng: -79.395 }],
  ['M4W', { lat: 43.677, lng: -79.381 }],
  ['M6J', { lat: 43.648, lng: -79.421 }],
  // Hamilton area
  ['L8P', { lat: 43.255, lng: -79.87 }],
  ['L8R', { lat: 43.259, lng: -79.861 }],
  // Vancouver area
  ['V6B', { lat: 49.278, lng: -123.111 }],
  ['V6A', { lat: 49.282, lng: -123.098 }],
]);

// ============================================================================
// Color helpers — map bucket to theme-compatible color values
// ============================================================================

import type { FsaCountBucket } from './fsaAggregation';

/**
 * Map an FSA count bucket to polygon fill colors (light mode).
 * Uses theme-adjacent values. Semi-transparent so the basemap shows through.
 *
 * These are NOT raw hex in the NativeWind sense — they're programmatic
 * values for the map overlay, which can't use className. The source colors
 * are derived from `colors.light.accent` (#1F7A6A) at varying opacities.
 */
export const BUCKET_FILL_COLORS_LIGHT: Record<FsaCountBucket, string> = {
  none: 'transparent',
  light: 'rgba(31, 122, 106, 0.15)',
  medium: 'rgba(31, 122, 106, 0.35)',
  heavy: 'rgba(31, 122, 106, 0.55)',
};

/**
 * Dark mode polygon fills — derived from `colors.dark.accent` (#4FBFA8).
 */
export const BUCKET_FILL_COLORS_DARK: Record<FsaCountBucket, string> = {
  none: 'transparent',
  light: 'rgba(79, 191, 168, 0.15)',
  medium: 'rgba(79, 191, 168, 0.35)',
  heavy: 'rgba(79, 191, 168, 0.55)',
};

/**
 * Polygon stroke (border) color — subtle, mode-aware.
 */
export const POLYGON_STROKE_LIGHT = 'rgba(31, 122, 106, 0.6)';
export const POLYGON_STROKE_DARK = 'rgba(79, 191, 168, 0.6)';

/**
 * UI-facing label for an FSA bucket — used in chips and preview sheets.
 * Distinct from FSA_BUCKET_LABEL (accessibility, lowercase) in fsaAggregation.
 */
export function bucketLabel(bucket: FsaCountBucket): string {
  if (bucket === 'light') return 'A few resources available';
  if (bucket === 'medium') return 'Several resources available';
  if (bucket === 'heavy') return 'Many resources available';
  return 'No resources';
}
