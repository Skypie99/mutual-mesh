/**
 * Demo fixtures — synthetic, bundled, zero-PII marketplace data (WEB-4).
 *
 * These power the anonymous guest demo (`?demo=1`). They are the ONLY data the
 * app renders while `isDemo` is true; no Supabase call is ever made in demo.
 *
 * === Hard privacy invariants (Jordan gate, 2026-06-05) ===
 *
 *   - `contact_handle` is ALWAYS `null` on every row — no real or fake personal
 *     contact identifier is shipped, and the detail screen's handle-reveal path
 *     stays structurally unreachable. (Machine-checked in src/__tests__/demo.test.ts.)
 *   - `photo_url` is ALWAYS `null` on every row — so no Storage signed-URL path
 *     is ever exercised.
 *   - `posted_by` / `claimed_by` are obviously-fake synthetic ids
 *     ('demo-user-N' / null), never real auth uuids.
 *   - `pickup_text` is generic neighborhood phrasing — NEVER a real street address.
 *   - Postal prefixes use real Kelowna FSA *format* codes (V1Y/V1W/V1V/V1X);
 *     FSAs are public postal geography, not personal data, and are not paired
 *     with any real personal detail.
 *   - All timestamps are fixed ISO string literals — we never call Date.now(),
 *     so fixtures are deterministic and snapshot-stable.
 *
 * Tone: warm, supportive mutual-aid listings. Realistic-but-clearly-sample.
 *
 * Typed as `ResourceRow[]` so `tsc --noEmit` catches any schema drift.
 */

import type { ResourceRow } from '@/types/database';

/** Single fixed timestamp source so nothing here depends on the clock. */
const POSTED_AT = '2026-05-20T17:00:00.000Z';

/**
 * Build a demo resource with the privacy-critical fields hard-locked.
 *
 * `contact_handle`, `photo_url`, `claimed_by`, `confirmed_at`, `confirmed_by`,
 * and `status` are NOT accepted as overrides — they're pinned to the only
 * values the demo is allowed to render (null / null / null / null / null /
 * 'available'). This makes the invariant impossible to break by editing the
 * per-row data below.
 */
function demoResource(
  fields: Pick<
    ResourceRow,
    'id' | 'posted_by' | 'name' | 'description' | 'pickup_text' | 'category' | 'postal_prefix'
  >,
): ResourceRow {
  return {
    id: fields.id,
    posted_by: fields.posted_by,
    claimed_by: null,
    name: fields.name,
    description: fields.description,
    photo_url: null, // INVARIANT: never a Storage path in demo.
    pickup_text: fields.pickup_text,
    contact_handle: null, // INVARIANT: never reveal a (real or fake) contact handle.
    category: fields.category,
    status: 'available',
    postal_prefix: fields.postal_prefix,
    city: 'Kelowna',
    confirmed_at: null,
    confirmed_by: null,
    created_at: POSTED_AT,
    status_changed_at: POSTED_AT,
  };
}

/**
 * ~10 listings spanning all five categories (food, hygiene, baby, HRT, other)
 * across four Kelowna FSAs (V1Y, V1W, V1V, V1X).
 */
export const DEMO_RESOURCES: ResourceRow[] = [
  demoResource({
    id: 'demo-1',
    posted_by: 'demo-user-1',
    name: 'Box of canned goods',
    description:
      'Soups, beans, and pasta sauce — all sealed and well within date. Happy to set aside whatever helps.',
    pickup_text: 'Porch pickup near the downtown library. Message to arrange a time.',
    category: 'food',
    postal_prefix: 'V1Y',
  }),
  demoResource({
    id: 'demo-2',
    posted_by: 'demo-user-2',
    name: 'Unopened baby formula (sealed)',
    description: 'Two tins of stage-1 formula, factory sealed. Our little one outgrew this stage.',
    pickup_text: 'Lobby handoff at an apartment building off the main road.',
    category: 'baby',
    postal_prefix: 'V1W',
  }),
  demoResource({
    id: 'demo-3',
    posted_by: 'demo-user-3',
    name: 'Winter coats, various sizes',
    description:
      'Gently used coats — a couple of kids sizes and two adult mediums. Warm and clean.',
    pickup_text: 'Front-step pickup in a quiet residential neighborhood.',
    category: 'other',
    postal_prefix: 'V1V',
  }),
  demoResource({
    id: 'demo-4',
    posted_by: 'demo-user-4',
    name: 'Toiletry kit (soap, toothpaste, shampoo)',
    description: 'A fresh bundle of basics, all unopened. Enough to fill a small bag.',
    pickup_text: 'Meet outside a community center near the park.',
    category: 'hygiene',
    postal_prefix: 'V1X',
  }),
  demoResource({
    id: 'demo-5',
    posted_by: 'demo-user-5',
    name: 'Spare HRT supplies — sealed',
    description:
      'Extra sealed supplies I no longer need. No questions, no judgment — just want them to help someone.',
    pickup_text: 'Discreet handoff near a bus stop downtown; flexible on timing.',
    category: 'HRT',
    postal_prefix: 'V1Y',
  }),
  demoResource({
    id: 'demo-6',
    posted_by: 'demo-user-6',
    name: 'Fresh garden vegetables',
    description: 'Zucchini, tomatoes, and herbs from the backyard. More than we can eat this week.',
    pickup_text: 'Pick up from a shaded porch in a leafy side street.',
    category: 'food',
    postal_prefix: 'V1W',
  }),
  demoResource({
    id: 'demo-7',
    posted_by: 'demo-user-7',
    name: 'Diapers — size 3 and size 4',
    description: 'One open pack and one sealed pack each. Clean and stored indoors.',
    pickup_text: 'Front-door pickup in a townhouse complex near the school.',
    category: 'baby',
    postal_prefix: 'V1V',
  }),
  demoResource({
    id: 'demo-8',
    posted_by: 'demo-user-8',
    name: 'Reusable menstrual products (new)',
    description: 'Still in packaging — bought the wrong size. Hoping they find a good home.',
    pickup_text: 'Meet at a coffee shop near the transit exchange.',
    category: 'hygiene',
    postal_prefix: 'V1X',
  }),
  demoResource({
    id: 'demo-9',
    posted_by: 'demo-user-9',
    name: 'Small kitchen starter set',
    description:
      'A pot, a pan, a few plates and utensils. Great for someone setting up a new place.',
    pickup_text: 'Curbside pickup on a calm residential block.',
    category: 'other',
    postal_prefix: 'V1Y',
  }),
  demoResource({
    id: 'demo-10',
    posted_by: 'demo-user-10',
    name: 'Bread and pastries (end of day)',
    description: 'A bag of day-old loaves and muffins, still soft. First to claim, first served.',
    pickup_text: 'Evening pickup near a neighborhood bakery; flexible window.',
    category: 'food',
    postal_prefix: 'V1W',
  }),
];

/**
 * findDemoResource — synthetic stand-in for the get_resource_detail RPC.
 *
 * Returns the matching demo row by id, or null when the id is unknown.
 * Pure, zero-network. The returned row already has `contact_handle: null`
 * and `photo_url: null`, so the detail screen renders no handle and fetches
 * no signed photo URL.
 */
export function findDemoResource(id: string): ResourceRow | null {
  return DEMO_RESOURCES.find((r) => r.id === id) ?? null;
}
