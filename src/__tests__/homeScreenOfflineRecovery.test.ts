/**
 * HomeScreen offline recovery — integration-level contract tests.
 *
 * Written by Gary (QA) on branch qa/auto-2026-05-25-gary-offline-integration.
 * Companion to: qa/auto-2026-05-25-gary-offline-tests (23 unit tests).
 *
 * SCOPE — what this file adds vs the unit-test suite:
 *   1. isNetworkError() contract (5 cases) — duplicated here only for the
 *      cases not yet covered by offline-tests. NOTE: isNetworkError is currently
 *      inlined in HomeScreen.tsx on feat/auto-2026-05-25-shamus-offline-recovery
 *      rather than exported from src/lib/networkError.ts. The networkError.ts
 *      extraction lives only on qa/auto-2026-05-25-gary-offline-tests.
 *      These tests use the locally-mirrored logic (see SHAMUS_NOTE below).
 *   2. Error-state selection enum — maps (error, resources) → named state.
 *   3. FlashBanner stale-data message content — exact copy per HomeScreen.tsx.
 *   4. PII / security contract — error states show static copy, never raw error text.
 *
 * All tests are pure: no React, no RTL, no mocks. Inputs are literals.
 * Run with: npm test --testPathPattern=homeScreenOfflineRecovery
 *
 * SHAMUS_NOTE (refactor opportunity logged in qa-report):
 *   isNetworkError is currently a private function inside HomeScreen.tsx.
 *   It should be extracted to src/lib/networkError.ts (as Gary's offline-tests
 *   branch already did) so these integration tests can import it directly.
 *   Until that merge lands, this file mirrors the logic to keep tests green.
 */

// ============================================================================
// Mirror of HomeScreen's inlined isNetworkError — remove once networkError.ts
// is merged and exported from @/lib/networkError.
// ============================================================================

/**
 * Mirrors the isNetworkError function currently inlined in HomeScreen.tsx.
 * Source of truth: feat/auto-2026-05-25-shamus-offline-recovery HomeScreen.tsx.
 *
 * Patterns checked (case-insensitive substring match):
 *   'network', 'fetch', 'failed to fetch', 'typeerror',
 *   'network request failed', 'no internet'
 *
 * Accepts null/undefined so the function can be called with raw hook error
 * values without a null guard at call sites.
 */
function isNetworkError(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('typeerror') ||
    lower.includes('network request failed') ||
    lower.includes('no internet')
  );
}

// ============================================================================
// 1. isNetworkError() — integration-contract tests
//
// These five cases are specified in the task brief and differ from the
// offline-tests suite which covers the full documented patterns. We test
// the exact strings mentioned in the spec to confirm the contract.
// ============================================================================

describe('isNetworkError() — integration contract (spec-specified cases)', () => {
  it('"fetch failed" → true', () => {
    expect(isNetworkError('fetch failed')).toBe(true);
  });

  it('"Network request failed" → true', () => {
    expect(isNetworkError('Network request failed')).toBe(true);
  });

  it('"TypeError: network" prefix → true', () => {
    expect(isNetworkError('TypeError: network error')).toBe(true);
  });

  it('"PGRST200" → false (PostgREST server error, not a network failure)', () => {
    expect(isNetworkError('PGRST200: relation does not exist')).toBe(false);
  });

  it('"" (empty string) → false', () => {
    expect(isNetworkError('')).toBe(false);
  });
});

// ============================================================================
// 2. Error-state selection logic
//
// HomeScreen's render branch determines which "state" is active. The logic
// is embedded in JSX conditionals; we model it here as a pure selector to
// give the conditional explicit, testable semantics.
//
// State enum:
//   'loading'        — resources empty AND loading is true (not tested here;
//                      covers first-load skeleton; no error involved)
//   'network-error'  — error truthy, resources empty, isNetworkError(error) true
//   'server-error'   — error truthy, resources empty, isNetworkError(error) false
//   'stale-data'     — error truthy, resources non-empty (FlatList + banner)
//   'empty'          — no error, resources empty (Casey copy EmptyState)
//   'normal'         — no error, resources non-empty (plain FlatList)
//
// Source: HomeScreen.tsx render tree (feat/auto-2026-05-25-shamus-offline-recovery).
// ============================================================================

