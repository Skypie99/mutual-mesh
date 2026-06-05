import { DEMO_RESOURCES, findDemoResource } from '@/lib/demo/fixtures';
import { decideGateRoute } from '@/lib/verification';
import { CATEGORY_VALUES } from '@/lib/categories';
import type { Cycle1GateInput } from '@/lib/verification';
import type { ResourceCategory } from '@/types/database';

/**
 * Guest demo mode tests (WEB-4, 2026-06-05).
 *
 * These are pure-data + pure-function assertions — no Supabase, no React, so no
 * mock is required (same as categories.test.ts). The single most important test
 * here is the machine-checkable privacy invariant: every demo row must have
 * `contact_handle === null` AND `photo_url === null` (Jordan gate condition 4).
 */

const sessionFixture: Cycle1GateInput['session'] = { user: { id: 'abc' } };

describe('DEMO_RESOURCES — privacy invariants (Jordan condition 4)', () => {
  it('is non-empty', () => {
    expect(DEMO_RESOURCES.length).toBeGreaterThan(0);
  });

  it('has contact_handle === null on EVERY row (no handle ever revealed in demo)', () => {
    for (const row of DEMO_RESOURCES) {
      expect(row.contact_handle).toBeNull();
    }
  });

  it('has photo_url === null on EVERY row (no Storage signed-URL path exercised)', () => {
    for (const row of DEMO_RESOURCES) {
      expect(row.photo_url).toBeNull();
    }
  });

  it('claims nothing — claimed_by is null and status is "available" on every row', () => {
    for (const row of DEMO_RESOURCES) {
      expect(row.claimed_by).toBeNull();
      expect(row.status).toBe('available');
    }
  });

  it('uses obviously-synthetic ids and posted_by (never real auth uuids)', () => {
    for (const row of DEMO_RESOURCES) {
      expect(row.id).toMatch(/^demo-/);
      expect(row.posted_by).toMatch(/^demo-user-/);
    }
  });

  it('uses deterministic fixed timestamps (no Date.now drift)', () => {
    for (const row of DEMO_RESOURCES) {
      // ISO 8601 with milliseconds + Z.
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(row.status_changed_at).toBe(row.created_at);
    }
  });

  it('has unique ids', () => {
    const ids = DEMO_RESOURCES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('DEMO_RESOURCES — coverage', () => {
  it('covers all 5 categories', () => {
    const present = new Set<ResourceCategory>(DEMO_RESOURCES.map((r) => r.category));
    for (const category of CATEGORY_VALUES) {
      expect(present.has(category)).toBe(true);
    }
    // No stray category outside the canonical five.
    expect(present.size).toBe(CATEGORY_VALUES.length);
  });

  it('spreads across multiple Kelowna FSAs in the real public format', () => {
    const fsas = new Set(DEMO_RESOURCES.map((r) => r.postal_prefix));
    expect(fsas.size).toBeGreaterThanOrEqual(3);
    for (const fsa of fsas) {
      // Canadian FSA format: letter-digit-letter (e.g. V1Y). Public geography.
      expect(fsa).toMatch(/^[A-Z]\d[A-Z]$/);
    }
  });
});

describe('findDemoResource', () => {
  it('returns the matching row for a known id', () => {
    const first = DEMO_RESOURCES[0];
    expect(first).toBeDefined();
    const found = findDemoResource(first!.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(first!.id);
    // The resolved row still honors the privacy invariant.
    expect(found?.contact_handle).toBeNull();
    expect(found?.photo_url).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(findDemoResource('does-not-exist')).toBeNull();
    expect(findDemoResource('')).toBeNull();
  });
});

describe('decideGateRoute — demo branch (additive, non-regressive)', () => {
  it('routes to demo-home when demo is true, regardless of session/profile', () => {
    expect(decideGateRoute({ loading: false, session: null, profile: null, demo: true })).toBe(
      'demo-home',
    );
    // Demo wins even over a loading boot and even with a session present.
    expect(decideGateRoute({ loading: true, session: null, profile: null, demo: true })).toBe(
      'demo-home',
    );
    expect(
      decideGateRoute({
        loading: false,
        session: sessionFixture,
        profile: { handle: 'brave-otter-4729', is_verified: true },
        demo: true,
      }),
    ).toBe('demo-home');
  });

  it('preserves existing behavior when demo is false', () => {
    expect(decideGateRoute({ loading: false, session: null, profile: null, demo: false })).toBe(
      'sign-in',
    );
    expect(
      decideGateRoute({
        loading: false,
        session: sessionFixture,
        profile: { handle: 'brave-otter-4729', is_verified: true },
        demo: false,
      }),
    ).toBe('home');
  });

  it('preserves existing behavior when demo is omitted (undefined)', () => {
    expect(decideGateRoute({ loading: false, session: null, profile: null })).toBe('sign-in');
    expect(decideGateRoute({ loading: true, session: null, profile: null })).toBe('splash');
  });
});
