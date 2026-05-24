/**
 * Tests for the pure FSA-aggregation helpers — Phase 3.2 Map View.
 *
 * Covers Quinn AC-1 (no per-resource markers), AC-4 (aggregated counts only;
 * bucket-not-count semantics), AC-9 (only available resources count), and
 * the screen-reader fallback (AC-5).
 *
 * No React, no Supabase, no async. Pure helper coverage.
 */

import {
  FSA_BUCKET_LABEL,
  fsaAccessibilityLabel,
  fsaCountToBucket,
  fsaMapSummary,
  groupResourcesByFSA,
  type FsaDescriptor,
  type ResourceCategoryHint,
} from '@/lib/fsaAggregation';
import type { ResourceRow } from '@/types/database';

// Tiny factory so tests stay readable. Default values pass the "available"
// gate; override per test as needed.
//
// We use Object.prototype.hasOwnProperty so an explicit `null` / `''`
// override overrides the default (the `??` operator would not — it falls
// through to the default).
function makeResource(
  overrides: Partial<ResourceRow> & { category?: ResourceCategoryHint } = {},
): ResourceRow {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(overrides, k);
  const base: ResourceRow & { category?: ResourceCategoryHint } = {
    id: overrides.id ?? `res-${Math.random().toString(36).slice(2, 9)}`,
    posted_by: overrides.posted_by ?? 'user-1',
    claimed_by: has('claimed_by') ? (overrides.claimed_by as string | null) : null,
    name: overrides.name ?? 'Test resource',
    description: has('description') ? (overrides.description as string | null) : null,
    photo_url: has('photo_url') ? (overrides.photo_url as string | null) : null,
    pickup_text: overrides.pickup_text ?? 'somewhere',
    contact_handle: overrides.contact_handle ?? '@somebody',
    status: overrides.status ?? 'available',
    postal_prefix: has('postal_prefix') ? (overrides.postal_prefix as string | null) : 'M5V',
    city: has('city') ? (overrides.city as string | null) : 'Toronto',
    category: (overrides.category as ResourceRow['category']) ?? 'other',
    confirmed_at: has('confirmed_at') ? (overrides.confirmed_at as string | null) : null,
    confirmed_by: has('confirmed_by') ? (overrides.confirmed_by as string | null) : null,
    created_at: overrides.created_at ?? '2026-05-24T00:00:00Z',
    status_changed_at: overrides.status_changed_at ?? '2026-05-24T00:00:00Z',
  };
  return base;
}

// ============================================================================
// fsaCountToBucket — boundary table
// ============================================================================

describe('fsaCountToBucket', () => {
  it('returns "none" for zero and negative counts', () => {
    expect(fsaCountToBucket(0)).toBe('none');
    expect(fsaCountToBucket(-1)).toBe('none');
    expect(fsaCountToBucket(-100)).toBe('none');
  });

  it('returns "light" for 1-2', () => {
    expect(fsaCountToBucket(1)).toBe('light');
    expect(fsaCountToBucket(2)).toBe('light');
  });

  it('returns "medium" for 3-5', () => {
    expect(fsaCountToBucket(3)).toBe('medium');
    expect(fsaCountToBucket(4)).toBe('medium');
    expect(fsaCountToBucket(5)).toBe('medium');
  });

  it('returns "heavy" for 6 or more', () => {
    expect(fsaCountToBucket(6)).toBe('heavy');
    expect(fsaCountToBucket(100)).toBe('heavy');
    expect(fsaCountToBucket(10_000)).toBe('heavy');
  });

  it('treats NaN / Infinity defensively as "none" (never crash on bad input)', () => {
    expect(fsaCountToBucket(NaN)).toBe('none');
    // Positive infinity is technically > 0 but not a finite bucket; we
    // defensively map it to 'none' too so we never render bogus polygons.
    expect(fsaCountToBucket(Number.POSITIVE_INFINITY)).toBe('none');
  });
});

// ============================================================================
// FSA_BUCKET_LABEL — privacy-safe wording
// ============================================================================

describe('FSA_BUCKET_LABEL', () => {
  it('never includes a numeric count or a per-category breakdown', () => {
    for (const bucket of ['none', 'light', 'medium', 'heavy'] as const) {
      const label = FSA_BUCKET_LABEL[bucket];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      // AC-4 privacy contract: no digits should appear in the label.
      expect(/\d/.test(label)).toBe(false);
    }
  });

  it('has a label for every bucket', () => {
    expect(Object.keys(FSA_BUCKET_LABEL).sort()).toEqual(['heavy', 'light', 'medium', 'none']);
  });
});

// ============================================================================
// groupResourcesByFSA — core aggregation
// ============================================================================

