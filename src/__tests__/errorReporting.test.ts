/**
 * Tests for src/lib/errorReporting.ts.
 *
 * Pure-helper coverage only — the network round-trip and AsyncStorage IO
 * are deferred to integration (the Edge Function's deploy README walks
 * through end-to-end verification). What we cover here:
 *
 *   1. PII heuristic stripping — each of the 6 heuristics catches its
 *      intended pattern, idempotent on already-redacted output, the
 *      redaction labels themselves are not re-redacted.
 *      Heuristics 1-2 added per Steve security sweep F2+F3.
 *   2. Error part extraction — Error instance, string, plain object,
 *      undefined/null degrade gracefully.
 *   3. Platform normalization — ios/android pass through; anything else
 *      collapses to 'web'.
 *   4. URL resolution — explicit override beats derivation, derivation
 *      handles trailing slashes, both-missing returns null.
 *   5. Storage key + defaults — versioned key matches the convention,
 *      DEFAULT_OPT_IN is false (PRIVACY.md D8).
 */

import {
  DEFAULT_OPT_IN,
  MAX_MESSAGE_CHARS,
  MAX_STACK_CHARS,
  OPT_IN_STORAGE_KEY,
  PII_HEURISTICS,
  REDACTED_EMAIL,
  REDACTED_HANDLE,
  REDACTED_POSTAL,
  REDACTED_TOKEN,
  extractErrorParts,
  normalizePlatform,
  resolveLogErrorUrl,
  stripPii,
} from '@/lib/errorReporting';

describe('OPT_IN_STORAGE_KEY', () => {
  it('is versioned for future shape changes (matches categoryStorage convention)', () => {
    expect(OPT_IN_STORAGE_KEY).toBe('mutualmesh.errorReporting.optIn.v1');
  });
});

describe('DEFAULT_OPT_IN', () => {
  it('is false — opt-in default OFF per PRIVACY.md D8', () => {
    expect(DEFAULT_OPT_IN).toBe(false);
  });
});

describe('MAX_MESSAGE_CHARS / MAX_STACK_CHARS', () => {
  it('caps message at 8 KB to keep payloads bounded', () => {
    expect(MAX_MESSAGE_CHARS).toBe(8 * 1024);
  });

  it('caps stack at 32 KB (typical stacks are <16 KB)', () => {
    expect(MAX_STACK_CHARS).toBe(32 * 1024);
  });
});

// ============================================================================
// PII heuristic count + manifest
// ============================================================================

describe('PII_HEURISTICS', () => {
  it('declares all named heuristics in stable order', () => {
    // Six heuristics: expo_token (F2) + http_header_token (F3) prepend the
    // original five. The two postal patterns are reported jointly as the
    // single "postal" class; the two new token patterns are distinct entries
    // added per Steve security sweep findings.
    expect(PII_HEURISTICS.map((h) => h.label)).toEqual([
      'expo_token',
      'http_header_token',
      'token',
      'email',
      'postal_full',
      'postal_fsa',
      'handle',
    ]);
  });
});

// ============================================================================
// stripPii — token (URL auth) leak heuristic
// ============================================================================