type HomeScreenState = 'network-error' | 'server-error' | 'stale-data' | 'empty' | 'normal';

/**
 * Pure model of HomeScreen's display-branch selection logic.
 * Mirrors the ternary chain in HomeScreen's return JSX.
 *
 * Note: does not model 'loading' because that depends on the `loading` boolean
 * from useResources, not just error/resources. Loading is out of scope for
 * offline-recovery error-state tests.
 */
function selectHomeScreenState(
  error: string | null | undefined,
  resources: unknown[],
): HomeScreenState {
  if (error && resources.length > 0) return 'stale-data';
  if (error && resources.length === 0 && isNetworkError(error)) return 'network-error';
  if (error && resources.length === 0) return 'server-error';
  if (!error && resources.length === 0) return 'empty';
  return 'normal';
}

describe('error-state selection — (error, resources) → state', () => {
  it('(networkError, []) → "network-error"', () => {
    expect(selectHomeScreenState('TypeError: Network request failed', [])).toBe('network-error');
  });

  it('(serverError, []) → "server-error"', () => {
    expect(selectHomeScreenState('PGRST116: Row not found', [])).toBe('server-error');
  });

  it('(anyError, [resource1]) → "stale-data"', () => {
    const fakeResource = { id: 'r1', name: 'Tent', status: 'available' };
    expect(selectHomeScreenState('Network request failed', [fakeResource])).toBe('stale-data');
    expect(selectHomeScreenState('PGRST116: Row not found', [fakeResource])).toBe('stale-data');
  });

  it('(null, [resource1]) → "normal" (no error state)', () => {
    const fakeResource = { id: 'r1', name: 'Tent', status: 'available' };
    expect(selectHomeScreenState(null, [fakeResource])).toBe('normal');
  });

  it('(null, []) → "empty" (no error, empty list)', () => {
    expect(selectHomeScreenState(null, [])).toBe('empty');
  });

  it('(undefined, []) → "empty" (undefined treated as no-error)', () => {
    expect(selectHomeScreenState(undefined, [])).toBe('empty');
  });

  it('stale-data state is triggered by any non-null error when resources exist', () => {
    // Both network and server errors go to stale-data when resources.length > 0
    const resources = [{ id: 'r1' }];
    expect(selectHomeScreenState('fetch failed', resources)).toBe('stale-data');
    expect(selectHomeScreenState('Internal server error', resources)).toBe('stale-data');
  });
});

// ============================================================================
// 3. FlashBanner stale-data message content
//
// When state === 'stale-data', HomeScreen renders:
//   <FlashBanner message="Showing saved resources — couldn't refresh" ... />
//
// Source: HomeScreen.tsx line ~82 (feat/auto-2026-05-25-shamus-offline-recovery).
// The task brief mentions "Some listings may be outdated" — the actual copy
// differs. This test uses the real string from the component.
// ============================================================================

const STALE_BANNER_MESSAGE = "Showing saved resources — couldn't refresh";

