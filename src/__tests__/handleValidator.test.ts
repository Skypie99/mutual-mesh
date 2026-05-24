import {
  validateHandle,
  looksLikeRealName,
  handleFailureMessage,
  realNameWarningMessage,
} from '@/lib/handleValidator';

describe('validateHandle — happy paths', () => {
  it('accepts a generated handle like brave-otter-4729', () => {
    expect(validateHandle('brave-otter-4729')).toEqual({ ok: true });
  });

  it('accepts short clean handles', () => {
    expect(validateHandle('cat')).toEqual({ ok: true });
    expect(validateHandle('m5v')).toEqual({ ok: true });
  });

  it('accepts at the boundary lengths (3 and 32 chars)', () => {
    expect(validateHandle('abc')).toEqual({ ok: true });
    expect(validateHandle('a'.repeat(32))).toEqual({ ok: true });
  });

  it('trims and lowercases before validating', () => {
    expect(validateHandle('  BRAVE-OTTER  ')).toEqual({ ok: true });
  });
});

describe('validateHandle — hard rejections', () => {
  it('rejects empty', () => {
    expect(validateHandle('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateHandle('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects too-short', () => {
    expect(validateHandle('ab')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('rejects too-long', () => {
    expect(validateHandle('a'.repeat(33))).toEqual({ ok: false, reason: 'too-long' });
  });

  it('rejects spaces, underscores, and special characters', () => {
    expect(validateHandle('foo bar')).toEqual({ ok: false, reason: 'invalid-format' });
    expect(validateHandle('foo_bar')).toEqual({ ok: false, reason: 'invalid-format' });
    expect(validateHandle('foo!bar')).toEqual({ ok: false, reason: 'invalid-format' });
    expect(validateHandle('foo.bar')).toEqual({ ok: false, reason: 'invalid-format' });
  });

  it('rejects handles starting or ending with a hyphen', () => {
    expect(validateHandle('-foo')).toEqual({ ok: false, reason: 'invalid-format' });
    expect(validateHandle('foo-')).toEqual({ ok: false, reason: 'invalid-format' });
  });

  it('rejects reserved handles (admin, mod, sky, etc.)', () => {
    expect(validateHandle('admin')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateHandle('Admin')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateHandle('moderator')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateHandle('sky')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateHandle('mutualmesh')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('validateHandle — soft real-name warning (DFS-C1.1)', () => {
  it('warns on common first names (jane, john)', () => {
    expect(validateHandle('jane')).toEqual({ ok: true, warning: 'looks-like-real-name' });
    expect(validateHandle('john')).toEqual({ ok: true, warning: 'looks-like-real-name' });
  });

  it('warns on names from multiple cultures', () => {
    expect(validateHandle('maria')).toEqual({ ok: true, warning: 'looks-like-real-name' });
    expect(validateHandle('mohammed')).toEqual({ ok: true, warning: 'looks-like-real-name' });
    expect(validateHandle('wei')).toEqual({ ok: true, warning: 'looks-like-real-name' });
    expect(validateHandle('priya')).toEqual({ ok: true, warning: 'looks-like-real-name' });
  });

  it('does NOT warn on hyphenated handles even if a name is embedded', () => {
    expect(validateHandle('brave-jane')).toEqual({ ok: true });
    expect(validateHandle('jane-otter')).toEqual({ ok: true });
  });

  it('does NOT warn when digits are present', () => {
    expect(validateHandle('jane1')).toEqual({ ok: true });
    expect(validateHandle('jane42')).toEqual({ ok: true });
  });

  it('does NOT warn on natural-world words that overlap names (sage, river)', () => {
    // These ARE in our wordlist (NOUNS) and don't appear in COMMON_FIRST_NAMES.
    expect(validateHandle('sage')).toEqual({ ok: true });
    expect(validateHandle('river')).toEqual({ ok: true });
  });
});

describe('looksLikeRealName helper', () => {
  it('returns true for common single-token names', () => {
    expect(looksLikeRealName('jane')).toBe(true);
    expect(looksLikeRealName('John')).toBe(true); // case-insensitive
  });

  it('returns false for hyphenated and digit-containing inputs', () => {
    expect(looksLikeRealName('jane-otter')).toBe(false);
    expect(looksLikeRealName('jane2')).toBe(false);
  });

  it('returns false for unknown words', () => {
    expect(looksLikeRealName('xyzzy')).toBe(false);
    expect(looksLikeRealName('quasar')).toBe(false);
  });
});

describe('handleFailureMessage', () => {
  it('returns user-facing copy for each reason', () => {
    expect(handleFailureMessage('empty')).toMatch(/please choose/i);
    expect(handleFailureMessage('too-short')).toMatch(/at least \d+/i);
    expect(handleFailureMessage('too-long')).toMatch(/at most \d+/i);
    expect(handleFailureMessage('invalid-format')).toMatch(/lowercase letters/i);
    expect(handleFailureMessage('reserved')).toMatch(/reserved/i);
  });
});

describe('realNameWarningMessage', () => {
  it('produces the DFS-C1.1 soft-warn copy', () => {
    const msg = realNameWarningMessage();
    expect(msg).toMatch(/real name/i);
    expect(msg).toMatch(/choosing to/i);
  });
});

// ============================================================================
// Phase 4 Gary coverage gaps — see qa-reports/phase-4-gary-coverage-audit.md
// ============================================================================

describe('validateHandle — reserved hyphenated variants', () => {
  it('rejects mutual-mesh (hyphenated brand name)', () => {
    expect(validateHandle('mutual-mesh')).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects team and official (impersonation-surface guards)', () => {
    expect(validateHandle('team')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateHandle('official')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateHandle('verified')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateHandle('staff')).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects reserved with surrounding whitespace (trim runs first)', () => {
    expect(validateHandle('   admin   ')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('looksLikeRealName — edge cases', () => {
  it('returns false for empty input (no false positive on empty)', () => {
    expect(looksLikeRealName('')).toBe(false);
    expect(looksLikeRealName('   ')).toBe(false);
  });

  it('case-folds before checking the known-names set', () => {
    expect(looksLikeRealName('JANE')).toBe(true);
    expect(looksLikeRealName('John')).toBe(true);
    expect(looksLikeRealName('MaRiA')).toBe(true);
  });
});
