import {
  ADJECTIVES,
  NOUNS,
  generateRandomHandle,
  generateHandleSuggestions,
} from '@/lib/handleGenerator';

describe('generateRandomHandle', () => {
  it('matches the format <adjective>-<noun>-<4digit>', () => {
    for (let i = 0; i < 50; i++) {
      const h = generateRandomHandle();
      expect(h).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
    }
  });

  it('only emits 4-digit numeric suffixes (zero-padded)', () => {
    for (let i = 0; i < 50; i++) {
      const h = generateRandomHandle();
      const parts = h.split('-');
      const last = parts[parts.length - 1]!;
      expect(last).toMatch(/^\d{4}$/);
    }
  });

  it('draws adjectives and nouns from the published wordlists', () => {
    for (let i = 0; i < 50; i++) {
      const h = generateRandomHandle();
      const [adj, noun] = h.split('-');
      expect(ADJECTIVES).toContain(adj);
      expect(NOUNS).toContain(noun);
    }
  });

  it('produces high variability across 100 draws (>50 unique)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateRandomHandle());
    // With ~150x~150x10000 space, 100 draws should land >50 unique.
    expect(seen.size).toBeGreaterThan(50);
  });
});

describe('wordlist sanity', () => {
  it('all adjectives are lowercase single tokens', () => {
    for (const a of ADJECTIVES) {
      expect(a).toMatch(/^[a-z]+$/);
    }
  });

  it('all nouns are lowercase single tokens', () => {
    for (const n of NOUNS) {
      expect(n).toMatch(/^[a-z]+$/);
    }
  });

  it('has at least 100 adjectives and 100 nouns (DFS-C1.3 target)', () => {
    expect(ADJECTIVES.length).toBeGreaterThanOrEqual(100);
    expect(NOUNS.length).toBeGreaterThanOrEqual(100);
  });
});

describe('generateHandleSuggestions', () => {
  it('returns N unique suggestions', () => {
    const suggestions = generateHandleSuggestions(3);
    expect(suggestions).toHaveLength(3);
    expect(new Set(suggestions).size).toBe(3);
  });

  it('all suggestions match the handle format', () => {
    const suggestions = generateHandleSuggestions(5);
    for (const s of suggestions) {
      expect(s).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
    }
  });

  it('defaults to 3 suggestions when no count is passed', () => {
    expect(generateHandleSuggestions()).toHaveLength(3);
  });
});
