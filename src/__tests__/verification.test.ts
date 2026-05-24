import { routeForGate, describeGate, type GateInput } from '@/lib/verification';

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
