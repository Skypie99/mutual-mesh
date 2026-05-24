/**
 * Pure FSA-aggregation helpers — Phase 3.2 Map View.
 *
 * Privacy posture (Quinn AC-1, AC-2, AC-4):
 *   - The smallest spatial unit the app EVER renders is an FSA polygon
 *     (Canadian Forward Sortation Area: the first 3 characters of a postal
 *     code, neighborhood-sized, several blocks across).
 *   - We NEVER render individual GPS pins, street-level zoom, or
 *     per-resource markers.
 *   - We aggregate counts per FSA on the CLIENT (zero new RPCs, zero new
 *     query paths).
 *
 * Helpers in this file are PURE — no React, no Supabase, no AsyncStorage,
 * no expo-* imports. They're fully unit-tested in
 * `src/__tests__/fsaAggregation.test.ts`.
 *
 * Used by:
 *   - `ResourceMap` (Phase 3.2) — renders one polygon per FSA with active
 *     resources, color-graded by count bucket.
 *   - Hidden accessibility list below the map (AC-5) — screen-reader users
 *     get the same FSA descriptors in text form.
 *   - HomeScreen list-view filter (AC-4) — tapping a polygon transitions
 *     to the list filtered by that FSA.
 */

import type { ResourceRow } from '@/types/database';

// ============================================================================
// Color buckets (AC-4: color gradient, no exact counts)
// ============================================================================

/**
 * The four count buckets used for polygon color grading. Order matters —
 * brightness/saturation should increase from `light` to `heavy`. The map
 * never exposes the exact count to the user (privacy-adjacent per Jordan
 * pre-audit Sec 5); the bucket label is the public surface.
 */
export type FsaCountBucket = 'none' | 'light' | 'medium' | 'heavy';

/**
 * Map a raw count to a privacy-safe bucket. Boundaries chosen per Quinn's
 * spec AC-4:
 *   - 0          → 'none'   (no polygon rendered)
 *   - 1-2        → 'light'
 *   - 3-5        → 'medium'
 *   - 6+         → 'heavy'
 *
 * Pure. Tested with table-driven boundary cases.
 *
 * @privacy-load-bearing PRIVACY.md §D3 — aggregates resource counts to FSA
 * buckets to prevent GPS-level location inference. Do not return raw coordinates
 * or fine-grained counts without Jordan review.
 */
export function fsaCountToBucket(count: number): FsaCountBucket {
  if (!Number.isFinite(count) || count <= 0) return 'none';
  if (count <= 2) return 'light';
  if (count <= 5) return 'medium';
  return 'heavy';
}

/**
 * Human-friendly bucket label used in accessibility text. NEVER exposes
 * the exact count (AC-4).
 *
 * Localized later in Phase 3.4 — for now plain English strings; the i18n
 * keys are `map.bucket.light` / `map.bucket.medium` / `map.bucket.heavy`.
 */
export const FSA_BUCKET_LABEL: Record<FsaCountBucket, string> = {
  none: 'no resources',
  light: 'a few resources',
  medium: 'several resources',
  heavy: 'many resources',
};

// ============================================================================
// Descriptor shape — one entry per FSA with at least one active resource
// ============================================================================

/**
 * One descriptor per FSA that has ≥1 available resource. Drives both the
 * map polygon render AND the accessibility hidden-list fallback.
 *
 * Field design (Jordan pre-audit + Alex AC-5):
 *   - `fsa`              — the 3-char Forward Sortation Area code.
 *   - `count`            — internal; never exposed in user-facing UI.
 *   - `bucket`           — the privacy-safe count category for color/label.
 *   - `dominantCategory` — the category that appears MOST in this FSA.
 *                          Used for tinting; never as a per-category count.
 *   - `categories`       — the distinct set of categories present, sorted.
 *                          Used to inform the dominant pick deterministically.
 *   - `city`             — the city the FSA's resources come from. Used in
 *                          the accessibility label (e.g., "M5V Toronto").
 *                          Null if all the resources in this FSA have a
 *                          null city.
 */
export type FsaDescriptor = {
  fsa: string;
  count: number;
  bucket: FsaCountBucket;
  dominantCategory: ResourceCategoryHint;
  categories: ResourceCategoryHint[];
  city: string | null;
};

/**
 * We don't yet have a `category` column on `public.resources` in Cycle 1's
 * schema (Phase 2's category enum is shipped but the DB column is part of
 * the same in-flight wave). To keep this helper compilable + testable now,
 * we accept a STRUCTURAL hint: `category` may be one of the canonical
 * Phase 2 enum values OR null/undefined (resource not yet categorized).
 *
 * When the resource is null-category, the dominant calculation treats it
 * as the `'other'` bucket so we still render the polygon (the user has
 * something there) without inventing a category they didn't pick.
 */
export type ResourceCategoryHint = 'food' | 'hygiene' | 'baby' | 'HRT' | 'other';

const CATEGORY_ORDER: readonly ResourceCategoryHint[] = [
  'food',
  'hygiene',
  'baby',
  'HRT',
  'other',
] as const;

/**
 * Pull the postal_prefix safely from a resource row, normalized to a 3-char
 * uppercase string. Returns null when the prefix is missing, blank, or
 * malformed (we never invent an FSA the resource didn't have).
 *
 * Why we normalize: postal_prefix is user-input; some users type lowercase,
 * some include trailing spaces, some accidentally include the last 3 chars
 * of the postal code too. We trim and uppercase, then keep only the first
 * 3 chars if available.
 */
function extractFsa(resource: Pick<ResourceRow, 'postal_prefix'>): string | null {
  const raw = resource.postal_prefix;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length < 3) return null;
  return trimmed.slice(0, 3);
}

