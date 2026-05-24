import {
  validateContactHandle,
  validationFailureMessage,
  classifyContactHandle,
  MAX_CONTACT_HANDLE_LENGTH,
} from '@/lib/contactHandle';

describe('validateContactHandle', () => {
  it('accepts a normal Signal handle', () => {
    expect(validateContactHandle('@signaluser')).toEqual({ ok: true });
  });

  it('accepts an email', () => {
    expect(validateContactHandle('me@proton.me')).toEqual({ ok: true });
  });

  it('trims whitespace before validating', () => {
    expect(validateContactHandle('   @user   ')).toEqual({ ok: true });
  });

  it('rejects empty input', () => {
    expect(validateContactHandle('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateContactHandle('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it(`rejects handles longer than ${MAX_CONTACT_HANDLE_LENGTH} chars`, () => {
    const longHandle = 'a'.repeat(MAX_CONTACT_HANDLE_LENGTH + 1);
    expect(validateContactHandle(longHandle)).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it(`accepts handles exactly at the ${MAX_CONTACT_HANDLE_LENGTH}-char limit`, () => {
    const boundary = 'a'.repeat(MAX_CONTACT_HANDLE_LENGTH);
    expect(validateContactHandle(boundary)).toEqual({ ok: true });
  });

  it('rejects handles containing http:// URLs (Steve S3)', () => {
    expect(validateContactHandle('http://evil.example')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
    expect(validateContactHandle('see http://x.io/contact')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
  });

  it('rejects handles containing https:// URLs', () => {
    expect(validateContactHandle('https://t.me/me')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
  });

  it('rejects handles containing www. prefix (Steve S3)', () => {
    expect(validateContactHandle('www.evil.example')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
  });

  it('rejects dangerous URL schemes — javascript:, data:, vbscript: (Steve loop-6)', () => {
    expect(validateContactHandle('javascript:alert(1)')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
    expect(validateContactHandle('JavaScript:alert(1)')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
    expect(validateContactHandle('data:text/html,<script>')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
    expect(validateContactHandle('vbscript:msgbox')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
  });

  it('rejects tel: and mailto: schemes — force bare value (Steve loop-6)', () => {
    expect(validateContactHandle('tel:+15551234567')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
    expect(validateContactHandle('mailto:me@example.com')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
  });

  it('rejects file: scheme (Steve loop-6)', () => {
    expect(validateContactHandle('file:///etc/passwd')).toEqual({
      ok: false,
      reason: 'url-not-allowed',
    });
  });
});

describe('validationFailureMessage', () => {
  it('returns user-facing copy for each reason', () => {
    expect(validationFailureMessage('empty')).toMatch(/please enter/i);
    expect(validationFailureMessage('too-long')).toMatch(/under \d+ characters/i);
    expect(validationFailureMessage('url-not-allowed')).toMatch(/not a link/i);
  });
});

describe('classifyContactHandle', () => {
  it('classifies emails', () => {
    expect(classifyContactHandle('me@proton.me')).toBe('email');
    expect(classifyContactHandle('a.b@example.co.uk')).toBe('email');
  });

  it('classifies phone-like inputs', () => {
    expect(classifyContactHandle('+1 555-0100')).toBe('phone');
    expect(classifyContactHandle('5551234567')).toBe('phone');
    expect(classifyContactHandle('(555) 123-4567')).toBe('phone');
  });

  it('classifies Signal handles', () => {
    expect(classifyContactHandle('@signaluser')).toBe('signal');
    expect(classifyContactHandle('signal.me/#u/xxx')).toBe('signal');
  });

  it('classifies Reddit handles', () => {
    expect(classifyContactHandle('/u/someuser')).toBe('reddit');
    expect(classifyContactHandle('u/someuser')).toBe('reddit');
    expect(classifyContactHandle('reddit.com/u/x')).toBe('reddit');
  });

  it('falls back to "other" for unrecognized formats', () => {
    expect(classifyContactHandle('something else')).toBe('other');
    expect(classifyContactHandle('xmpp-handle-here')).toBe('other');
  });
});
