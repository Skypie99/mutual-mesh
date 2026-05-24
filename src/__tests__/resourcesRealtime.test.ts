import {
  applyResourceDelta,
  applyResourceDeltas,
  filterAvailable,
  sortByNewest,
  type RealtimeResource,
  type RealtimeEvent,
} from '@/lib/resourcesRealtime';
import type { ResourceStatus } from '@/types/database';

const r1: RealtimeResource = { id: '1', status: 'available', name: 'Rice' };
const r2: RealtimeResource = { id: '2', status: 'available', name: 'Formula' };
const r3: RealtimeResource = { id: '3', status: 'reserved', name: 'Diapers' };

describe('applyResourceDelta — INSERT', () => {
  it('adds a new resource to the end of state', () => {
    const result = applyResourceDelta([r1], { type: 'INSERT', new: r2 });
    expect(result).toEqual([r1, r2]);
  });

  it('is idempotent — inserting an existing id is a no-op', () => {
    const state = [r1];
    const result = applyResourceDelta(state, { type: 'INSERT', new: r1 });
    expect(result).toBe(state); // same reference — no churn
  });
});

describe('applyResourceDelta — UPDATE', () => {
  it('replaces the matching row by id', () => {
    const updated: RealtimeResource = { ...r1, status: 'reserved' };
    const result = applyResourceDelta([r1, r2], {
      type: 'UPDATE',
      new: updated,
      old: { id: '1' },
    });
    expect(result).toEqual([updated, r2]);
  });

  it('is a no-op when the updated id is not in state (out-of-order delivery)', () => {
    const state = [r1];
    const stranger: RealtimeResource = { id: '99', status: 'available', name: 'Soap' };
    const result = applyResourceDelta(state, {
      type: 'UPDATE',
      new: stranger,
      old: { id: '99' },
    });
    expect(result).toBe(state);
  });
});

describe('applyResourceDelta — DELETE', () => {
  it('removes the matching row', () => {
    const result = applyResourceDelta([r1, r2], {
      type: 'DELETE',
      old: { id: '1' },
    });
    expect(result).toEqual([r2]);
  });

  it('is a no-op when the deleted id is not in state', () => {
    const state = [r1, r2];
    const result = applyResourceDelta(state, {
      type: 'DELETE',
      old: { id: '99' },
    });
    expect(result).toBe(state);
  });
});

describe('applyResourceDeltas (sequence)', () => {
  it('processes a sequence in order', () => {
    const events: RealtimeEvent[] = [
      { type: 'INSERT', new: r1 },
      { type: 'INSERT', new: r2 },
      { type: 'UPDATE', new: { ...r1, status: 'reserved' }, old: { id: '1' } },
      { type: 'DELETE', old: { id: '2' } },
    ];
    const result = applyResourceDeltas([], events);
    expect(result).toEqual([{ ...r1, status: 'reserved' }]);
  });
});

describe('filterAvailable', () => {
  it('keeps only resources with status="available"', () => {
    expect(filterAvailable([r1, r2, r3])).toEqual([r1, r2]);
  });

  it('rejects status values that are not exactly "available" (strict match)', () => {
    // ResourceStatus is a string union — only lowercase 'available' is valid.
    const wrongCase: RealtimeResource = { id: '4', status: 'available' as const, name: 'X' };
    expect(filterAvailable([wrongCase])).toEqual([wrongCase]);
    // Unlisted statuses (e.g. reserved, completed) are excluded.
    const reserved: RealtimeResource = { id: '5', status: 'reserved' as const, name: 'Y' };
    expect(filterAvailable([reserved])).toEqual([]);
  });

  it('drops resources with missing status field', () => {
    const noStatus: RealtimeResource = { id: '5', name: 'Mystery' };
    expect(filterAvailable([noStatus])).toEqual([]);
  });
});

describe('sortByNewest', () => {
  it('sorts by created_at descending', () => {
    const a = { id: 'a', created_at: '2026-01-01' };
    const b = { id: 'b', created_at: '2026-05-01' };
    const c = { id: 'c', created_at: '2026-03-01' };
    expect(sortByNewest([a, b, c]).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns a new array (does not mutate input)', () => {
    const input = [{ id: 'a', created_at: '2026-01-01' }];
    const result = sortByNewest(input);
    expect(result).not.toBe(input);
  });

  it('places undated rows at the end (treated as epoch)', () => {
    const dated = { id: 'a', created_at: '2026-01-01' };
    const undated = { id: 'b' };
    expect(sortByNewest([undated, dated]).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('treats invalid date strings as epoch — no NaN comparator (Steve loop-6)', () => {
    const dated = { id: 'a', created_at: '2026-01-01' };
    const bogus = { id: 'b', created_at: 'not-a-date' };
    // Both treated as 0 + epoch respectively → dated wins; bogus to end.
    expect(sortByNewest([bogus, dated]).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

// ============================================================================
// Phase 4 Gary coverage gaps — see qa-reports/phase-4-gary-coverage-audit.md
// ============================================================================

describe('filterAvailable — defensive non-string status', () => {
  it('drops rows where status is non-string, null, or wrong-case', () => {
    const rows: RealtimeResource[] = [
      { id: '1', status: 'available' },
      { id: '2', status: 42 as unknown as ResourceStatus },
      { id: '3', status: null as unknown as ResourceStatus },
      { id: '4', status: 'AVAILABLE' as unknown as ResourceStatus },
    ];
    // Only exact lowercase 'available' passes — strict match per ResourceStatus union.
    expect(filterAvailable(rows).map((r) => r.id)).toEqual(['1']);
  });

  it('returns an empty array for an empty input', () => {
    expect(filterAvailable([])).toEqual([]);
  });

  it('returns the same logical content but a new array (no mutation)', () => {
    const input: RealtimeResource[] = [{ id: '1', status: 'available' }];
    const out = filterAvailable(input);
    expect(out).not.toBe(input);
    expect(out).toEqual(input);
  });
});

describe('applyResourceDeltas — empty event sequence', () => {
  it('returns the original state unchanged for an empty event list', () => {
    const state = [r1, r2];
    expect(applyResourceDeltas(state, [])).toBe(state);
  });
});

describe('sortByNewest — stable behavior', () => {
  it('handles all-undated rows without throwing', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const out = sortByNewest([a, b]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty input', () => {
    expect(sortByNewest([])).toEqual([]);
  });
});
