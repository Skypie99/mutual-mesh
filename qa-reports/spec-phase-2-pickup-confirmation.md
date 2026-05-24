# Spec: Phase 2 — Pickup Confirmation Flow — Quinn — 2026-05-24

## Summary

Phase 2 adds a "pickup confirmed" lifecycle stage to `public.resources` so both the poster and the claimant can mark a reserved pickup as completed. Today, claimed resources sit at `status='reserved'` until the 30-day prune cron deletes them (PRIVACY.md D7); there's no way to record that the handoff actually happened. This blocks Casey's #1 growth metric ("successful exchanges per active community per week" — `community/growth-strategy.md`).

The change: extend the existing CHECK constraint to allow `status='completed'`, add two nullable columns (`confirmed_at`, `confirmed_by`) on `public.resources`, ship a single new `confirm_pickup(resource_id)` RPC (security definer; verifies caller is poster OR claimant; one-sided confirmation is sufficient), surface a "Confirm pickup" button on ResourceDetailScreen, and split the ProfileScreen "my claims" list into active vs completed.

**Scope:** schema change (one new value in CHECK + two new columns + index) + one new security-definer RPC + UI on ResourceDetailScreen + UI on ProfileScreen + minimal hook update. **Dana writes** the migration (`supabase/migrations/005_pickup_confirmation.sql`) **and** the RPC; Shamus does the UI; Sky applies via dashboard.

**Estimated effort:** 1.5 build days + 0.5 day audit/test. Two-three PRs across Dana (schema + RPC), Shamus (UI), Steve (RPC + RLS audit), Gary (tests).

