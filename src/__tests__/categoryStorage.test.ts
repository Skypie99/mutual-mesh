// ============================================================================
// AsyncStorage IO mocks — loadFilterFromStorage / saveFilterToStorage
// The categoryStorage module lazy-requires AsyncStorage via getStorage() so we
// intercept it with jest.mock at the module level here. The pure-helper tests
// below do NOT use these mocks — they call the pure functions directly.
// ============================================================================

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: [string]) => mockGetItem(...args),
    setItem: (...args: [string, string]) => mockSetItem(...args),
  },
}));

import {
  FILTER_STORAGE_KEY,
  loadFilterFromStorage,
  parseStoredFilter,
  saveFilterToStorage,
  serializeFilter,
} from '@/lib/categoryStorage';

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

// ============================================================================
// Phase 4 Gary — AsyncStorage IO path tests (Gary audit: MEDIUM-defer, landed)
// These tests mock AsyncStorage at the module boundary (see top of file) so
// the async IO functions run in pure Jest without a React Native runtime.
// ============================================================================

describe('loadFilterFromStorage', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
  });

  it('returns parsed categories when AsyncStorage has a valid JSON value', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify(['food', 'baby']));
    const result = await loadFilterFromStorage();
    expect(mockGetItem).toHaveBeenCalledWith(FILTER_STORAGE_KEY);
    expect(result).toEqual(['food', 'baby']);
  });

  it('returns [] when the key is missing (null)', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const result = await loadFilterFromStorage();
    expect(result).toEqual([]);
  });

  it('returns [] and does not throw when the stored value is malformed JSON', async () => {
    mockGetItem.mockResolvedValueOnce('not-valid-json{{{');
    const result = await loadFilterFromStorage();
    expect(result).toEqual([]);
  });

  it('returns [] and does not throw when AsyncStorage.getItem rejects (IO error)', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('disk full'));
    const result = await loadFilterFromStorage();
    expect(result).toEqual([]);
  });

  it('re-orders to canonical CATEGORY_VALUES order on load', async () => {
    // Stored out-of-order; should come back in canonical order.
    mockGetItem.mockResolvedValueOnce(JSON.stringify(['HRT', 'food']));
    const result = await loadFilterFromStorage();
    expect(result).toEqual(['food', 'HRT']);
  });

  it('drops unknown category values silently on load', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify(['food', 'unknownCategory', 'baby']));
    const result = await loadFilterFromStorage();
    expect(result).toEqual(['food', 'baby']);
  });
});

describe('saveFilterToStorage', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
  });

  it('serializes and writes the filter under the versioned key', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await saveFilterToStorage(['food', 'baby']);
    expect(mockSetItem).toHaveBeenCalledWith(
      FILTER_STORAGE_KEY,
      JSON.stringify(['food', 'baby']), // canonical order
    );
  });

  it('writes an empty array string when saving an empty filter', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await saveFilterToStorage([]);
    expect(mockSetItem).toHaveBeenCalledWith(FILTER_STORAGE_KEY, '[]');
  });

  it('normalizes to canonical order before writing (input order is irrelevant)', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await saveFilterToStorage(['HRT', 'food']); // reversed input
    const [, written] = mockSetItem.mock.calls[0]!;
    // The written string should be byte-equal to canonical order.
    expect(written).toBe(JSON.stringify(['food', 'HRT']));
  });

  it('does not throw when AsyncStorage.setItem rejects (IO error swallowed)', async () => {
    mockSetItem.mockRejectedValueOnce(new Error('storage quota exceeded'));
    // Must resolve (not reject) — saveFilterToStorage swallows IO errors.
    await expect(saveFilterToStorage(['food'])).resolves.toBeUndefined();
  });

  it('saves all five categories in canonical order', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await saveFilterToStorage(['other', 'HRT', 'hygiene', 'baby', 'food']);
    const [, written] = mockSetItem.mock.calls[0]!;
    expect(written).toBe(JSON.stringify(['food', 'hygiene', 'baby', 'HRT', 'other']));
  });
});
