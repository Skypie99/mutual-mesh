import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FAB } from '@/components/FAB';
import { FeedSkeleton } from '@/components/LoadingSkeleton';
import { MapToggle } from '@/components/MapToggle';
import { StatusPill } from '@/components/StatusPill';
import { useResources } from '@/hooks/useResources';
import { colors } from '@/lib/theme';
import { useColorScheme } from 'react-native';
import type { ResourceRow } from '@/types/database';

/**
 * Home / Feed screen — wired to real Supabase data via useResources.
 *
 * States rendered:
 *   - loading (first fetch)                  → FeedSkeleton
 *   - loaded + empty                         → EmptyState with Casey copy
 *   - loaded + error                         → EmptyState with retry copy
 *   - loaded + items                         → FlatList of ResourceCard
 *
 * Pull-to-refresh wires to the hook's reload(). Realtime updates flow in via
 * the hook's subscription — no manual polling needed.
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
  const { resources, loading, error, reload } = useResources();
  const [refreshing, setRefreshing] = useState(false);
  const scheme = useColorScheme();
  const accent = scheme === 'dark' ? colors.dark.accent : colors.light.accent;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

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
        <View className="mb-4">
          <MapToggle
            value="list"
            onChange={(next) => {
              if (next === 'map') onOpenMap?.();
            }}
          />
        </View>

        {loading && resources.length === 0 ? (
          <FeedSkeleton />
        ) : error && resources.length === 0 ? (
          <EmptyState
            title="Couldn't load listings"
            description={error}
            ctaLabel="Try again"
            onCta={() => void reload()}
          />
        ) : resources.length === 0 ? (
          // Casey-approved copy per Alex Cycle 1 advisory + Riley friction #1.
          <EmptyState
            title="Nothing here yet"
            description="Your community is just starting. Check back later, or invite a neighbor — every listing makes this more useful for the next person."
            ctaLabel="Post a resource"
            onCta={() => onAddResource?.()}
          />
        ) : (
          <FlatList
            data={resources}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={Separator}
            renderItem={({ item }) => <ResourceCard item={item} onPress={onOpenResource} />}
            contentContainerStyle={{ paddingBottom: 96 }}
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
      {resources.length > 0 && <FAB label="Post a resource" onPress={() => onAddResource?.()} />}
    </SafeAreaView>
  );
}

// ============================================================================
// Sub-components (extracted for React.memo + a11y consistency — Peter pre-empt)
// ============================================================================

function Separator() {
  return <View className="h-3" />;
}

type ResourceCardProps = {
  item: ResourceRow;
  onPress?: (id: string) => void;
};

function ResourceCard({ item, onPress }: ResourceCardProps) {
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
}
