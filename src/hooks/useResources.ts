import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listResources } from '@/lib/resources';
import {
  applyResourceDelta,
  type RealtimeEvent,
  type RealtimeResource,
} from '@/lib/resourcesRealtime';
import type { ResourceRow } from '@/types/database';

/**
 * useResources — marketplace feed data + realtime.
 *
 * Responsibilities:
 *   1. Initial fetch via listResources (filtered to status='available', .limit(500)).
 *   2. Subscribe to Supabase Realtime on public.resources.
 *   3. Apply deltas via the PURE helper applyResourceDelta (tested in Loop 5).
 *   4. Surface { resources, loading, error, reload }.
 *
 * Patterns:
 *   - Mounted-ref guards every async setState (AccessMap LEARNINGS).
 *   - Realtime channel removed on unmount.
 *   - Reload is a manual refresh handle for pull-to-refresh UX (Cycle 2.5).
 *
 * Note on filtering: this hook returns ONLY available resources. INSERT
 * events for resources that arrive as status='available' add to the list;
 * UPDATE events that flip status to 'reserved' are removed from the local
 * view via a post-merge filter. DELETE events remove. This keeps the feed
 * consistent without a re-fetch on every status change.
 */
export type UseResourcesState = {
  resources: ResourceRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useResources(): UseResourcesState {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
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
  }, []);

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

  // Realtime subscription
  useEffect(() => {
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
  }, []);

  return { resources, loading, error, reload };
}
