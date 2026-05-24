# Spec: Cycle 5 — Admin Verification UI — Quinn — 2026-05-24

## Summary

Cycle 5 wires the in-app Admin Verification UI on top of the already-shipped `approve_user` / `reject_user` Supabase RPCs. After Cycle 5, any user with `is_admin = true` on their `public.users` row gets a new "Verify" tab that lists unverified applicants, shows the minimum-necessary view of each one (5 fields — see Section 5), and exposes Approve / Reject actions. Non-admin users see no new UI at all. Verification was an SQL-only operation through Cycle 4; Cycle 5 turns it into a UI flow so Casey's Tier-1 seed communities can run their own verification queue without Sky in the loop.

**Scope:** UI + tiny data-layer helper (`src/lib/verificationQueue.ts`) + admin tab in navigation. **Schema is unchanged.** No new tables, no new RPCs, no new migrations. Realtime config (`supabase/realtime.sql`) already publishes `public.users` (Cycle 1 line 20). Three-layer gate (Section 7) is already in place: `users_admin_read_unverified` RLS policy (schema.sql line 524-530), `approve_user` / `reject_user` admin-only check (lines 305-360), `protect_admin_flags` trigger blocks direct UPDATE on `is_verified` (line 226).

**Estimated effort:** 1 build day + 0.5 hardening day. ~3-4 PRs across Shamus, Steve (RLS verification), Alex (a11y), Gary (tests).

**READY.** PRIVACY.md is APPROVED + locked; the data-minimum rule (Section 5) flows directly from Jordan D6 + Mara's persona anti-goal "anyone — even verification admins — knowing what she's claimed."

## User story

> _As a community-appointed verification admin, I can open a "Verify" tab in the app, see a list of unverified applicants from my community, view only the four fields I need to make a decision (handle, postal prefix, city, referred-by status, signup date), and approve or reject each one with a single tap — without ever seeing the applicant's email, IP, resource history, or anything else._

> _As a rejecting admin, I can record a short reason for the rejection so Sky can audit patterns in `verification_log` later — the applicant's `auth.users` row is deleted immediately on reject, so I will not see them again._

> _As an admin verifying alongside other admins, if a co-admin handles the same applicant first, the queue updates in realtime and I am not given a stale row to act on._

> _As a non-admin verified user, I see no admin tab; I have no way to enumerate the unverified queue; my RLS access to other unverified users' rows returns zero rows._

## Personas served

- **Casey's Tier-1 partner-network admin** (the primary target): a community-appointed verification admin running the queue for a postpartum-support / harm-reduction / community-fridge / tenant-union network. Needs the queue to be fast, low-cognitive-load, and explainable to their community (Casey: "Offer a verification-admin role to someone in their network. Not an outsider. Not Casey.").
- **Mara (recipient)**, indirectly: her anti-goal #4 — "anyone — even verification admins — knowing what she's claimed" — is the load-bearing constraint that produces Section 5's exclusion list. The admin sees nothing about her past resources, photos, claims, or contacts.
- **Keo (trans organizer)**, indirectly: their anti-goal "'verified ✓' badge that becomes a target / makes them findable" plus "state actors in threat model" means the verification record must NOT be displayed back in the marketplace next to the user's handle (already true; this spec MUST NOT regress it).
- **Deb (poster)**, indirectly: Deb may be the community-fridge admin in her building's network — the queue UX should feel like the tenant-union triage spreadsheets she's used to, not like a corporate dashboard.

## Why now