describe('groupResourcesByFSA', () => {
  it('returns an empty array for null / undefined / empty input', () => {
    expect(groupResourcesByFSA(null)).toEqual([]);
    expect(groupResourcesByFSA(undefined)).toEqual([]);
    expect(groupResourcesByFSA([])).toEqual([]);
  });

  it('drops resources without a postal_prefix (no FSA → no polygon)', () => {
    const resources = [
      makeResource({ id: 'a', postal_prefix: null }),
      makeResource({ id: 'b', postal_prefix: '' }),
      makeResource({ id: 'c', postal_prefix: '  ' }),
      makeResource({ id: 'd', postal_prefix: 'XY' }), // too short
    ];
    expect(groupResourcesByFSA(resources)).toEqual([]);
  });

  it('drops resources whose status is not "available" (AC-9 visibility rule)', () => {
    const resources = [
      makeResource({ id: 'a', status: 'available', postal_prefix: 'M5V' }),
      makeResource({ id: 'b', status: 'reserved', postal_prefix: 'M5V' }),
      makeResource({ id: 'c', status: 'reserved', postal_prefix: 'M4W' }),
    ];
    const out = groupResourcesByFSA(resources);
    expect(out).toHaveLength(1);
    expect(out[0]?.fsa).toBe('M5V');
    expect(out[0]?.count).toBe(1);
  });

  it('normalizes postal_prefix to a 3-char uppercase FSA', () => {
    const resources = [
      makeResource({ id: 'a', postal_prefix: 'm5v' }),
      makeResource({ id: 'b', postal_prefix: '  M5V  ' }),
      makeResource({ id: 'c', postal_prefix: 'M5V 3A8' }), // first 3 chars
    ];
    const out = groupResourcesByFSA(resources);
    expect(out).toHaveLength(1);
    expect(out[0]?.fsa).toBe('M5V');
    expect(out[0]?.count).toBe(3);
  });

  it('groups multiple resources by FSA and sets correct bucket', () => {
    const resources = [
      // M5V: 6 resources → heavy
      ...Array.from({ length: 6 }, (_, i) =>
        makeResource({ id: `m5v-${i}`, postal_prefix: 'M5V' }),
      ),
      // M4W: 3 resources → medium
      ...Array.from({ length: 3 }, (_, i) =>
        makeResource({ id: `m4w-${i}`, postal_prefix: 'M4W' }),
      ),
      // M6J: 1 resource → light
      makeResource({ id: 'm6j-1', postal_prefix: 'M6J' }),
    ];
    const out = groupResourcesByFSA(resources);
    // Sorted by FSA lex: M4W, M5V, M6J
    expect(out.map((d) => d.fsa)).toEqual(['M4W', 'M5V', 'M6J']);
    expect(out[0]?.count).toBe(3);
    expect(out[0]?.bucket).toBe('medium');
    expect(out[1]?.count).toBe(6);
    expect(out[1]?.bucket).toBe('heavy');
    expect(out[2]?.count).toBe(1);
    expect(out[2]?.bucket).toBe('light');
  });

  it('picks dominant category and exposes the present-category set', () => {
    const resources = [
      makeResource({ id: 'a', postal_prefix: 'M5V', category: 'baby' }),
      makeResource({ id: 'b', postal_prefix: 'M5V', category: 'baby' }),
      makeResource({ id: 'c', postal_prefix: 'M5V', category: 'food' }),
    ];
    const out = groupResourcesByFSA(resources);
    expect(out[0]?.dominantCategory).toBe('baby');
    expect(out[0]?.categories).toEqual(['food', 'baby']);
  });

  it('falls back to "other" when a resource has no category field', () => {
    const resources = [
      // No category field at all (Phase 2 mid-rollout case).
      makeResource({ id: 'a', postal_prefix: 'M5V' }),
    ];
    const out = groupResourcesByFSA(resources);
    expect(out[0]?.dominantCategory).toBe('other');
  });

  it('returns a stable canonical-ordered category list (food/hygiene/baby/HRT/other)', () => {
    const resources = [
      makeResource({ id: 'a', postal_prefix: 'M5V', category: 'HRT' }),
      makeResource({ id: 'b', postal_prefix: 'M5V', category: 'food' }),
      makeResource({ id: 'c', postal_prefix: 'M5V', category: 'baby' }),
    ];
    const out = groupResourcesByFSA(resources);
    // Order should follow CATEGORY_ORDER (food, hygiene, baby, HRT, other).
    expect(out[0]?.categories).toEqual(['food', 'baby', 'HRT']);
  });

  it('uses canonical CATEGORY_ORDER to break dominant ties', () => {
    // One of each: food + baby. Both have count=1. food is earlier in the
    // canonical order so it should win the tie.
    const resources = [
      makeResource({ id: 'a', postal_prefix: 'M5V', category: 'food' }),
      makeResource({ id: 'b', postal_prefix: 'M5V', category: 'baby' }),
    ];
    const out = groupResourcesByFSA(resources);
    expect(out[0]?.dominantCategory).toBe('food');
  });

  it('exposes the city when consistent across resources in an FSA', () => {
    const resources = [
      makeResource({ id: 'a', postal_prefix: 'M5V', city: 'Toronto' }),
      makeResource({ id: 'b', postal_prefix: 'M5V', city: 'Toronto' }),
    ];
    const out = groupResourcesByFSA(resources);
    expect(out[0]?.city).toBe('Toronto');
  });

  it('returns null city when no resource in the FSA has a city', () => {
    const resources = [
      makeResource({ id: 'a', postal_prefix: 'M5V', city: null }),
      makeResource({ id: 'b', postal_prefix: 'M5V', city: null }),
    ];
    const out = groupResourcesByFSA(resources);
    expect(out[0]?.city).toBeNull();
  });

  it('does not mutate the input array', () => {
    const resources = [
      makeResource({ id: 'a', postal_prefix: 'M5V' }),
      makeResource({ id: 'b', postal_prefix: 'M4W' }),
    ];
    const copy = resources.map((r) => ({ ...r }));
    groupResourcesByFSA(resources);
    expect(resources).toEqual(copy);
  });

  it('handles a large feed (500 resources spread across many FSAs) without crashing', () => {
    const fsas = ['M5V', 'M4W', 'M6J', 'V6B', 'H2X'];
    const resources = Array.from({ length: 500 }, (_, i) =>
      makeResource({
        id: `r-${i}`,
        postal_prefix: fsas[i % fsas.length] ?? 'M5V',
      }),
    );
    const out = groupResourcesByFSA(resources);
    expect(out).toHaveLength(fsas.length);
    // Each FSA should have 100 resources → heavy bucket.
    for (const d of out) {
      expect(d.bucket).toBe('heavy');
    }
  });
});

