/**
 * ProfileScreen — counts, loading state, and error-path tests (Cycle 7 Gary).
 *
 * Extends the read-only display path tests in ProfileScreen.test.tsx with:
 *   - Posted / Active-claims counts loading from listMyPosts + listMyClaims
 *   - Loading state ("…") before data arrives
 *   - Null data from Supabase treated as 0
 *
 * Pattern: follows ProfileScreen.test.tsx exactly — render() without act(),
 * then use findBy* queries (which await internally) to let async effects settle.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ProfileScreen } from '@/screens/ProfileScreen';

// ─── Module mocks ────────────────────────────────────────────────────────────

jest.mock('@/lib/auth', () => ({
  useAuth: jest.fn(),
}));

const mockListMyPosts = jest.fn();
const mockListMyClaims = jest.fn();

jest.mock('@/lib/resources', () => ({
  listMyPosts: (...args: unknown[]) => mockListMyPosts(...args),
  listMyClaims: (...args: unknown[]) => mockListMyClaims(...args),
  deleteMyAccount: jest.fn().mockResolvedValue({ error: null }),
  updateMyProfile: jest.fn().mockResolvedValue({ error: null }),
}));

jest.mock('@/lib/errorReporting', () => ({
  DEFAULT_OPT_IN: false,
  getErrorReportingOptIn: jest.fn().mockResolvedValue(false),
  setErrorReportingOptIn: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SafeAreaView: jest.requireActual('react-native').View as unknown,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { useAuth } from '@/lib/auth';

const mockUseAuth = useAuth as jest.Mock;

const fakeUser = { id: 'user-123' };
const fakeProfile = {
  id: 'user-123',
  handle: 'brave-fox-4521',
  postal_prefix: 'V6A',
  city: 'Vancouver',
  is_verified: true,
  is_admin: false,
  last_active_at: new Date().toISOString(),
};

function renderWithFakeAuth(overrides: Partial<typeof fakeProfile> = {}) {
  mockUseAuth.mockReturnValue({
    user: fakeUser,
    profile: { ...fakeProfile, ...overrides },
    signOut: jest.fn(),
    session: {},
    loading: false,
    reloadProfile: jest.fn(),
  });
  return render(<ProfileScreen />);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProfileScreen — counts display after load', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls listMyPosts with the user id on mount', async () => {
    mockListMyPosts.mockResolvedValue({ data: [], error: null });
    mockListMyClaims.mockResolvedValue({ data: [], error: null });
    renderWithFakeAuth();
    // Wait for async effects to complete — both counts become 0 (use findAll to
    // avoid "multiple matches" error when the query finds two "0" text nodes)
    await screen.findAllByText('0');
    expect(mockListMyPosts).toHaveBeenCalledWith(fakeUser.id);
  });

  it('calls listMyClaims with the user id on mount', async () => {
    mockListMyPosts.mockResolvedValue({ data: [], error: null });
    mockListMyClaims.mockResolvedValue({ data: [], error: null });
    renderWithFakeAuth();
    await screen.findAllByText('0');
    expect(mockListMyClaims).toHaveBeenCalledWith(fakeUser.id);
  });

  it('displays the posted count after data loads (3 posts)', async () => {
    mockListMyPosts.mockResolvedValue({
      data: [{ id: '1' }, { id: '2' }, { id: '3' }],
      error: null,
    });
    mockListMyClaims.mockResolvedValue({ data: [], error: null });
    renderWithFakeAuth();
    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('displays the active-claims count after data loads (2 claims)', async () => {
    mockListMyPosts.mockResolvedValue({ data: [], error: null });
    mockListMyClaims.mockResolvedValue({
      data: [{ id: 'c1' }, { id: 'c2' }],
      error: null,
    });
    renderWithFakeAuth();
    expect(await screen.findByText('2')).toBeTruthy();
  });

  it('shows zero counts when both queries return empty arrays', async () => {
    mockListMyPosts.mockResolvedValue({ data: [], error: null });
    mockListMyClaims.mockResolvedValue({ data: [], error: null });
    renderWithFakeAuth();
    // Wait for load to complete — both counts become 0
    const zeros = await screen.findAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it('treats null data from Supabase as 0 (defensive)', async () => {
    mockListMyPosts.mockResolvedValue({ data: null, error: { message: 'oops' } });
    mockListMyClaims.mockResolvedValue({ data: null, error: null });
    renderWithFakeAuth();
    const zeros = await screen.findAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ProfileScreen — loading state', () => {
  it('shows "…" loading indicator before data resolves', async () => {
    // Use a never-resolving promise to keep the loading state visible long
    // enough to assert. We then resolve in a findByText to avoid open handles.
    let resolvePostsFn!: (v: unknown) => void;
    const pendingPosts = new Promise((res) => { resolvePostsFn = res; });
    mockListMyPosts.mockReturnValue(pendingPosts);
    mockListMyClaims.mockResolvedValue({ data: [], error: null });

    renderWithFakeAuth();
    // Loading state renders "…" in the count cells
    const dots = screen.getAllByText('…');
    expect(dots.length).toBeGreaterThanOrEqual(1);

    // Resolve to allow cleanup and avoid open-handle warnings
    resolvePostsFn({ data: [], error: null });
    // Wait for load completion
    await screen.findAllByText('0');
  });
});

describe('ProfileScreen — no user', () => {
  it('renders without crashing when user is null', async () => {
    mockListMyPosts.mockResolvedValue({ data: [], error: null });
    mockListMyClaims.mockResolvedValue({ data: [], error: null });
    mockUseAuth.mockReturnValue({
      user: null,
      profile: null,
      signOut: jest.fn(),
      session: null,
      loading: false,
      reloadProfile: jest.fn(),
    });
    render(<ProfileScreen />);
    // Should render and show em-dash for null handle
    expect(await screen.findAllByText('—')).toBeTruthy();
  });
});
