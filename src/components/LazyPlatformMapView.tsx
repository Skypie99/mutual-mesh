/**
 * LazyPlatformMapView.tsx — native path.
 *
 * On native, React.lazy is not needed (Metro handles code splitting
 * differently). This file simply re-exports PlatformMapView so that
 * ResourceMapScreen can import LazyPlatformMapView on all platforms.
 */
export { PlatformMapView as LazyPlatformMapView } from './PlatformMapView';