// ============================================================================
// fsaAccessibilityLabel — privacy-safe screen-reader string
// ============================================================================

describe('fsaAccessibilityLabel', () => {
  it('includes the FSA code and the bucket label, never an exact count', () => {
    const descriptor: FsaDescriptor = {
      fsa: 'M5V',
      count: 7,
      bucket: 'heavy',
      dominantCategory: 'food',
      categories: ['food'],
      city: 'Toronto',
    };
    const label = fsaAccessibilityLabel(descriptor);
    expect(label).toContain('M5V');
    expect(label).toContain('Toronto');
    expect(label).toContain('many resources');
    // AC-4 privacy contract: no exact count in the label.
    expect(label).not.toContain('7');
  });

  it('omits the city part when city is null', () => {
    const descriptor: FsaDescriptor = {
      fsa: 'M4W',
      count: 1,
      bucket: 'light',
      dominantCategory: 'other',
      categories: ['other'],
      city: null,
    };
    expect(fsaAccessibilityLabel(descriptor)).toBe('M4W, a few resources available');
  });
});

// ============================================================================
// fsaMapSummary — one-line whole-map description
// ============================================================================

describe('fsaMapSummary', () => {
  it('uses zero-state copy when no descriptors are present', () => {
    expect(fsaMapSummary([])).toBe('Map shows no neighborhoods with available resources.');
  });

  it('uses singular copy when one descriptor is present', () => {
    const desc: FsaDescriptor = {
      fsa: 'M5V',
      count: 1,
      bucket: 'light',
      dominantCategory: 'other',
      categories: ['other'],
      city: 'Toronto',
    };
    expect(fsaMapSummary([desc])).toBe('Map shows 1 neighborhood with available resources.');
  });

  it('uses plural copy when several descriptors are present', () => {
    const a: FsaDescriptor = {
      fsa: 'M5V',
      count: 6,
      bucket: 'heavy',
      dominantCategory: 'food',
      categories: ['food'],
      city: 'Toronto',
    };
    const b: FsaDescriptor = {
      fsa: 'M4W',
      count: 1,
      bucket: 'light',
      dominantCategory: 'other',
      categories: ['other'],
      city: 'Toronto',
    };
    expect(fsaMapSummary([a, b])).toBe('Map shows 2 neighborhoods with available resources.');
  });

  it('never enumerates city or FSA names in the summary (privacy: aggregate only)', () => {
    const a: FsaDescriptor = {
      fsa: 'M5V',
      count: 6,
      bucket: 'heavy',
      dominantCategory: 'food',
      categories: ['food'],
      city: 'Toronto',
    };
    const summary = fsaMapSummary([a]);
    expect(summary).not.toContain('M5V');
    expect(summary).not.toContain('Toronto');
  });
});
