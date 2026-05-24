/**
 * Pickup-confirmation pure helpers — Phase 2 #7 (Quinn spec).
 *
 * The UI logic for "should the Confirm button appear?" and "what should
 * the label say?" is extracted here so we can table-test it without
 * mounting the screen.
 *
 * Per Quinn DFS-1 (default = role-varying copy): the claimant sees
 * "I picked this up"; the poster sees "They picked it up". The same event,
 * opposite agency — maps to the user's lived perspective.
 *
 * All functions are pure. No React, no Supabase, no async.
 */

import type { ResourceRow } from '@/types/database';

export type PickupConfirmCopy = 'I picked this up' | 'They picked it up';

/**
 * Returns true iff the user can call `confirm_pickup(resource.id)`:
 *
 *   - resource.status MUST be 'reserved' (the only state the RPC accepts)
 *   - userId MUST equal resource.posted_by OR resource.claimed_by
 *
 * Returns false for any other status (available / completed) or for users
 * who are neither party. Mirrors the RPC's authorization check so the UI
 * never offers a button that would 'Not authorized' / 'Not in reserved state'.
 */
export function canConfirm(
  resource: Pick<ResourceRow, 'status' | 'posted_by' | 'claimed_by'>,
  userId: string,
): boolean {
  if (resource.status !== 'reserved') return false;
  if (userId === resource.posted_by) return true;
  if (resource.claimed_by !== null && userId === resource.claimed_by) return true;
  return false;
}

/**
 * Role-aware button label for the Confirm-pickup action.
 *
 *   - claimant view (auth.uid === resource.claimed_by) → "I picked this up"
 *   - poster view   (auth.uid === resource.posted_by)  → "They picked it up"
 *   - everyone else                                     → null (button hidden)
 *
 * If a user is BOTH poster and claimant (impossible in production — the
 * claim RPC rejects self-claim; included only for total-function safety),
 * the claimant copy wins because the act of picking up reflects their
 * lived agency more accurately than the receiving side.
 */
export function getConfirmButtonCopy(
  resource: Pick<ResourceRow, 'status' | 'posted_by' | 'claimed_by'>,
  userId: string,
): PickupConfirmCopy | null {
  if (!canConfirm(resource, userId)) return null;
  if (resource.claimed_by !== null && userId === resource.claimed_by) {
    return 'I picked this up';
  }
  if (userId === resource.posted_by) return 'They picked it up';
  return null;
}

/**
 * Role-aware accessibility hint for the Confirm-pickup action. Mirrors the
 * spec's Alex pre-audit notes:
 *   - claimant: "Marks this as picked up. Confirms the exchange happened."
 *   - poster: "Marks this as picked up. Confirms the claimant came and got it."
 */
export function getConfirmButtonHint(copy: PickupConfirmCopy): string {
  if (copy === 'I picked this up') {
    return 'Marks this as picked up. Confirms the exchange happened.';
  }
  return 'Marks this as picked up. Confirms the claimant came and got it.';
}