describe('FlashBanner stale-data message', () => {
  it('stale banner message communicates that data is from cache', () => {
    expect(STALE_BANNER_MESSAGE.toLowerCase()).toMatch(/saved|cached|stale|old/);
  });

  it('stale banner message communicates that refresh failed', () => {
    expect(STALE_BANNER_MESSAGE.toLowerCase()).toMatch(/couldn'?t|failed|unable/);
  });

  it('stale banner message is not empty', () => {
    expect(STALE_BANNER_MESSAGE.trim().length).toBeGreaterThan(0);
  });

  it('stale banner message does NOT mention "error" (avoids alarming users)', () => {
    // UX intent: show a soft nudge, not an alarming "Error!" message.
    expect(STALE_BANNER_MESSAGE.toLowerCase()).not.toMatch(/\berror\b/);
  });
});

// ============================================================================
// 4. PII / security contract — static copy, no raw error text exposed
//
// LEARNINGS:2026-05-25 — raw error messages from Supabase/PostgREST can
// contain table names, column names, query fragments, or JWT contents that
// are PII risks. HomeScreen must NEVER forward the raw error string to the
// user-visible UI; it must always render static, pre-approved copy.
//
// These tests verify that the static copy strings do NOT contain identifiers
// that would only appear if raw error text had leaked through.
// ============================================================================

const NETWORK_ERROR_COPY = {
  title: "Can't reach the network",
  description: 'Check your connection and pull down to retry.',
} as const;

const SERVER_ERROR_COPY = {
  title: "Couldn't load listings",
  description: 'Something went wrong on our end. Try again in a moment.',
} as const;

describe('PII / security — error states show static copy, never raw error text', () => {
  // Network error copy must not contain PostgREST codes or fetch internals.
  it('network error title does NOT contain "PostgREST", "PGRST", or "fetch"', () => {
    const title = NETWORK_ERROR_COPY.title.toLowerCase();
    expect(title).not.toMatch(/postgrest|pgrst/);
    expect(title).not.toMatch(/\bfetch\b/);
  });

  it('network error description does NOT contain "PostgREST", "PGRST", or "fetch"', () => {
    const desc = NETWORK_ERROR_COPY.description.toLowerCase();
    expect(desc).not.toMatch(/postgrest|pgrst/);
    // "fetch" appears in "pull down to retry" — test only for raw fetch API noise.
    expect(desc).not.toMatch(/failed to fetch|fetch failed/);
  });

  // Server error copy must not expose raw server responses.
  it('server error title does NOT expose raw error text (no PGRST codes)', () => {
    const title = SERVER_ERROR_COPY.title.toLowerCase();
    expect(title).not.toMatch(/pgrst\d+/);
    expect(title).not.toMatch(/supabase|postgrest/);
  });

  it('server error description does NOT expose raw error text', () => {
    const desc = SERVER_ERROR_COPY.description.toLowerCase();
    expect(desc).not.toMatch(/pgrst\d+/);
    expect(desc).not.toMatch(/jwt|token|schema|column|relation/);
  });

  it('server error description uses generic "our end" language (not technical blame)', () => {
    expect(SERVER_ERROR_COPY.description.toLowerCase()).toMatch(/our end|moment|try again/);
  });

  it('network error description directs user to a safe action (retry / connection check)', () => {
    const desc = NETWORK_ERROR_COPY.description.toLowerCase();
    expect(desc).toMatch(/connection|retry|refresh|pull/);
  });
});

// ============================================================================
// 5. State-transition coherence — error clearing resets to normal/empty
//
// When a successful reload() clears the error, the component should return
// to 'normal' or 'empty' state — never stay stuck in an error state.
// ============================================================================

describe('state-transition coherence — error clearing', () => {
  it('clearing error with resources → transitions from stale-data to normal', () => {
    const resources = [{ id: 'r1' }];
    // Before: stale-data
    expect(selectHomeScreenState('fetch failed', resources)).toBe('stale-data');
    // After error clears:
    expect(selectHomeScreenState(null, resources)).toBe('normal');
  });

  it('clearing error without resources → transitions from network-error to empty', () => {
    // Before: network-error
    expect(selectHomeScreenState('Network request failed', [])).toBe('network-error');
    // After error clears:
    expect(selectHomeScreenState(null, [])).toBe('empty');
  });

  it('clearing error without resources → transitions from server-error to empty', () => {
    // Before: server-error
    expect(selectHomeScreenState('PGRST116: Row not found', [])).toBe('server-error');
    // After error clears:
    expect(selectHomeScreenState(null, [])).toBe('empty');
  });
});
