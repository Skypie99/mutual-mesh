import { useResourcesContext } from '@/contexts/ResourcesContext';
import type { ResourceRow } from '@/types/database';

/**
 * useResources — marketplace feed data + realtime.
 *
 * SINGLETON VIA CONTEXT (perf/auto-2026-05-25-quinn-wave6-resources-singleton):
 *
 * Previously this hook instantiated its own Supabase Realtime subscription
 * and fetch independently in every component that called it. When both
 * HomeScreen and ResourceMapScreen were mounted simultaneously this created
 * two channels on the same 'resources-feed' topic and two redundant fetches.
 *
 * The hook now reads from ResourcesContext, which holds ONE subscription and
 * ONE fetch, shared across all consumers. The public API ({resources, loading,
 * error, reload}) is identical — no screen-level changes needed.
 *
 * Requires: <ResourcesProvider> somewhere above this hook in the tree.
 *   → HomeStackNavigator in src/navigation/RootNavigator.tsx wraps both
 *     HomeScreen and ResourceMapScreen with <ResourcesProvider>.
 *
 * Original hook logic lives in src/contexts/ResourcesContext.tsx.
 */
export type UseResourcesState = {
  resources: ResourceRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useResources(): UseResourcesState {
  return useResourcesContext();
}
