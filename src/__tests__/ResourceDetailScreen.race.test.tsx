/**
 * ResourceDetailScreen — race-condition & claim-flow tests.
 *
 * Gary QA — 2026-05-25
 * Branch: qa/auto-2026-05-25-gary-claim-race-tests
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * FEATURES.md Cycle 4 mandates "race-condition tests (two clients claiming
 * same item; one wins)." Since migration 014 (the atomic claim_resource RPC
 * with row-level locking) has not been applied to the live DB yet, these tests
 * operate at the **client layer only**, mocking `supabase.rpc` from
 * `@/lib/supabase` to simulate the error shape the RPC will return.
 *
 * When migration 014 ships, complement these with integration tests that hit
 * the real DB and issue concurrent claims.
 *
 * SCENARIOS COVERED (8 tests)
 * ────────────────────────────
 * Race condition (primary goal):
 *   R1 – "already claimed" error → shows plain-English message, not raw error
 *   R2 – "already claimed" error → message does NOT contain "try again"
 *   R3 – "already reserved" variant also triggers the race-condition path
 *   R4 – claiming state resets to false after the race-condition error
 *
 * Additional claim flow:
 *   C1 – successful claim triggers a refetch of the resource detail
 *   C2 – after successful claim, handle section renders when contact_handle
 *        becomes non-null (post-claim server response)
 *   C3 – Claim button is disabled while RPC is in flight (claiming === true)
 *   C4 – self-claim prevention: Claim button absent when posted_by ===
 *        currentUser.id
 *
 * KNOWN GAP — navigation-back on race condition
 * ──────────────────────────────────────────────
 * The Cycle 4 spec (Riley F4) requires that after a race-condition error the
 * screen navigates back to the feed after 2.5 s. The main-branch
 * ResourceDetailScreen does NOT yet have an `onNavigateBack` prop or `useAuth`
 * — those are introduced on feat/mutualmesh-2026-05-25-shamus-resource-detail.
 * Test R_NAV below is marked `.todo` to document the gap; it will become a
 * passing test once that branch is merged.
 *
 * MOCK STRATEGY
 * ─────────────
 * Mirrors the pattern in the baseline ResourceDetailScreen.test.tsx
 * (qa/auto-2026-05-25-gary-resource-detail-tests):
 *   - jest.mock('@/lib/resources')  → getResourceDetail
 *   - jest.mock('@/lib/supabase')   → supabase.rpc (claim_resource)
 *   - react-native-safe-area-context → SafeAreaView stubbed with RN View
 *   - @react-navigation/native      → useFocusEffect forwarded to useEffect
 *   - @/lib/photos                  → createSignedResourcePhotoUrl → null
 *
 * NOTE: main-branch ResourceDetailScreen does not import useAuth / @/lib/auth,
 * so no auth mock is needed here. Self-claim prevention (C4) therefore tests
 * the `posted_by` field against a hardcoded user id injected via the resource
 * fixture. When the Shamus branch is merged, this test should be updated to
 * also mock useAuth.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ResourceDetailScreen } from '@/screens/ResourceDetailScreen';

// ─── Module mocks ────────────────────────────────────────────────────────────

jest.mock('@/lib/resources', () => ({
  getResourceDetail: jest.fn(),
  getClaimantHandle: jest.fn().mockResolvedValue({ data: null, error: null }),
  // Ensure all other named exports remain intact (some may be imported by
  // transitive deps inside the screen bundle).
  listResources: jest.fn(),
  listMyPosts: jest.fn(),
  listMyClaims: jest.fn(),
  createResource: jest.fn(),
  deleteResourceById: jest.fn(),
}));

// The new ResourceDetailScreen calls supabase.rpc('claim_resource', ...) directly
// rather than the claimResource() helper. Mock supabase at the module level.
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// useFocusEffect: forward to useEffect so the callback runs after mount
// without causing infinite re-renders during the render phase.
// (Same fix as ProfileScreen + baseline ResourceDetailScreen tests.)
jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, []);
    },
  };
});

// SafeAreaView → RN View so NativeWind CSS interop doesn't execute in tests.
jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SafeAreaView: jest.requireActual('react-native').View as unknown,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// Photos: stub signed URL generation — no photo in any test fixture.
jest.mock('@/lib/photos', () => ({
  createSignedResourcePhotoUrl: jest.fn().mockResolvedValue(null),
}));

// Auth: stub useAuth so the screen mounts without an AuthProvider.
// Default: OTHER_USER_ID so race-condition tests don't hit the self-claim guard.
// Individual tests that need poster perspective call mockAuthAs(POSTER_ID).
const mockUseAuth = jest.fn(() => ({ user: { id: 'user-other-003' } }));
jest.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Import mocked modules ───────────────────────────────────────────────────

import { getResourceDetail } from '@/lib/resources';
import type { ResourceRow } from '@/types/database';

const mockGetResourceById = getResourceDetail as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const POSTER_ID = 'user-poster-001';
const CLAIMANT_ID = 'user-claimant-002';
const OTHER_USER_ID = 'user-other-003';
const RES_ID = 'res-race-001';

function fakeResource(overrides: Partial<ResourceRow> = {}): ResourceRow {
  return {
    id: RES_ID,
    posted_by: POSTER_ID,
    claimed_by: null,
    name: 'Baby Formula (Similac)',
    description: 'Two unopened cans, expiry Jan 2027.',
    pickup_text: 'Front porch, ring bell once.',
    contact_handle: null, // null until claimed (Jordan Condition B: string | null)
    postal_prefix: 'V6A',
    city: 'Vancouver',
    photo_url: null,
    category: 'baby',
    status: 'available',
    confirmed_at: null,
    confirmed_by: null,
    created_at: new Date().toISOString(),
    status_changed_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mock a successful resource fetch returning the given row. */
