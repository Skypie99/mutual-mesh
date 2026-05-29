/**
 * resources.ts — unit tests for the critical read/write paths (Cycle 7 Gary).
 *
 * Covers the coverage gaps identified in qa-reports/2026-05-28_Gary_Cycle7_CoverageMap.md:
 *   - createResource() success + insert propagation
 *   - listResources() call shape (filter + ordering)
 *   - updateResourceStatus via deleteResourceById (no updateResourceStatus in API;
 *     the write path that changes status from client-side is claimResource / deleteResourceById)
 *   - getResourceDetail() success + error paths
 *   - listMyPosts / listMyClaims filter args
 *
 * Supabase is mocked at the module level using the chaining pattern from
 * updateMyProfile.test.ts. Factory exposes inner mocks via __mocks so tests
 * can reach them after the hoisted jest.mock call.
 *
 * Note on jest.mock hoisting: jest.mock() is hoisted above all imports; outer
 * scope variables cannot be referenced inside the factory function. Inner mocks
 * are defined inline and exposed via the __mocks escape hatch.
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => {
  // Single / terminal mock — resolves with a configurable value.
  // Avoid circular self-reference inside the factory: each mock is declared
  // before it is referenced in another mock's return value.
  const mockSingle: jest.Mock = jest.fn();
  const mockLimit: jest.Mock = jest.fn();
  const mockOrder: jest.Mock = jest.fn();
  // mockEq is self-referential (chained .eq().eq()). We break the cycle by
  // returning a plain object that references the same mockEq variable — this
  // works because the returned object is evaluated lazily (on invocation), not
  // at declaration time. TypeScript explicit annotation removes the TS7022 error.
  const mockEq: jest.Mock = jest.fn(function () {
    return { eq: mockEq, order: mockOrder, limit: mockLimit };
  });
  const mockSelect: jest.Mock = jest.fn(function () {
    return { eq: mockEq, order: mockOrder, limit: mockLimit, single: mockSingle };
  });
  const mockInsert: jest.Mock = jest.fn(function () {
    return { select: mockSelect };
  });
  const mockDelete: jest.Mock = jest.fn(function () {
    return { eq: mockEq };
  });
  const mockFrom: jest.Mock = jest.fn(function () {
    return { select: mockSelect, insert: mockInsert, delete: mockDelete };
  });
  const mockRpc: jest.Mock = jest.fn();

  // Wire defaults for limit/order
  mockLimit.mockImplementation(function () { return { single: mockSingle }; });
  mockOrder.mockImplementation(function () { return { limit: mockLimit }; });

  return {
    supabase: {
      from: mockFrom,
      rpc: mockRpc,
      // Expose inner mocks for test access
      __mocks: { mockFrom, mockInsert, mockSelect, mockEq, mockLimit, mockOrder, mockSingle, mockRpc, mockDelete },
    },
  };
});

// ─── Import after mock setup ──────────────────────────────────────────────────

import {
  createResource,
  listResources,
  listMyPosts,
  listMyClaims,
  getResourceDetail,
  deleteResourceById,
  claimResource,
  deleteMyAccount,
  confirmPickup,
  completeOnboarding,
  getClaimantHandle,
} from '@/lib/resources';
import { supabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabase as any).__mocks as {
  mockFrom: jest.Mock;
  mockInsert: jest.Mock;
  mockSelect: jest.Mock;
  mockEq: jest.Mock;
  mockLimit: jest.Mock;
  mockOrder: jest.Mock;
  mockSingle: jest.Mock;
  mockRpc: jest.Mock;
  mockDelete: jest.Mock;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetChain(terminalResult: { data: unknown; error: unknown }) {
  // Re-wire the chain so each method returns the next in sequence and the
  // terminal (single / limit) returns the configured result.
  mocks.mockSingle.mockResolvedValue(terminalResult);
  mocks.mockLimit.mockImplementation(() => {
    // For queries that end with .limit(), resolve immediately
    return Promise.resolve(terminalResult);
  });
  mocks.mockOrder.mockReturnValue({ limit: mocks.mockLimit });
  mocks.mockEq.mockReturnValue({
    eq: mocks.mockEq,
    order: mocks.mockOrder,
    limit: mocks.mockLimit,
  });
  mocks.mockSelect.mockReturnValue({
    eq: mocks.mockEq,
    order: mocks.mockOrder,
    limit: mocks.mockLimit,
    single: mocks.mockSingle,
  });
  mocks.mockInsert.mockReturnValue({ select: mocks.mockSelect });
  mocks.mockDelete.mockReturnValue({ eq: mocks.mockEq });
  mocks.mockFrom.mockReturnValue({
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    delete: mocks.mockDelete,
  });
}

const POSTER_ID = 'user-poster-aaa';

const minimalInput = {
  name: 'Rice bag',
  pickup_text: 'Front door',
  contact_handle: 'brave-fox-9999',
};

// ─── createResource() ─────────────────────────────────────────────────────────

describe('createResource() — success path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetChain({ data: { id: 'resource-001', name: 'Rice bag' }, error: null });
  });

  it('calls supabase.from("resources")', async () => {
    await createResource(minimalInput, POSTER_ID);
    expect(mocks.mockFrom).toHaveBeenCalledWith('resources');
  });

  it('inserts with posted_by set to the provided userId', async () => {
    await createResource(minimalInput, POSTER_ID);
    expect(mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ posted_by: POSTER_ID }),
    );
  });

  it('inserts with the correct name', async () => {
    await createResource(minimalInput, POSTER_ID);
    expect(mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Rice bag' }),
    );
  });

  it('normalizes undefined description to null', async () => {
    await createResource({ ...minimalInput, description: undefined }, POSTER_ID);
    expect(mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it('normalizes undefined photo_url to null', async () => {
    await createResource({ ...minimalInput, photo_url: undefined }, POSTER_ID);
    expect(mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ photo_url: null }),
    );
  });

  it('normalizes undefined postal_prefix to null', async () => {
    await createResource({ ...minimalInput, postal_prefix: undefined }, POSTER_ID);
    expect(mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ postal_prefix: null }),
    );
  });

  it('normalizes undefined city to null', async () => {
    await createResource({ ...minimalInput, city: undefined }, POSTER_ID);
    expect(mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ city: null }),
    );
  });

  it('passes non-null optional fields through unchanged', async () => {
    await createResource(
      { ...minimalInput, description: 'Good rice', city: 'Vancouver', postal_prefix: 'V6A' },
      POSTER_ID,
    );
    expect(mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Good rice',
        city: 'Vancouver',
        postal_prefix: 'V6A',
      }),
    );
  });

  it('chains .select().single() after insert', async () => {
    await createResource(minimalInput, POSTER_ID);
    expect(mocks.mockSelect).toHaveBeenCalled();
    expect(mocks.mockSingle).toHaveBeenCalled();
  });
});

describe('createResource() — error path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetChain({ data: null, error: { code: '23505', message: 'duplicate key' } });
  });

  it('forwards the Supabase error without throwing', async () => {
    const result = await createResource(minimalInput, POSTER_ID);
    expect(result.error).toBeTruthy();
    expect(result.data).toBeNull();
  });
});

// ─── listResources() ──────────────────────────────────────────────────────────

describe('listResources() — query shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetChain({ data: [], error: null });
  });

  it('queries the "resources" table', async () => {
    await listResources();
    expect(mocks.mockFrom).toHaveBeenCalledWith('resources');
  });

  it('applies status="available" filter', async () => {
    await listResources();
    expect(mocks.mockEq).toHaveBeenCalledWith('status', 'available');
  });

  it('orders by created_at descending', async () => {
    await listResources();
    expect(mocks.mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('applies a limit (hard cap)', async () => {
    await listResources();
    expect(mocks.mockLimit).toHaveBeenCalledWith(500);
  });
});

// ─── listMyPosts() ─────────────────────────────────────────────────────────────

describe('listMyPosts() — query shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetChain({ data: [], error: null });
  });

  it('queries "resources" filtered by posted_by', async () => {
    await listMyPosts(POSTER_ID);
    expect(mocks.mockFrom).toHaveBeenCalledWith('resources');
    expect(mocks.mockEq).toHaveBeenCalledWith('posted_by', POSTER_ID);
  });

  it('applies a limit', async () => {
    await listMyPosts(POSTER_ID);
    expect(mocks.mockLimit).toHaveBeenCalledWith(500);
  });
});

// ─── listMyClaims() ────────────────────────────────────────────────────────────

describe('listMyClaims() — query shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetChain({ data: [], error: null });
  });

  it('queries "resources" filtered by claimed_by', async () => {
    await listMyClaims(POSTER_ID);
    expect(mocks.mockFrom).toHaveBeenCalledWith('resources');
    expect(mocks.mockEq).toHaveBeenCalledWith('claimed_by', POSTER_ID);
  });

  it('also filters by status="reserved"', async () => {
    await listMyClaims(POSTER_ID);
    expect(mocks.mockEq).toHaveBeenCalledWith('status', 'reserved');
  });

  it('applies a limit', async () => {
    await listMyClaims(POSTER_ID);
    expect(mocks.mockLimit).toHaveBeenCalledWith(500);
  });
});

// ─── getResourceDetail() ──────────────────────────────────────────────────────

describe('getResourceDetail() — success path', () => {
  const fakeRow = { id: 'resource-001', name: 'Rice bag', contact_handle: null };

  beforeEach(() => {
    jest.clearAllMocks();
    mocks.mockRpc.mockResolvedValue({ data: [fakeRow], error: null });
  });

  it('calls supabase.rpc("get_resource_detail")', async () => {
    await getResourceDetail('resource-001');
    expect(mocks.mockRpc).toHaveBeenCalledWith('get_resource_detail', {
      p_resource_id: 'resource-001',
    });
  });

  it('returns the first row from the array result', async () => {
    const result = await getResourceDetail('resource-001');
    expect(result.data).toEqual(fakeRow);
    expect(result.error).toBeNull();
  });

  it('returns null data when the RPC returns an empty array (not found)', async () => {
    mocks.mockRpc.mockResolvedValue({ data: [], error: null });
    const result = await getResourceDetail('missing-id');
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it('handles a non-array data response (single object from RPC)', async () => {
    mocks.mockRpc.mockResolvedValue({ data: fakeRow, error: null });
    const result = await getResourceDetail('resource-001');
    // Non-array path: data is returned as-is
    expect(result.data).toEqual(fakeRow);
    expect(result.error).toBeNull();
  });
});

describe('getResourceDetail() — error path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'row not found' },
    });
  });

  it('returns null data and the error when RPC fails', async () => {
    const result = await getResourceDetail('resource-001');
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('does NOT throw — returns the error object', async () => {
    await expect(getResourceDetail('resource-001')).resolves.not.toThrow();
  });
});

// ─── deleteResourceById() ─────────────────────────────────────────────────────

describe('deleteResourceById() — query shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.mockEq.mockResolvedValue({ error: null });
    mocks.mockDelete.mockReturnValue({ eq: mocks.mockEq });
    mocks.mockFrom.mockReturnValue({
      select: mocks.mockSelect,
      insert: mocks.mockInsert,
      delete: mocks.mockDelete,
    });
  });

  it('calls delete() on the "resources" table', async () => {
    await deleteResourceById('resource-001');
    expect(mocks.mockFrom).toHaveBeenCalledWith('resources');
    expect(mocks.mockDelete).toHaveBeenCalled();
  });

  it('filters by the provided id', async () => {
    await deleteResourceById('resource-001');
    expect(mocks.mockEq).toHaveBeenCalledWith('id', 'resource-001');
  });
});

// ─── claimResource() ──────────────────────────────────────────────────────────

describe('claimResource() — delegates to RPC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('calls supabase.rpc("claim_resource") with the resource id', async () => {
    await claimResource('resource-001');
    expect(mocks.mockRpc).toHaveBeenCalledWith('claim_resource', {
      resource_id: 'resource-001',
    });
  });
});

// ─── deleteMyAccount() ────────────────────────────────────────────────────────

describe('deleteMyAccount() — delegates to RPC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('calls supabase.rpc("delete_my_account")', async () => {
    await deleteMyAccount();
    expect(mocks.mockRpc).toHaveBeenCalledWith('delete_my_account');
  });
});

// ─── confirmPickup() ──────────────────────────────────────────────────────────

describe('confirmPickup() — delegates to RPC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('calls supabase.rpc("confirm_pickup") with the resource id', async () => {
    await confirmPickup('resource-001');
    expect(mocks.mockRpc).toHaveBeenCalledWith('confirm_pickup', {
      p_resource_id: 'resource-001',
    });
  });
});

// ─── completeOnboarding() ─────────────────────────────────────────────────────

describe('completeOnboarding() — delegates to RPC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('calls supabase.rpc("complete_onboarding")', async () => {
    await completeOnboarding();
    expect(mocks.mockRpc).toHaveBeenCalledWith('complete_onboarding');
  });
});

// ─── getClaimantHandle() ──────────────────────────────────────────────────────

describe('getClaimantHandle() — query shape', () => {
  const mockMaybeSingle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { handle: 'brave-fox-9999' }, error: null });
    mocks.mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mocks.mockSelect.mockReturnValue({ eq: mocks.mockEq });
    mocks.mockFrom.mockReturnValue({ select: mocks.mockSelect });
  });

  it('queries the "users" table for the handle field', async () => {
    await getClaimantHandle('user-aaa');
    expect(mocks.mockFrom).toHaveBeenCalledWith('users');
    expect(mocks.mockSelect).toHaveBeenCalledWith('handle');
  });

  it('filters by the provided userId', async () => {
    await getClaimantHandle('user-aaa');
    expect(mocks.mockEq).toHaveBeenCalledWith('id', 'user-aaa');
  });
});
