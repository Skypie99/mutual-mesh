import {
  routeForGate,
  describeGate,
  decideGateRoute,
  isProfilePending,
  type GateInput,
  type Cycle1GateInput,
} from '@/lib/verification';

const userSession: GateInput['session'] = { user: { id: 'abc-123' } };

describe('routeForGate', () => {
  it('routes to sign-in when there is no session', () => {
    expect(routeForGate({ session: null, isVerified: null })).toBe('sign-in');
    expect(routeForGate({ session: null, isVerified: true })).toBe('sign-in');
    expect(routeForGate({ session: null, isVerified: false })).toBe('sign-in');
  });

  it('routes to home only when isVerified === true', () => {
    expect(routeForGate({ session: userSession, isVerified: true })).toBe('home');
  });

  it('routes to wait when isVerified is false', () => {
    expect(routeForGate({ session: userSession, isVerified: false })).toBe('wait');
  });

  it('routes to wait when isVerified is null (loading)', () => {
    expect(routeForGate({ session: userSession, isVerified: null })).toBe('wait');
  });

  it('never short-circuits home for a falsy-but-truthy session shape', () => {
    // Ensure the boolean check is strict — only `true` passes.
    expect(routeForGate({ session: userSession, isVerified: 1 as unknown as boolean })).toBe(
      'wait',
    );
    expect(routeForGate({ session: userSession, isVerified: 'true' as unknown as boolean })).toBe(
      'wait',
    );
  });
});

describe('describeGate', () => {
  it('labels each state in plain language', () => {
    expect(describeGate({ session: null, isVerified: null })).toMatch(/not signed in/i);
    expect(describeGate({ session: userSession, isVerified: null })).toMatch(
      /loading verification/i,
    );
    expect(describeGate({ session: userSession, isVerified: false })).toMatch(/awaiting admin/i);
    expect(describeGate({ session: userSession, isVerified: true })).toMatch(/verified.*home/i);
  });
});

// ============================================================================
// Cycle 1 — full gate routing (Loop 14 / Loop 17 Gary tests)
// ============================================================================

const sessionFixture: Cycle1GateInput['session'] = { user: { id: 'abc' } };
const pendingProfile = { handle: 'pending-abc123', is_verified: false };
const completeUnverified = { handle: 'brave-otter-4729', is_verified: false };
const completeVerified = { handle: 'brave-otter-4729', is_verified: true };

describe('isProfilePending', () => {
  it('returns true for placeholder handle (from handle_new_user trigger)', () => {
    expect(isProfilePending('pending-abc123')).toBe(true);
  });

  it('returns false for a real handle', () => {
    expect(isProfilePending('brave-otter-4729')).toBe(false);
  });
});

describe('decideGateRoute', () => {
  it('routes to splash while loading', () => {
    expect(decideGateRoute({ loading: true, session: null, profile: null })).toBe('splash');
    expect(
      decideGateRoute({ loading: true, session: sessionFixture, profile: completeVerified }),
    ).toBe('splash');
  });

  it('routes to sign-in when there is no session', () => {
    expect(decideGateRoute({ loading: false, session: null, profile: null })).toBe('sign-in');
  });

  it('routes to splash when session exists but profile is still loading', () => {
    expect(decideGateRoute({ loading: false, session: sessionFixture, profile: null })).toBe(
      'splash',
    );
  });

  it('routes to complete-profile when handle is still pending', () => {
    expect(
      decideGateRoute({ loading: false, session: sessionFixture, profile: pendingProfile }),
    ).toBe('complete-profile');
  });

  it('routes to wait when profile is complete but unverified', () => {
    expect(
      decideGateRoute({ loading: false, session: sessionFixture, profile: completeUnverified }),
    ).toBe('wait');
  });

  it('routes to home only when profile is complete AND is_verified is strictly true', () => {
    expect(
      decideGateRoute({ loading: false, session: sessionFixture, profile: completeVerified }),
    ).toBe('home');
  });

  it('refuses home for non-strict-true is_verified (defensive against bad payloads)', () => {
    const truthy: Cycle1GateInput = {
      loading: false,
      session: sessionFixture,
      profile: { handle: 'brave-otter-4729', is_verified: 1 as unknown as boolean },
    };
    expect(decideGateRoute(truthy)).toBe('wait');
  });

  it('handles defensive demotion — verified→unverified flip routes back to wait', () => {
    // First render: verified
    expect(
      decideGateRoute({ loading: false, session: sessionFixture, profile: completeVerified }),
    ).toBe('home');
    // Realtime delivers a demotion (admin flipped is_verified back to false)
    expect(
      decideGateRoute({ loading: false, session: sessionFixture, profile: completeUnverified }),
    ).toBe('wait');
  });

  // ============================================================================
  // Phase 4 Gary coverage gaps — see qa-reports/phase-4-gary-coverage-audit.md
  // ============================================================================

  it('routes to splash when loading=true even without a session (boot defensive)', () => {
    // Belt-and-braces: loading wins over session presence so the very first
    // tick after cold boot is never sign-in or home, always splash.
    expect(decideGateRoute({ loading: true, session: null, profile: null })).toBe('splash');
    expect(
      decideGateRoute({ loading: true, session: sessionFixture, profile: pendingProfile }),
    ).toBe('splash');
  });

  it('treats handle "pending-" (suffix-empty) as pending — boundary case', () => {
    // `isProfilePending` uses startsWith('pending-'); the bare prefix
    // should also count as pending. Regression guard.
    const justPrefix = { handle: 'pending-', is_verified: false };
    expect(decideGateRoute({ loading: false, session: sessionFixture, profile: justPrefix })).toBe(
      'complete-profile',
    );
  });

  it('routes to wait for any non-strict-true is_verified (covers true/false/numeric)', () => {
    // Defensive total-function coverage on the strict-true gate.
    const numericTruthy = { handle: 'brave-otter-4729', is_verified: 1 as unknown as boolean };
    const stringTruthy = { handle: 'brave-otter-4729', is_verified: 'true' as unknown as boolean };
    expect(
      decideGateRoute({ loading: false, session: sessionFixture, profile: numericTruthy }),
    ).toBe('wait');
    expect(
      decideGateRoute({ loading: false, session: sessionFixture, profile: stringTruthy }),
    ).toBe('wait');
  });
});
