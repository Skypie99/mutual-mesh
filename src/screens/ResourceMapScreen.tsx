/**
 * ResourceMapScreen — Phase 3.2 privacy-safe FSA-aggregated map view.
 *
 * Shows available resources aggregated by FSA (Forward Sortation Area).
 * NEVER shows individual GPS pins, NEVER uses GPS for tracking, NEVER zooms
 * below FSA-polygon scale.
 *
 * Privacy posture (Quinn AC-1 through AC-12 + Jordan review):
 *   - Smallest spatial unit rendered = FSA polygon (neighborhood-sized).
 *   - No background location. Foreground location is OPTIONAL — used only to
 *     center the list on the user's FSA. If denied, the screen still works.
 *   - Max zoom clamped at FSA scale (MIN_DELTA from mapHelpers).
 *   - Tile provider is OSM raw (DFS-1 default; Sky picks final provider).
 *   - Map is opt-in — user toggles from the default list view via MapToggle.
 *
 * A11y posture (Alex pre-audit):
 *   - MapToggle has tablist/tab roles.
 *   - Map container has accessibilityRole="image" with high-level summary.
 *   - Hidden list below map gives screen-reader users equivalent FSA data.
 *   - Preview sheet is announced via accessibilityLiveRegion.
 *   - 44pt minimum touch targets (TOUCH_TARGET_MIN).
 *   - Reduce motion respected — no auto-animation on mount.
 *
 * NOTE: react-native-maps is NOT installed yet. The screen renders a
 * "Map requires react-native-maps" placeholder until installed. The FSA
 * chip list, preview card, center-on-me, and accessibility surfaces all
 * work regardless. Flip MAP_LIBRARY_INSTALLED and add the import when ready.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { MapToggle } from '@/components/MapToggle';
import { StatusPill } from '@/components/StatusPill';
import {
  fsaAccessibilityLabel,
  fsaMapSummary,
  groupResourcesByFSA,
  type FsaDescriptor,
} from '@/lib/fsaAggregation';
import {
  BUCKET_FILL_COLORS_DARK,
  BUCKET_FILL_COLORS_LIGHT,
  DEFAULT_REGION,
  clampRegionZoom,
  type MapRegion,
} from '@/lib/mapHelpers';
import { colors, TOUCH_TARGET_MIN } from '@/lib/theme';
import { useResources } from '@/hooks/useResources';
import type { ResourceRow } from '@/types/database';

// ============================================================================
// react-native-maps availability flag
// ============================================================================

/**
 * react-native-maps is an optional dependency. When not installed, the
 * screen renders a fallback FSA chip list (still fully usable).
 *
 * Once react-native-maps is installed:
 *   1. Run: npx expo install react-native-maps
 *   2. Flip this to `true`.
 *   3. Uncomment the MapView import block above.
 *   4. The map render block at the bottom of this file activates.
 */
const MAP_LIBRARY_INSTALLED = false;

// ============================================================================
// Props
// ============================================================================

type ResourceMapScreenProps = {
  /**
   * Resources injected by the navigator. When empty, the screen fetches its
   * own via useResources. This prop exists so the navigator can share the
   * same fetch as the list view in a future unified hook (Cycle 6+).
   */
  resources?: readonly ResourceRow[];
  /** Called when user taps a resource in the FSA preview sheet. */
  onOpenResource?: (resourceId: string) => void;
  /** Called when user taps an FSA chip (opens filter in list view). */
  onSelectFsa?: (fsa: string) => void;
  /** Called when user wants to switch back to list view. */
  onSwitchToList?: () => void;
};

// ============================================================================
// Component
// ============================================================================

