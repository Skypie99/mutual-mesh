/**
 * Verification queue — PURE helpers for the AdminVerificationScreen.
 *
 * Pattern inherited from `resourcesRealtime.ts` (LEARNINGS.md):
 * split Supabase channel adapter from merge logic so the merge can be
 * unit-tested without mocking Supabase.
 *
 * Privacy load-bearing (Quinn spec — Cycle 5, Section 5):
 *
 *   The admin sees ONLY these 5 fields per applicant:
 *     - handle
 *     - postal_prefix
 *     - city
 *     - referrer_token_hash (presence-only label, never the raw value)
 *     - created_at
 *
 *   ADDING TO THIS LIST REQUIRES JORDAN + SKY APPROVAL.
 *
 *   In particular: NEVER add email. PRIVACY.md D6 originally listed email;
 *   Quinn's DFS-1 dropped it after Mara/Keo persona review (real-name leak
 *   risk via auth.users.email). Default is data-minimum.
 *
 * Tests live in `src/__tests__/adminQueue.test.ts`.
 */

// ============================================================================
// PRIVACY: this list is load-bearing. Adding to it requires Jordan + Sky
// approval (Constitution Art. 7.6 — admin access to user data). Section 5 of
// the Cycle 5 spec is the source of truth.
// ============================================================================

/**
 * The exact column list passed to `.select()` in the AdminVerificationScreen.
 *
 * @privacy-load-bearing PRIVACY.md §A6 — limits admin query to non-sensitive
 * fields only. Do not add email, phone, full_name, or location columns without
 * Jordan review. Constitution Art. 7.6 governs admin data access.
 */
export const ADMIN_VIEWABLE_USER_FIELDS = [
  'id',
  'handle',
  'postal_prefix',
  'city',
  'referrer_token_hash',
  'created_at',
] as const;

export type AdminViewableField = (typeof ADMIN_VIEWABLE_USER_FIELDS)[number];

/**
 * The shape of a row the admin sees. Deliberately a SUBSET of UserRow — the
 * admin screen never reads is_admin, is_verified, last_active_at, or anything
 * from auth.users (e.g., email).
 */
export type AdminApplicantRow = {
  id: string;
  handle: string;
  postal_prefix: string | null;
  city: string | null;
  /** Presence-only — admin sees a derived label, never the raw bcrypt hash. */
  referrer_token_hash: string | null;
  created_at: string;
};

// ============================================================================
// Filter — which rows belong in the queue
// ============================================================================

/**
 * A user is in the verification queue if and only if their handle is a real
 * one (not the `pending-XXX` placeholder from `handle_new_user`). The
 * `is_verified = false` filter is applied at the query layer; this function
 * is the second layer that drops users still in signup step 3.
 *
 * Pure: takes a handle, returns a boolean.
 */
export function isQueueEligibleHandle(handle: string): boolean {
  return !handle.startsWith('pending-');
}

/**
 * Filter a list of applicant rows to those eligible for the queue.
 *
 * Defense in depth: the Supabase query already filters
 * `.not('handle', 'ilike', 'pending-%')`, but if a future code path forgets
 * the filter, this helper still drops them.
 */
export function filterQueueEligible<T extends { handle: string }>(rows: T[]): T[] {
  return rows.filter((r) => isQueueEligibleHandle(r.handle));
}

// ============================================================================
// Realtime delta merge
// ============================================================================

/** Structural minimum we need to apply deltas. Wider types satisfy. */
export type QueueResource = {
  id: string;
  is_verified?: boolean;
  handle?: string;
  [key: string]: unknown;
};

export type QueueEvent<T extends QueueResource = QueueResource> =
  | { type: 'INSERT'; new: T }
  | { type: 'UPDATE'; new: T; old: { id: string } }
  | { type: 'DELETE'; old: { id: string } };

