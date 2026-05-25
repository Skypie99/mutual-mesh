/**
 * PlatformMapView -- native path.
 *
 * Wraps react-native-maps MapView with an OSM tile layer, clamped to FSA zoom.
 * Used by ResourceMapScreen on iOS/Android.
 *
 * The web bundle never imports this file -- Metro resolves
 * PlatformMapView.web.tsx instead when building for web (Expo platform-split
 * convention: https://docs.expo.dev/router/advanced/platform-specific-modules/).
 */

import React from 'react';
import MapView, { UrlTile } from 'react-native-maps';
import { OSM_TILE_URL, type MapRegion } from '@/lib/mapHelpers';

export type PlatformMapViewProps = {
  region: MapRegion;
  onRegionChangeComplete: (region: MapRegion) => void;
  accessibilityLabel?: string;
};

/**
 * Native map tile view -- react-native-maps + OpenStreetMap tiles.
 * Privacy-safe: no individual GPS pins, FSA-scale only (MIN_DELTA enforced
 * by ResourceMapScreen's onRegionChangeComplete -> clampRegionZoom).
 */
export function PlatformMapView({
  region,
  onRegionChangeComplete,
  accessibilityLabel,
}: PlatformMapViewProps) {
  return (
    <MapView
      style={{ flex: 1 }}
      region={region}
      onRegionChangeComplete={onRegionChangeComplete}
      accessibilityLabel={accessibilityLabel}
    >
      <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={19} flipY={false} />
    </MapView>
  );
}