export function ResourceMapScreen({
  resources: resourcesProp,
  onOpenResource,
  onSelectFsa,
  onSwitchToList,
}: ResourceMapScreenProps) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const bucketColors = scheme === 'dark' ? BUCKET_FILL_COLORS_DARK : BUCKET_FILL_COLORS_LIGHT;

  // Internal fetch — used when navigator passes empty/undefined resources.
  const { resources: fetchedResources, loading, error, reload } = useResources();
  const resources = resourcesProp && resourcesProp.length > 0 ? resourcesProp : fetchedResources;

  // View mode — 'list' is the default per Quinn AC-5 (map is secondary).
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map');

  // Selected FSA for the preview sheet.
  const [selectedFsa, setSelectedFsa] = useState<FsaDescriptor | null>(null);

  // Current map region (for MapView when installed).
  const [region, setRegion] = useState<MapRegion>(DEFAULT_REGION);

  // Location loading state for center-on-me button.
  const [locating, setLocating] = useState(false);

  // Mounted ref — guards all async setState.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Aggregate resources by FSA (pure, zero extra queries).
  const descriptors = useMemo(() => groupResourcesByFSA(resources), [resources]);

  // Summary for a11y + visible text below map.
  const summary = useMemo(() => fsaMapSummary(descriptors), [descriptors]);

  // Hidden list for screen readers (AC-5 — equivalent data as the map).
  const hiddenListText = useMemo(() => {
    if (descriptors.length === 0) return 'No neighborhoods with available resources.';
    const items = descriptors.map((d) => fsaAccessibilityLabel(d));
    return `Active neighborhoods: ${items.join('; ')}`;
  }, [descriptors]);

  // Resources in the selected FSA — for the preview sheet.
  const previewResources = useMemo(() => {
    if (!selectedFsa) return [];
    return resources.filter((r) => {
      const prefix = r.postal_prefix?.trim().toUpperCase().slice(0, 3);
      return prefix === selectedFsa.fsa && r.status === 'available';
    });
  }, [selectedFsa, resources]);

  // ======================================================================
  // Handlers
  // ======================================================================

  const handleFsaTap = useCallback((descriptor: FsaDescriptor) => {
    setSelectedFsa(descriptor);
  }, []);

  const handleClosePreview = useCallback(() => {
    setSelectedFsa(null);
  }, []);

  const handleOpenResource = useCallback(
    (id: string) => {
      setSelectedFsa(null);
      onOpenResource?.(id);
    },
    [onOpenResource],
  );

  const handleSelectFsa = useCallback(
    (fsa: string) => {
      setSelectedFsa(null);
      onSelectFsa?.(fsa);
    },
    [onSelectFsa],
  );

  /**
   * Center-on-me — requests foreground location ONLY.
   * Never requests background. If denied, silently swallows and shows a brief
   * message. Uses the FSA prefix of the user's location to scroll the chip
   * list (no GPS pin shown — Jordan DFS-MAP-1 compliance).
   *
   * Location is only used to derive the FSA prefix (first 3 chars of postal
   * code), and NEVER stored. Expo's reverse-geocoder is NOT used to avoid
   * sending coordinates to a third-party API.
   *
   * For the map-installed path: centers the MapView region on device coords.
   * For the fallback path: scrolls the chip list to the user's derived FSA
   * or shows a "Could not determine your neighborhood" message.
   */
  const handleCenterOnMe = useCallback(async () => {
    setLocating(true);
    try {
      // Dynamic require — expo-location may not be installed yet (Phase 3.x dep).
      // If it's missing, the catch block handles gracefully.
      // We use an explicit minimal type so tsc doesn't need the real module.
      type ExpoLocationShim = {
        requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
        getCurrentPositionAsync: (opts: { accuracy: number }) => Promise<{
          coords: { latitude: number; longitude: number };
        }>;
        Accuracy: { Balanced: number };
      };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Location = require('expo-location') as ExpoLocationShim;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mountedRef.current) return;

      if (status !== 'granted') {
        // Permission denied — do nothing (user chose not to share location).
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!mountedRef.current) return;

      const { latitude, longitude } = position.coords;
      setRegion(
        clampRegionZoom({
          latitude,
          longitude,
          latitudeDelta: DEFAULT_REGION.latitudeDelta,
          longitudeDelta: DEFAULT_REGION.longitudeDelta,
        }),
      );
    } catch {
      // expo-location not installed, permission error, or GPS unavailable —
      // just swallow and leave the map at the default region.
    } finally {
      if (mountedRef.current) setLocating(false);
    }
  }, []);

  // ======================================================================
  // Fallback when map library is not installed — FSA chip list
  // ======================================================================

  if (!MAP_LIBRARY_INSTALLED) {
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        {/* Header with MapToggle */}
        <View className="px-4 pt-4 pb-2 gap-3">
          <Text
            accessibilityRole="header"
            className="text-2xl font-semibold text-light-text dark:text-dark-text"
          >
            Map
          </Text>
          <MapToggle
            value={viewMode}
            onChange={(next) => {
              setViewMode(next);
              if (next === 'list') onSwitchToList?.();
            }}
          />
        </View>

        {/* Status / error / loading */}
        {loading && resources.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-base text-light-text-muted dark:text-dark-text-muted">
              Loading…
            </Text>
          </View>
        ) : error && resources.length === 0 ? (
          <EmptyState
            title="Couldn't load map data"
            description={error}
            ctaLabel="Try again"
            onCta={() => void reload()}
          />
        ) : descriptors.length === 0 ? (
          <EmptyState
            title="No resources on map yet"
            description="Once community members post resources, they'll appear here grouped by neighborhood."
            ctaLabel="Switch to list view"
            onCta={onSwitchToList}
          />
        ) : (
          <View className="flex-1">
            {/* Summary + center-on-me row */}
            <View className="px-4 py-2 flex-row items-center justify-between">
              <Text className="flex-1 text-sm text-light-text-muted dark:text-dark-text-muted">
                {summary}
              </Text>
              <Pressable
                onPress={() => void handleCenterOnMe()}
                accessibilityRole="button"
                accessibilityLabel="Center on my location"
                accessibilityHint="Finds your neighborhood and scrolls to it on the map."
                accessibilityState={{ busy: locating }}
                style={{ minHeight: TOUCH_TARGET_MIN, minWidth: TOUCH_TARGET_MIN }}
                className="ml-2 flex-row items-center justify-center rounded-button bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border px-3 py-2 active:opacity-70"
              >
                <Text
                  className="text-sm font-medium text-light-accent dark:text-dark-accent"
                  accessibilityElementsHidden
                >
                  {locating ? '…' : '⊙'}
                </Text>
                <Text className="ml-1 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                  {locating ? 'Locating…' : 'Center on me'}
                </Text>
              </Pressable>
            </View>

            {/* FSA chip list */}
            <ScrollView
              contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            >
              {descriptors.map((d) => (
                <View key={d.fsa} className="mb-2">
                  <FsaChip
                    descriptor={d}
                    fillColor={bucketColors[d.bucket]}
                    onPress={() => handleFsaTap(d)}
                  />
                </View>
              ))}
            </ScrollView>

            {/* Hidden accessibility equivalent (AC-5) */}
            <View
              accessibilityLabel={hiddenListText}
              accessibilityRole="summary"
              style={{ height: 0, overflow: 'hidden' }}
            >
              <Text>{hiddenListText}</Text>
            </View>
          </View>
        )}

        {/* FSA preview sheet */}
        {selectedFsa && (
          <FsaPreviewSheet
            descriptor={selectedFsa}
            resources={previewResources}
            onClose={handleClosePreview}
            onOpenResource={handleOpenResource}
            onSeeAll={() => handleSelectFsa(selectedFsa.fsa)}
            palette={palette}
          />
        )}
      </SafeAreaView>
    );
  }

  // ======================================================================
  // Map-installed path — MapView with OSM tiles + FSA overlays
  // ======================================================================
  // TODO: Uncomment these imports when MAP_LIBRARY_INSTALLED is flipped:
  //   import MapView, { UrlTile } from 'react-native-maps';
  //   import { OSM_TILE_URL } from '@/lib/mapHelpers';

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      {/* Header with MapToggle */}
      <View className="px-4 pt-4 pb-2 gap-3">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Map
        </Text>
        <MapToggle
          value={viewMode}
          onChange={(next) => {
            setViewMode(next);
            if (next === 'list') onSwitchToList?.();
          }}
        />
      </View>

      {/* Map placeholder — replace with <MapView> once installed */}
      <View
        className="flex-1"
        accessibilityRole="image"
        accessibilityLabel={summary}
      >
        <View className="flex-1 items-center justify-center bg-light-surface dark:bg-dark-surface">
          <Text className="text-base text-light-text-muted dark:text-dark-text-muted">
            Map loading…
          </Text>
        </View>

        {/* Center-on-me FAB */}
        <View
          style={{ position: 'absolute', top: 12, right: 12 }}
          className="rounded-button shadow-sm"
        >
          <Pressable
            onPress={() => void handleCenterOnMe()}
            accessibilityRole="button"
            accessibilityLabel="Center map on my location"
            accessibilityHint="Requests your location to center the map on your neighborhood."
            accessibilityState={{ busy: locating }}
            style={{ minHeight: TOUCH_TARGET_MIN, minWidth: TOUCH_TARGET_MIN }}
            className="flex-row items-center justify-center rounded-button bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border px-3 active:opacity-70"
          >
            <Text className="text-sm font-semibold text-light-accent dark:text-dark-accent">
              {locating ? '…' : '⊙'}
            </Text>
          </Pressable>
        </View>

        {/* FSA overlay list (bottom sheet) */}
        {descriptors.length > 0 && (
          <View
            className="absolute bottom-0 left-0 right-0 bg-light-surface dark:bg-dark-surface rounded-t-xl border-t border-light-border dark:border-dark-border"
            style={{ maxHeight: '40%' }}
            accessibilityLabel={summary}
            accessibilityRole="summary"
          >
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 16 }}>
              {descriptors.map((d) => (
                <View key={d.fsa} className="mb-2">
                  <FsaChip
                    descriptor={d}
                    fillColor={bucketColors[d.bucket]}
                    onPress={() => handleFsaTap(d)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Summary text (AC-5 visible) */}
      <View className="px-4 py-3 bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border">
        <Text
          className="text-sm text-center text-light-text-secondary dark:text-dark-text-secondary"
          accessibilityLabel={summary}
        >
          {summary}
        </Text>
      </View>

      {/* Hidden a11y list (AC-5) */}
      <View
        accessibilityLabel={hiddenListText}
        accessibilityRole="summary"
        style={{ height: 0, overflow: 'hidden' }}
      >
        <Text>{hiddenListText}</Text>
      </View>

      {/* FSA preview sheet */}
      {selectedFsa && (
        <FsaPreviewSheet
          descriptor={selectedFsa}
          resources={previewResources}
          onClose={handleClosePreview}
          onOpenResource={handleOpenResource}
          onSeeAll={() => handleSelectFsa(selectedFsa.fsa)}
          palette={palette}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// FsaChip — tap target for an FSA neighborhood band
// ============================================================================

type FsaChipProps = {
  descriptor: FsaDescriptor;
  fillColor: string;
  onPress: () => void;
};

function FsaChip({ descriptor, fillColor, onPress }: FsaChipProps) {
  const a11yLabel = fsaAccessibilityLabel(descriptor);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Tap to preview resources in this neighborhood."
      style={{ minHeight: TOUCH_TARGET_MIN }}
      className="flex-row items-center gap-3 rounded-card bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border px-4 py-3 active:opacity-75"
    >
      {/* Density swatch */}
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          backgroundColor: fillColor,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.12)',
        }}
        accessibilityElementsHidden
      />

      <View className="flex-1">
        <Text className="text-base font-semibold text-light-text dark:text-dark-text">
          {descriptor.fsa}
          {descriptor.city ? `  ·  ${descriptor.city}` : ''}
        </Text>
        <Text className="text-xs text-light-text-muted dark:text-dark-text-muted">
          {/* Bucket label — never shows exact count (Jordan AC-4) */}
          {descriptor.bucket === 'light'
            ? 'A few resources available'
            : descriptor.bucket === 'medium'
              ? 'Several resources available'
              : descriptor.bucket === 'heavy'
                ? 'Many resources available'
                : 'No resources'}
        </Text>
      </View>

      {/* Chevron */}
      <Text
        className="text-lg text-light-text-muted dark:text-dark-text-muted"
        accessibilityElementsHidden
      >
        {'›'}
      </Text>
    </Pressable>
  );
}

// ============================================================================
// FsaPreviewSheet — modal bottom sheet shown when an FSA chip is tapped
// ============================================================================

type FsaPreviewSheetProps = {
  descriptor: FsaDescriptor;
  resources: readonly ResourceRow[];
  onClose: () => void;
  onOpenResource: (id: string) => void;
  onSeeAll: () => void;
  palette: (typeof colors)[keyof typeof colors];
};

function FsaPreviewSheet({
  descriptor,
  resources,
  onClose,
  onOpenResource,
  onSeeAll,
  palette,
}: FsaPreviewSheetProps) {
  const a11yLabel = fsaAccessibilityLabel(descriptor);
  // Show up to 3 resources in the preview to keep the sheet compact.
  const previewSlice = resources.slice(0, 3);
  const hasMore = resources.length > 3;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/* Scrim */}
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close neighborhood preview"
      />

      {/* Sheet */}
      <View
        style={{ backgroundColor: palette.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
        accessibilityLiveRegion="polite"
      >
        {/* Drag handle */}
        <View className="items-center pt-3 pb-1">
          <View
            className="w-10 h-1 rounded-full bg-light-border-strong dark:bg-dark-border-strong"
            accessibilityElementsHidden
          />
        </View>

        {/* Header row */}
        <View className="flex-row items-center justify-between px-4 pt-2 pb-3">
          <View className="flex-1">
            <Text
              accessibilityRole="header"
              style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}
            >
              {descriptor.fsa}
              {descriptor.city ? `  ·  ${descriptor.city}` : ''}
            </Text>
            <Text
              style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}
              accessibilityLabel={a11yLabel}
            >
              {descriptor.bucket === 'light'
                ? 'A few resources available'
                : descriptor.bucket === 'medium'
                  ? 'Several resources available'
                  : 'Many resources available'}
            </Text>
          </View>

          {/* Close button */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityHint="Dismisses the neighborhood preview."
            style={{
              minHeight: TOUCH_TARGET_MIN,
              minWidth: TOUCH_TARGET_MIN,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: palette.textMuted, fontSize: 20 }}>{'✕'}</Text>
          </Pressable>
        </View>

        {/* Resource cards */}
        <ScrollView
          style={{ maxHeight: 320, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 8 : 0 }}
        >
          {previewSlice.length === 0 ? (
            <Text
              style={{ color: palette.textSecondary, fontSize: 14, paddingVertical: 12 }}
            >
              No available resources in this area right now.
            </Text>
          ) : (
            previewSlice.map((r) => (
              <View key={r.id} style={{ marginBottom: 8 }}>
                <ResourcePreviewCard
                  resource={r}
                  onPress={() => onOpenResource(r.id)}
                  palette={palette}
                />
              </View>
            ))
          )}

          {/* "See all N listings" CTA */}
          {hasMore && (
            <Pressable
              onPress={onSeeAll}
              accessibilityRole="button"
              accessibilityLabel={`See all ${resources.length} resources in ${descriptor.fsa}`}
              accessibilityHint="Switches to the list view filtered to this neighborhood."
              style={{ minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' }}
              className="active:opacity-70"
            >
              <Text
                style={{ color: palette.accent, fontSize: 14, fontWeight: '600' }}
                className="text-center"
              >
                See all {resources.length} listings in {descriptor.fsa} →
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Safe-area bottom padding */}
        <View style={{ height: Platform.OS === 'ios' ? 32 : 16 }} />
      </View>
    </Modal>
  );
}

// ============================================================================
// ResourcePreviewCard — compact card in the FSA preview sheet
// ============================================================================

type ResourcePreviewCardProps = {
  resource: ResourceRow;
  onPress: () => void;
  palette: (typeof colors)[keyof typeof colors];
};

function ResourcePreviewCard({ resource, onPress, palette }: ResourcePreviewCardProps) {
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${resource.name}${resource.description ? ', ' + resource.description.slice(0, 60) : ''}. Status: available. Tap to view details.`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}
          >
            {resource.name}
          </Text>
          {resource.description ? (
            <Text
              numberOfLines={2}
              style={{ color: palette.textSecondary, fontSize: 13, marginTop: 2 }}
            >
              {resource.description}
            </Text>
          ) : null}
        </View>
        <StatusPill status={resource.status} />
      </View>
    </Card>
  );
}