**READY but Jordan REVIEW REQUIRED** (privacy-sensitive: lifecycle of a claimed resource is sensitive to Mara/Keo's threat models — see Section "Privacy considerations").

## User story

> _As Mara (claimant), I claimed the formula listing yesterday; today I picked it up. On the resource detail screen, I tap "I picked this up." The listing disappears from my "Active claims" and into my "Completed" section. Casey sees one more successful exchange in this week's metric._

> _As Deb (poster), I posted 12 items; six were claimed. For three of them, the claimant confirmed pickup. For the other three, the claimant didn't confirm — I open each one and tap "They picked it up" myself because I want my catalog to reflect reality. One-sided confirmation is fine; we don't require both parties._

> _As Keo (organizer), I have a reservation for shared HRT supplies. The other person picks them up. I open the listing and tap "They picked it up." The realtime channel removes the row from any other admin/peer's view of the active list. The 30-day prune timer starts from the confirmed time, not from the reservation time._

> _As Mara (anti-goal #4), no one — including admins — sees that I confirmed. Confirmation does not surface to admins; `confirmed_by` is server-side only and only visible to the poster and claimant on the listing they're already party to. Confirmation does not change my profile, does not award a badge, does not become a "reputation score."_

> _As Casey (growth strategy), I can run `SELECT count(*) FROM public.resources WHERE status='completed' AND confirmed_at > now() - INTERVAL '7 days'` to get this week's successful-exchange count without any third-party analytics SDK._

## Personas served

- **Mara (recipient) — primary.** Her anti-goal #4 "anyone — even verification admins — knowing what she's claimed" remains intact: confirmation is between her and the poster, NEVER surfaced to admins. Adding "pickup confirmed" gives her a way to close the loop on her own record (a small dignity signal — "I got what I needed") without exposing her to anyone new.
- **Deb (poster) — primary.** Persona goal #2: "See claims as they come in — she wants to be able to triage if multiple people want the same item." Today there's no closure; tomorrow she can see which claims actually happened. Her "Building 22 Fridge" mental model already has "claimed → picked up → archive"; this matches.
- **Keo (organizer) — primary.** Persona goal #2: "Match excess vs. deficit in real time within their community." Confirmation removes completed items from the active feed faster than the 30-day prune, which means Keo's HRT-sharing network sees a more accurate snapshot of what's currently available.
- **Casey (Community Manager) — primary.** This is the schema basis for the load-bearing growth-strategy metric ("successful exchanges per active community per week"). Without confirmation, that metric is impossible to compute honestly.

## Why now

Expansion plan Tier 2 #7 (`~/.claude/plans/goofy-singing-steele.md` line 60): "Casey's #1 growth metric ('successful exchanges') requires both parties confirm pickup." Sequenced as Phase 2 Stream B because:

1. **Casey's seeding-decision gate.** The 90-day metrics in `community/growth-strategy.md` ("30-60 successful exchanges per week") are unmeasurable today. Until pickup confirmation lands, every seed-community retrospective is qualitative-only. Casey can't say "this community is hitting threshold" or "this community is failing."
2. **PRIVACY.md D7 retention math depends on it.** Today's 30-day prune (`prune_expired_resources()` schema.sql lines 430-449) starts from `status_changed_at` (the reservation moment). Without confirmation, every successful pickup still sits in the DB for 30 days. With confirmation, completed rows get a fresh `confirmed_at` clock and prune cleanly.
3. **Lifecycle UX cleanup.** Riley friction #2 (resource freshness) is partly about "stale claims that never went anywhere." Confirmation lets the feed and the user's profile distinguish "this is in flight" from "this completed".
4. **Low schema risk.** Adds one CHECK value and two nullable columns; no existing query breaks. Migration is straightforward, rollback is clean.

Risk-of-deferral: every week we ship without this, Casey's metric is unmeasurable, and we ship more rows that the 30-day prune deletes in a way that conflates "successful" with "abandoned." Mixing the two pollutes the only signal Casey trusts.

## Acceptance criteria

### AC-1: Schema migration adds `status='completed'`, `confirmed_at`, `confirmed_by`

- A new migration file `supabase/migrations/005_pickup_confirmation.sql` (Dana writes):
  1. Drops + recreates the CHECK constraint on `public.resources.status` to include `'completed'`: `CHECK (status IN ('available','reserved','completed'))`.
  2. Adds `confirmed_at TIMESTAMPTZ NULL` (no default — NULL until confirmed).
  3. Adds `confirmed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL` (mirrors `claimed_by` cascade rule).
  4. Adds an index: `CREATE INDEX IF NOT EXISTS idx_resources_confirmed_at ON public.resources (confirmed_at) WHERE confirmed_at IS NOT NULL;` — partial index supports the prune query and Casey's metric query.
  5. Adds the new RPC `confirm_pickup(resource_id UUID) RETURNS BOOLEAN` (Section 6 of this spec).
  6. Updates `prune_expired_resources()` to also delete `status='completed' AND confirmed_at < now() - INTERVAL '30 days'` (see DFS-3).
- Idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
- Rollback documented at top of file: `DROP FUNCTION public.confirm_pickup; ALTER TABLE public.resources DROP COLUMN confirmed_by; DROP COLUMN confirmed_at; ALTER TABLE public.resources DROP CONSTRAINT resources_status_check; ALTER TABLE public.resources ADD CONSTRAINT resources_status_check CHECK (status IN ('available','reserved'));`.
- **Sky applies via dashboard.**

### AC-2: Only poster OR claimant can call `confirm_pickup`

- The RPC is `SECURITY DEFINER` (so it bypasses RLS to do its own auth check), runs `SELECT posted_by, claimed_by INTO p, c FROM public.resources WHERE id = resource_id FOR UPDATE`, then `IF auth.uid() NOT IN (p, c) THEN RAISE EXCEPTION 'Forbidden'`.
- Non-authenticated callers raise `'Not authenticated'`.
- Authenticated callers who are neither poster nor claimant raise `'Forbidden'`.
- The poster's row check uses `posted_by`; the claimant's row check uses `claimed_by`. If `claimed_by IS NULL` (no one has claimed yet — wrong state), the RPC raises `'Resource is not reserved'`.
- Steve verifies via SQL integration tests (`supabase/__tests__/rls.sql` extension).

### AC-3: One-sided confirmation is sufficient

- A single call to `confirm_pickup(resource_id)` by either the poster or the claimant transitions `status='reserved'` → `status='completed'`, sets `confirmed_at = now()`, sets `confirmed_by = auth.uid()`.
- We do NOT require both parties to confirm. Reasoning (Casey): "asking both parties is a coordination tax that won't get paid; the metric needs to be measurable with one-sided confirmation."
- Second confirmation attempts (from the other party, or accidentally from the same party) return `false` with no error AND do NOT modify the row. The RPC is idempotent at the `status='completed'` state.

### AC-4: Resource must be in `status='reserved'` to be confirmable

- Calling `confirm_pickup` on a row with `status='available'` raises `'Resource is not reserved'` (one of the three valid error messages — see Section 6).
- Calling on a row with `status='completed'` returns `false` silently (idempotent — see AC-3).
- The status check uses `FOR UPDATE` so two simultaneous calls (poster + claimant both tap at once) are serialized; the second is a no-op.

### AC-5: ResourceDetailScreen shows a "Confirm pickup" button conditionally

- The button is visible only when:
  - `auth.uid() === resource.posted_by` OR `auth.uid() === resource.claimed_by`, AND
  - `resource.status === 'reserved'`.
- For all other states (status='available', status='completed', user is neither party), the button is not rendered.
- Button copy varies by role per DFS-1:
  - **Claimant view** (`auth.uid() === resource.claimed_by`): `"I picked this up"`.
  - **Poster view** (`auth.uid() === resource.posted_by`): `"They picked it up"`.
- Tapping the button opens a `ConfirmationModal` (non-destructive variant; reuses `src/components/ConfirmationModal.tsx`). Modal copy:
  - Title: `"Confirm pickup?"`
  - Body: `"This marks the listing as completed. It'll be removed from the active feed."`
  - Confirm label: `"Yes, confirm"`.
  - Cancel: `"Cancel"`.
- On confirm, the RPC fires; on success the screen pops back to the previous screen (HomeScreen or ProfileScreen depending on entry path) and a `FlashBanner` reads `"Pickup confirmed."`.

### AC-6: Realtime updates remove `status='completed'` from the active feed

- The existing `resources-feed` channel (in `src/hooks/useResources.ts`) already publishes UPDATE events on `public.resources` (via `supabase/realtime.sql`). No realtime config change is needed.
- HomeScreen's filter logic excludes `status='completed'` from the visible feed. Today HomeScreen already filters to `status='available'` (or similar); this AC extends that filter (or confirms it covers the new state).
- When a user is on ResourceDetailScreen for a row another party just confirmed, the screen shows a non-destructive notice (`"This pickup was just confirmed."`) and the Confirm button disappears.
- Verified via the manual smoke test on staging (two devices, one taps confirm; the other's screen reflects within ~1 second).

### AC-7: ProfileScreen splits "my claims" into Active and Completed

- ProfileScreen currently shows "My posts" and "My claims." The latter section is split into:
  - **Active claims** — `status IN ('available','reserved')` AND `claimed_by = auth.uid()`. (Available shouldn't appear under "my claims" since you can't claim available rows; this is defense-in-depth.)
  - **Completed** — `status='completed'` AND `claimed_by = auth.uid()` AND `confirmed_at IS NOT NULL` AND `confirmed_at > now() - INTERVAL '30 days'` (pre-prune; after prune the row is gone).
- Each section is collapsible (a small "▾ Completed (3)" header) so a user with many completed pickups doesn't blow out the scroll length.
- The Completed section is OFF (collapsed) by default. Mara persona: doesn't want a list of "things I got" on her profile by default.
- The same split applies to "My posts" (Active + Completed). Reuse the same component pattern.

### AC-8: `prune_expired_resources()` deletes completed rows after 30 days from `confirmed_at`

- The cron job (`schema.sql` lines 430-449) is extended to also delete:
  - `status='completed' AND confirmed_at IS NOT NULL AND confirmed_at < now() - INTERVAL '30 days'`.
- The two existing prune conditions (`reserved` past 30 days from `status_changed_at`; `available` past 30 days from `created_at`) are unchanged.
- This means: a confirmed pickup is visible for 30 days post-confirmation in case of dispute. Then it's hard-deleted along with its photo (Storage cascade is unchanged).
- The `cron_log` row counts the merged delete count; Steve verifies no double-counting (one row, one delete).
- See DFS-3 for the choice of 30 days vs. 0/7/14.

### AC-9: No admin surface for confirmation

- The Cycle 5 AdminVerificationScreen does NOT show pickup confirmations. Admins do not see `confirmed_at`, `confirmed_by`, or `status='completed'` rows on any admin screen. (Cycle 5 spec Section 5 enumerates exactly 5 admin-visible fields; this spec does not add a 6th.)
- Sky can run SQL against `verification_log` and `cron_log` via the Supabase dashboard for Casey's metric — direct DB access, not an admin UI.
- This preserves Mara's anti-goal #4 ("anyone — even verification admins — knowing what she's claimed"): completion is private between the two parties + Sky-via-direct-SQL.

### AC-10: Defensive — `confirmed_by` is server-controlled, not client-supplied

- The RPC signature is `confirm_pickup(resource_id UUID)` — only the resource_id, never a `confirmed_by` parameter from the client. The RPC reads `auth.uid()` and sets `confirmed_by` server-side.
- A malicious client crafting `supabase.rpc('confirm_pickup', { resource_id, confirmed_by: <other_uid> })` is rejected at the function signature level (extra arguments are not accepted; Postgres function signature is strict).
- Steve verifies in the SQL audit.

## Screens / layout

Two screens touched. No new screens.

### State 1: ResourceDetailScreen — Confirm pickup button (claimant view)

```
┌──────────────────────────────────────────┐
│  ←  Resource detail                      │
│                                          │
│  Hypoallergenic formula (Nutramigen)     │
│  [ photo ]                               │
│                                          │
│  Posted by  quiet-otter-1234             │
│  Pickup     M5V · Behind 123 Some St    │
│  Contact    @userhandle (Signal)         │
│                                          │
│  Status     Reserved by you              │  <- StatusPill
│                                          │
│  ┌────────────────────────────────────┐  │
│  │     I picked this up               │  │  <- NEW BUTTON; claimant-side copy
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

### State 2: ResourceDetailScreen — Confirm pickup button (poster view)

```
┌──────────────────────────────────────────┐
│  ←  Resource detail                      │
│                                          │
│  Hypoallergenic formula (Nutramigen)     │
│  [ photo ]                               │
│                                          │
│  Pickup     M5V · Behind 123 Some St    │
│  Status     Reserved                     │
│  Claimed by quiet-fox-5678               │  <- claimant's handle visible to poster
│                                          │
│  ┌────────────────────────────────────┐  │
│  │     They picked it up              │  │  <- NEW BUTTON; poster-side copy
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### State 3: ResourceDetailScreen — confirmed view (read-only)

```
┌──────────────────────────────────────────┐
│  ←  Resource detail                      │
│                                          │
│  Hypoallergenic formula (Nutramigen)     │
│  [ photo ]                               │
│                                          │
│  Status     Completed · May 24           │  <- StatusPill (new variant)
│                                          │
│  (no buttons — this is a closed listing) │
└──────────────────────────────────────────┘
```

### State 4: ProfileScreen — collapsible Completed section

```
┌──────────────────────────────────────────┐
│  Profile                                 │
│                                          │
│  brave-otter-1234                        │
│                                          │
│  My posts (2)                            │
│  ┌─ Active (1) ────────────────────────┐ │
│  │ Formula · Reserved                  │ │
│  └─────────────────────────────────────┘ │
│  ▸ Completed (1)                         │  <- collapsed by default
│                                          │
│  My claims (3)                           │
│  ┌─ Active (1) ────────────────────────┐ │
│  │ Diapers · Reserved by me            │ │
│  └─────────────────────────────────────┘ │
│  ▸ Completed (2)                         │
│                                          │
│  Delete my account                       │
└──────────────────────────────────────────┘
```

### Component reuse map (no new components)

| Used component                           | Where                                                |
| ---------------------------------------- | ---------------------------------------------------- |
| `Button` (primary)                       | "I picked this up" / "They picked it up" CTA         |
| `ConfirmationModal` (non-destructive)    | Final confirm before RPC fires                       |
| `FlashBanner`                            | Post-confirm success toast                           |
| `StatusPill` (extended with `completed`) | Completed variant on detail screen + profile cards   |
| `Card`                                   | Profile screen sub-sections                          |
| `EmptyState`                             | Empty Completed section ("No completed pickups yet") |

No new components are needed. The collapsible "▸ Completed (N)" affordance can be a `Pressable` wrapping a count + chevron — small inline pattern, not a new shared component.

## Data view (Jordan privacy gate — FULL REVIEW REQUIRED)

This section is privacy-load-bearing. Jordan reviews and signs off or sends back. The Constitution Art. 7.6 trigger fires: this touches the lifecycle of marginalized users' resource claims.

### What the new columns store

| Column                                | Source                    | Visibility (RLS scoped to)                                                                                                     |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `public.resources.status='completed'` | Set by RPC                | All verified users (matches existing `resources_verified_read`)                                                                |
| `public.resources.confirmed_at`       | Set by RPC                | Same                                                                                                                           |
| `public.resources.confirmed_by`       | Set by RPC (`auth.uid()`) | Same — but the value is a UUID; resolved to a handle only by client lookup which already exists for `posted_by` / `claimed_by` |

### Mara anti-goal #4 — admin visibility

- **Confirmation does NOT add to the admin view.** Cycle 5 Section 5 enumerates 5 admin-visible fields; this spec adds 0.
- A future admin tool that joined `users.is_admin` against `resources.confirmed_by` would be in violation of PRIVACY.md D6 and Cycle 5's exclusion list; explicitly out of scope (AC-9).
- An admin running a SQL query against the DB via the Supabase dashboard CAN see `confirmed_by`. That's a Supabase-platform fact, not an app-level decision; admins-with-DB-access are a separate threat model (only Sky has DB access today).

### Keo anti-goal #3 — "verified ✓" / reputation creep

- The `confirmed_by` column does NOT power any badge, score, or leaderboard. The Profile screen shows the count of completed claims/posts only to the user themselves; never to other users.
- Casey's growth-strategy metric ("successful exchanges per active community per week") is computed at the COMMUNITY level, never per-user. No leaderboards, no power dynamics.

### Retention

- A completed row is visible for 30 days post-confirmation. Then it's hard-deleted by the prune cron. No "completed archive" retained.
- 30 days is chosen because (a) it matches the existing 30-day retention for `status='reserved'` and `status='available'` (PRIVACY.md D7 + schema.sql lines 442-443), (b) it gives the two parties ~4 weeks to revisit the listing for a dispute (extremely rare in this context but legitimate edge case), (c) it limits the long-tail data exposure.

### Concrete RPC shape (Dana writes; this is a sketch, not the deliverable)

```sql
-- confirm_pickup(resource_id UUID) RETURNS BOOLEAN
-- Either poster or claimant can confirm; one-sided is enough.

CREATE OR REPLACE FUNCTION public.confirm_pickup(resource_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  poster UUID;
  claimant UUID;
  current_status TEXT;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT posted_by, claimed_by, status INTO poster, claimant, current_status
  FROM public.resources WHERE id = resource_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Resource not found'; END IF;
  IF current_status = 'completed' THEN RETURN FALSE; END IF;  -- idempotent
  IF current_status <> 'reserved' THEN RAISE EXCEPTION 'Resource is not reserved'; END IF;
  IF caller NOT IN (poster, claimant) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.resources
    SET status = 'completed',
        confirmed_at = now(),
        confirmed_by = caller,
        status_changed_at = now()
    WHERE id = resource_id;

  RETURN TRUE;
END;
$$;
```

Dana finalizes; the above is illustrative.

## RPC contracts

### `confirm_pickup(resource_id UUID) RETURNS BOOLEAN` (NEW)

**Source:** `supabase/migrations/005_pickup_confirmation.sql` (Dana writes).
**Authorization:** Caller's `auth.uid()` must equal either `resources.posted_by` or `resources.claimed_by`. Raises `'Forbidden'` otherwise. `'Not authenticated'` if `auth.uid()` is NULL.

**Client call:**

```ts
const { data, error } = await supabase.rpc('confirm_pickup', {
  resource_id: resourceId,
});
```

**Response shape:**

- `data: true` on success (state changed reserved → completed).
- `data: false` on idempotent no-op (state was already completed).
- `error: PostgrestError` on failure. Known `error.message` values:
  - `"Not authenticated"` — session expired; route to sign-in.
  - `"Resource not found"` — race with deletion; refresh feed; pop back.
  - `"Resource is not reserved"` — state changed under us (e.g., poster pulled the listing); refresh; pop back.
  - `"Forbidden"` — programming bug or attack; log and pop back.
- Any other error → `userFacingErrorMessage()` ("Couldn't confirm. Please try again.").

**Side effects (atomic in the RPC transaction):**

1. `public.resources.status` flips reserved → completed.
2. `confirmed_at = now()`, `confirmed_by = auth.uid()`, `status_changed_at = now()`.
3. Realtime publishes UPDATE event on `public.resources`; subscribers' filters drop it from the active feed.

### `claim_resource(resource_id)` — UNCHANGED

The existing claim RPC is not modified. It still transitions available → reserved. (DFS-4 considers an "auto-cancel" 7-day expiry on claims; out of scope here.)

### `prune_expired_resources()` — EXTENDED

Adds a third DELETE condition for `status='completed' AND confirmed_at < now() - INTERVAL '30 days'`. See AC-8.

### Error mapping (for `userFacingErrorMessage`)

| `error.message`              | User-facing message                                 | Recovery                    |
| ---------------------------- | --------------------------------------------------- | --------------------------- |
| `"Not authenticated"`        | `"Your session ended. Please sign in again."`       | Sign out + route to SignIn  |
| `"Resource not found"`       | `"This listing was deleted. Going back."`           | Pop to previous screen      |
| `"Resource is not reserved"` | `"This listing is no longer reserved. Going back."` | Pop                         |
| `"Forbidden"`                | `"You're not on this listing. Going back."`         | Pop; log via `console.warn` |
| Network / 5xx                | `"Couldn't reach the server. Try again."`           | Retry button on FlashBanner |
| Anything else                | `"Something went wrong. Please try again."`         | Generic                     |

## Tests (Gary writes)

### Unit tests (pure helpers)

- `src/lib/resourceLifecycle.test.ts` — new pure helper file:
  - `canConfirm(resource, userId)` → boolean. Pure function returning true iff `resource.status === 'reserved' && (resource.posted_by === userId || resource.claimed_by === userId)`. Tested table-driven (status × role permutation).
  - `getConfirmButtonCopy(resource, userId)` → `"I picked this up" | "They picked it up" | null`. Pure formatter for the button label per DFS-1.

### Component tests

- ResourceDetailScreen renders the Confirm button when `status='reserved'` AND user is poster or claimant; hides it otherwise.
- Tapping Confirm opens the ConfirmationModal; cancelling closes it without calling the RPC; confirming calls the RPC (mocked).
- ResourceDetailScreen handles the realtime "another party confirmed" case: button disappears, status pill switches to Completed.
- ProfileScreen renders Active and Completed sub-sections with correct counts; Completed defaults collapsed.
- ProfileScreen's Completed sub-section is hidden when count is 0.

### Integration tests (Steve writes; Gary runs in CI; extends `supabase/__tests__/rls.sql`)

- A poster calling `confirm_pickup` on their own reserved resource transitions it to completed; the next call returns FALSE.
- A claimant calling `confirm_pickup` on their reserved claim succeeds; the next call by the poster returns FALSE (idempotent).
- A third-party verified user calling `confirm_pickup` raises `'Forbidden'`.
- An unauthenticated client raises `'Not authenticated'`.
- Calling on a `status='available'` row raises `'Resource is not reserved'`.
- Calling on a deleted row raises `'Resource not found'`.
- After a successful confirmation, the realtime channel emits an UPDATE event with `status='completed'`.
- The prune cron deletes a completed row aged 31 days; does not delete one aged 29 days.

### Manual smoke test (Sky walks through on staging — Phase 2 sync point)

1. Apply migration 005 via Supabase dashboard; confirm `confirmed_at`, `confirmed_by` columns exist; confirm CHECK includes `completed`; confirm `confirm_pickup` is in `pg_proc`.
2. Two test users on two devices/sims (User A = poster, User B = claimant).
3. A posts a resource; B claims it. Status='reserved'.
4. B taps "I picked this up" → confirmation modal → confirm. FlashBanner reads success. A's HomeScreen no longer shows the listing.
5. B's ProfileScreen shows the resource under "Completed (1)" in claims.
6. Repeat with poster-side confirmation (A confirms instead of B). Same outcome.
7. Run `SELECT count(*) FROM public.resources WHERE status='completed' AND confirmed_at > now() - INTERVAL '7 days'` — Casey's metric query.
8. Wait 31 days (or manually adjust `confirmed_at` to 31 days ago); trigger prune; confirm the row is hard-deleted.

## A11y (Alex pre-audit notes)

- **Button copy that varies by role** (claimant: "I picked this up" vs poster: "They picked it up") must also have a clear `accessibilityHint`:
  - Claimant: `"Marks this as picked up. Confirms the exchange happened."`
  - Poster: `"Marks this as picked up. Confirms the claimant came and got it."`
- **ConfirmationModal**: already audited; uses the non-destructive variant here.
- **FlashBanner**: `accessibilityLiveRegion="polite"` so the success announcement reads once on confirm.
- **ProfileScreen collapsible section**: the chevron + count header has `accessibilityRole="button"`, `accessibilityState={{ expanded }}`, `accessibilityLabel="Completed claims, X items. Double tap to expand."`.
- **Reduced motion**: collapse animation respects `useReducedMotion`; snap with reduced motion.
- **"Completed" StatusPill**: the new variant must hit WCAG 2.2 AA 4.5:1 contrast; Alex picks the muted-green token to avoid celebrating with a saturated color (matches the privacy-first emotional restraint of the rest of the app).
- **Confirm button** doesn't become the only contextually-relevant control once shown — the back chevron must remain focusable. Tab order: back → ... → confirm.

## Performance considerations (Peter pre-notes)

- The partial index `idx_resources_confirmed_at` supports both the prune query (`WHERE status='completed' AND confirmed_at < ...`) and Casey's metric query (`WHERE confirmed_at > ...`) with index-only scans.
- The prune query runs once nightly; performance is non-critical (cron job; up to 5 minutes is fine).
- Casey's metric query may run weekly; at <500 rows the index is overkill, but cheap to maintain.
- Realtime channel cost is unchanged (one channel; new UPDATE events flow through the existing subscription).
- The ProfileScreen split adds one extra client-side filter pass (split active vs completed) per render; negligible at <100 rows.

## Privacy considerations (Jordan pre-audit + sign-off REQUIRED)

This is the section that gates merge.

1. **Confirmation lifecycle does NOT introduce admin visibility.** AC-9 enumerates this; Cycle 5 spec Section 5 caps admin-visible fields at 5; this spec adds 0. Jordan must confirm this remains true after merge.
2. **`confirmed_by` is a server-set UUID, never client-supplied** (AC-10). A malicious client cannot impersonate the other party's confirmation.
3. **One-sided confirmation creates a "did-the-pickup-happen?" honesty surface.** A bad-faith poster could confirm without the pickup ever happening to artificially inflate Casey's metric. Mitigation: Casey owns the metric and validates community-by-community; no public leaderboard exists. Sky tracks via SQL only. This is fine for v1.
4. **30-day retention post-confirmation** preserves the dispute window without becoming an archive. Honest delete preserves Mara's "Delete my account" promise (PRIVACY.md D6/D8); a completed resource also deletes on account deletion (existing cascade rules unchanged).
5. **"Successful exchange" is a community-level metric.** No per-user metric is computed or stored. Casey reports counts; not "Mara had X exchanges."
6. **Realtime channel does not leak completion data to outsiders.** The existing `resources_verified_read` RLS policy gates SELECT to verified users; the realtime channel inherits the same policy.
7. **The button copy difference** ("I picked this up" vs "They picked it up") reveals the role asymmetry to the user, not to others. This is a UX/empathy choice, not a privacy leak.

**Sign-off needed from Jordan and Sky before merge.** Constitution Art. 7.6 applies because this touches the lifecycle of claimed resources for the marginalized-group audience.

## DECISIONS FOR SKY

> Each item below needs Sky's call before this cycle lands. Default behavior in parentheses is what ships if Sky doesn't override.

### DFS-1: Button copy varies by role — or single "Confirm pickup" for both?

The spec's preferred design has two copies ("I picked this up" for claimant; "They picked it up" for poster). Alternative: single shared copy "Confirm pickup" with a screen-reader hint that differs.

**Quinn's proposal:** **Two copies.** Reasoning:

1. They map directly to the user's lived perspective — Mara _did the picking up_; Deb _received the picker-upper_. Same event, opposite agency.
2. They reduce cognitive load (no "wait am I the poster or the claimant?").
3. Cost is one extra conditional in `getConfirmButtonCopy` (already pure-tested per Section 7).
4. Translation cost in Phase 3 #19 is the same — both strings get translated.

- [ ] Approve role-varying copy (default)
- [ ] Edit — single "Confirm pickup" copy

### DFS-2: One-sided vs two-sided confirmation

The spec uses one-sided (AC-3). Alternative: require both parties to confirm before status flips to completed.

**Quinn's proposal:** **One-sided is sufficient.** Reasoning:

1. Casey's metric needs to be measurable; two-sided creates a coordination tax that won't get paid in practice.
2. Bad-faith confirmation by one party is mitigated by the absence of a leaderboard or per-user metric (see Section "Privacy considerations" #3).
3. Two-sided would require a `confirmed_by_poster` + `confirmed_by_claimant` schema, double the buttons, double the realtime events; cost-benefit doesn't favor it.
4. If a v2 use case emerges where two-sided confirmation is needed (e.g., to certify a high-value exchange), add a separate `verified_completed` boolean later.

- [ ] Approve one-sided (default)
- [ ] Push back — require two-sided

### DFS-3: Retention of completed rows — 30 days, 7 days, or "stay forever for retrospective"?

The spec defaults to 30 days post-confirmation (mirrors existing reserved/available retention).

**Quinn's reasoning for asking:** Casey may want completed exchanges to STAY visible somewhere (an internal "month-in-review" report). But Mara wants honest deletion. Two options:

- **(a)** 30-day delete (default). Pros: matches existing pattern; clean privacy story. Cons: Casey loses the long-tail metric.
- **(b)** 0-day delete (delete immediately on confirmation). Pros: strictest privacy. Cons: loses the dispute window.
- **(c)** Keep `cron_log` of "N completed rows pruned today" so Casey gets the COUNT without keeping the rows. The row is gone; only the bare count survives.

**Quinn's proposal:** **Ship (a) + add (c) as a small extension** to `prune_expired_resources()` — it already writes to `cron_log` (schema.sql line 449), so the count is preserved without the row data.

**Default if Sky says nothing:** ships (a) + (c).

- [ ] Approve 30-day + bare-count log (default)
- [ ] Push back — 0-day immediate delete
- [ ] Edit — keep forever (defer this DFS to a future "retrospective" cycle; do NOT ship completion to staging until decided)

### DFS-4: "No pickup happened" outcome

The spec's silent fallback for "the pickup never happened" is: neither party confirms; the 30-day prune deletes the reserved row on the existing schedule.

**Alternative**: enforce a max-time-window on a claim (e.g., reserved resources auto-cancel after 7 days without confirmation).

**Quinn's proposal:** **Out of scope for this cycle.** Reasoning:

1. The 30-day prune already handles the abandoned case.
2. Auto-cancel introduces a third RPC (`auto_unclaim_resource`) and surfaces UI complexity ("your claim expires in 3 days").
3. Casey's growth strategy treats abandoned claims as a measurable failure mode; auto-cancel obscures the signal.
4. If a community asks for it after 90 days, ship as a follow-up.

- [ ] Approve "out of scope; 30-day prune handles it" (default)
- [ ] Push back — add 7-day claim auto-cancel in this cycle (significantly larger scope; revisit timing)

### DFS-5: Should the poster get a notification when the claimant confirms (and vice versa)?

The spec does NOT include any push notification. Phase 3 #16 is the push-notifications cycle.

**Quinn's proposal:** **No notification in this cycle.** Reasoning:

1. Push depends on Phase 3 #16 wiring; out of scope here.
2. In-app FlashBanner-only is acceptable for v1.
3. Mara's anti-goal #3 ("push notifications that show item names on her lock screen") means even when push lands, confirmation notifications must follow strict title-only-no-body rules; that work belongs in #16.

- [ ] Approve no-notification-this-cycle (default)
- [ ] Edit — block this cycle on push wiring (delays Phase 2)

## Out of scope for this cycle

- **Two-sided confirmation** (see DFS-2).
- **Auto-cancel on stale claims** (see DFS-4).
- **Push notification on confirmation** (see DFS-5; sequenced to Phase 3 #16).
- **In-app dispute / "report this didn't happen"** flow: out of scope. The 30-day prune is the dispute window; disputes outside that window are out-of-band conversations (Signal, etc.).
- **Per-user completion metric** ("Mara had X exchanges"): out of scope; would create a reputation surface that violates Keo/Mara anti-goals.
- **Public leaderboard / community rank**: out of scope; explicitly excluded by `community/growth-strategy.md` "No `impact` metrics shared publicly."
- **Admin pickup-confirmation surface** (admin sees "completed" listings): out of scope; AC-9 enumerates.
- **Confirmation badges / icons next to user handles**: out of scope; violates Keo's anti-goal #3.
- **Bulk confirm** (poster confirms 10 pickups at once): out of scope; defer to v2 if Deb requests it after 90-day metric review.
- **Email receipt of confirmation**: out of scope; PRIVACY.md D8 (no third-party SDKs) and no transactional email infra in MVP.

## Definition of done

- All 10 AC pass manually on staging.
- Migration 005 file lands; Sky applies; CHECK + columns + RPC + prune extension verified.
- ResourceDetailScreen + ProfileScreen + StatusPill extended; `resourceLifecycle.test.ts` + component tests + RLS integration tests pass green.
- **Jordan signs off** on the privacy review (full review per Constitution Art. 7.6).
- Alex signs off on screen-reader copy, contrast, focus order.
- Steve signs off on the RPC's `SECURITY DEFINER` auth check + the `FOR UPDATE` race-safety.
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 5 DECISIONS FOR SKY items before merge.
- Will updates `CLAUDE.md` with the new columns/RPC in the Tables/RPCs section.
- Morgan briefing in `qa-reports/phase-2-pickup-confirmation-YYYY-MM-DD.md`.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
