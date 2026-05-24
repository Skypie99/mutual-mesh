/**
 * Resources API surface — thin wrappers over the Supabase client.
 *
 * All calls return Supabase's standard `{ data, error }` shape. Callers
 * should pipe `error` through `userFacingErrorMessage()` before display.
 *
 * Coverage:
 *   - listResources()          — paginated, filtered to status='available'
 *   - getResourceById(id)      — single fetch for detail screen
 *   - createResource(input)    — INSERT; trigger sets created_at + status
 *   - claimResource(id)        — calls claim_resource RPC (atomic per PRD §3)
 *   - deleteResourceById(id)   — DELETE; RLS enforces posted_by = auth.uid()
 *   - listMyPosts(uid)         — caller's own posts
 *   - listMyClaims(uid)        — caller's claimed (status='reserved')
 *
 * **Hard cap:** every list query uses .limit(500). Cursor pagination is
 * Cycle 7 work — see CLAUDE.md gotcha #6 (AccessMap learned the hard way).
 */

import { supabase } from './supabase';
import type { ResourceCategory, ResourceRow } from '@/types/database';

const LIST_LIMIT = 500;

// ============================================================================
// Read paths
// ============================================================================

/**
 * Fetch up to LIST_LIMIT available resources, newest first.
 * Filtered to status='available' for the marketplace feed.
 */
export async function listResources() {
  return supabase
    .from('resources')
    .select('*')
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
}

/** Single resource by id — for the detail screen. */
export async function getResourceById(id: string) {
  return supabase.from('resources').select('*').eq('id', id).maybeSingle();
}

/** Posts the current user has created (any status). */
export async function listMyPosts(userId: string) {
  return supabase
    .from('resources')
    .select('*')
    .eq('posted_by', userId)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
}

/** Claims the current user has placed (status='reserved'). */
export async function listMyClaims(userId: string) {
  return supabase
    .from('resources')
    .select('*')
    .eq('claimed_by', userId)
    .eq('status', 'reserved')
    .order('status_changed_at', { ascending: false })
    .limit(LIST_LIMIT);
}

// ============================================================================
// Write paths
// ============================================================================

export type CreateResourceInput = {
  name: string;
  description?: string | null;
  pickup_text: string;
  contact_handle: string;
  postal_prefix?: string | null;
  city?: string | null;
  /** Optional photo URL — already uploaded + EXIF-stripped via photos.ts. */
  photo_url?: string | null;
  /** Resource category — defaults to 'other' at the DB level if omitted. */
  category?: ResourceCategory;
};

/**
 * Create a new resource. The trigger sets `created_at`, `status_changed_at`,
 * and defaults `status='available'`. Caller MUST be verified (RLS enforces).
 *
 * Normalizes `undefined` → `null` on nullable columns so the postgrest Insert
 * type accepts it (schema is `string | null`, not `string | null | undefined`).
 */
export async function createResource(input: CreateResourceInput, postedBy: string) {
  return supabase
    .from('resources')
    .insert({
      posted_by: postedBy,
      name: input.name,
      description: input.description ?? null,
      pickup_text: input.pickup_text,
      contact_handle: input.contact_handle,
      postal_prefix: input.postal_prefix ?? null,
      city: input.city ?? null,
      photo_url: input.photo_url ?? null,
      category: input.category,
    })
    .select()
    .single();
}

/**
 * Claim a resource via the atomic RPC (PRD §3 + Steve S5).
 *
 * The RPC:
 *   - locks the row with FOR UPDATE
 *   - rejects self-claim
 *   - rejects double-claim
 *   - flips status to 'reserved' + sets claimed_by + status_changed_at
 *
 * Two clients tapping Claim within milliseconds → exactly one wins.
 */
export async function claimResource(resourceId: string) {
  return supabase.rpc('claim_resource', { resource_id: resourceId });
}

/**
 * Delete a resource. RLS enforces `posted_by = auth.uid()` so callers
 * can only delete their own posts.
 *
 * Storage objects in resource-photos/<userId>/... are NOT auto-cleaned
 * by this — caller's responsibility to also remove the photo via
 * photos.ts deleteResourcePhoto if applicable.
 */
export async function deleteResourceById(id: string) {
  return supabase.from('resources').delete().eq('id', id);
}

// ============================================================================
// Account deletion (delegates to the security-definer RPC for D6 + S5)
// ============================================================================

/**
 * Hard-delete the current user's account. Calls delete_my_account RPC
 * which:
 *   - locks the auth.users row with FOR UPDATE (S5)
 *   - DELETEs all resources posted by the user (cascade)
 *   - NULLs out claims the user had placed on others' resources
 *   - DELETEs from auth.users → cascades to public.users
 *
 * Note: Supabase platform backups retain the data for ~7 days (D6 honest
 * disclosure). The in-app delete confirmation should say so.
 */
export async function deleteMyAccount() {
  return supabase.rpc('delete_my_account');
}

// ============================================================================
// Phase 2 — pickup confirmation + onboarding
// ============================================================================

/**
 * Confirm pickup of a reserved resource. Calls the confirm_pickup RPC
 * which flips status to 'completed' + sets confirmed_at/confirmed_by.
 * Either the poster or claimant can call this (RPC enforces authorization).
 */
export async function confirmPickup(resourceId: string) {
  return supabase.rpc('confirm_pickup', { p_resource_id: resourceId });
}

/**
 * Mark the current user's onboarding as complete. Called once after the
 * user finishes the onboarding tour. The RPC sets onboarding_complete = true
 * on public.users for auth.uid(). Idempotent.
 */
export async function completeOnboarding() {
  return supabase.rpc('complete_onboarding');
}
