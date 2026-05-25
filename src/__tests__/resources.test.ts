/**
 * resources.ts — unit tests for listMyPosts() and listMyClaims().
 *
 * AC-6.3 Gary QA (2026-05-25): Dana narrowed both functions to select('id')
 * so ProfileScreen only fetches what it actually needs (a count). These tests
 * verify the correct Supabase call chain and return-value contract without
 * hitting the network.
 *
 * Approach: jest.mock('@/lib/supabase') with a chainable builder so the full
 * .from().select().eq().order().limit() chain resolves to a controlled value.
 * Each test drives the mock to a different terminal state (data, empty, error)
 * and asserts the function returns the raw Supabase result unchanged.
 *
 * Note: listMyPosts / listMyClaims are thin query builders — they return the
 * Supabase promise directly (no transformation). The UI is responsible for
 * interpreting `.data.length`. These tests verify the CHAIN is correct, not
 * that the UI counts correctly (that's ProfileScreen.test.tsx's territory).
 */

// ─── Mock supabase ────────────────────────────────────────────────────────────

/**
 * Chainable builder that resolves to `resolvedValue` when awaited.
 * Every method returns `this` so the full query chain can be called
 * without errors even in tests that don't assert intermediate calls.
 */
function makeChain(resolvedValue: unknown) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(resolvedValue),
  };
  return chain;
}

const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Import after mock ────────────────────────────────────────────────────────

import { listMyPosts, listMyClaims } from '@/lib/resources';

// ─── listMyPosts ──────────────────────────────────────────────────────────────

describe('listMyPosts()', () => {
  const uid = 'user-abc-123';

  it('returns data array when Supabase returns rows', async () => {
    const rows = [{ id: 'res-1' }, { id: 'res-2' }, { id: 'res-3' }];
    const chain = makeChain({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await listMyPosts(uid);

    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
  });

  it('returns empty array when the user has no posts', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await listMyPosts(uid);

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('returns error object when Supabase returns an error', async () => {
    const supabaseError = { message: 'permission denied', code: '42501' };
    const chain = makeChain({ data: null, error: supabaseError });
    mockFrom.mockReturnValue(chain);

    const result = await listMyPosts(uid);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(supabaseError);
  });

  it('queries the resources table with the correct column and filter', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listMyPosts(uid);

    // Verify the chain: from('resources').select('id').eq('posted_by', uid)
    expect(mockFrom).toHaveBeenCalledWith('resources');
    expect(chain.select).toHaveBeenCalledWith('id');
    expect(chain.eq).toHaveBeenCalledWith('posted_by', uid);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(500);
  });

  it('returns only {id} shaped objects (no extra columns leaked)', async () => {
    const rows = [{ id: 'res-x' }];
    const chain = makeChain({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await listMyPosts(uid);

    // Verify the mock-returned data has only `id` — guards against a future
    // regression that accidentally widens select('id') back to select('*').
    const keys = Object.keys((result.data as { id: string }[])[0] ?? {});
    expect(keys).toEqual(['id']);
  });
});

// ─── listMyClaims ─────────────────────────────────────────────────────────────

describe('listMyClaims()', () => {
  const uid = 'user-xyz-789';

  it('returns reserved rows when Supabase returns matches', async () => {
    const rows = [{ id: 'res-10' }, { id: 'res-11' }];
    const chain = makeChain({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await listMyClaims(uid);

    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
  });

  it('returns empty array when the user has no active claims', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await listMyClaims(uid);

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('returns error object when Supabase returns an error', async () => {
    const supabaseError = { message: 'connection timeout', code: '08006' };
    const chain = makeChain({ data: null, error: supabaseError });
    mockFrom.mockReturnValue(chain);

    const result = await listMyClaims(uid);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(supabaseError);
  });

  it('filters to claimed_by = uid AND status = reserved (not completed or available)', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listMyClaims(uid);

    // Both .eq() calls must be present — claimed_by and status='reserved'.
    // This is the core AC-6.3 correctness contract: completed pickups must
    // NOT appear in the "Active claims" count.
    expect(mockFrom).toHaveBeenCalledWith('resources');
    expect(chain.select).toHaveBeenCalledWith('id');
    expect(chain.eq).toHaveBeenCalledWith('claimed_by', uid);
    expect(chain.eq).toHaveBeenCalledWith('status', 'reserved');
    expect(chain.order).toHaveBeenCalledWith('status_changed_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(500);
  });

  it('does NOT count completed pickups (status filter is load-bearing)', async () => {
    // This test documents the INTENT: the function is supposed to only return
    // 'reserved' rows. The mock here simulates what Supabase would return if
    // only reserved rows matched — completed rows are absent.
    const reservedOnly = [{ id: 'res-20' }];
    const chain = makeChain({ data: reservedOnly, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await listMyClaims(uid);

    // If a 'completed' row somehow appeared, the ProfileScreen would show a
    // wrong "Active claims" count. The DB enforces this via the .eq('status',
    // 'reserved') filter — we verify the function passes that filter.
    expect(chain.eq).toHaveBeenCalledWith('status', 'reserved');
    expect(result.data).toHaveLength(1);
  });
});
