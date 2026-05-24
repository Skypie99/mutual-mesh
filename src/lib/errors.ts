/**
 * Consolidated error-message helpers.
 *
 * Use `errorMessage(e)` in every `catch` block to get a string suitable for
 * showing to the user. Never log the raw error object to the UI — Supabase
 * errors often include internal IDs and URLs we don't want surfaced.
 */

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
    return e.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Friendlier wrapper when surfacing to the user. Falls back to a generic
 * message if the raw error isn't user-safe.
 */
export function userFacingErrorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  const m = errorMessage(e);
  // Don't leak Supabase/Postgres internal codes or URLs to the user.
  if (/PGRST\d+|https?:\/\/|jwt/i.test(m)) return fallback;
  return m;
}
