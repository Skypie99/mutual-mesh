/**
 * AsyncStorage persistence for HomeScreen's category filter selection.
 *
 * Per Quinn spec AC-5: the active filter set persists across sessions under
 * a single key. We use the array-of-active-categories shape (canonical
 * CATEGORY_VALUES order) so the on-disk JSON stays compact and the empty
 * array intentionally means "show everything" (matches matchesActiveFilter
 * semantics in src/lib/categories.ts).
 *
 * STORAGE KEY: `mutualmesh.feed.categories.v1` (versioned so a future shape
 * change can ignore stale keys instead of crashing).
 *
 * The IO surface (load + save) lives in this module; the pure parse / serialize
 * helpers below are unit-tested in src/__tests__/categoryStorage.test.ts.
 *
 * Defensive defaults (Quinn spec AC-5):
 *   - missing key  → [] (all chips ON = show everything)
 *   - malformed JSON → [] (never crash; never persist corrupted shape back)
 *   - unknown values → filtered out before returning
 *
 * AsyncStorage is intentionally unencrypted per PRIVACY.md S7. Filter
 * preferences are NOT PII; this is acceptable.
 */

import type { ResourceCategory } from '@/types/database';
import { CATEGORY_VALUES, validateCategory } from './categories';

// Lazy-required to keep pure helpers below importable in pure-Jest tests
// without pulling the native AsyncStorage module (jest-expo handles it for
// real component tests but the pure tests run without React Native setup).
type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

function getStorage(): AsyncStorageLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-async-storage/async-storage');
  return (mod.default ?? mod) as AsyncStorageLike;
}

export const FILTER_STORAGE_KEY = 'mutualmesh.feed.categories.v1';

/**
 * Parse a stored JSON string into a defensive list of categories. Returns
 * `[]` ("no filter active → show everything") for any malformed / missing
 * input. Unknown values are silently dropped; duplicates are removed.
 *
 * Pure — no IO. Safe to unit-test with raw strings.
 */
export function parseStoredFilter(jsonString: string | null): ResourceCategory[] {
  if (jsonString === null || jsonString === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<ResourceCategory>();
  for (const value of parsed) {
    if (typeof value !== 'string') continue;
    if (validateCategory(value)) {
      seen.add(value);
    }
  }
  // Emit in canonical CATEGORY_VALUES order for stable round-trips.
  return CATEGORY_VALUES.filter((c) => seen.has(c));
}

/**
 * Serialize a filter set to a stable JSON shape. Always emits in
 * CATEGORY_VALUES order so two stored arrays with the same logical
 * contents are equal at the byte level.
 *
 * Pure — no IO.
 */
export function serializeFilter(filter: readonly ResourceCategory[]): string {
  const seen = new Set<ResourceCategory>(filter);
  const stable = CATEGORY_VALUES.filter((c) => seen.has(c));
  return JSON.stringify(stable);
}

/**
 * Read the persisted filter set from AsyncStorage. Returns `[]` on any
 * error (missing key, IO error, parse failure). Never throws.
 */
export async function loadFilterFromStorage(): Promise<ResourceCategory[]> {
  try {
    const raw = await getStorage().getItem(FILTER_STORAGE_KEY);
    return parseStoredFilter(raw);
  } catch {
    return [];
  }
}

/**
 * Persist the filter set to AsyncStorage. Best-effort — silently swallows
 * IO errors. Returns void for caller simplicity (filter persistence is a
 * UX nicety, not a correctness gate).
 */
export async function saveFilterToStorage(filter: readonly ResourceCategory[]): Promise<void> {
  try {
    await getStorage().setItem(FILTER_STORAGE_KEY, serializeFilter(filter));
  } catch {
    // Intentionally swallowed — see JSDoc.
  }
}
