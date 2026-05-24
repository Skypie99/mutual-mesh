/**
 * Tests for src/lib/onboardingCopy.ts — Phase 2 #8 onboarding tour content.
 *
 * The copy itself is owned by Casey (community/onboarding-tour-copy.md);
 * these tests pin down the SHAPE and the privacy-load-bearing invariants
 * so a future edit can't silently break them:
 *
 *   - Card count is exactly 3 (gate / handle / claim).
 *   - Order is gate → handle → claim (mental-load order Casey tuned).
 *   - Body ≤140 chars; headline ≤30 chars (Casey's voice rules).
 *   - CTA pattern is Next, Next, Get started.
 *   - Each card has the load-bearing PRIVACY.md gloss in its body so a
 *     regression that strips "any time" / "no real names" / "you see
 *     each other on claim" is caught.
 *
 * Pure data tests — no React, no Supabase.
 */

import { ONBOARDING_CARDS, ONBOARDING_CARD_COUNT } from '@/lib/onboardingCopy';

describe('ONBOARDING_CARDS — shape and count', () => {
  it('contains exactly 3 cards (gate / handle / claim)', () => {
    expect(ONBOARDING_CARDS).toHaveLength(3);
    expect(ONBOARDING_CARD_COUNT).toBe(3);
  });

  it('preserves the gate → handle → claim order (Casey mental-load tuning)', () => {
    expect(ONBOARDING_CARDS.map((c) => c.id)).toEqual(['gate', 'handle', 'claim']);
  });

  it('every card has a non-empty title, body, microcopy, cta, and ctaHint', () => {
    for (const card of ONBOARDING_CARDS) {
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.body.length).toBeGreaterThan(0);
      expect(card.microcopy.length).toBeGreaterThan(0);
      expect(card.cta.length).toBeGreaterThan(0);
      expect(card.ctaHint.length).toBeGreaterThan(0);
    }
  });
});

describe('ONBOARDING_CARDS — Casey voice rules', () => {
  it('every headline is ≤30 chars (Casey voice rule)', () => {
    for (const card of ONBOARDING_CARDS) {
      expect(card.title.length).toBeLessThanOrEqual(30);
    }
  });

  it('every body is ≤140 chars (Casey voice rule)', () => {
    for (const card of ONBOARDING_CARDS) {
      expect(card.body.length).toBeLessThanOrEqual(140);
    }
  });
});

describe('ONBOARDING_CARDS — CTA pattern', () => {
  it('first two cards use "Next" CTA', () => {
    expect(ONBOARDING_CARDS[0]?.cta).toBe('Next');
    expect(ONBOARDING_CARDS[1]?.cta).toBe('Next');
  });

  it('final card uses "Get started" CTA', () => {
    expect(ONBOARDING_CARDS[2]?.cta).toBe('Get started');
  });
});

describe('ONBOARDING_CARDS — privacy-load-bearing copy contract (Jordan)', () => {
  // Each card describes ONE load-bearing PRIVACY.md decision. The strings
  // tested here are the keystones — removing/weakening any of them is a
  // Jordan re-review trigger per src/lib/onboardingCopy.ts header.

  it('card 1 (gate) mentions Delete + Profile (D6 cascade-delete promise)', () => {
    const card = ONBOARDING_CARDS[0]!;
    expect(card.id).toBe('gate');
    expect(card.body).toMatch(/Delete/i);
    expect(card.body).toMatch(/Profile/i);
  });

  it('card 2 (handle) mentions "no real names" (D1/D2 EDITED, soft warn)', () => {
    const card = ONBOARDING_CARDS[1]!;
    expect(card.id).toBe('handle');
    expect(card.body).toMatch(/no real names/i);
  });

  it('card 3 (claim) mentions Claim + handle visibility on claim (D2, MVP scope)', () => {
    const card = ONBOARDING_CARDS[2]!;
    expect(card.id).toBe('claim');
    expect(card.body).toMatch(/Claim/i);
    expect(card.body).toMatch(/handle/i);
  });
});

describe('ONBOARDING_CARDS — stable id type for accessibility focus', () => {
  it('every id is one of the three accepted literals', () => {
    const accepted = new Set(['gate', 'handle', 'claim']);
    for (const card of ONBOARDING_CARDS) {
      expect(accepted.has(card.id)).toBe(true);
    }
  });

  it('ids are unique across the deck (needed for FlatList keyExtractor)', () => {
    const ids = ONBOARDING_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
