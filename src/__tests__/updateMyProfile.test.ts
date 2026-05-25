/**
 * updateMyProfile() — unit tests (AC-6.1, Gary QA 2026-05-25).
 *
 * Tests the function added by Shamus on feat/mutualmesh-2026-05-25-shamus-profile-handle-edit.
 * Cherry-picked onto this qa/ branch so the import resolves.
 *
 * Supabase is mocked at the module level so no network calls are made.
 * The mock mirrors the chaining pattern: supabase.from(table).update(data).eq(col, val)
 * returning { error }.
 *
 * supabase.auth.getUser() is also mocked — success returns a fake user, failure
 * returns { data: { user: null } } to exercise the "Not signed in" path.
 *
 * Note on jest.mock hoisting: jest.mock() is hoisted above imports, but
 * variable declarations in the outer scope are NOT accessible from inside the
 * factory function when hoisted. To work around this, we use jest.fn() inline
 * in the factory and access the mocks via the re-imported module object.
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => {
  const mockEq = jest.fn();
  const mockUpdate = jest.fn(() => ({ eq: mockEq }));
  const mockFrom = jest.fn(() => ({ update: mockUpdate }));
  const mockGetUser = jest.fn();
  return {
    supabase: {
      auth: { getUser: mockGetUser },
      from: mockFrom,
      // expose the inner mocks so tests can reach them after import
      __mocks: { mockEq, mockUpdate, mockFrom, mockGetUser },
    },
  };
});

// ─── Import after mock setup ──────────────────────────────────────────────────

import { updateMyProfile } from '@/lib/resources';
import { supabase } from '@/lib/supabase';

// Extract the inner mock functions via the escape hatch exposed above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { mockEq, mockUpdate, mockFrom, mockGetUser } = (supabase as any).__mocks as {
  mockEq: jest.Mock;
  mockUpdate: jest.Mock;
  mockFrom: jest.Mock;
  mockGetUser: jest.Mock;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { id: 'user-abc-123' };

/** Sets auth.getUser() to resolve with a valid user. */
function signedIn() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser } });
}

/** Sets auth.getUser() to resolve with no user (signed out). */
function signedOut() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

/** Sets the Supabase update chain to resolve with a given error value. */
function dbResult(error: { code: string; message: string } | null) {
  mockEq.mockResolvedValue({ error });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('updateMyProfile() — not signed in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedOut();
  });

  it('returns an error message when the user is not authenticated', async () => {
    const result = await updateMyProfile({ handle: 'cool-otter-1234' });
    expect(result.error).toBe('Not signed in.');
  });

  it('does not call supabase.from() when not signed in', async () => {
    await updateMyProfile({ handle: 'cool-otter-1234' });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('updateMyProfile() — success path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn();
    // Reset the chain: mockFrom returns { update } and update returns { eq }
    mockFrom.mockReturnValue({ update: mockUpdate });
    mockUpdate.mockReturnValue({ eq: mockEq });
    dbResult(null);
  });

  it('returns { error: null } on success', async () => {
    const result = await updateMyProfile({ handle: 'brave-fox-9999' });
    expect(result.error).toBeNull();
  });

  it('calls supabase.from("users")', async () => {
    await updateMyProfile({ handle: 'brave-fox-9999' });
    expect(mockFrom).toHaveBeenCalledWith('users');
  });

  it('passes the handle update to .update()', async () => {
    await updateMyProfile({ handle: 'brave-fox-9999' });
    expect(mockUpdate).toHaveBeenCalledWith({ handle: 'brave-fox-9999' });
  });

  it('filters by the authenticated user id via .eq()', async () => {
    await updateMyProfile({ handle: 'brave-fox-9999' });
    expect(mockEq).toHaveBeenCalledWith('id', fakeUser.id);
  });

  it('passes postal_prefix update correctly', async () => {
    await updateMyProfile({ postal_prefix: 'M5V' });
    expect(mockUpdate).toHaveBeenCalledWith({ postal_prefix: 'M5V' });
  });

  it('passes both handle and postal_prefix when both are provided', async () => {
    await updateMyProfile({ handle: 'quiet-owl-2233', postal_prefix: 'K1A' });
    expect(mockUpdate).toHaveBeenCalledWith({
      handle: 'quiet-owl-2233',
      postal_prefix: 'K1A',
    });
  });
});

describe('updateMyProfile() — error path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn();
    mockFrom.mockReturnValue({ update: mockUpdate });
    mockUpdate.mockReturnValue({ eq: mockEq });
  });

  it('returns a non-null error string when Supabase reports an error', async () => {
    dbResult({ code: '23505', message: 'duplicate key value violates unique constraint' });
    const result = await updateMyProfile({ handle: 'taken-handle-0001' });
    expect(result.error).not.toBeNull();
    expect(typeof result.error).toBe('string');
  });

  it('does not expose raw Supabase error codes in the returned message', async () => {
    // userFacingErrorMessage() hides internal codes (PGRST*, numeric codes).
    dbResult({ code: 'PGRST116', message: 'PGRST116 row not found' });
    const result = await updateMyProfile({ handle: 'any-handle-1234' });
    expect(result.error).not.toContain('PGRST116');
  });

  it('uses the "Could not save your profile." fallback for PGRST-coded errors', async () => {
    // userFacingErrorMessage() hides messages matching /PGRST\d+/ and returns
    // the provided fallback ("Could not save your profile.") instead.
    dbResult({ code: 'PGRST301', message: 'PGRST301 JWT expired' });
    const result = await updateMyProfile({ handle: 'any-handle-5678' });
    expect(result.error).toMatch(/could not save your profile/i);
  });
});

describe('updateMyProfile() — empty updates object', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn();
    mockFrom.mockReturnValue({ update: mockUpdate });
    mockUpdate.mockReturnValue({ eq: mockEq });
    dbResult(null);
  });

  it('does not crash when passed an empty updates object', async () => {
    // updateMyProfile({}) is technically valid TypeScript (all fields optional).
    // The function should call Supabase without blowing up.
    await expect(updateMyProfile({})).resolves.toEqual({ error: null });
  });

  it('still calls .update() with the empty object so Supabase can decide', async () => {
    await updateMyProfile({});
    expect(mockUpdate).toHaveBeenCalledWith({});
  });
});
