import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listResources } from '@/lib/resources';
import {
  applyResourceDelta,
  type RealtimeEvent,
  type RealtimeResource,
} from '@/lib/resourcesRealtime';
import { useDemo } from '@/lib/demo/DemoContext';
import { DEMO_RESOURCES } from '@/lib/demo/fixtures';
import type { ResourceRow } from '@/types/database';

/**
 * ResourcesContext — singleton marketplace feed data + realtime.
 *
 * Motivation: both HomeScreen and ResourceMapScreen call useResources(), which
 * previously created two independent Supabase Realtime channels and two fetch
 * calls whenever both screens were mounted simultaneously (Peter perf audit
 * wave-6, 2026-05-25).
 *
 * This context lifts the subscription and state into a single Provider that
 * wraps the HomeStackNavigator. Both screens call useResources() as before —
 * the hook now reads from this context, so they share one subscription and one
 * fetch regardless of how many components call the hook.
 *
 * Architecture:
 *   App.tsx → RootNavigator → HomeStackNavigator
 *                               └─ <ResourcesProvider>        ← added here
 *                                    ├─ HomeScreen            calls useResources()
 *                                    └─ ResourceMapScreen     calls useResources()
 */

// ============================================================================
// Types
// ============================================================================

export type ResourcesContextValue = {
  resources: ResourceRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

// ============================================================================
// Context
// ============================================================================

const ResourcesContext = createContext<ResourcesContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

/**
 * ResourcesProvider — mounts exactly ONE Supabase Realtime subscription and
 * ONE initial fetch. All consumers that call useResources() share this state.
 *
 * Single subscription shared across Home and Map tabs — prevents duplicate channels.
 */
export function ResourcesProvider({ children }: { children: React.ReactNode }) {
  const { isDemo } = useDemo();
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    // DEMO MODE (WEB-4): serve bundled synthetic fixtures and return BEFORE any
    // Supabase call. This is the zero-network guarantee for the feed + FSA map
    // (both consume this context). Jordan gate condition 1.
    if (isDemo) {
      setResources(DEMO_RESOURCES);
      setError(null);
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error: err } = await listResources();
    if (!mountedRef.current) return;
    if (err) {
      setError(err.message ?? 'Failed to load listings.');
      setResources([]);
    } else {
      // listResources uses an explicit column select that intentionally omits
      // contact_handle (Jordan blocking condition 2 -- web gate 2026-05-25).
      // Feed components never access contact_handle, so this cast is safe.
      // contact_handle is only returned by getResourceDetail() RPC (detail screen).
      setResources((data ?? []) as ResourceRow[]);
    }
    setLoading(false);
  }, [isDemo]);

  const reload = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    await load();
  }, [load]);

  // Initial load + cleanup
  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Single subscription shared across Home and Map tabs — prevents duplicate channels.
  useEffect(() => {
    // DEMO MODE (WEB-4): no Realtime channel — opening a `wss` connection would
    // violate the zero-network guarantee. Fixtures are static, so there's
    // nothing to subscribe to. Jordan gate condition 1.
    if (isDemo) return;

    const channel = supabase
      .channel('resources-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, (payload) => {
        if (!mountedRef.current) return;
        const event = payload as unknown as RealtimeEvent<RealtimeResource>;
        setResources((current) => {
          const merged = applyResourceDelta(current as RealtimeResource[], event);
          // Post-merge filter: drop anything no longer 'available'.
          return (merged as ResourceRow[]).filter((r) => r.status === 'available');
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isDemo]);

  return (
    <ResourcesContext.Provider value={{ resources, loading, error, reload }}>
      {children}
    </ResourcesContext.Provider>
  );
}

// ============================================================================
// Hook — public API (unchanged from old useResources shape)
// ============================================================================

/**
 * useResourcesContext — reads the singleton ResourcesContext.
 *
 * Must be called within a <ResourcesProvider> tree. Throws a clear error if
 * used outside so misconfiguration fails loudly at dev time.
 */
export function useResourcesContext(): ResourcesContextValue {
  const ctx = useContext(ResourcesContext);
  if (!ctx) {
    throw new Error(
      'useResourcesContext must be called inside <ResourcesProvider>. ' +
        'Wrap your navigator (HomeStackNavigator) with <ResourcesProvider>.',
    );
  }
  return ctx;
}
