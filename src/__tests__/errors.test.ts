import { errorMessage, userFacingErrorMessage } from '@/lib/errors';

describe('errorMessage', () => {
  it('returns message from Error instances', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the string itself when given a string', () => {
    expect(errorMessage('plain message')).toBe('plain message');
  });

  it('reads .message from plain objects that have one', () => {
    expect(errorMessage({ message: 'object error' })).toBe('object error');
  });

  it('falls back gracefully for unknown shapes', () => {
    expect(errorMessage(undefined)).toMatch(/something went wrong/i);
    expect(errorMessage(null)).toMatch(/something went wrong/i);
    expect(errorMessage(42)).toMatch(/something went wrong/i);
  });
});

describe('userFacingErrorMessage', () => {
  it('passes through clean messages', () => {
    expect(userFacingErrorMessage(new Error('Please check your input.'))).toBe(
      'Please check your input.',
    );
  });

  it('hides Supabase / Postgrest internal codes', () => {
    expect(userFacingErrorMessage(new Error('PGRST116 row not found'))).toMatch(
      /something went wrong/i,
    );
  });

  it('hides URLs that may leak internals', () => {
    expect(
      userFacingErrorMessage(new Error('Network at https://abc.supabase.co/auth/v1/token failed')),
    ).toMatch(/something went wrong/i);
  });

  it('hides JWT-related errors', () => {
    expect(userFacingErrorMessage(new Error('Invalid JWT'))).toMatch(/something went wrong/i);
  });

  it('uses the custom fallback when provided', () => {
    expect(userFacingErrorMessage(new Error('PGRST500'), 'Could not load resources.')).toBe(
      'Could not load resources.',
    );
  });
});

// ============================================================================
// Phase 4 Gary coverage gaps — see qa-reports/phase-4-gary-coverage-audit.md
// ============================================================================

describe('errorMessage — additional shapes', () => {
  it('returns generic fallback when .message exists but is not a string', () => {
    expect(errorMessage({ message: 42 })).toMatch(/something went wrong/i);
    expect(errorMessage({ message: null })).toMatch(/something went wrong/i);
    expect(errorMessage({ message: { nested: true } })).toMatch(/something went wrong/i);
  });

  it('returns generic fallback for objects without a message property', () => {
    expect(errorMessage({ code: 500 })).toMatch(/something went wrong/i);
    expect(errorMessage({})).toMatch(/something went wrong/i);
  });

  it('returns generic fallback for booleans and arrays', () => {
    expect(errorMessage(true)).toMatch(/something went wrong/i);
    expect(errorMessage(false)).toMatch(/something went wrong/i);
    expect(errorMessage(['boom'])).toMatch(/something went wrong/i);
  });
});

describe('userFacingErrorMessage — STRIDE I6 (no internal leakage)', () => {
  it('hides PGRST codes regardless of case / surrounding text', () => {
    expect(userFacingErrorMessage(new Error('pgrst301 schema mismatch'))).toMatch(
      /something went wrong/i,
    );
    expect(userFacingErrorMessage(new Error('PgRsT404 ohno'))).toMatch(/something went wrong/i);
  });

  it('hides any URL even if the rest of the message is safe', () => {
    expect(userFacingErrorMessage(new Error('https://x.y/blew/up'))).toMatch(
      /something went wrong/i,
    );
    expect(userFacingErrorMessage(new Error('see http://internal-svc:8080/'))).toMatch(
      /something went wrong/i,
    );
  });

  it('hides JWT-mention errors case-insensitively', () => {
    expect(userFacingErrorMessage(new Error('JWT expired'))).toMatch(/something went wrong/i);
    expect(userFacingErrorMessage(new Error('jwt malformed'))).toMatch(/something went wrong/i);
    expect(userFacingErrorMessage(new Error('JwT no soup'))).toMatch(/something went wrong/i);
  });

  it('passes through messages with no internal markers', () => {
    expect(userFacingErrorMessage(new Error('Please enter a valid email.'))).toBe(
      'Please enter a valid email.',
    );
  });
});
