/**
 * Verification gate — pure function deciding which root screen to render.
 *
 * This is a PURE helper: no Supabase imports, no side effects. The auth
 * provider feeds it the current `(session, isVerified)` pair; it returns
 * a route enum. Tests live in `src/__tests__/verification.test.ts`.
 *
 * Three-layer enforcement (per CLAUDE.md gotcha #8):
 * - UI layer:  this function decides routing
 * - DB layer:  RLS policies on every SELECT require `is_verified = true`
 * - Storage:   bucket RLS requires same
 *
 * If the UI gate is bypassed (e.g., via a deep link or hacked client),
 * the DB and Storage layers still hold. Don't single-point this.
 */

/** Minimal shape we need; satisfies Supabase Session w/o importing it. */
export type GateSession = {
  user: { id: string };
} | null;

export type GateInput = {
  /** null while loading; non-null once getSession resolved. */
  session: GateSession;
  /**
   * `is_verified` from `public.users` for the current session user.
   * - `true`  → user is approved; route to home
   * - `false` → user signed up but admin hasn't approved
   * - `null`  → not yet fetched (still loading the row) OR row missing
   */
  isVerified: boolean | null;
};

export type GateRoute = 'sign-in' | 'wait' | 'home';

/**
 * Decide which root screen the Gate component should render.
 *
 * Defaults conservatively:
 * - No session             → sign-in
 * - Session + is_verified  → home
 * - Anything else          → wait (covers `false` AND `null`)
 *
 * `null` → 'wait' is deliberate: we never optimistically route an unknown
 * verification status to home. Better to show the waiting room for a few
 * extra ms than to flash sensitive UI before the verified flag arrives.
 */
export function routeForGate(input: GateInput): GateRoute {
  if (!input.session) return 'sign-in';
  if (input.isVerified === true) return 'home';
  return 'wait';
}

/**
 * Convenience helper for telemetry / debug: human-readable label for
 * the current gate state.
 */
export function describeGate(input: GateInput): string {
  const route = routeForGate(input);
  if (route === 'sign-in') return 'not signed in';
  if (route === 'wait') {
    if (input.isVerified === false) return 'awaiting admin approval';
    return 'loading verification status';
  }
  return 'verified — home';
}

// ============================================================================
// Cycle 1 — fuller routing including loading + complete-profile states.
// Used by App.tsx Gate component (Loop 14). Pure, testable.
// ============================================================================

export type Cycle1GateInput = {
  /** AuthProvider has not yet resolved getSession() */
  loading: boolean;
  session: GateSession;
  /** Slice of public.users for the current user. null = not yet loaded or row missing. */
  profile: {
    handle: string;
    is_verified: boolean;
  } | null;
};

export type Cycle1GateRoute =
  | 'splash' // booting OR session arrived but profile still hydrating
  | 'sign-in' // no session
  | 'complete-profile' // signup step 3 — handle still 'pending-XXX'
  | 'wait' // profile complete, !is_verified
  | 'home'; // profile complete, is_verified

/** A user whose handle still starts with `pending-` hasn't finished signup. */
export function isProfilePending(handle: string): boolean {
  return handle.startsWith('pending-');
}

/**
 * Decide which root component the Gate should render.
 *
 * Pure function. App.tsx adds a "splashDismissed" UX-only state on top so a
 * fast boot doesn't flash; that's not part of this routing logic.
 *
 * Default-conservative: anything ambiguous routes to 'splash' or 'wait',
 * never to 'home'. We never optimistically expose marketplace UI.
 */
export function decideGateRoute(input: Cycle1GateInput): Cycle1GateRoute {
  if (input.loading) return 'splash';
  if (!input.session) return 'sign-in';
  if (input.profile === null) return 'splash';
  if (isProfilePending(input.profile.handle)) return 'complete-profile';
  if (input.profile.is_verified !== true) return 'wait';
  return 'home';
}
