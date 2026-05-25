/**
 * listResources() cursor pagination — unit tests (Shamus 2026-05-25).
 *
 * Verifies:
 *   - page 0 requests range 0–19
 *   - page 1 requests range 20–39
 *   - hasMore: true when exactly PAGE_SIZE rows returned
 *   - hasMore: false when <PAGE_SIZE rows returned (last page / empty DB)
 *   - empty DB (0 rows) → hasMore: false
 *   - error propagated correctly in the return value
 *
 * Supabase is mocked at the module level. The chaining pattern mirrors
 * how the postgrest builder works: from().select().eq().order().range()
 * returning { data, error }.
 *
 * Note on jest.mock hoisting: factory function runs before imports, so
 * inner mocks are accessed via the escape hatch pattern used across this
 * test suite (see updateMyProfile.test.ts).
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => {
  const mockRange = jest.fn();
  const mockOrder = jest.fn(() => ({ range: mockRange }));
  const mockEq = jest.fn(() => ({ order: mockOrder }));
  const mockSelect = jest.fn(() => ({ eq: mockEq }));
  const mockFrom = jest.fn(() => ({ select: mockSelect }));
  return {
    supabase: {
      from: mockFrom,
      __mocks: { mockRange, mockOrder, mockEq, mockSelect, mockFrom },
    },
  };
});

// ─── Imports after mock setup ─────────────────────────────────────────────────

import { listResources, PAGE_SIZE } from '@/lib/resources';
import { supabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { mockRange, mockOrder, mockEq, mockSelect, mockFrom } = (supabase as any).__mocks as {
  mockRange: jest.Mock;
  mockOrder: jest.Mock;
  mockEq: jest.Mock;
  mockSelect: jest.Mock;
  mockFrom: jest.Mock;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build an array of N minimal resource stubs. */
function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `resource-${i}`, status: 'available' }));
}

/** Reset chain mocks between tests. */
function resetChain() {
  jest.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ order: mockOrder });
  mockOrder.mockReturnValue({ range: mockRange });
}

/** Set what .range() will resolve with. */
function dbResult(data: object[] | null, error: { message: string } | null = null) {
  mockRange.mockResolvedValue({ data, error });
}

// ─── PAGE_SIZE constant ───────────────────────────────────────────────────────

describe('PAGE_SIZE constant', () => {
  it('is 20', () => {
    expect(PAGE_SIZE).toBe(20);
  });
});

// ─── Range calculation ────────────────────────────────────────────────────────

describe('listResources() — range calculation', () => {
  beforeEach(() => {
    resetChain();
    dbResult(makeRows(PAGE_SIZE));
  });

  it('page 0 fetches range 0–19', async () => {
    await listResources(0);
    expect(mockRange).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
  });

  it('page 1 fetches range 20–39', async () => {
    await listResources(1);
    expect(mockRange).toHaveBeenCalledWith(PAGE_SIZE, PAGE_SIZE * 2 - 1);
  });

  it('page 2 fetches range 40–59', async () => {
    await listResources(2);
    expect(mockRange).toHaveBeenCalledWith(PAGE_SIZE * 2, PAGE_SIZE * 3 - 1);
  });

  it('defaults to page 0 when called with no argument', async () => {
    await listResources();
    expect(mockRange).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
  });
});

// ─── hasMore flag ─────────────────────────────────────────────────────────────

describe('listResources() — hasMore flag', () => {
  beforeEach(resetChain);

  it('hasMore: true when exactly PAGE_SIZE rows returned', async () => {
    dbResult(makeRows(PAGE_SIZE));
    const result = await listResources(0);
    expect(result.hasMore).toBe(true);
  });

  it('hasMore: false when fewer than PAGE_SIZE rows returned', async () => {
    dbResult(makeRows(PAGE_SIZE - 1));
    const result = await listResources(0);
    expect(result.hasMore).toBe(false);
  });

  it('hasMore: false when exactly 1 row returned', async () => {
    dbResult(makeRows(1));
    const result = await listResources(0);
    expect(result.hasMore).toBe(false);
  });

  it('hasMore: false when 0 rows returned (empty DB)', async () => {
    dbResult([]);
    const result = await listResources(0);
    expect(result.hasMore).toBe(false);
  });

  it('hasMore: false when data is null (Supabase returns null on no rows)', async () => {
    dbResult(null);
    const result = await listResources(0);
    expect(result.hasMore).toBe(false);
  });
});

// ─── Data passthrough ─────────────────────────────────────────────────────────

describe('listResources() — data passthrough', () => {
  beforeEach(resetChain);

  it('returns the data array from Supabase on success', async () => {
    const rows = makeRows(5);
    dbResult(rows);
    const result = await listResources(0);
    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
  });

  it('returns an empty array when data is null', async () => {
    dbResult(null);
    const result = await listResources(0);
    expect(result.data).toEqual([]);
  });
});

// ─── Error propagation ────────────────────────────────────────────────────────

describe('listResources() — error propagation', () => {
  beforeEach(resetChain);

  it('propagates the error when Supabase returns an error', async () => {
    const err = { message: 'connection refused' };
    mockRange.mockResolvedValue({ data: null, error: err });
    const result = await listResources(0);
    expect(result.error).toEqual(err);
  });

  it('returns an empty data array on error', async () => {
    mockRange.mockResolvedValue({ data: null, error: { message: 'oops' } });
    const result = await listResources(0);
    expect(result.data).toEqual([]);
  });

  it('reports hasMore: false on error (no rows means no next page)', async () => {
    mockRange.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    const result = await listResources(0);
    expect(result.hasMore).toBe(false);
  });
});

// ─── Query shape ──────────────────────────────────────────────────────────────

describe('listResources() — query shape', () => {
  beforeEach(() => {
    resetChain();
    dbResult(makeRows(PAGE_SIZE));
  });

  it('queries the resources table', async () => {
    await listResources(0);
    expect(mockFrom).toHaveBeenCalledWith('resources');
  });

  it('filters to status="available"', async () => {
    await listResources(0);
    expect(mockEq).toHaveBeenCalledWith('status', 'available');
  });

  it('orders by created_at descending', async () => {
    await listResources(0);
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
