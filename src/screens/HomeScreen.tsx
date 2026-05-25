import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { CategoryChip } from '@/components/CategoryChip';
import { EmptyFeedState } from '@/components/EmptyFeedState';
import { EmptyState } from '@/components/EmptyState';
import { FAB } from '@/components/FAB';
import { FeedSkeleton } from '@/components/LoadingSkeleton';
import { MapToggle } from '@/components/MapToggle';
import { StatusPill } from '@/components/StatusPill';
import { useResources } from '@/hooks/useResources';
import { CATEGORY_LABELS, CATEGORY_VALUES, matchesActiveFilter, toggleCategoryInFilter } from '@/lib/categories';
import { loadFilterFromStorage, saveFilterToStorage } from '@/lib/categoryStorage';
import { colors } from '@/lib/theme';
import type { ResourceCategory, ResourceRow } from '@/types/database';

/**
 * Home / Feed screen — wired to real Supabase data via useResources.
 *
 * States rendered:
 *   - loading (first fetch)                  → FeedSkeleton
 *   - loaded + empty                         → EmptyState with Casey copy
 *   - loaded + error                         → EmptyState with retry copy
 *   - loaded + items                         → FlatList of ResourceCard
 *
 * Pagination:
 *   - onEndReached fires loadMore() when within 50% of the list end.
 *   - loadMore() fetches the next PAGE_SIZE=20 batch and appends via the hook.
 *   - ListFooterComponent shows a small spinner while loadingMore=true.
 *   - Pull-to-refresh resets to page 0 via reload().
 *   - Filters are applied client-side across already-fetched pages.
 *
 * MapToggle (Phase 3.2) switches between list and map views. The map view
 * is navigated to as a separate screen in the HomeStack so back-nav works
 * correctly. The toggle defaults to 'list' (Quinn AC-5 — list is canonical).
 */
type HomeScreenProps = {
  onOpenResource?: (id: string) => void;
  onAddResource?: () => void;
  /** Called when user taps the "Map" segment in the toggle. */
  onOpenMap?: () => void;
};

export function HomeScreen({ onOpenResource, onAddResource, onOpenMap }: HomeScreenProps) {
  const { resources, loading, loadingMore, hasMore, error, reload, loadMore } = useResources();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ResourceCategory[]>([]);
  const scheme = useColorScheme();
  const accent = scheme === 'dark' ? colors.dark.accent : colors.light.accent;

  // Restore persisted filter selection on mount.
  useEffect(() => {
    void loadFilterFromStorage().then(setActiveFilters);
  }, []);

  // Derived: filtered resource list from hook output.
  const filteredResources =
    activeFilters.length === 0
      ? resources
      : resources.filter((r) => matchesActiveFilter(r.category, activeFilters));

  const filtersActive = activeFilters.length > 0;

  const handleToggleFilter = useCallback(
    (category: ResourceCategory) => {
      setActiveFilters((prev) => {
        const next = toggleCategoryInFilter(prev, category);
        void saveFilterToStorage(next);
        return next;
      });
    },
    [],
  );

  const handleClearFilters = useCallback(() => {
    setActiveFilters([]);
    void saveFilterToStorage([]);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore) {
      void loadMore();
    }
  }, [hasMore, loadingMore, loadMore]);

  const keyExtractor = useCallback((item: ResourceRow) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: ResourceRow }) => <ResourceCard item={item} onPress={onOpenResource} />,
    [onOpenResource],
  );

  const ListEmpty = useCallback(
    () => (
      <EmptyFeedState
        filtersActive={filtersActive}
        onAddResource={() => onAddResource?.()}
        onClearFilters={handleClearFilters}
      />
    ),
    [filtersActive, onAddResource, handleClearFilters],
  );

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <View className="flex-1 px-4 pt-4">
        {/* Header + view toggle */}
        <Text
          accessibilityRole="header"
          className="mb-3 text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Available now
        </Text>

        {/* MapToggle — 'list' is always selected here; tapping 'map' navigates away */}
        <View className="mb-3">
          <MapToggle
            value="list"
            onChange={(next) => {
              if (next === 'map') onOpenMap?.();
            }}
          />
        </View>

        {/* Category filter chip row — multi-select; empty = show all */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Filter by category"
          contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingHorizontal: 2 }}
        >
          {CATEGORY_VALUES.map((cat) => (
            <CategoryChip
              key={cat}
              label={CATEGORY_LABELS[cat]}
              selected={activeFilters.includes(cat)}
              onPress={() => handleToggleFilter(cat)}
              hint={`Toggle ${CATEGORY_LABELS[cat]} filter`}
            />
          ))}
        </ScrollView>

        {loading && resources.length === 0 ? (
          <FeedSkeleton />
        ) : error && resources.length === 0 ? (
          <EmptyState
            title="Couldn't load listings"
            description={error}
            ctaLabel="Try again"
            onCta={() => void reload()}
          />
        ) : (
          <FlatList
            data={filteredResources}
            keyExtractor={keyExtractor}
            ItemSeparatorComponent={Separator}
            renderItem={renderItem}
            ListEmptyComponent={ListEmpty}
            contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View
                  accessible
                  className="items-center py-4"
                  accessibilityLabel="Loading more resources"
                >
                  <ActivityIndicator color={accent} />
                </View>
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={accent}
                accessibilityLabel="Pull to refresh listings"
              />
            }
          />
        )}
      </View>
      {filteredResources.length > 0 && <FAB label="Post a resource" onPress={() => onAddResource?.()} />}
    </SafeAreaView>
  );
}

// ============================================================================
// Sub-components (extracted for React.memo + a11y consistency — Peter pre-empt)
// ============================================================================

const Separator = memo(function Separator() {
  return <View className="h-3" />;
});

type ResourceCardProps = {
  item: ResourceRow;
  onPress?: (id: string) => void;
};

const ResourceCard = memo(function ResourceCard({ item, onPress }: ResourceCardProps) {
  return (
    <Card
      onPress={() => onPress?.(item.id)}
      accessibilityLabel={`${item.name}, ${item.status}${item.postal_prefix ? `, neighborhood ${item.postal_prefix}` : ''}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text
            numberOfLines={2}
            className="text-base font-semibold text-light-text dark:text-dark-text"
          >
            {item.name}
          </Text>
          {item.description && (
            <Text
              numberOfLines={2}
              className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary"
            >
              {item.description}
            </Text>
          )}
          {item.postal_prefix && (
            <Text className="mt-2 text-xs text-light-text-muted dark:text-dark-text-muted">
              {item.postal_prefix}
            </Text>
          )}
        </View>
        <StatusPill status={item.status} />
      </View>
    </Card>
  );
});
