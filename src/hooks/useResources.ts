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
 * useResources — marketplace feed data + realtime + cursor pagination.
 *
 * Responsibilities:
 *   1. Initial fetch via listResources(page=0) — PAGE_SIZE=20, newest first.
 *   2. loadMore() — fetches the next page and appends to the list.
 *   3. Subscribe to Supabase Realtime on public.resources.
 *   4. Apply deltas via the PURE helper applyResourceDelta (tested in Loop 5).
 *   5. Surface { resources, loading, loadingMore, hasMore, error, reload, loadMore }.
 *
 * Patterns:
 *   - Mounted-ref guards every async setState (AccessMap LEARNINGS).
 *   - pageRef tracks the current page without triggering re-renders.
 *   - Realtime channel removed on unmount.
 *   - reload() resets to page 0 (for pull-to-refresh).
 *   - loadMore() appends the next page; no-ops if loadingMore or !hasMore.
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
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

export function useResources(): UseResourcesState {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pageRef = useRef(0);

  const load = useCallback(async (page: number, append: boolean) => {
    if (!mountedRef.current) return;
    setError(null);

    const { data, error: err, hasMore: more } = await listResources(page);

    if (!mountedRef.current) return;
    if (err) {
      setError(err.message ?? 'Failed to load listings.');
      if (!append) setResources([]);
    } else {
      // listResources uses an explicit column select that intentionally omits
      // contact_handle (Jordan blocking condition 2 -- web gate 2026-05-25).
      // Feed components never access contact_handle, so this cast is safe.
      // contact_handle is only returned by getResourceDetail() RPC (detail screen).
      const rows = data as ResourceRow[];
      if (append) {
        setResources((prev) => [...prev, ...rows]);
      } else {
        setResources(rows);
      }
      setHasMore(more);
    }
  }, []);

  const reload = useCallback(async () => {
    if (!mountedRef.current) return;
    pageRef.current = 0;
    setLoading(true);
    await load(0, false);
    if (mountedRef.current) setLoading(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!mountedRef.current) return;
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    await load(nextPage, true);
    if (mountedRef.current) setLoadingMore(false);
  }, [load, loadingMore, hasMore]);

  // Initial load + cleanup
  useEffect(() => {
    mountedRef.current = true;
    pageRef.current = 0;
    void load(0, false).then(() => {
      if (mountedRef.current) setLoading(false);
    });
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

  return { resources, loading, loadingMore, hasMore, error, reload, loadMore };
}
