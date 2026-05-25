/**
 * Resources API surface — thin wrappers over the Supabase client.
 *
 * All calls return Supabase's standard `{ data, error }` shape. Callers
 * should pipe `error` through `userFacingErrorMessage()` before display.
 *
 * Coverage:
 *   - listResources(page?)     — cursor-paginated (PAGE_SIZE=20), filtered to status='available'
 *   - getResourceDetail(id)    — SECURITY DEFINER RPC; gates contact_handle per claim status
 *   - createResource(input)    — INSERT; trigger sets created_at + status
 *   - claimResource(id)        — calls claim_resource RPC (atomic per PRD §3)
 *   - deleteResourceById(id)   — DELETE; RLS enforces posted_by = auth.uid()
 *   - listMyPosts(uid)         — caller's own posts
 *   - listMyClaims(uid)        — caller's claimed (status='reserved')
 *
 * **Pagination:** listResources uses PAGE_SIZE=20 with Supabase .range() for
 * cursor pagination. page=0 → rows 0–19, page=1 → rows 20–39, etc. The return
 * shape includes `hasMore` so callers know when to stop requesting more pages.
 * Replaces the former .limit(500) hard cap (Cycle 7 — CLAUDE.md gotcha #6).
 */

import { supabase } from './supabase';
import { userFacingErrorMessage } from './errors';
import type { ResourceCategory } from '@/types/database';

/** Number of resources fetched per page in the marketplace feed. */
export const PAGE_SIZE = 20;

const LIST_LIMIT = 500;

// ============================================================================
// Read paths
// ============================================================================

/**
 * Fetch one page of available resources, newest first.
 * Filtered to status='available' for the marketplace feed.
 *
 * @param page - Zero-based page index. Page 0 → rows 0–19, page 1 → rows 20–39.
 *               Defaults to 0.
 *
 * Returns `{ data, error, hasMore }`:
 *   - `data`    — array of resource rows (may be empty on the last page)
 *   - `error`   — Supabase PostgrestError or null
 *   - `hasMore` — true when exactly PAGE_SIZE rows were returned (another page exists)
 *
 * JORDAN BLOCKING CONDITION 2 (web gate 2026-05-25-jordan-web-gate.md):
 * contact_handle is intentionally excluded from this list query. It must
 * only appear post-claim on the detail view (getResourceDetail() RPC ->
 * ResourceDetailScreen). Never render contact_handle in feed list cards.
 *
 * If you need to add columns here, list them explicitly. Do NOT switch back
 * to select('*').
 */
export async function listResources(page = 0) {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from('resources')
    .select(
      'id, name, description, pickup_text, postal_prefix, city, photo_url, category, status, posted_by, claimed_by, confirmed_at, confirmed_by, created_at, status_changed_at',
    )
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .range(from, to);

  return {
    data: data ?? [],
    error,
    hasMore: (data?.length ?? 0) === PAGE_SIZE,
  };
}

/**
 * Fetch resource detail via the get_resource_detail SECURITY DEFINER RPC.
 *
 * This replaces the removed getResourceById select('*') which returned
 * contact_handle to all verified users regardless of claim status —
 * violating PRIVACY.md row 11 (Jordan BLOCK 2026-05-25).
 *
 * The RPC returns contact_handle ONLY to the poster or claimant; all other
 * callers receive NULL. This is enforced at the server layer, not the client.
 *
 * Returns the first row of the result set (single resource), or null if
 * no resource was found. contact_handle is typed string | null per Jordan
 * Condition B — never narrow to string.
 *
 * Requires migration 014_get_resource_detail_rpc.sql to be applied first.
 * File lives on data/auto-2026-05-25-dana-claim-rpc; Sky applies via dashboard.
 */
export async function getResourceDetail(resourceId: string) {
  const { data, error } = await supabase
    .rpc('get_resource_detail', { p_resource_id: resourceId });
  if (error) return { data: null, error };
  // RPC returns a rows array; first item is our resource (or undefined = not found)
  const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  return { data: row, error: null };
}

/**
 * Fetch only the handle of a user — used by the poster to display the
 * claimant's handle once a resource is reserved.
 *
 * RLS safety: `users_verified_read_others` allows any verified user to read
 * another verified user's row. The claimant must be verified to have claimed
 * (RLS + Gate enforces this), so this read is always permitted for a poster
 * who is also verified. We select ONLY `handle` — no email, no postal data,
 * no is_admin — minimising exposure per Jordan D1/D2 and PRD §6 handle-only
 * reveal policy.
 */
export async function getClaimantHandle(userId: string) {
  return supabase.from('users').select('handle').eq('id', userId).maybeSingle();
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

// ============================================================================
// Profile self-update (AC-6.1)
// ============================================================================

/**
 * Update the authenticated user's handle and/or postal_prefix.
 *
 * AC-6.1. Relies on users_self_update RLS policy (schema.sql:498-503).
 * The protect_admin_flags trigger blocks is_verified/is_admin changes;
 * handle + postal_prefix are freely updatable by the owner.
 *
 * @privacy-note handle is a random adjective-noun display string (not a
 *   real name per PRIVACY.md D1/D2). postal_prefix is 3-char FSA already
 *   in the user's public.users row. No new PII collection.
 */
export async function updateMyProfile(updates: {
  handle?: string;
  postal_prefix?: string;
}): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not signed in.' };
  }

  const { error } = await supabase.from('users').update(updates).eq('id', user.id);

  if (error) {
    return { error: userFacingErrorMessage(error, 'Could not save your profile.') };
  }
  return { error: null };
}
