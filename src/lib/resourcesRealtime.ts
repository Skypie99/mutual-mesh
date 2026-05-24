/**
 * Realtime merge helpers — PURE.
 *
 * Pattern inherited from AccessMap's `flagsRealtime.ts` (LEARNINGS.md):
 * split the Supabase channel adapter from the merge logic so the merge
 * can be unit-tested without mocking Supabase.
 *
 * When Phase 0b ships:
 * - `src/lib/resources.ts` (NOT yet written) owns the Supabase channel
 *   subscription and calls these helpers on each event.
 * - This file is testable in isolation with plain JS objects.
 *
 * Generic `Resource` shape on purpose — the real schema lands in
 * `src/types/database.ts` after Jordan/Sky approve `PRIVACY.md`. These
 * helpers don't need to know about every field; they only key on `id`
 * and (for filterAvailable) `status`.
 */

import type { ResourceStatus } from '@/types/database';

/** Structural minimum we need. Wider types satisfy. */
export type RealtimeResource = {
  id: string;
  status?: ResourceStatus;
  created_at?: string;
  [key: string]: unknown;
};

export type RealtimeEvent<T extends RealtimeResource = RealtimeResource> =
  | { type: 'INSERT'; new: T }
  | { type: 'UPDATE'; new: T; old: { id: string } }
  | { type: 'DELETE'; old: { id: string } };

/**
 * Apply a single realtime delta to a list of resources.
 * Returns a NEW array reference — safe to use as React state.
 *
 * Edge cases handled:
 * - INSERT for an id already in state → no-op (idempotent)
 * - UPDATE for an id NOT in state → no-op (out-of-order delivery; the
 *   subsequent INSERT will land via a later event)
 * - DELETE for an id NOT in state → no-op
 */
export function applyResourceDelta<T extends RealtimeResource>(
  state: T[],
  event: RealtimeEvent<T>,
): T[] {
  switch (event.type) {
    case 'INSERT':
      if (state.some((r) => r.id === event.new.id)) return state;
      return [...state, event.new];
    case 'UPDATE': {
      let changed = false;
      const next = state.map((r) => {
        if (r.id === event.new.id) {
          changed = true;
          return event.new;
        }
        return r;
      });
      return changed ? next : state;
    }
    case 'DELETE': {
      const next = state.filter((r) => r.id !== event.old.id);
      return next.length === state.length ? state : next;
    }
  }
}

/**
 * Apply a sequence of deltas in order. Useful for tests and for replaying
 * a buffered event queue (e.g., events that arrived while a screen was
 * suspended).
 */
export function applyResourceDeltas<T extends RealtimeResource>(
  state: T[],
  events: RealtimeEvent<T>[],
): T[] {
  return events.reduce<T[]>((acc, ev) => applyResourceDelta(acc, ev), state);
}

const AVAILABLE_STATUS: ResourceStatus = 'available';

/**
 * Filter to resources currently available in the marketplace.
 */
export function filterAvailable<T extends RealtimeResource>(state: T[]): T[] {
  return state.filter((r) => r.status === AVAILABLE_STATUS);
}

/**
 * Defensive sort: newest first by `created_at` if present, else stable.
 * Pure — does not mutate input.
 */
export function sortByNewest<T extends RealtimeResource>(state: T[]): T[] {
  // Steve loop-6 audit: Date.parse returns NaN for invalid strings. A NaN
  // comparator return value is undefined behavior per ECMAScript; coerce
  // NaN → 0 so unparseable rows are treated as "no date" (sort to end).
  const safeParse = (s: string | undefined): number => {
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  };
  return [...state].sort((a, b) => safeParse(b.created_at) - safeParse(a.created_at));
}