describe('stripPii — token heuristic', () => {
  it('redacts query-string access tokens in URLs', () => {
    const input =
      'GET https://abc.supabase.co/storage/v1/object/sign/resource-photos/x.jpg?token=eyJhbGciOiJIUzI1NiJ9.payload.signature';
    const output = stripPii(input);
    expect(output).toContain(REDACTED_TOKEN);
    expect(output).not.toMatch(/eyJhbGciOiJIUzI1NiJ9/);
  });

  it('redacts api_key / api-key query params', () => {
    expect(stripPii('?api_key=abcdef1234567890abcdef')).toContain(REDACTED_TOKEN); // gitleaks:allow
    expect(stripPii('?api-key=abcdef1234567890abcdef')).toContain(REDACTED_TOKEN); // gitleaks:allow
  });

  it('redacts Bearer tokens in Authorization header fragments', () => {
    const input = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456';
    const output = stripPii(input);
    expect(output).toContain(REDACTED_TOKEN);
    expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('preserves the param name so crash shape stays readable', () => {
    const output = stripPii('?token=abcdefghijklmnopqrstuvwxyz');
    expect(output).toMatch(/\?token=/);
  });

  it('leaves short bare strings alone (no false positive on UUIDs ≤15 chars)', () => {
    // The token regex requires 16+ chars after the param name. A short
    // hex string in error text shouldn't trigger redaction.
    expect(stripPii('id=abc123def')).toBe('id=abc123def');
  });
});

// ============================================================================
// stripPii — Expo push token heuristic (Steve F2)
// ============================================================================

describe('stripPii — expo_token heuristic', () => {
  it('redacts ExponentPushToken[...] in error text', () => {
    const input = 'DeviceNotRegistered for ExponentPushToken[AbCdEfGhIjKlMnOpQrStUvWxYz]';
    const output = stripPii(input);
    expect(output).toContain(REDACTED_TOKEN);
    expect(output).not.toContain('AbCdEfGhIjKlMnOpQrStUvWxYz');
  });

  it('redacts multiple Expo tokens in one string', () => {
    const input = 'tokens: ExponentPushToken[AAA111] and ExponentPushToken[BBB222]';
    const output = stripPii(input);
    expect((output.match(/\[REDACTED_TOKEN\]/g) ?? []).length).toBe(2);
    expect(output).not.toContain('ExponentPushToken[');
  });

  it('preserves unrelated bracket content', () => {
    const output = stripPii('Error code [404] not found');
    expect(output).toBe('Error code [404] not found');
  });
});

// ============================================================================
// stripPii — HTTP header token heuristic (Steve F3)
// ============================================================================

describe('stripPii — http_header_token heuristic', () => {
  it('redacts apikey: <value> header format', () => {
    const input = 'Request headers: apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD';
    const output = stripPii(input);
    expect(output).toContain(REDACTED_TOKEN);
    expect(output).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('redacts authorization: Bearer <value> header format', () => {
    const input = 'authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD.SIG';
    const output = stripPii(input);
    expect(output).toContain(REDACTED_TOKEN);
  });

  it('leaves short values alone (no false positive)', () => {
    // Under 16 chars — below the length floor
    expect(stripPii('apikey: shortkey')).toBe('apikey: shortkey');
  });
});

// ============================================================================
// stripPii — email
// ============================================================================

describe('stripPii — email heuristic', () => {
  it('redacts a plain email', () => {
    expect(stripPii('user alice@example.com signed in')).toBe(`user ${REDACTED_EMAIL} signed in`);
  });

  it('redacts multiple emails in one string', () => {
    const output = stripPii('From a.b@gmail.com to c.d+tag@proton.me');
    expect(output).toBe(`From ${REDACTED_EMAIL} to ${REDACTED_EMAIL}`);
  });

  it('redacts emails embedded in stack frames', () => {
    const stack = 'at fn (file.js): user alice@example.com not verified';
    expect(stripPii(stack)).toContain(REDACTED_EMAIL);
  });

  it('leaves email-like strings without an @ alone', () => {
    expect(stripPii('user.example.com')).toBe('user.example.com');
  });
});

// ============================================================================
// stripPii — postal codes (Canadian — D3 FSA + full)
// ============================================================================

describe('stripPii — postal heuristic', () => {
  it('redacts a full Canadian postal code with space', () => {
    expect(stripPii('M5V 3A8 not found')).toBe(`${REDACTED_POSTAL} not found`);
  });

  it('redacts a full Canadian postal code without space', () => {
    expect(stripPii('postal=M5V3A8')).toContain(REDACTED_POSTAL);
  });

  it('redacts a bare FSA (3-char form per D3)', () => {
    expect(stripPii('FSA M5V missing handler')).toBe(`FSA ${REDACTED_POSTAL} missing handler`);
  });

  it('redacts multiple postal codes', () => {
    const output = stripPii('A1A 1A1 vs B2B 2B2');
    expect(output).toBe(`${REDACTED_POSTAL} vs ${REDACTED_POSTAL}`);
  });

  it('does not match US-style 5-digit ZIPs (digit start)', () => {
    expect(stripPii('zip 90210 unhandled')).toBe('zip 90210 unhandled');
  });

  it('does not match arbitrary 3-letter codes (must be A1A pattern)', () => {
    expect(stripPii('FOO unhandled')).toBe('FOO unhandled');
    expect(stripPii('M55 unhandled')).toBe('M55 unhandled');
  });
});

// ============================================================================
// stripPii — handle
// ============================================================================

describe('stripPii — handle heuristic', () => {
  it('redacts Signal-style @handles', () => {
    expect(stripPii('contact: @signaluser failed')).toBe(`contact: ${REDACTED_HANDLE} failed`);
  });

  it('redacts Reddit-style /u/handles and u/handles', () => {
    expect(stripPii('/u/someuser said')).toContain(REDACTED_HANDLE);
    expect(stripPii('u/someuser said')).toContain(REDACTED_HANDLE);
  });

  it('redacts our generated adjective-noun-NNNN handle shape', () => {
    expect(stripPii('user happy-koala-1234 conflict')).toBe(`user ${REDACTED_HANDLE} conflict`);
  });

  it('does not redact short identifiers below the handle length floor', () => {
    // @ab is below the 2-char floor's word constraint
    expect(stripPii('@a failed')).toBe('@a failed');
  });
});

// ============================================================================
// stripPii — composition + idempotency
// ============================================================================

describe('stripPii — composition + idempotency', () => {
  it('applies all heuristics in one pass', () => {
    const input =
      'User alice@example.com (handle @happyuser) in M5V 3A8 had token=abcdefghijklmnopqrstuvwxyz failed';
    const output = stripPii(input);
    expect(output).toContain(REDACTED_EMAIL);
    expect(output).toContain(REDACTED_HANDLE);
    expect(output).toContain(REDACTED_POSTAL);
    expect(output).toContain(REDACTED_TOKEN);
    expect(output).not.toContain('alice@example.com');
    expect(output).not.toContain('@happyuser');
    expect(output).not.toContain('M5V 3A8');
    expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('is idempotent — re-running on stripped output produces the same string', () => {
    const input = 'user alice@example.com in M5V 3A8';
    const once = stripPii(input);
    const twice = stripPii(once);
    expect(twice).toBe(once);
  });

  it('does NOT re-redact the redaction labels themselves', () => {
    // Redaction labels are bracketed and contain no @, no postal pattern,
    // no token=value pattern. Asserting explicit identity here is the
    // canary against future heuristic additions that accidentally match.
    expect(stripPii(REDACTED_EMAIL)).toBe(REDACTED_EMAIL);
    expect(stripPii(REDACTED_POSTAL)).toBe(REDACTED_POSTAL);
    expect(stripPii(REDACTED_HANDLE)).toBe(REDACTED_HANDLE);
    expect(stripPii(REDACTED_TOKEN)).toBe(REDACTED_TOKEN);
  });

  it('handles empty / non-string defensively', () => {
    expect(stripPii('')).toBe('');
    // @ts-expect-error — testing runtime defensiveness
    expect(stripPii(null)).toBe(null);
    // @ts-expect-error — testing runtime defensiveness
    expect(stripPii(undefined)).toBe(undefined);
  });
});

// ============================================================================
// extractErrorParts
// ============================================================================

describe('extractErrorParts', () => {
  it('reads message + stack from an Error instance', () => {
    const err = new Error('boom');
    err.stack = 'fake-stack';
    expect(extractErrorParts(err)).toEqual({ message: 'boom', stack: 'fake-stack' });
  });

  it('handles strings — message=string, stack=empty', () => {
    expect(extractErrorParts('plain')).toEqual({ message: 'plain', stack: '' });
  });

  it('reads .message / .stack from plain objects', () => {
    expect(extractErrorParts({ message: 'obj', stack: 's' })).toEqual({
      message: 'obj',
      stack: 's',
    });
  });

  it('coerces non-string .message to string', () => {
    expect(extractErrorParts({ message: 42 })).toEqual({ message: '42', stack: '' });
  });

  it('falls back to empty strings for null / undefined', () => {
    expect(extractErrorParts(undefined)).toEqual({ message: '', stack: '' });
    expect(extractErrorParts(null)).toEqual({ message: '', stack: '' });
  });
});

// ============================================================================
// normalizePlatform
// ============================================================================

describe('normalizePlatform', () => {
  it('passes through ios and android', () => {
    expect(normalizePlatform('ios')).toBe('ios');
    expect(normalizePlatform('android')).toBe('android');
  });

  it('collapses anything else to web (least-revealing default)', () => {
    expect(normalizePlatform('web')).toBe('web');
    expect(normalizePlatform('macos')).toBe('web');
    expect(normalizePlatform('windows')).toBe('web');
    expect(normalizePlatform('')).toBe('web');
  });
});

// ============================================================================
// resolveLogErrorUrl
// ============================================================================

describe('resolveLogErrorUrl', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('prefers EXPO_PUBLIC_LOG_ERROR_URL when set', () => {
    process.env.EXPO_PUBLIC_LOG_ERROR_URL = 'https://explicit.example/functions/log-error';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    expect(resolveLogErrorUrl()).toBe('https://explicit.example/functions/log-error');
  });

  it('derives from EXPO_PUBLIC_SUPABASE_URL when explicit is unset', () => {
    delete process.env.EXPO_PUBLIC_LOG_ERROR_URL;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    expect(resolveLogErrorUrl()).toBe('https://abc.supabase.co/functions/v1/log-error');
  });

  it('strips trailing slashes on the supabase URL before deriving', () => {
    delete process.env.EXPO_PUBLIC_LOG_ERROR_URL;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co///';
    expect(resolveLogErrorUrl()).toBe('https://abc.supabase.co/functions/v1/log-error');
  });

  it('returns null when both env vars are absent', () => {
    delete process.env.EXPO_PUBLIC_LOG_ERROR_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(resolveLogErrorUrl()).toBe(null);
  });

  it('returns null when the explicit URL is empty string', () => {
    process.env.EXPO_PUBLIC_LOG_ERROR_URL = '';
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(resolveLogErrorUrl()).toBe(null);
  });
});