/**
 * Try to read a category from a resource. The `category` column may not
 * exist on the row yet (Phase 2 mid-rollout), so we defensively check via
 * `in` rather than property access.
 *
 * Falls back to `'other'` when missing or unknown so the resource still
 * counts toward the polygon — never drops a row silently.
 */
function extractCategory(resource: ResourceRow): ResourceCategoryHint {
  // Resource rows MAY have a `category` field added by Phase 2; treat it as
  // unknown-shape until the type catches up.
  const candidate = (resource as unknown as { category?: unknown }).category;
  if (typeof candidate === 'string') {
    if ((CATEGORY_ORDER as readonly string[]).includes(candidate)) {
      return candidate as ResourceCategoryHint;
    }
  }
  return 'other';
}

/**
 * Pick a single dominant category for an FSA. Algorithm:
 *   - Highest count wins.
 *   - On a tie, the canonical `CATEGORY_ORDER` order wins (so test outputs
 *     are stable and partner-network seed views don't flicker between
 *     ties on re-render).
 */
function pickDominant(perCategoryCount: Map<ResourceCategoryHint, number>): ResourceCategoryHint {
  let best: ResourceCategoryHint = 'other';
  let bestCount = -1;
  for (const cat of CATEGORY_ORDER) {
    const c = perCategoryCount.get(cat) ?? 0;
    if (c > bestCount) {
      best = cat;
      bestCount = c;
    }
  }
  return best;
}

// ============================================================================
// Core aggregation
// ============================================================================

/**
 * Aggregate a list of resources into FSA descriptors.
 *
 * Behavior (Quinn AC-4 + AC-9):
 *   - Only resources with `status === 'available'` count (matches list view).
 *   - Resources without a postal_prefix are dropped (they don't belong to
 *     any FSA polygon — privacy by design).
 *   - The result is sorted by FSA code ascending for deterministic render.
 *
 * Returns an empty array for empty / null / undefined input — callers can
 * use the result length as a quick "no polygons" guard.
 *
 * Pure; never mutates inputs.
 */
export function groupResourcesByFSA(
  resources: readonly ResourceRow[] | null | undefined,
): FsaDescriptor[] {
  if (!resources || resources.length === 0) return [];

  // Bucket the rows by FSA, accumulating per-category counts and cities.
  type Acc = {
    count: number;
    perCategory: Map<ResourceCategoryHint, number>;
    cities: Set<string>;
  };
  const byFsa = new Map<string, Acc>();

  for (const r of resources) {
    if (r.status !== 'available') continue;
    const fsa = extractFsa(r);
    if (!fsa) continue;

    const category = extractCategory(r);
    const existing = byFsa.get(fsa) ?? {
      count: 0,
      perCategory: new Map<ResourceCategoryHint, number>(),
      cities: new Set<string>(),
    };
    existing.count += 1;
    existing.perCategory.set(category, (existing.perCategory.get(category) ?? 0) + 1);
    if (r.city && r.city.trim().length > 0) {
      existing.cities.add(r.city.trim());
    }
    byFsa.set(fsa, existing);
  }

  const descriptors: FsaDescriptor[] = [];
  for (const [fsa, acc] of byFsa) {
    const dominant = pickDominant(acc.perCategory);
    // Distinct categories present, in canonical order (stable across runs).
    const presentCategories = CATEGORY_ORDER.filter((c) => (acc.perCategory.get(c) ?? 0) > 0);
    // City: if a single city dominates, use it; if multiple, prefer the most
    // common (stable on tie via CATEGORY_ORDER-style fallback: alphabetic).
    const cityList = Array.from(acc.cities).sort();
    const city = cityList.length === 0 ? null : (cityList[0] ?? null);

    descriptors.push({
      fsa,
      count: acc.count,
      bucket: fsaCountToBucket(acc.count),
      dominantCategory: dominant,
      categories: presentCategories,
      city,
    });
  }

  // Stable sort by FSA code (lex) so snapshot tests are deterministic.
  descriptors.sort((a, b) => a.fsa.localeCompare(b.fsa));
  return descriptors;
}

/**
 * Build the screen-reader-safe accessibility label for an FSA descriptor.
 *
 * Per Quinn AC-4 + Jordan pre-audit Sec 5: the label NEVER includes the
 * exact count or per-category counts. It uses the bucket label and (if
 * known) the city name.
 *
 * Examples:
 *   - `{ fsa: 'M5V', city: 'Toronto', bucket: 'light' }`
 *       → "M5V, Toronto, a few resources available"
 *   - `{ fsa: 'M4W', city: null, bucket: 'heavy' }`
 *       → "M4W, many resources available"
 */
export function fsaAccessibilityLabel(descriptor: FsaDescriptor): string {
  const bucketLabel = FSA_BUCKET_LABEL[descriptor.bucket];
  const cityPart = descriptor.city ? `, ${descriptor.city}` : '';
  return `${descriptor.fsa}${cityPart}, ${bucketLabel} available`;
}

/**
 * Build a single high-level summary string for the whole map (used as the
 * map container's accessibilityLabel + the visible text summary below the
 * map per Quinn AC-5 layout).
 *
 * Examples:
 *   - 0 descriptors      → "Map shows no neighborhoods with available resources."
 *   - 1 descriptor       → "Map shows 1 neighborhood with available resources."
 *   - N >= 2 descriptors → "Map shows N neighborhoods with available resources."
 *
 * Cities are not enumerated — could leak rough geographic distribution if
 * combined with other signals; one summary number is enough.
 */
export function fsaMapSummary(descriptors: readonly FsaDescriptor[]): string {
  const n = descriptors.length;
  if (n === 0) return 'Map shows no neighborhoods with available resources.';
  if (n === 1) return 'Map shows 1 neighborhood with available resources.';
  return `Map shows ${n} neighborhoods with available resources.`;
}