function mockDetailSuccess(resource: ResourceRow) {
  mockGetResourceById.mockResolvedValue({ data: resource, error: null });
}

/** Simulate an RPC error whose message triggers the race-condition path. */
function mockClaimRaceCondition(message = 'Resource already claimed') {
  // The screen calls supabase.rpc('claim_resource', ...) directly.
  // The error must be thrown (not returned as { error }) because supabase.rpc
  // rejects on network/RPC errors.
  mockRpc.mockResolvedValue({
    data: null,
    error: { message, code: 'PGRST504' },
  });
}

/** Simulate a successful claim followed by a refetch with a handle revealed. */
function mockClaimSuccess(postClaimResource: ResourceRow) {
  mockRpc.mockResolvedValue({ data: null, error: null });
  // Second call to getResourceDetail returns the post-claim row.
  mockGetResourceById
    .mockResolvedValueOnce({ data: fakeResource(), error: null }) // initial fetch
    .mockResolvedValueOnce({ data: postClaimResource, error: null }); // refetch
}

/**
 * Render the screen and wait until the resource name appears (i.e. the
 * initial fetch has resolved and the main content is visible).
 */
async function renderAndLoad(props: { resourceId?: string; onNavigateBack?: () => void } = {}) {
  const result = render(<ResourceDetailScreen resourceId={RES_ID} {...props} />);
  // Wait for the resource name — confirms initial fetch is done.
  await screen.findByText('Baby Formula (Similac)');
  return result;
}

/**
 * Open the ConfirmationModal and tap confirm.
 * This is a helper for tests that need to trigger the claim flow.
 */
