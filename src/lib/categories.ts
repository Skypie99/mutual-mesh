/**
 * Resource categories — PURE helpers for Phase 2 #6.
 *
 * The category enum is the source of truth for what kinds of resources
 * exist in the marketplace. Five fixed values (per DFS-2):
 *   - food
 *   - hygiene
 *   - baby
 *   - HRT      (uppercase per DFS-1)
 *   - other
 *
 * **Privacy note (DFS-3 / Jordan):** HRT is one of five categories with
 * no special handling. The filter / display path treats HRT IDENTICALLY
 * to every other value so a screen-reader or analytics consumer can't
 * derive Keo's filter intent from category-specific branching. If you
 * need to special-case HRT for any reason, escalate to Jordan first.
 *
 * All helpers in this file are pure — no React, no Supabase, no async,
 * no AsyncStorage. They're unit-tested in src/__tests__/categories.test.ts.
 *
 * Per Quinn's spec AC-1 / AC-3 / AC-4, this module backs:
 *   - The AddResourceScreen single-select picker (5 buttons, one required).
 *   - The HomeScreen multi-select filter chip row (zero or more active).
 *   - The ResourceCard category-tag pill (display label only).
 */

import type { ResourceCategory } from '@/types/database';

// ============================================================================
// The enum surface
// ============================================================================

/**
 * Canonical ordered list of categories. Used to render the picker on
 * AddResource and the filter chip row on Home. Order matches Quinn's
 * spec (food → hygiene → baby → HRT → other) — keep stable; Casey's
 * 90-day metrics expect this exact ordering.
 */
export const CATEGORY_VALUES: readonly ResourceCategory[] = [
  'food',
  'hygiene',
  'baby',
  'HRT',
  'other',
] as const;

/**
 * Display labels — the strings users actually see. Capitalization in
 * display only; storage casing is the lowercase enum value (except HRT,
 * which is uppercase in storage per DFS-1).
 */
export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  food: 'Food',
  hygiene: 'Hygiene',
  baby: 'Baby',
  HRT: 'HRT',
  other: 'Other',
};

/**
 * Short descriptive accessibility hints, used for screen-reader hints
 * on the picker and chip rows. Kept generic — no surveillance language.
 */
export const CATEGORY_DESCRIPTIONS: Record<ResourceCategory, string> = {
  food: 'Food, groceries, pantry items, prepared meals.',
  hygiene: 'Hygiene supplies, toiletries, personal care.',
  baby: 'Baby items: formula, diapers, clothes, gear.',
  HRT: 'Hormone replacement therapy supplies and related medical items.',
  other: 'Anything that does not fit another category.',
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Type-guard: returns true if `input` is one of the five valid category
 * enum values. Use this to filter unknown values that arrive from
 * AsyncStorage, deep links, or future-schema migrations gracefully.
 */
export function validateCategory(input: string): input is ResourceCategory {
  return (CATEGORY_VALUES as readonly string[]).includes(input);
}

// ============================================================================
// Filter logic — purely set membership, no fancy fallthroughs
// ============================================================================

/**
 * Returns true if the given resource category should be visible under
 * the current active-filter set.
 *
 * **Semantics:** an empty `activeFilters` means "no filter active → show
 * everything". This matches the spec's default-on-all behavior and avoids
 * a corner case where a user toggles off every chip and sees nothing
 * unexpectedly. The HomeScreen UI still surfaces a filter-empty
 * EmptyState when no rows pass; this helper just answers per-row
 * visibility.
 *
 * Pure — does not mutate inputs.
 */
export function matchesActiveFilter(
  resourceCategory: ResourceCategory,
  activeFilters: readonly ResourceCategory[],
): boolean {
  if (activeFilters.length === 0) return true;
  return activeFilters.includes(resourceCategory);
}

/**
 * Add or remove a category from the active-filter set. Returns a NEW
 * array (never mutates) so React reference-equality checks fire on
 * actual changes only.
 *
 * Behavior:
 *   - If `category` is in `filters`, returns `filters` minus that value.
 *   - If `category` is not in `filters`, returns `filters` plus that value.
 *
 * The returned array preserves CATEGORY_VALUES ordering for any
 * categories present — keeps the on-disk persistence stable across
 * sessions and makes test assertions less brittle.
 */
export function toggleCategoryInFilter(
  filters: readonly ResourceCategory[],
  category: ResourceCategory,
): ResourceCategory[] {
  const set = new Set<ResourceCategory>(filters);
  if (set.has(category)) {
    set.delete(category);
  } else {
    set.add(category);
  }
  // Re-emit in canonical CATEGORY_VALUES order for stable serialization.
  return CATEGORY_VALUES.filter((c) => set.has(c));
}