Per `community/growth-strategy.md` and the expansion plan (`~/.claude/plans/goofy-singing-steele.md` Tier 1 Feature #1), Admin Verification UI is the single feature blocking Tier-1 community seeding. Casey's seeding mechanic is:

1. Talk to a partner network (Signal/Telegram-coordinated mutual-aid group).
2. Offer a verification-admin role to **someone in their network**, vetted by them.
3. That person — not Sky, not Casey — runs the verification queue from their phone.

Step 3 is impossible today. Verification is SQL-only. The RPCs exist (Cycle 1, shipped 2026-05-23), but no user-facing surface invokes them. Until Cycle 5 lands, Sky is in the critical path for every new user across every seed community. That doesn't scale past one community, and it violates the "their member, vetted by them, not us" principle that makes the trust model work.

The growth-strategy 90-day target — **2-3 seeded communities, 100-300 verified users, verification queue median <24h** — is impossible without this. Cycle 5 is therefore launch-critical and the highest-priority feature in Phase 1 (Days 1-10 of the expansion plan).

## Acceptance criteria

### AC-1: Admin tab visibility is gated by `is_admin = true` (UI layer)

- Given a verified user with `profile.is_admin === false`,
- When they open the app and the RootNavigator renders,
- Then no "Verify" tab is present in the bottom tabs and no deep-link route renders the AdminVerificationScreen.

- Given a verified user with `profile.is_admin === true`,
- Then a "Verify" tab is added between "Home" and "Profile" in the bottom tabs with a numeric badge showing the current unverified-queue count (badge omitted when count is 0).

### AC-2: Admin tab visibility is gated by RLS at the DB layer (defense in depth)

- The `users_admin_read_unverified` RLS policy (schema.sql line 524-530) is the single source of truth for "who can read unverified users' rows." This spec MUST NOT introduce a service-role bypass on the client.
- Given a verified-but-non-admin user manually crafts a Supabase query against `public.users WHERE is_verified = false`,
- Then PostgREST returns zero rows (RLS-filtered). Verified in Steve's RLS test pass.

### AC-3: Queue list view

- The "Verify" tab opens to an AdminVerificationScreen showing a paginated FlatList of unverified applicants.
- Query: `supabase.from('users').select('id, handle, postal_prefix, city, referrer_token_hash, created_at').eq('is_verified', false).order('created_at', { ascending: true }).limit(500)` (oldest first — FIFO queue; .limit(500) per CLAUDE.md gotcha #6).
- The query MUST NOT select `is_admin`, `last_active_at`, or any auth-side field (email lives on `auth.users`, not `public.users`, and admin must not see it — see Section 5 + DECISIONS FOR SKY DFS-1).
- Each row renders as a Card (reuses `src/components/Card.tsx`) showing the 5 admin-visible fields (Section 5) and an "Open" affordance (tap-to-detail).

### AC-4: Empty-queue state

- When the queue returns zero rows, the screen renders the existing `EmptyState` component (reuses `src/components/EmptyState.tsx`) with copy:
  - Title: `"No one is waiting."`
  - Description: `"When a new person signs up, they'll appear here for you to verify."`
  - No CTA button.
- The empty state has `accessibilityLiveRegion="polite"` so screen readers announce the transition when the queue empties mid-session.

### AC-5: Detail view — Approve / Reject actions

- Tapping a Card pushes an AdminApplicantDetailScreen showing the same 5 fields larger, plus two buttons:
  - **Approve** — `Button` primary variant; label `"Approve"`; accessibilityHint `"Approves this person. They will be able to use the marketplace."`. Tapping opens a ConfirmationModal (non-destructive variant).
  - **Reject** — `Button` danger variant (destructive); label `"Reject"`; accessibilityHint `"Rejects this person. Their account will be deleted."`. Tapping opens a screen-section (NOT a modal — needs a TextField) with a required `reason` TextField (1-280 chars) plus a final ConfirmationModal (destructive variant) before commit.
- Both actions call the existing RPCs via a thin helper in `src/lib/verificationQueue.ts` (Section 6).
- On success, the screen pops back to the queue list and a FlashBanner announces the result (`"Approved <handle>."` / `"Rejected. Account deleted."`).

### AC-6: Rejection requires a non-empty reason

- The reject form's commit button is disabled until `reason.trim().length >= 1` (and visibly disabled — `disabled` prop on `Button`).
- Reason text is sanitized + length-capped client-side at 280 chars (matches the `verification_log.reason CHECK (length(reason) <= 280)` constraint at schema.sql line 97).
- The reason is passed straight through to `reject_user(applicant_id, reason)`. The RPC inserts it into `verification_log.reason` before deleting the user (schema.sql lines 352-356).
- **Important:** The applicant is NOT shown the rejection reason. The reason is stored only in `verification_log`, which is Sky-only readable (RLS policy `verification_log_sky_select` at schema.sql line 552). DFS-2 covers whether to ever surface it back.

### AC-7: Audit log is written by the RPC, not the client

- The client MUST NOT INSERT into `verification_log` directly. `verification_log` has no client-facing INSERT policy (schema.sql lines 549-557, "No INSERT/UPDATE/DELETE policies → only security-definer RPCs write rows"). All audit writes happen inside `approve_user` / `reject_user`.
- After a successful approve, the row in `verification_log` is `(applicant_id, admin_id = auth.uid(), decision = 'approve', reason = NULL, decided_at = now())` (schema.sql lines 325-326).
- After a successful reject, the row is `(applicant_id, admin_id, decision = 'reject', reason = <admin's text>, decided_at = now())` (lines 352-353).
- Steve verifies via a SQL integration test that `verification_log` rows are written exactly once per RPC call and never directly by the client.

### AC-8: Realtime updates — co-admin handoff

- The AdminVerificationScreen subscribes to `public.users` realtime changes (the publication already includes `public.users` per `supabase/realtime.sql` line 20).
- When another admin approves or rejects an applicant, the row either flips `is_verified` to `true` (approve) or is deleted (reject). Either change MUST cause the local FlatList to remove that row within ~1 second.
- The mounted-ref pattern (CLAUDE.md gotcha #5) is applied to the subscription handler so navigation mid-update doesn't setState on an unmounted screen.
- If the admin is on the AdminApplicantDetailScreen for an applicant another admin just handled, the detail screen displays a non-destructive notice ("Another admin handled this person.") and a single "Back to queue" button. The Approve/Reject buttons disappear.
- Realtime channel is cancelled on unmount (mounted-ref pattern + explicit `channel.unsubscribe()` per CLAUDE.md gotcha #5 + Peter's AccessMap pattern).

### AC-9: Three-layer enforcement (matches the marketplace gate)

This is a privacy-load-bearing constraint and the architecture mirrors the `is_verified` gate documented in CLAUDE.md gotcha #8:

| Layer       | What enforces it                                                                                                          | What happens if breached |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| UI          | RootNavigator hides the "Verify" tab when `profile.is_admin === false`                                                    | Other two layers reject  |
| DB SELECT   | `users_admin_read_unverified` RLS policy gates reads of unverified rows on `is_admin = true`                              | Query returns zero rows  |
| DB MUTATION | `approve_user` / `reject_user` RPCs hard-check `is_admin` before performing any work (schema.sql lines 316-319 + 346-349) | RPC raises `'Forbidden'` |

If any one layer fails (UI bypass, JWT spoof, manual RPC invocation), the other two hold.

### AC-10: No spillover into other user data

- The AdminVerificationScreen MUST NOT query `public.resources`, `public.invite_tokens`, `auth.users` (no access anyway), or any other table.
- A failed query that triggers an error MUST run through `userFacingErrorMessage()` from `src/lib/errors.ts` so JWT/URL/Postgrest internals never reach screen text.

## Screens / layout

Two states. No new component invention — everything reuses existing primitives.

### State 1: AdminVerificationScreen (queue list view)

```
┌──────────────────────────────────────────┐
│  Verify                                  │   <- screen title (NativeWind h1 token)
│  3 people waiting                        │   <- count subtext; hidden when 0
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ brave-otter-1234                   │  │   <- Card component
│  │ M5V · Toronto · Invite valid       │  │      (handle / FSA · city · invite status)
│  │ Signed up 2 days ago               │  │      (relative timestamp)
│  │                              Open →│  │      (chevron / accessibility hint)
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ quiet-bear-5678                    │  │
│  │ M4W · Toronto · Invite valid       │  │
│  │ Signed up 1 day ago                │  │
│  │                              Open →│  │
│  └────────────────────────────────────┘  │
│  ...                                     │
└──────────────────────────────────────────┘
```

When empty:

```
┌──────────────────────────────────────────┐
│  Verify                                  │
│                                          │
│         No one is waiting.               │   <- EmptyState component
│   When a new person signs up, they'll    │
│         appear here for you to verify.   │
│                                          │
└──────────────────────────────────────────┘
```

### State 2: AdminApplicantDetailScreen (detail-view-with-actions)

```
┌──────────────────────────────────────────┐
│  ←  Verify                               │   <- back chevron + screen title
│                                          │
│  brave-otter-1234                        │   <- large handle display
│                                          │
│  Postal prefix     M5V                   │   <- 5-field grid
│  City              Toronto               │
│  Invite status     Valid · single-use    │
│  Signed up         May 22, 2026          │
│  Referred by       (anonymous)           │   <- never a name; "(anonymous)" copy
│                                          │
│  ┌─────────────┐  ┌─────────────┐       │
│  │   Approve   │  │   Reject    │       │   <- Button (primary) + Button (danger)
│  └─────────────┘  └─────────────┘       │
└──────────────────────────────────────────┘
```

When the admin taps **Reject**, the detail view reveals an inline reason input (no modal — modals can't host a TextField cleanly):

```
┌──────────────────────────────────────────┐
│  ...                                     │
│  Reject this person                      │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Reason (required)                  │  │   <- TextField with maxLength=280
│  │                                    │  │      multiline; counter "23/280"
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  This will permanently delete the        │   <- destructive disclosure
│  account. The person will not be told    │
│  the reason. (DFS-2)                     │
│                                          │
│  ┌─────────────┐  ┌─────────────┐       │
│  │   Cancel    │  │   Reject    │       │   <- Reject opens ConfirmationModal
│  └─────────────┘  └─────────────┘       │
└──────────────────────────────────────────┘
```

ConfirmationModal (destructive variant, already exists in `src/components/ConfirmationModal.tsx`) is the final confirm.

### Component reuse map (no new components)

| Used component                                      | Where                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `Card`                                              | Queue list rows                                                      |
| `Button` (primary + danger variants)                | Approve / Reject / Cancel                                            |
| `StatusPill`                                        | Optional: invite-status pill ("Valid" / "Used")                      |
| `EmptyState`                                        | Empty-queue state                                                    |
| `ConfirmationModal` (destructive + non-destructive) | Approve confirm + final reject confirm                               |
| `TextField`                                         | Rejection reason input                                               |
| `FlashBanner`                                       | Post-action success announcement                                     |
| `LoadingSkeleton`                                   | Queue-loading placeholder (per `src/components/LoadingSkeleton.tsx`) |

No new components are needed. If a need emerges during build, Shamus surfaces it to Dani via a `qa-reports/feature-*.md` proposal first (per CLAUDE.md role-lane rule).

## Data view (Jordan privacy gate)

This section is privacy-load-bearing. It MUST be reviewed by Jordan before merge (Constitution Art. 7.6: admin access to user data).

### What the admin sees (5 fields, all from `public.users`)

| #   | Field              | Source                                          | Why admin needs it                                                                |
| --- | ------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `handle`           | `public.users.handle`                           | Identifies which applicant the admin is acting on; the only persistent identity   |
| 2   | `postal_prefix`    | `public.users.postal_prefix`                    | Verifies the applicant is in the admin's community catchment (PRIVACY.md D3)      |
| 3   | `city`             | `public.users.city`                             | Disambiguates postal prefixes near borders (Sky's Q2 answer 2026-05-23)           |
| 4   | Referred-by status | Derived from `public.users.referrer_token_hash` | "Valid · single-use" or "(none — bypassed)" — confirms invite mechanism (D4 + S1) |
| 5   | `created_at`       | `public.users.created_at`                       | Tells the admin how long this person has been waiting (queue-health UX)           |

The "Referred-by status" derivation does NOT expose the inviter's identity (D4). It is a string label only:

- If `referrer_token_hash IS NULL` → `"(none — bypassed)"` (flag for admin attention)
- If `referrer_token_hash IS NOT NULL` → `"Valid · single-use"`

We do NOT join to `invite_tokens` to show which token / who created it; that would be the identity graph Jordan deliberately broke (D4).

### What the admin does NOT see (~15 fields)

Explicit exclusion list, sourced from PRIVACY.md inventory + Mara/Keo anti-goals:

| #   | Field                                                 | Source                                   | Why admin must NOT see                                                                                                           |
| --- | ----------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `auth.users.email`                                    | Supabase auth schema                     | PRIVACY.md D6 ("admins see only what's needed to decide"); auth schema is unreachable from PostgREST without service-role anyway |
| 2   | Password / password hash                              | `auth.users.encrypted_password`          | No legitimate use; auth schema unreachable                                                                                       |
| 3   | IP address                                            | Supabase `auth.audit_log_entries`        | PRIVACY.md §9 — "We do not query this table from the app"                                                                        |
| 4   | Device info / user-agent                              | Supabase platform                        | Same                                                                                                                             |
| 5   | `is_admin` (of OTHER applicants)                      | `public.users.is_admin`                  | Applicants never become admins automatically; surface adds no value                                                              |
| 6   | `last_active_at`                                      | `public.users.last_active_at`            | Not needed for verify decision; reveals usage pattern                                                                            |
| 7   | The plaintext invite token                            | Never stored; only `referrer_token_hash` | Not retrievable; reverse-impossible (D4 + S1)                                                                                    |
| 8   | The inviter's identity (`invite_tokens.created_by`)   | `public.invite_tokens`                   | D4 — no identity graph; client has no RLS access to `invite_tokens`                                                              |
| 9   | Resource history (what they've posted)                | `public.resources`                       | Mara persona anti-goal #4; admin queries `users`, not `resources`                                                                |
| 10  | Claim history (what they've claimed)                  | `public.resources.claimed_by`            | Same                                                                                                                             |
| 11  | Resource photos                                       | Storage `resource-photos`                | Storage RLS only allows verified users to fetch signed URLs                                                                      |
| 12  | Per-resource contact handles                          | `public.resources.contact_handle`        | Same                                                                                                                             |
| 13  | Pickup-text content                                   | `public.resources.pickup_text`           | Same                                                                                                                             |
| 14  | Other admins' notes / decisions on the same applicant | `public.verification_log`                | Sky-only SELECT (RLS); per PRIVACY.md D6, no admin-to-admin notes                                                                |
| 15  | Anything from `auth.audit_log_entries`                | Supabase auth schema                     | Out of scope; not queried                                                                                                        |

### Concrete query

The ONLY query the admin screen runs against user data is:

```ts
const { data, error } = await supabase
  .from('users')
  .select('id, handle, postal_prefix, city, referrer_token_hash, created_at')
  .eq('is_verified', false)
  .order('created_at', { ascending: true })
  .limit(500);
```

`select('*')` is **forbidden** in this file. The explicit column list is the load-bearing privacy guarantee. Steve verifies in code review. Gary adds a lint-style assertion if practical (DFS-3).

## RPC contracts

Both RPCs exist and are tested (schema.sql lines 303-360). This section documents the exact contract Shamus consumes; it does NOT propose changes.

### `approve_user(applicant_id UUID) RETURNS BOOLEAN`

**Source:** `supabase/schema.sql` lines 303-330.
**Authorization:** Caller's `auth.uid()` row in `public.users` must have `is_admin = true`. Raises `'Forbidden: caller is not an admin'` otherwise (line 318). Raises `'Not authenticated'` if `auth.uid()` is NULL (line 314).

**Client call:**

```ts
const { data, error } = await supabase.rpc('approve_user', {
  applicant_id: applicantId,
});
```

**Response shape:**

- `data: true` on success.
- `error: PostgrestError` on failure. The two known error.message values:
  - `"Not authenticated"` — session expired; route to sign-in.
  - `"Forbidden: caller is not an admin"` — race with admin demotion; refresh `profile.is_admin` and pop back to home.
- Any other error → `userFacingErrorMessage()` from `errors.ts` ("Couldn't approve. Please try again.").

**Side effects (atomic within the RPC transaction):**

1. `public.users.is_verified` flips from `false` → `true` for the row matching `applicant_id` (line 321-323).
2. A new row is inserted into `public.verification_log` with `decision = 'approve'`, `admin_id = auth.uid()`, `reason = NULL` (lines 325-326).
3. Realtime publishes the `UPDATE` event on `public.users`; co-admins' subscriptions filter it out of their queue.

### `reject_user(applicant_id UUID, reason TEXT DEFAULT NULL) RETURNS BOOLEAN`

**Source:** `supabase/schema.sql` lines 333-360.
**Authorization:** Identical to `approve_user`.

**Client call:**

```ts
const { data, error } = await supabase.rpc('reject_user', {
  applicant_id: applicantId,
  reason: reasonText, // required from UI (AC-6), but the RPC signature allows NULL
});
```

**Response shape:** Same as `approve_user` (returns `true` on success; PostgrestError on failure).

**Side effects (atomic within the RPC transaction):**

1. A row is inserted into `public.verification_log` BEFORE the delete (line 352-353) — this is intentional so the applicant_id FK still resolves.
2. `auth.users WHERE id = applicant_id` is DELETED (line 356), which cascades to `public.users` (FK `ON DELETE CASCADE` per schema.sql line 47) and any orphan rows.
3. Realtime publishes a `DELETE` event on `public.users`; co-admins' subscriptions remove the row from their queue.

**Important:** Rejection is destructive and irreversible from the client. The 7-day Supabase PITR window is the only recovery path (PRIVACY.md "Backups (honest disclosure)"). The admin must confirm via ConfirmationModal (destructive variant) before the RPC fires (AC-5 + AC-6).

### Error mapping (for `userFacingErrorMessage` consumption)

| `error.message`                       | User-facing message                            | Recovery                             |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `"Not authenticated"`                 | `"Your session ended. Please sign in again."`  | Sign out + route to SignIn           |
| `"Forbidden: caller is not an admin"` | `"Admin access is required. Pull to refresh."` | Refresh profile; if still false, pop |
| Network / 5xx                         | `"Couldn't reach the server. Try again."`      | Retry button on FlashBanner          |
| Anything else                         | `"Something went wrong. Please try again."`    | Generic                              |

## Tests (Gary writes)

### Unit tests (pure helpers in `src/lib/verificationQueue.ts`)

The helper file should expose two pure functions (per CLAUDE.md gotcha #4 — pure helpers, testable without mocking Supabase):

- `applyVerificationDelta(state, event)` — pure merge function for the realtime subscription. Takes the current applicant list + a Supabase realtime payload, returns the new list. Tested independently of Supabase. Mirror of `applyResourceDelta` in `resourcesRealtime.ts`.
- `formatApplicantRow(row)` — pure formatter that turns a `users` SELECT row into the 5-field display object the Card consumes. Strips/derives the referred-by status string. Tested with table-driven inputs.

Each helper gets its own `*.test.ts` file in `src/__tests__/`.

### Component tests

- AdminVerificationScreen renders the EmptyState when the queue is empty.
- AdminVerificationScreen renders Cards for each applicant, in `created_at ASC` order.
- AdminApplicantDetailScreen shows exactly the 5 fields enumerated in Section 5 — and does NOT render any other field even if the row contains it (defense against future schema additions).
- The "Verify" tab is NOT rendered in RootNavigator when `profile.is_admin === false`.
- The reject form's Reject button is `disabled` until `reason.trim().length >= 1`.

### Integration tests (RLS — Steve writes; Gary runs in CI)

These extend the existing `supabase/__tests__/rls.sql` file:

- **A non-admin verified user's SELECT on `public.users WHERE is_verified = false` returns zero rows.** (Direct RLS check on `users_admin_read_unverified`.)
- **A non-admin verified user calling `approve_user` raises `'Forbidden'`.**
- **A non-admin verified user calling `reject_user` raises `'Forbidden'`.**
- **An unauthenticated client calling either RPC raises `'Not authenticated'`.**
- **After a successful `approve_user` call, exactly one row appears in `verification_log` with `decision = 'approve'` and `admin_id = caller`.**
- **After a successful `reject_user` call, exactly one row appears in `verification_log` with `decision = 'reject'` AND the applicant row in `public.users` is gone.**
- **The client cannot INSERT into `verification_log` directly** (no INSERT policy; PostgREST returns 401/permission-denied).

### Manual smoke test (Sky walks through on staging — Phase 1 sync point)

1. Sign in as `is_admin = true` user; confirm "Verify" tab appears with badge.
2. Sign in as non-admin verified user; confirm no "Verify" tab and no admin route.
3. Approve a test applicant; confirm they appear in `public.users` with `is_verified = true` and `verification_log` has a new approve row.
4. Reject a test applicant with a reason; confirm `auth.users` row is gone, `public.users` row is gone (CASCADE), `verification_log` has a new reject row with the reason.
5. Two admins log in concurrently on staging; one approves; confirm the row disappears from the other's queue within ~1 second.

## A11y (Alex pre-audit notes — Cycle 5 build)

- **Tab badge** ("3 people waiting"): the numeric badge MUST also be announced as text — set `accessibilityLabel` on the tab to `"Verify, 3 people waiting"` so screen readers convey the count.
- **Queue list**: each Card uses the existing `accessibilityLabel` pattern (`"<handle>, <postal_prefix>, <city>, signed up <relative time>"`). The "Open" affordance is implicit in the Card's pressable role.
- **Detail screen**: the 5-field grid uses `accessibilityRole="text"` on each label-value pair. The Approve/Reject buttons inherit their accessibility from the Button component (already audited).
- **Destructive disclosure**: the "This will permanently delete the account" copy is wrapped in `accessibilityRole="alert"` so the screen reader announces it when the reject form expands.
- **Realtime row removal**: when a co-admin handles a row mid-queue, announce via `AccessibilityInfo.announceForAccessibility("An applicant was handled by another admin and removed from the list.")` exactly once (mounted-ref guard).
- **Reduced motion**: list-removal animation (if any) respects `useReducedMotion` from `src/lib/useReducedMotion.ts`. Default is a fade; with reduced motion, snap.
- **Color contrast**: the danger-variant Button (Reject) must hit WCAG 2.2 AA 4.5:1 against its background. Already verified in Alex's a11y-tokens audit.

## Performance considerations (Peter pre-notes)

- The queue list query has `.limit(500)` (CLAUDE.md gotcha #6). At 100-300 verified users (Casey's 90-day target), unverified queues will be in the single or low double digits. Pagination beyond 500 is a P1 follow-up if any community ever stacks 500 unverified applicants — likely a sign of a bot attack and should trigger Steve.
- The realtime subscription is one channel per AdminVerificationScreen mount, scoped to `public.users` only. Cancel on unmount. Peter audits the channel-per-screen count in Phase 1 streams (per the expansion plan, ≤2 active channels per client at any time).
- The Detail screen renders 5 static fields; no perf concerns.

## Privacy considerations (Jordan pre-audit + sign-off needed)

This is the section that gates merge. Jordan reviews and either signs off or sends back with notes.

1. **Section 5 is the privacy contract.** Any deviation from the exact 5-field SELECT (e.g., a future feature that needs the admin to see "when this person was last active") goes back through Jordan, not landed unilaterally by Shamus.
2. **Verification realtime channel** subscribes to `public.users` — verify Supabase realtime filters apply RLS (it does; Supabase docs are explicit about this). Otherwise, an admin's realtime channel could leak rows of VERIFIED users (which the admin shouldn't see post-verification beyond the marketplace-visible fields). Steve verifies in the RLS pass.
3. **The rejection reason is admin-author free text.** A malicious admin could write PII or slurs. Mitigations: (a) the reason is Sky-only readable (verification_log RLS); (b) 280-char cap; (c) Casey vets admins per `community/growth-strategy.md`. Out-of-scope improvement: a "Report this admin" surface for Sky to remove `is_admin` — deferred to Cycle 5.5 or Tier 1 #3 (Report & Block).
4. **The "(anonymous)" referred-by label** prevents the inviter's identity from being inferred by admins enumerating recent rejections. Confirm with Jordan that this is acceptable copy.
5. **Realtime channel name**: do NOT use an applicant-specific channel name (e.g., per-applicant subscription). Use a single broad channel filtered by `is_verified = false` so the channel name itself doesn't reveal which applicants the admin is reviewing.

## DECISIONS FOR SKY

> Each item below needs Sky's call before Cycle 5 lands. Default behavior in parentheses is what ships if Sky doesn't override.

### DFS-1: Email visibility — confirm admins do NOT see applicant email

Per PRIVACY.md D6, admins see "only `email`, `chosen handle`, `postal prefix`, and `referrer_token_hash` status." This spec REMOVES email from the admin view (Section 5), because:

- Mara's persona anti-goal: "anything that ties her name to 'asking for formula.'" An email like `mara.smith@gmail.com` is a real-name disclosure.
- Keo's persona: "Apple ID is in their dead name." Their email could betray their dead name even if their handle doesn't.
- The auth schema is unreachable from PostgREST anyway; selecting email would require joining via a service-role view, which is a new attack surface.

**Quinn's proposal:** Sky **EDITS PRIVACY.md D6** to drop email from the admin view. The admin verifies via handle + postal_prefix + city + invite-status + signup-date. If email is ever needed (e.g., to disambiguate identical handles), it's an explicit `request_email_view(applicant_id)` RPC with its own audit row — out of scope for Cycle 5.

**Default if Sky says nothing:** spec ships WITHOUT email (data-minimum interpretation). Sky's call before merge.

- [ ] Approve drop-email-from-admin-view
- [ ] Push back — admins DO see email; explain why
- [ ] Edit — add email but only behind a "Reveal" button + extra audit row

### DFS-2: Does the rejected user ever see the rejection reason?

Currently the spec stores `reason` in `verification_log` only (Sky-readable). The rejected user's account is DELETED on reject (cascade), so there is no row to display the reason on anyway. But:

- Casey may want to send a rejection email ("Your application wasn't approved. Reason: <text>") via a verified-by-Casey communication channel.
- Jordan's posture (PRIVACY.md): "No third-party SDKs in MVP" — no transactional email service.
- Mara/Keo would likely view a rejection email as a tracking signal ("they have my email + a record of rejection").

**Quinn's proposal:** **Default NO.** The rejection is silent from the app's perspective. The community admin can choose to reach out to the applicant through their existing community channel (Signal, Telegram) if they want to — that's the partner network's call, not Mutual Mesh's.

- [ ] Approve silent rejection (default)
- [ ] Push back — Mutual Mesh sends a rejection email (requires new infra; Jordan re-review)
- [ ] Edit — admin can attach a reason that's displayed on a stub "Account not approved" screen the rejected user sees once on next sign-in attempt (requires NOT deleting `auth.users` on reject; significant schema change; defer to v2)

### DFS-3: Lint enforcement on the admin query column list

The privacy guarantee in Section 5 depends on the column list `id, handle, postal_prefix, city, referrer_token_hash, created_at` being the exact set the admin screen selects. A future Shamus could carelessly add `select('*')` or `select('..., email')`.

**Quinn's proposal:** Gary adds a simple ESLint custom rule (or a lower-tech grep test in CI) that fails if `src/screens/AdminVerificationScreen.tsx` or `src/screens/AdminApplicantDetailScreen.tsx` contains the string `select(` with any column not in the approved list.

**Default:** ship without the lint rule but add the rule in Cycle 5.5. Sky can prioritize earlier.

- [ ] Add lint rule in Cycle 5 (recommended — privacy-load-bearing)
- [ ] Defer to Cycle 5.5
- [ ] Skip; rely on Steve's code review at every PR

### DFS-4: Admin tab order in RootNavigator

The spec inserts "Verify" between "Home" and "Profile" for admins. Alternative: a settings-like submenu under "Profile" so the tab order is identical for all users.

**Quinn's proposal:** Tab between Home and Profile. Reasoning: admins are users in a hurry; the verify queue is their primary task in the app; burying it under Profile adds taps. Non-admins don't see it, so there's no consistency loss.

- [ ] Approve "tab between Home and Profile" (default)
- [ ] Push back — bury under Profile

### DFS-5: Does the queue badge count refresh in realtime?

A new signup creates an `unverified` row that should immediately bump the admin's tab badge from 3 → 4.

**Quinn's proposal:** **Yes.** The badge subscribes to the same `public.users` realtime channel as the queue list. Cost is negligible (one extra `useState` + memoized count).

**Default:** ships with realtime badge. Sky can deprioritize if it complicates Phase 1 timing.

- [ ] Approve realtime badge (default)
- [ ] Edit — badge updates only on tab-focus (cheaper, slightly worse UX)

## Out of scope for Cycle 5

The following are deliberately deferred. Each has a follow-up cycle named so we don't lose track.

- **Bulk-approve** (multi-select + "Approve all visible"): defer to **Cycle 5.5**. Reasoning: violates the "review each person individually" principle Casey's growth strategy depends on. Add only if community admins explicitly ask for it after their first 90 days.
- **Admin search / filter** (search by handle, filter by city, etc.): defer to **Cycle 5.5**. Reasoning: queues will be small in Phase 1; search is premature optimization. Re-evaluate at 100+ unverified per queue.
- **Admin profile pages** ("View this admin's verification history"): **never ship**. Admins are users too; their `verification_log` rows are Sky-only readable per PRIVACY.md §9. Surfacing an admin's history to other admins would (a) create the identity graph D4 broke and (b) expose admins to retaliation.
- **Admin-to-admin notes** ("This applicant was flagged in our Signal group"): **never ship**. PRIVACY.md D6 explicitly excludes prior admins' notes from the next admin's view. This is a hard constraint, not a feature gap.
- **Promote an applicant to admin from the queue**: out of scope. Admin promotion happens via Sky's direct UPDATE on `public.users.is_admin` (service-role only; `protect_admin_flags` trigger blocks the `authenticated` role). Re-evaluate after Tier-1 communities ship and Sky decides whether to delegate admin-promotion to community leads.
- **Verification-log review UI for Sky**: out of scope here; Sky reads `verification_log` directly via the Supabase dashboard. A future "Sky cockpit" feature could surface it, but that's a separate cycle (post-Phase-3 if at all).
- **Auto-suspend inactive admins**: a separate Tier-1 feature (#4 in the expansion plan, owned by Steve + Dana). Cycle 5 assumes the admins it lists in the queue are themselves active.
- **Reports / blocks of applicants** (queue-side report-bad-actor): out of scope. The Report & Block flow is Tier-1 #3 (separate Cycle).
- **Email the rejected user**: see DFS-2. Default no; revisit if Sky overrides.

## Definition of done

- All 10 AC pass manually on staging.
- All unit + component tests pass green.
- All RLS integration tests pass green (Steve writes; Gary runs in CI).
- Jordan signs off on Section 5 (data-minimum) and the realtime channel design.
- Alex signs off on the screen-reader announcements + reduced-motion behavior.
- Steve signs off on the three-layer enforcement (UI / RLS / RPC).
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 5 DECISIONS FOR SKY items (DFS-1 through DFS-5) before merge.
- Will updates `CLAUDE.md` "Status" line + adds any new gotcha to the "Gotchas" section if one emerges during build.
- Morgan briefing in `qa-reports/cycle-5-admin-verification-ui-YYYY-MM-DD.md` summarising what shipped + screenshots from staging.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