/**
 * Apply a single realtime delta to the queue list.
 *
 * Rules:
 *   INSERT — add the new row IF it's queue-eligible (not verified, not
 *            still in signup); otherwise no-op.
 *   UPDATE — if the new row is verified (admin approved) or its handle
 *            is now pending-* (extremely unlikely but defensive), REMOVE
 *            it from the queue. Otherwise replace in place if present, or
 *            insert if it just became eligible (e.g., a co-admin demoted
 *            it back to unverified — out of band but covered).
 *   DELETE — remove the row by id (covers `reject_user` cascade).
 *
 * Returns a NEW array reference when state changes; the SAME reference on
 * no-op so React doesn't churn.
 */
export function applyVerificationDelta<T extends QueueResource>(
  state: T[],
  event: QueueEvent<T>,
): T[] {
  switch (event.type) {
    case 'INSERT': {
      // Only add unverified, non-pending users.
      if (event.new.is_verified === true) return state;
      if (typeof event.new.handle === 'string' && !isQueueEligibleHandle(event.new.handle)) {
        return state;
      }
      if (state.some((r) => r.id === event.new.id)) return state;
      return [...state, event.new];
    }
    case 'UPDATE': {
      const isNowVerified = event.new.is_verified === true;
      const isNowPending =
        typeof event.new.handle === 'string' && !isQueueEligibleHandle(event.new.handle);

      // If it leaves the queue, drop it.
      if (isNowVerified || isNowPending) {
        const next = state.filter((r) => r.id !== event.new.id);
        return next.length === state.length ? state : next;
      }
      // Replace in place if present.
      let changed = false;
      const next = state.map((r) => {
        if (r.id === event.new.id) {
          changed = true;
          return event.new;
        }
        return r;
      });
      if (changed) return next;
      // Not present + still eligible → out-of-order arrival; add it.
      return [...state, event.new];
    }
    case 'DELETE': {
      const next = state.filter((r) => r.id !== event.old.id);
      return next.length === state.length ? state : next;
    }
  }
}

// ============================================================================
// Pure formatter — the "what the admin sees" projection
// ============================================================================

/**
 * The 5-field display projection the AdminVerificationScreen renders. The
 * `referredByLabel` is a derived string — NEVER the raw referrer_token_hash.
 */
export type FormattedApplicant = {
  id: string;
  handle: string;
  postalPrefix: string;
  city: string;
  referredByLabel: string;
  /** ISO timestamp passthrough. UI does its own relative-time formatting. */
  createdAt: string;
};

/**
 * Project a raw `users` row into the 5-field display shape.
 *
 * - `referrer_token_hash IS NULL`     → "(none — bypassed)" (admin flag)
 * - `referrer_token_hash IS NOT NULL` → "Valid · single-use"
 *
 * We deliberately do NOT join to invite_tokens to expose the inviter's
 * identity (PRIVACY.md D4 — no identity graph).
 *
 * `null` postal_prefix / city are rendered as `"—"` to keep the grid stable.
 */
export function formatApplicantRow(row: AdminApplicantRow): FormattedApplicant {
  return {
    id: row.id,
    handle: row.handle,
    postalPrefix: row.postal_prefix ?? '—',
    city: row.city ?? '—',
    referredByLabel: row.referrer_token_hash ? 'Valid · single-use' : '(none — bypassed)',
    createdAt: row.created_at,
  };
}

// ============================================================================
// Relative-time formatter (pure; tested with fixed `now`)
// ============================================================================

/**
 * Render a created_at timestamp as a short relative-time string for the queue
 * UX ("3h ago", "2d ago"). Falls back to the date string for >30d.
 *
 * Pure: pass `now` explicitly in tests; default is `Date.now()` at call time.
 */
export function formatRelativeAge(createdAt: string, now: number = Date.now()): string {
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return 'recently';
  const deltaMs = Math.max(0, now - then);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  // Fall back to date string for old rows
  return new Date(then).toISOString().slice(0, 10);
}
