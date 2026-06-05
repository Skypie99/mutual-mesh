/**
 * PlatformMapView — web path (PLACEHOLDER).
 *
 * The interactive web map (react-leaflet + OpenStreetMap) is not currently
 * wired: `leaflet` / `react-leaflet` were never declared dependencies, so
 * importing them broke the web bundle (`Unable to resolve leaflet/dist/leaflet.css`).
 * Rather than ship a crash, the web build renders a graceful placeholder that
 * points users to the FSA filter chips (and the mobile app for the full map).
 * Resolved instead of PlatformMapView.tsx when Metro bundles for web.
 *
 * The guest demo hides the list/map toggle entirely (see DemoRootNavigator),
 * so demo visitors never reach this screen.
 *
 * To restore the real web map: add `leaflet` + `react-leaflet` to package.json
 * (with an `.npmrc` `legacy-peer-deps=true` for the React 19 pin) and bring back
 * the MapContainer/TileLayer + `deltaToZoom` helper from git history (commit
 * before this stub). Keep the OSM attribution visible and `keyboard={false}`
 * for the WCAG 2.1.2 no-keyboard-trap requirement.
 *
 * A11y: role="img" + aria-label keep the region a single landmark; the visible
 * note directs keyboard/AT users to the FSA chips (WCAG 2.1.2 + 1.3.1).
 */

import React from 'react';
import type { PlatformMapViewProps } from './PlatformMapView';

export function PlatformMapView({ accessibilityLabel }: PlatformMapViewProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        backgroundColor: '#EFEAE2',
        color: '#5B5247',
      }}
      role="img"
      aria-label={accessibilityLabel ?? 'Resource map'}
    >
      <p style={{ maxWidth: 360, fontSize: 15, lineHeight: 1.5, margin: 0 }}>
        The interactive map is available in the Mutual Mesh mobile app. On the web, use the area
        (FSA) filter chips above to browse resources by neighbourhood.
      </p>
    </div>
  );
}
