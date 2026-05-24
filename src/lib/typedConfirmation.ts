/**
 * typedConfirmation — pure helpers for typed-confirmation gating.
 *
 * Background (Alex A-P1-9): WCAG 3.3.4 recommends a "review step" before
 * irreversible high-consequence actions (e.g., cascade-delete of a user's
 * account, posts, and claims). Mutual Mesh's delete-my-account flow used a
 * single-step ConfirmationModal, which is at the lower edge of acceptability
 * given the 7-day Supabase backup window admitted in the modal copy.
 *
 * This module exports a single pure predicate (and a small helper for the
 * prompt copy) so the gating logic is unit-testable without rendering RN.
 *
 * The convention: a user must literally type the supplied phrase (e.g.
 * "DELETE") into a TextField before the destructive button enables. The
 * match is case-sensitive — "delete" does NOT match "DELETE" — because
 * Sky's design intent for this kind of friction is to make muscle memory
 * fail you, not just confirm intent.
 *
 * We deliberately do NOT trim leading/trailing whitespace: a user who hits
 * spacebar accidentally should fail the check and re-read the prompt.
 */

export type TypedConfirmationOptions = {
  /**
   * Strict casing. Default true — "DELETE" only matches "DELETE", not "delete".
   * Setting to false is reserved for future flows where the destructive
   * action is less severe (e.g., archive).
   */
  caseSensitive?: boolean;
};

/**
 * Returns true iff the typed value exactly matches the expected phrase.
 *
 * Examples:
 *   typedConfirmationMatches('DELETE', 'DELETE')                  → true
 *   typedConfirmationMatches('DELETE', 'delete')                  → false (case-sensitive)
 *   typedConfirmationMatches('DELETE', ' DELETE ')                → false (whitespace)
 *   typedConfirmationMatches('DELETE', '')                        → false
 *   typedConfirmationMatches('DELETE', 'DELETE', { caseSensitive: false }) → true
 *   typedConfirmationMatches('DELETE', 'delete', { caseSensitive: false }) → true
 */
export function typedConfirmationMatches(
  expected: string,
  typed: string,
  opts: TypedConfirmationOptions = {},
): boolean {
  const { caseSensitive = true } = opts;
  if (caseSensitive) return typed === expected;
  return typed.toLowerCase() === expected.toLowerCase();
}

/**
 * User-facing prompt for the typed-confirmation field. Kept here (not in the
 * component) so the same copy can be reused by other surfaces (e.g., a
 * future web-side delete flow).
 */
export function typedConfirmationPrompt(expected: string): string {
  return `Type "${expected}" to confirm.`;
}
