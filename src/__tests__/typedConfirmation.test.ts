import { typedConfirmationMatches, typedConfirmationPrompt } from '@/lib/typedConfirmation';

describe('typedConfirmationMatches — case-sensitive (default)', () => {
  it('returns true on exact match', () => {
    expect(typedConfirmationMatches('DELETE', 'DELETE')).toBe(true);
  });

  it('returns false on case mismatch (the load-bearing safety property)', () => {
    expect(typedConfirmationMatches('DELETE', 'delete')).toBe(false);
    expect(typedConfirmationMatches('DELETE', 'Delete')).toBe(false);
    expect(typedConfirmationMatches('DELETE', 'DELETe')).toBe(false);
  });

  it('returns false on empty string', () => {
    expect(typedConfirmationMatches('DELETE', '')).toBe(false);
  });

  it('returns false when the user types only part of the phrase', () => {
    expect(typedConfirmationMatches('DELETE', 'DELET')).toBe(false);
    expect(typedConfirmationMatches('DELETE', 'D')).toBe(false);
  });

  it('returns false when the typed value has leading or trailing whitespace', () => {
    // Whitespace is significant — a stray space should fail the check so the
    // user re-reads the prompt rather than tabbing past it.
    expect(typedConfirmationMatches('DELETE', ' DELETE')).toBe(false);
    expect(typedConfirmationMatches('DELETE', 'DELETE ')).toBe(false);
    expect(typedConfirmationMatches('DELETE', ' DELETE ')).toBe(false);
  });

  it('returns false when extra characters are appended', () => {
    expect(typedConfirmationMatches('DELETE', 'DELETEs')).toBe(false);
    expect(typedConfirmationMatches('DELETE', 'DELETE!')).toBe(false);
  });

  it('works for arbitrary phrases (not just DELETE)', () => {
    expect(typedConfirmationMatches('YES I AM SURE', 'YES I AM SURE')).toBe(true);
    expect(typedConfirmationMatches('YES I AM SURE', 'yes i am sure')).toBe(false);
  });
});

describe('typedConfirmationMatches — caseSensitive: false', () => {
  it('returns true on differing case when explicitly opted out', () => {
    expect(typedConfirmationMatches('DELETE', 'delete', { caseSensitive: false })).toBe(true);
    expect(typedConfirmationMatches('DELETE', 'Delete', { caseSensitive: false })).toBe(true);
  });

  it('still requires exact characters (no whitespace tolerance)', () => {
    expect(typedConfirmationMatches('DELETE', ' delete ', { caseSensitive: false })).toBe(false);
  });

  it('still rejects partials', () => {
    expect(typedConfirmationMatches('DELETE', 'del', { caseSensitive: false })).toBe(false);
  });
});

describe('typedConfirmationPrompt', () => {
  it('quotes the expected phrase in the prompt', () => {
    expect(typedConfirmationPrompt('DELETE')).toBe('Type "DELETE" to confirm.');
  });

  it('works with multi-word phrases', () => {
    expect(typedConfirmationPrompt('YES I AM SURE')).toBe('Type "YES I AM SURE" to confirm.');
  });

  it('does not lowercase or transform the phrase', () => {
    expect(typedConfirmationPrompt('Erase')).toBe('Type "Erase" to confirm.');
  });
});
