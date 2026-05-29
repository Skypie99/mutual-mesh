/**
 * ProfileScreen — component-level tests (read-only display path).
 *
 * Installed @testing-library/react-native (Phase 4 Gary coverage audit).
 * Tests the static display path: handle, postal_prefix, and action buttons.
 * Mocks useAuth, resource helpers, and errorReporting to isolate rendering.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ProfileScreen } from '@/screens/ProfileScreen';

// ─── Module mocks ────────────────────────────────────────────────────────────

jest.mock('@/lib/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/resources', () => ({
  listMyPosts: jest.fn().mockResolvedValue({ data: [], error: null }),
  listMyClaims: jest.fn().mockResolvedValue({ data: [], error: null }),
  deleteMyAccount: jest.fn().mockResolvedValue({ error: null }),
}));

jest.mock('@/lib/errorReporting', () => ({
  DEFAULT_OPT_IN: false,
  getErrorReportingOptIn: jest.fn().mockResolvedValue(false),
  setErrorReportingOptIn: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  // Stub SafeAreaView with the plain View from react-native so NativeWind's
  // CSS interop does not run during tests (avoids out-of-scope variable errors).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SafeAreaView: jest.requireActual('react-native').View as unknown,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// AC-6.3 — mock useFocusEffect so tests don't need a NavigationContainer.
// The mock is a no-op: we don't need to verify focus-triggered reloads in
// unit tests (that's an integration concern). The mount-time useEffect in
// ProfileScreen already exercises loadCounts on render, which is what the
// tests assert. Suppressing the real hook avoids "useNavigation called
// outside of NavigationContainer" errors.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
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

describe('ProfileScreen — read-only display path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the user handle from mock profile', async () => {
    renderWithFakeAuth();
    expect(await screen.findByText('brave-fox-4521')).toBeTruthy();
  });

  it('renders the postal prefix (neighborhood) from mock profile', async () => {
    renderWithFakeAuth();
    expect(await screen.findByText('V6A')).toBeTruthy();
  });

  it('shows "Sign out" button', async () => {
    renderWithFakeAuth();
    // Button uses accessibilityLabel matching its label prop
    expect(await screen.findByLabelText('Sign out')).toBeTruthy();
  });

  it('shows "Delete my account" button', async () => {
    renderWithFakeAuth();
    expect(await screen.findByLabelText('Delete my account')).toBeTruthy();
  });

  it('renders em-dash fallback when handle is null', async () => {
    renderWithFakeAuth({ handle: null as unknown as string });
    expect(await screen.findByText('—')).toBeTruthy();
  });

  it('renders em-dash fallback when postal_prefix is null', async () => {
    renderWithFakeAuth({ postal_prefix: null as unknown as string });
    // At least one em-dash should be present (handle may also be null here —
    // we just assert the fallback renders without crashing)
    const dashes = await screen.findAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