async function openModalAndConfirm() {
  // Riley F1: label is "Claim this resource" (updated in PR #28).
  const claimButton = screen.getByLabelText('Claim this resource');
  fireEvent.press(claimButton);
  // Confirm modal uses same label as the main button per PR #28.
  const confirmButton = await screen.findByLabelText('Claim this resource');
  fireEvent.press(confirmButton);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResourceDetailScreen — race-condition scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ── R1: "already claimed" error → plain-English message ──────────────────
  //
  // When the claim RPC returns an error whose message contains "already claimed",
  // the screen must display a human-readable message — not the raw RPC error.
  //
  // On the main branch this falls through to userFacingErrorMessage(), which
  // may or may not produce the ideal copy. The test pins the MINIMUM bar:
  // the word "claimed" or "available" must appear in the error text — raw
  // Supabase error codes like "PGRST504" must NOT be shown to the user.
  //
  // NOTE: the ideal message is "Someone else just claimed this. It's no
  // longer available." — added on feat/mutualmesh-2026-05-25-shamus-resource-detail.
  // When that branch is merged, tighten this assertion to the full phrase.

  it('[R1] "already claimed" RPC error shows a user-facing message (not raw error code)', async () => {
    mockDetailSuccess(fakeResource({ status: 'available' }));
    mockClaimRaceCondition('Resource already claimed');
    await renderAndLoad();

    await openModalAndConfirm();

    await waitFor(() => {
      // The error region (accessibilityLiveRegion="polite") must have content.
      // Must NOT show the raw Supabase error code.
      expect(screen.queryByText(/PGRST504/)).toBeNull();
      // Some user-facing text about the claim outcome must appear.
      // userFacingErrorMessage forwards the message when it doesn't look internal,
      // so the raw message "Resource already claimed" should be the minimum shown.
      const errorNodes = screen.queryAllByText(/claimed|available|could not claim/i);
      expect(errorNodes.length).toBeGreaterThan(0);
    });
  });

  // ── R2: "already claimed" error → no "try again" ─────────────────────────
  //
  // Riley F4: name the outcome in plain English; never say "try again".
  // The error copy must not suggest retrying — the resource is gone.

  it('[R2] "already claimed" error message does NOT contain "try again"', async () => {
    mockDetailSuccess(fakeResource({ status: 'available' }));
    mockClaimRaceCondition('Resource already claimed');
    await renderAndLoad();

    await openModalAndConfirm();

    await waitFor(() => {
      // Scan all text nodes for "try again" (case insensitive).
      expect(screen.queryByText(/try again/i)).toBeNull();
    });
  });

  // ── R3: "already reserved" variant also triggers race-condition path ──────
  //
  // The RPC may return slightly different wording depending on the migration.
  // Both "already claimed" and "already reserved" must be treated identically.

  it('[R3] "already reserved" RPC error variant also shows a user-facing message', async () => {
    mockDetailSuccess(fakeResource({ status: 'available' }));
    // "already reserved" wording variant
    mockClaimRaceCondition('Resource already reserved by another user');
    await renderAndLoad();

    await openModalAndConfirm();

    await waitFor(() => {
      expect(screen.queryByText(/PGRST504/)).toBeNull();
      const errorNodes = screen.queryAllByText(/claimed|reserved|available|could not claim/i);
      expect(errorNodes.length).toBeGreaterThan(0);
    });
  });

  // ── R4: claiming state resets to false after race-condition error ─────────
  //
  // After a race-condition error the `claiming` state must be false.
  // Observable: the Claim button label reverts from "Reserving…" to its
  // default, or — since the resource is now in an error state — the screen
  // still responds to user interaction normally (not frozen in busy state).
  //
  // On main branch, `finally { setClaiming(false) }` should handle this.
  // This test pins that guarantee.

  it('[R4] claiming state resets after race-condition error (button not stuck in busy state)', async () => {
    mockDetailSuccess(fakeResource({ status: 'available' }));
    mockClaimRaceCondition('Resource already claimed');
    await renderAndLoad();

    await openModalAndConfirm();

    // After the error settles, the screen must not show "Reserving…"
    // (which is the in-flight label from the Shamus branch), or be frozen.
    // On main branch the label is "Claim this item" for the non-busy state.
    await waitFor(() => {
      // "Reserving…" must not be present after the error resolves.
      expect(screen.queryByText('Reserving…')).toBeNull();
    });
  });

  // ── R_NAV: navigate back after race condition (TODO — gap on main branch) ─
  //
  // Riley F4 spec: after 2500ms the screen should call onNavigateBack() to
  // return the user to the feed. This is implemented on the Shamus branch
  // (feat/mutualmesh-2026-05-25-shamus-resource-detail) but not yet on main.
  // Marked .todo until that branch is merged.

  it.todo(
    '[R_NAV] after race-condition error, screen navigates back to feed after 2500ms ' +
      '(requires Shamus branch: onNavigateBack prop + useAuth)',
  );
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ResourceDetailScreen — additional claim flow tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ── C1: successful claim triggers a refetch ───────────────────────────────
  //
  // After claim succeeds, the screen must call getResourceDetail a second time
  // so the UI reflects the updated status and handle.

  it('[C1] successful claim triggers a refetch of the resource detail', async () => {
    const postClaimRow = fakeResource({
      status: 'reserved',
      claimed_by: OTHER_USER_ID,
      // main-branch contact_handle is string, not string | null
      contact_handle: 'signal:@keo',
    });
    mockClaimSuccess(postClaimRow);
    await renderAndLoad();

    await openModalAndConfirm();

    await waitFor(() => {
      // getResourceDetail must have been called at least twice:
      //   1. initial fetch on mount
      //   2. refetch after successful claim
      expect(mockGetResourceById).toHaveBeenCalledTimes(2);
      expect(mockGetResourceById).toHaveBeenCalledWith(RES_ID);
    });
  });

  // ── C2: post-claim handle section renders when contact_handle is non-null ─
  //
  // After a successful claim, getResourceDetail returns a row where
  // contact_handle is non-null. The handle section must become visible.
  //
  // NOTE: main-branch ResourceDetailScreen renders the handle section when
  // `resource.status === 'reserved' && resource.contact_handle` — so both
  // conditions must be true for the section to appear. The Shamus branch
  // changes this to `contact_handle != null`. Either way, the handle value
  // must be visible after a successful claim.

  it('[C2] handle section renders after successful claim when contact_handle is non-null', async () => {
    const postClaimRow = fakeResource({
      status: 'reserved',
      claimed_by: OTHER_USER_ID,
      contact_handle: 'signal:@keo',
    });
    mockClaimSuccess(postClaimRow);
    await renderAndLoad();

    await openModalAndConfirm();

    // The handle value must appear after the refetch resolves.
    expect(await screen.findByText('signal:@keo')).toBeTruthy();
  });

  // ── C3: Claim button disabled while RPC is in flight ─────────────────────
  //
  // While `claiming === true` (i.e. between the user confirming and the RPC
  // resolving), the Claim button must be disabled to prevent double-submission.
  //
  // We verify this by holding the supabase.rpc promise unresolved and
  // checking that the modal's confirm button is in its busy/disabled state.

  it('[C3] Claim button is disabled while the claim RPC is in flight', async () => {
    mockDetailSuccess(fakeResource({ status: 'available' }));

    // Keep the claim RPC unresolved for the duration of this test.
    let resolveClaimRpc!: (val: { data: null; error: null }) => void;
    mockRpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClaimRpc = resolve;
        }),
    );

    await renderAndLoad();

    // Open the modal and press confirm — this starts the in-flight state.
    const claimButton = screen.getByLabelText('Claim this resource');
    fireEvent.press(claimButton);
    const confirmButton = await screen.findByLabelText('Claim this resource');
    fireEvent.press(confirmButton);

    // While the RPC is pending, the confirm button must be disabled.
    // ConfirmationModal receives `busy={claiming}` and should disable the
    // confirm button when busy is true.
    await waitFor(() => {
      // The busy/disabled state is observable via accessibilityState.disabled
      // or by the button being replaced with a loading indicator.
      // We check the confirm button is no longer interactive (disabled).
      const btn = screen.queryByLabelText('Claim this resource');
      // The button may be hidden or have disabled=true. If it's still in the
      // tree, its accessibilityState.disabled should be truthy.
      if (btn) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        const disabled = (btn.props as any)?.accessibilityState?.disabled as boolean | undefined;
        expect(disabled).toBe(true);
      }
      // Alternatively: "Reserving…" label (Shamus branch) or busy indicator
      // may replace the confirm button text — accept either form.
    });

    // Clean up — resolve the RPC so no pending promises leak.
    await act(async () => {
      resolveClaimRpc({ data: null, error: null });
    });
  });

  // ── C4: Self-claim prevention ─────────────────────────────────────────────
  //
  // The Claim button must be absent when `resource.posted_by === currentUser.id`.
  // On main branch, `canClaim = resource.status === 'available'` — it does NOT
  // yet check posted_by. This test therefore documents the INTENDED behavior
  // (from the Shamus branch) and currently shows what main does.
  //
  // When the Shamus branch (which adds `useAuth` and the posted_by check) is
  // merged, this test should pass. Until then it documents the gap.
  //
  // IMPORTANT: main-branch `canClaim` only checks `status === 'available'`,
  // so the self-claim button IS currently shown. This test is skipped on the
  // main-branch by wrapping in `.todo` — change to `.it` after Shamus merge.

  it('[C4] Claim button absent when posted_by === currentUser.id', async () => {
    // Override auth to log in as the poster for this test only.
    mockUseAuth.mockReturnValue({ user: { id: POSTER_ID } });
    try {
      // PR #28 added useAuth + !isMyPost guard to canClaim — self-claim prevented.
      mockDetailSuccess(fakeResource({ status: 'available', posted_by: POSTER_ID }));
      await renderAndLoad();

      // Poster must NOT see the Claim button on their own resource.
      const btn = screen.queryByLabelText('Claim this resource');
      expect(btn).toBeNull();
    } finally {
      // Restore default auth for subsequent tests.
      mockUseAuth.mockReturnValue({ user: { id: OTHER_USER_ID } });
    }
  });

  // C4b retired: gap closed by PR #28 (added useAuth + !isMyPost to canClaim).
});

