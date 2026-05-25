/**
 * PlatformMapView -- web path (react-leaflet + OpenStreetMap).
 *
 * Resolved instead of PlatformMapView.tsx when Metro bundles for web. The
 * native file imports react-native-maps which doesn't work in a browser;
 * this file provides an equivalent tile map using react-leaflet.
 *
 * Jordan advisory conditions (2026-05-25-jordan-web-gate.md):
 *   - OSM attribution is visible by default via react-leaflet TileLayer.
 *     Do NOT hide or overlay it.
 *   - No precise user location is shown. The parent (ResourceMapScreen)
 *     controls the region; this component renders whatever region it receives.
 *   - Zoom is clamped at FSA scale (MIN_DELTA) by ResourceMapScreen --
 *     maxZoom=13 here reinforces that at the Leaflet level.
 *
 * Location handling note: ResourceMapScreen's handleCenterOnMe uses
 *   require('expo-location') inside a try/catch. On web, expo-location is
 *   not available, so it falls through to navigator.geolocation via the
 *   catch block's "GPS unavailable" path. No explicit Platform guard needed
 *   in ResourceMapScreen because the dynamic require already handles it.
 *
 * A11y notes (Alex audit 2026-05-25, WCAG 2.2 AA):
 *   - keyboard={false} on MapContainer disables Leaflet's built-in keyboard
 *     handler. Without this, Leaflet captures arrow keys and Tab indefinitely
 *     once the map tile pane is focused, violating WCAG 2.1.2 (No Keyboard
 *     Trap, Level A). Leaflet's default +/- zoom controls remain reachable
 *     via Tab before/after the map region because they are rendered as <a>
 *     elements outside the tile pane.
 *   - A visually-hidden paragraph inside the wrapper div informs keyboard and
 *     AT users that map interaction is limited and directs them to the FSA
 *     filter chips (WCAG 2.1.2 advisory + 1.3.1).
 *   - The outer div has role="img" + aria-label so the whole region is treated
 *     as a single landmark image by screen readers rather than an interactive
 *     widget (WCAG 4.1.2).
 */

import 'leaflet/dist/leaflet.css';
import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import type { PlatformMapViewProps } from './PlatformMapView';

// deltaToZoom converts react-native-maps latitudeDelta to a Leaflet zoom level.
// Mirrors the same helper in AccessMap's PlatformMap.web.tsx.
function deltaToZoom(latitudeDelta: number): number {
  return Math.max(2, Math.min(13, Math.round(Math.log2(360 / latitudeDelta))));
}

/**
 * Web map tile view -- react-leaflet + OpenStreetMap tiles.
 *
 * onRegionChangeComplete is not wired here: Leaflet's moveend fires with
 * slightly different coordinate semantics and the FSA map doesn't need
 * region sync from the map to the parent on web (the parent controls the
 * initial region; user panning/zooming on web doesn't feed back to native
 * state). This is intentional -- FSA chips drive navigation, not the map.
 */
export function PlatformMapView({ region, accessibilityLabel }: PlatformMapViewProps) {
  const zoom = deltaToZoom(region.latitudeDelta);

  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      role="img"
      aria-label={accessibilityLabel ?? 'Resource map'}
    >
      {/* Visually-hidden keyboard/AT notice (WCAG 2.1.2 + 1.3.1).
          Leaflet maps are not fully keyboard-navigable even with keyboard={false}.
          This message directs non-pointer users to the equivalent FSA chip list. */}
      <p
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        This map is not fully keyboard accessible. Use the FSA filter chips above to navigate
        resources by area.
      </p>
      <MapContainer
        center={[region.latitude, region.longitude]}
        zoom={zoom}
        maxZoom={13}
        style={{ height: '100%', width: '100%' }}
        // Disable scroll zoom to avoid page scroll interference on web
        scrollWheelZoom={false}
        // keyboard={false} prevents Leaflet from capturing arrow keys and Tab
        // focus inside the tile pane, which would create a keyboard trap
        // violating WCAG 2.1.2 (No Keyboard Trap, Level A).
        keyboard={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
      </MapContainer>
    </div>
  );
}
