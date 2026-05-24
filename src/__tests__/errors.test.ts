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
