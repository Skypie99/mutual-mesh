/**
 * LazyPlatformMapView.web.tsx
 *
 * Lazy-loaded wrapper for the web map component. React.lazy defers
 * the Leaflet JS + CSS bundle until this component is first rendered
 * (i.e., when the user taps the map toggle), not at initial page load.
 *
 * Used by ResourceMapScreen on web only. Metro resolves this file instead
 * of LazyPlatformMapView.tsx (which doesn't exist — the native path uses
 * PlatformMapView directly without lazy-loading, since Metro handles
 * native code-splitting differently).
 */

import React, { Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import type { PlatformMapViewProps } from './PlatformMapView';

const PlatformMapView = React.lazy(() =>
  import('./PlatformMapView.web').then((m) => ({ default: m.PlatformMapView }))
);

function MapLoadingFallback() {
  return (
    <View
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      accessibilityLabel="Map loading"
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator />
    </View>
  );
}

export function LazyPlatformMapView(props: PlatformMapViewProps) {
  return (
    <Suspense fallback={<MapLoadingFallback />}>
      <PlatformMapView {...props} />
    </Suspense>
  );
}
