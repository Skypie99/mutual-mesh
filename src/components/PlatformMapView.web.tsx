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
      <MapContainer
        center={[region.latitude, region.longitude]}
        zoom={zoom}
        maxZoom={13}
        style={{ height: '100%', width: '100%' }}
        // Disable scroll zoom to avoid page scroll interference on web
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
      </MapContainer>
    </div>
  );
}
