import { FILTER_STORAGE_KEY, parseStoredFilter, serializeFilter } from '@/lib/categoryStorage';

describe('FILTER_STORAGE_KEY', () => {
  it('is versioned for future shape changes', () => {
    expect(FILTER_STORAGE_KEY).toBe('mutualmesh.feed.categories.v1');
  });
});

describe('parseStoredFilter', () => {
  it('returns [] for null (missing key)', () => {
    expect(parseStoredFilter(null)).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseStoredFilter('not-json')).toEqual([]);
    expect(parseStoredFilter('{')).toEqual([]);
  });

  it('returns [] when JSON parses to a non-array', () => {
    expect(parseStoredFilter('"food"')).toEqual([]);
    expect(parseStoredFilter('{"food":true}')).toEqual([]);
    expect(parseStoredFilter('42')).toEqual([]);
  });

  it('filters out unknown category values silently', () => {
    expect(parseStoredFilter(JSON.stringify(['food', 'banana', 'baby']))).toEqual(['food', 'baby']);
  });

  it('drops non-string entries', () => {
    expect(parseStoredFilter(JSON.stringify(['food', 42, null, true, 'HRT']))).toEqual([
      'food',
      'HRT',
    ]);
  });

  it('de-duplicates repeated values', () => {
    expect(parseStoredFilter(JSON.stringify(['food', 'food', 'food']))).toEqual(['food']);
  });

  it('re-orders to canonical CATEGORY_VALUES order', () => {
    expect(parseStoredFilter(JSON.stringify(['HRT', 'food', 'baby']))).toEqual([
      'food',
      'baby',
      'HRT',
    ]);
  });
});

describe('serializeFilter', () => {
  it('round-trips through parse to the same canonical list', () => {
    const out = serializeFilter(['HRT', 'food', 'baby']);
    expect(parseStoredFilter(out)).toEqual(['food', 'baby', 'HRT']);
  });

  it('produces a stable byte-equal shape regardless of input order', () => {
    expect(serializeFilter(['HRT', 'food'])).toBe(serializeFilter(['food', 'HRT']));
  });

  it('emits an empty array for an empty filter', () => {
    expect(serializeFilter([])).toBe('[]');
  });

  it('de-duplicates input', () => {
    expect(serializeFilter(['food', 'food', 'food'])).toBe(serializeFilter(['food']));
  });
});

// ============================================================================
// Phase 4 Gary coverage gaps — see qa-reports/phase-4-gary-coverage-audit.md
// ============================================================================

describe('serializeFilter / parseStoredFilter — full-set round-trip', () => {
  it('round-trips an all-five filter (canonical order preserved)', () => {
    const all = serializeFilter(['HRT', 'other', 'food', 'baby', 'hygiene']);
    expect(parseStoredFilter(all)).toEqual(['food', 'hygiene', 'baby', 'HRT', 'other']);
  });

  it('round-trips an empty filter exactly to []', () => {
    const out = serializeFilter([]);
    expect(parseStoredFilter(out)).toEqual([]);
  });
});

describe('parseStoredFilter — defense vs adversarial payloads', () => {
  it('drops nested arrays inside the parsed array', () => {
    // A malformed cache entry from a future shape might contain nested
    // arrays. The string-only guard drops them silently.
    expect(parseStoredFilter(JSON.stringify(['food', ['baby'], 'HRT']))).toEqual(['food', 'HRT']);
  });

  it('drops objects inside the parsed array', () => {
    expect(parseStoredFilter(JSON.stringify(['food', { name: 'baby' }, 'HRT']))).toEqual([
      'food',
      'HRT',
    ]);
  });

  it('returns [] for an empty string (treat as missing)', () => {
    // JSON.parse('') throws — must hit the catch branch.
    expect(parseStoredFilter('')).toEqual([]);
  });
});
