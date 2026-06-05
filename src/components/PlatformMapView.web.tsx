/**
 * PlatformMapView — web path.
 *
 * Real react-leaflet implementation restored from the Phase 3 spec
 * (LEARNINGS.md 2026-05-25 "Phase 3 web-compat").
 *
 * Privacy guard (Jordan advisory — LEARNINGS.md 2026-05-25 "FSA aggregation"):
 *   - Renders FSA/neighborhood polygon scale only.
 *   - Leaflet zoom is clamped to [2, 13] — NEVER street-level.
 *   - No GPS pins. No individual resource markers.
 *   - `onRegionChangeComplete` is intentionally not wired on web (FSA chip taps
 *     drive navigation, not map panning). MapRegion → Leaflet view is one-way.
 *
 * WCAG 2.1.2 (no keyboard trap): `keyboard={false}` on MapContainer so keyboard
 * users are never trapped inside the Leaflet canvas. OSM attribution is always
 * visible per OSM tile usage terms.
 *
 * Metro resolves this file instead of PlatformMapView.tsx when bundling for web.
 * The native bundle never imports leaflet; the web bundle never imports
 * react-native-maps. Zero dead code in either bundle.
 */

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from 'react-leaflet';

import { OSM_TILE_URL, type MapRegion } from '@/lib/mapHelpers';
import type { PlatformMapViewProps } from './PlatformMapView';

// ============================================================================
// Privacy constants
// ============================================================================

/**
 * Minimum Leaflet zoom (most zoomed-out).
 * 2 = world overview; keeps the tile count sane.
 */
const MIN_LEAFLET_ZOOM = 2;

/**
 * Maximum Leaflet zoom.
 * 13 = neighborhood/FSA scale — NEVER street-level (Jordan BLOCKING CONDITION 2.1).
 * Mirrors MAX_ZOOM_LEVEL in mapHelpers.ts.
 */
const MAX_LEAFLET_ZOOM = 13;

// ============================================================================
// deltaToZoom — react-native-maps region → Leaflet zoom level
// ============================================================================

/**
 * Convert a react-native-maps `latitudeDelta` to a Leaflet zoom integer.
 *
 * react-native-maps uses delta (degrees of latitude visible). Leaflet uses
 * a zoom integer where zoom 0 = whole world and zoom 13 = neighborhood.
 * The relationship is approximately: zoom = log2(360 / latitudeDelta).
 *
 * Result is clamped to [MIN_LEAFLET_ZOOM, MAX_LEAFLET_ZOOM] to enforce the
 * FSA-scale privacy floor at the Leaflet level regardless of what the caller
 * passes in.
 */
function deltaToZoom(latitudeDelta: number): number {
  if (latitudeDelta <= 0) return MAX_LEAFLET_ZOOM;
  const raw = Math.round(Math.log2(360 / latitudeDelta));
  return Math.max(MIN_LEAFLET_ZOOM, Math.min(MAX_LEAFLET_ZOOM, raw));
}

// ============================================================================
// Component
// ============================================================================

/**
 * Web map component — react-leaflet + OpenStreetMap tiles.
 *
 * Exported as `PlatformMapView` so it matches the native file's export name.
 * Metro resolves this file on web; `LazyPlatformMapView.web.tsx` wraps it in
 * React.lazy so the Leaflet bundle is deferred until the map is first rendered.
 */
export function PlatformMapView({ region, accessibilityLabel }: PlatformMapViewProps) {
  const zoom = deltaToZoom(region.latitudeDelta);

  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      role="img"
      aria-label={accessibilityLabel ?? 'Resource map — neighbourhood view'}
    >
      <MapContainer
        center={[region.latitude, region.longitude]}
        zoom={zoom}
        minZoom={MIN_LEAFLET_ZOOM}
        maxZoom={MAX_LEAFLET_ZOOM}
        style={{ width: '100%', height: '100%' }}
        keyboard={false}
      >
        <TileLayer
          url={OSM_TILE_URL}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={MAX_LEAFLET_ZOOM}
        />
      </MapContainer>
    </div>
  );
}
