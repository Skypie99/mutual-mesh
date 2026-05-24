import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { FAB } from '@/components/FAB';
import { StatusPill, type ResourceStatus } from '@/components/StatusPill';

/**
 * Home / Feed screen.
 *
 * UI ONLY in Loop 7. Currently rendered against mock data (`MOCK_RESOURCES`)
 * so the layout is visible in `npm start` before Phase 0b wires the real
 * `listResources()` call.
 *
 * Phase 0b replaces `MOCK_RESOURCES` with a `useResources()` hook that
 * subscribes via Supabase Realtime and feeds results through
 * `applyResourceDelta` (already tested in Loop 5).
 */
type FeedItem = {
  id: string;
  name: string;
  description: string;
  status: ResourceStatus;
  postal_prefix: string;
  created_at: string;
};

const MOCK_RESOURCES: FeedItem[] = [
  {
    id: '1',
    name: 'Sensitive baby formula (unopened)',
    description: '2 cans, expires next year. Hypoallergenic.',
    status: 'available',
    postal_prefix: 'M5V',
    created_at: '2026-05-23T10:00:00Z',
  },
  {
    id: '2',
    name: '2lb basmati rice',
    description: 'Surplus from a community kitchen. Sealed.',
    status: 'available',
    postal_prefix: 'M4Y',
    created_at: '2026-05-23T08:30:00Z',
  },
  {
    id: '3',
    name: 'Winter coat (size M)',
    description: 'Lightly worn. Warm. Clean.',
    status: 'reserved',
    postal_prefix: 'M5V',
    created_at: '2026-05-22T18:00:00Z',
  },
];

type HomeScreenProps = {
  onOpenResource?: (id: string) => void;
  onAddResource?: () => void;
};

export function HomeScreen({ onOpenResource, onAddResource }: HomeScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <View className="flex-1 px-4 pt-4">
        <Text
          accessibilityRole="header"
          className="mb-2 text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Available now
        </Text>
        <Text className="mb-4 text-sm text-light-text-muted dark:text-dark-text-muted">
          Mock data — real listings land in Phase 0b.
        </Text>

        <FlatList
          data={MOCK_RESOURCES}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <Card
              onPress={() => onOpenResource?.(item.id)}
              accessibilityLabel={`${item.name}, ${item.status}, neighborhood ${item.postal_prefix}`}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text
                    numberOfLines={2}
                    className="text-base font-semibold text-light-text dark:text-dark-text"
                  >
                    {item.name}
                  </Text>
                  <Text
                    numberOfLines={2}
                    className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary"
                  >
                    {item.description}
                  </Text>
                  <Text className="mt-2 text-xs text-light-text-muted dark:text-dark-text-muted">
                    {item.postal_prefix}
                  </Text>
                </View>
                <StatusPill status={item.status} />
              </View>
            </Card>
          )}
          contentContainerStyle={{ paddingBottom: 96 }}
        />
      </View>
      <FAB label="Post a resource" onPress={() => onAddResource?.()} />
    </SafeAreaView>
  );
}
