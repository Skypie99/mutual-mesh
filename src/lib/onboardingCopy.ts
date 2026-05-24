/**
 * Onboarding tour copy — Phase 2 #8.
 *
 * Owned by Casey (see community/onboarding-tour-copy.md). Mirrored here as a
 * typed constant so the OnboardingTourScreen and its tests can share one
 * source of truth.
 *
 * Voice rules (from community/mission.md, abridged):
 *   - Speak to a peer, not a beneficiary.
 *   - Each body ≤140 chars.
 *   - Each headline ≤30 chars.
 *   - Don't promise what the app doesn't yet do.
 *
 * Privacy contract per Jordan: cards 1, 2, 3 each describe a load-bearing
 * PRIVACY.md decision (D6 / D1 / D2). Removing or weakening any of those
 * pillars is a Jordan re-review trigger — see the copy doc for the full
 * gloss.
 *
 * Pure data — no React, no Supabase.
 */

export type OnboardingCard = {
  /** Stable id for keys + accessibility focus targets. */
  id: 'gate' | 'handle' | 'claim';
  /** ≤30 chars; rendered as the screen header on each card. */
  title: string;
  /** ≤140 chars; rendered as body copy. */
  body: string;
  /** Per Casey-DFS-1 — small hint under the CTA button. */
  microcopy: string;
  /** Card 1 + 2 = "Next"; Card 3 = "Get started". */
  cta: 'Next' | 'Get started';
  /** Screen-reader hint for the CTA button. */
  ctaHint: string;
};

/**
 * Three-card carousel content. Order matters — the screen renders them in
 * this exact sequence. If you re-order, Casey re-reviews (the copy is
 * tuned for the "gate → handle → claim" mental load order).
 */
export const ONBOARDING_CARDS: readonly OnboardingCard[] = [
  {
    id: 'gate',
    title: "You're in.",
    body: 'A community admin let you in. Leave any time — Profile has a Delete button that wipes everything you posted.',
    microcopy: '2 more — about 30 seconds.',
    cta: 'Next',
    ctaHint: 'Go to the next card. Two more cards explain how handles and claiming work.',
  },
  {
    id: 'handle',
    title: 'Pick a handle, not a name.',
    body: "No real names — not yours, not your kid's. Change your handle any time. See someone using a real name? Skip that listing.",
    microcopy: 'One more — claiming.',
    cta: 'Next',
    ctaHint: 'Go to the next card. The last card explains what happens when you claim a listing.',
  },
  {
    id: 'claim',
    title: 'You see each other on claim.',
    body: 'Tap Claim and the poster sees your handle. You see the contact they chose (Signal, Proton, etc.). Pickup happens off-app.',
    microcopy: 'Profile has "See intro again."',
    cta: 'Get started',
    ctaHint: 'Finish the tour. The marketplace opens next. You can re-open this tour from Profile.',
  },
] as const;

/** Total card count, for "Card X of N" announcements. */
export const ONBOARDING_CARD_COUNT = ONBOARDING_CARDS.length;