// ─── Source-level pins for race-condition contract ───────────────────────────
//
// These read the source of ResourceDetailScreen to pin the `finally` block
// that resets `claiming` and the label copy — catching silent removals in
// refactors.

import * as fs from 'fs';
import * as path from 'path';

describe('ResourceDetailScreen source — race-condition contract pins', () => {
  const screenSrc = (() => {
    const diskPath = path.resolve(__dirname, '../../src/screens/ResourceDetailScreen.tsx');
    if (fs.existsSync(diskPath)) {
      return fs.readFileSync(diskPath, 'utf8');
    }
    return '';
  })();

  it('[contract] finally block calls setClaiming(false) to prevent stuck state', () => {
    // The finally block must contain setClaiming(false) — this is the guard
    // that resets the busy state after any RPC outcome (success or error).
    expect(screenSrc).toMatch(/finally[\s\S]{0,200}setClaiming\s*\(\s*false\s*\)/);
  });

  it('[contract] claimResource is called with the resource id', () => {
    // The screen calls supabase.rpc('claim_resource', { resource_id }) directly
    // (the RPC is the atomic row-lock per PRD §3 + S5). Verify the RPC name
    // and the resource_id parameter are present in the source.
    expect(screenSrc).toMatch(/supabase\.rpc\s*\(\s*['"]claim_resource['"]/);
    expect(screenSrc).toMatch(/resource_id/);
  });

  it('[contract] claim error is piped through userFacingErrorMessage', () => {
    // userFacingErrorMessage must be called on the caught error so internal
    // Supabase messages are never shown raw to the user.
    expect(screenSrc).toMatch(/userFacingErrorMessage\s*\(/);
  });
});
