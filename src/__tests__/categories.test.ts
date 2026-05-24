import {
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  matchesActiveFilter,
  toggleCategoryInFilter,
  validateCategory,
} from '@/lib/categories';
import type { ResourceCategory } from '@/types/database';

describe('CATEGORY_VALUES', () => {
  it('preserves the canonical order food → hygiene → baby → HRT → other', () => {
    // Casey's 90-day metrics expect this exact ordering — keep stable.
    expect(CATEGORY_VALUES).toEqual(['food', 'hygiene', 'baby', 'HRT', 'other']);
  });

  it('has a display label for every value', () => {
    for (const v of CATEGORY_VALUES) {
      expect(typeof CATEGORY_LABELS[v]).toBe('string');
      expect(CATEGORY_LABELS[v].length).toBeGreaterThan(0);
    }
  });
});

describe('validateCategory', () => {
  it('returns true for every canonical value', () => {
    for (const v of CATEGORY_VALUES) {
      expect(validateCategory(v)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(validateCategory('banana')).toBe(false);
    expect(validateCategory('')).toBe(false);
    expect(validateCategory('FOOD')).toBe(false); // case-sensitive
    expect(validateCategory('hrt')).toBe(false); // HRT is the canonical casing
  });
});

describe('matchesActiveFilter', () => {
  it('returns true for every category when filter is empty (no filter active)', () => {
    for (const v of CATEGORY_VALUES) {
      expect(matchesActiveFilter(v, [])).toBe(true);
    }
  });

  it('returns true only for categories in the active set', () => {
    expect(matchesActiveFilter('food', ['food'])).toBe(true);
    expect(matchesActiveFilter('baby', ['food'])).toBe(false);
    expect(matchesActiveFilter('HRT', ['HRT', 'food'])).toBe(true);
    expect(matchesActiveFilter('other', ['HRT', 'food'])).toBe(false);
  });
});

describe('toggleCategoryInFilter', () => {
  it('adds a category when not present', () => {
    expect(toggleCategoryInFilter([], 'food')).toEqual(['food']);
    expect(toggleCategoryInFilter(['food'], 'baby')).toEqual(['food', 'baby']);
  });

  it('removes a category when present', () => {
    expect(toggleCategoryInFilter(['food'], 'food')).toEqual([]);
    expect(toggleCategoryInFilter(['food', 'baby'], 'food')).toEqual(['baby']);
  });

  it('emits results in canonical CATEGORY_VALUES order regardless of input order', () => {
    const out = toggleCategoryInFilter(['HRT', 'food'], 'baby');
    // Canonical: food → hygiene → baby → HRT → other
    expect(out).toEqual(['food', 'baby', 'HRT']);
  });

  it('returns a NEW array (never mutates input)', () => {
    const input: readonly ResourceCategory[] = ['food'];
    const out = toggleCategoryInFilter(input, 'baby');
    expect(out).not.toBe(input);
    expect(input).toEqual(['food']);
  });
});

// ============================================================================
// Phase 4 Gary coverage gaps — see qa-reports/phase-4-gary-coverage-audit.md
// ============================================================================

describe('matchesActiveFilter — full-set parity', () => {
  it('returns true for every category when all five categories are active', () => {
    // Toggling every chip ON should be equivalent to no filter — defense
    // against a regression that special-cases the empty-set branch only.
    for (const v of CATEGORY_VALUES) {
      expect(matchesActiveFilter(v, [...CATEGORY_VALUES])).toBe(true);
    }
  });

  it('case-sensitive: filter set with wrong casing does not match', () => {
    // 'HRT' (uppercase) is canonical. Lower-case 'hrt' in active set is
    // an invalid value the type system would normally reject; included
    // because validate-from-storage paths route through here.
    expect(matchesActiveFilter('HRT', ['hrt' as unknown as 'HRT'])).toBe(false);
  });
});

describe('toggleCategoryInFilter — idempotent round-trip', () => {
  it('toggling the same category twice returns to the original set', () => {
    const before: readonly ResourceCategory[] = ['food', 'baby'];
    const after = toggleCategoryInFilter(toggleCategoryInFilter(before, 'HRT'), 'HRT');
    expect(after).toEqual([...before]);
  });
});
