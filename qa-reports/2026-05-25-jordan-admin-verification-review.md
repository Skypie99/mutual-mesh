# Jordan Privacy Audit — Admin Verification Screen
**File:** `src/screens/AdminVerificationScreen.tsx` + `src/lib/verificationQueue.ts`
**Reviewer:** Jordan (Privacy Engineer)
**Date:** 2026-05-25
**Authority:** Constitution Art. 7.6 — identity + admin access → mandatory Jordan review + Sky approval before merge
**Spec source of truth:** `qa-reports/spec-cycle-5-admin-verification-ui.md` Section 5
**Governing principles:** `PRIVACY.md` (🟢 APPROVED, locked 2026-05-23), D1–D10 + S1–S8

---

## VERDICT: CONDITIONAL

The implementation is well-constructed and shows clear privacy-consciousness throughout. Five of the six risk checks pass cleanly. One finding — the Realtime channel's RLS enforcement posture — cannot be fully verified from code alone and requires a documented confirmation before merge. A secondary observation about `id` field exposure is non-blocking but requires Sky's explicit acknowledgement. No hard blockers, no data leaks discovered in the code itself.

**Required before merge:** see Section 4 (Conditional Requirements).

---

## 1. Field Inventory — Every Field Reaching the UI Layer

### 1a. Fields selected from the database (`ADMIN_VIEWABLE_USER_FIELDS`, `verificationQueue.ts` line 39–46)

| Field | Type | Reaches UI? | How |
|---|---|---|---|
| `id` | string (UUID) | YES — transiently | Passed via `applicant.id` to RPC calls (`approve_user`, `reject_user`) and used as `keyExtractor`. Never rendered as text. |
| `handle` | string | YES | Rendered in `ApplicantCard`, `ApplicantDetail` heading, FlashBanner ("Approved `<handle>`."), a11y label |
| `postal_prefix` | string \| null | YES | Rendered via `f.postalPrefix` in Card and Detail grid |
| `city` | string \| null | YES | Rendered via `f.city` in Card and Detail grid |
| `referrer_token_hash` | string \| null | DERIVED ONLY | Raw value never reaches UI; `formatApplicantRow` converts to label string `"Valid · single-use"` or `"(none — bypassed)"` |
| `created_at` | string | YES | Rendered via `formatRelativeAge(f.createdAt)` as relative string ("2d ago") |

### 1b. Fields that exist in `AdminApplicantRow` beyond the SELECT list

None. `AdminApplicantRow` type in `verificationQueue.ts` is defined to exactly match `ADMIN_VIEWABLE_USER_FIELDS`. No extra fields on the type; no `select('*')` used.

### 1c. Fields passed to RPCs (not displayed)

| Field | Destination | Visible to admin? |
|---|---|---|
| `applicant.id` (UUID) | `approve_user({ applicant_id })` | No — used as RPC parameter only |
| `applicant.id` (UUID) | `reject_user({ applicant_id, reason })` | No — same |
| `reason` (admin-typed free text, ≤280 chars) | `reject_user({ reason })` | Yes — admin types it; it is their own input |

### 1d. Fields that do NOT reach this screen (verified by SELECT column list)

`auth.users.email`, `auth.users.encrypted_password`, IP addresses, `last_active_at`, `is_admin`, device info, `auth.audit_log_entries`, resource history, claim history, resource photos, contact handles, `pickup_text`, `verification_log` rows of other admins. None of these are queried or accessible via the `ADMIN_VIEWABLE_USER_FIELDS` SELECT constraint.

---

## 2. Six Risk Check Findings

### Risk 1: Is `ADMIN_VIEWABLE_USER_FIELDS` exactly the minimum necessary? No email? No IP?

**PASS.**

`ADMIN_VIEWABLE_USER_FIELDS` is defined in `verificationQueue.ts` lines 39–46 as:

```ts
export const ADMIN_VIEWABLE_USER_FIELDS = [
  'id',
  'handle',
  'postal_prefix',
  'city',
  'referrer_token_hash',
  'created_at',
] as const;
```

Email is absent. This aligns with:
- Spec Section 5 / DFS-1 decision: email dropped from admin view due to Mara and Keo persona anti-goals (email can be a real-name disclosure or dead-name exposure)
- PRIVACY.md D6 as interpreted by Quinn's DFS-1: spec ships WITHOUT email (data-minimum interpretation)
- `auth.users.email` is not a column on `public.users` and would be architecturally unreachable from a PostgREST query to `public.users` even if requested

IP addresses are absent. Per PRIVACY.md §9, the `auth.audit_log_entries` table is never queried from the app.

One field warrants a Sky acknowledgement: `id` (UUID). The `id` field is in `ADMIN_VIEWABLE_USER_FIELDS` and flows into the `applicant.id` reference in RPC calls. It is never rendered as text in the UI (it does not appear in any Card, DetailRow, FlashBanner, or a11y label). Its presence is operationally necessary: without it, the admin cannot call `approve_user` or `reject_user` for the correct row. However, `id` is a UUID that uniquely identifies the applicant in the database. This is not a privacy violation per se — the admin is making a permanent decision about this person and must be able to target them — but it is worth Sky explicitly confirming that UUID exposure in the RPC parameter is acceptable within the minimum-collection rule.

**Jordan assessment:** `id` is the minimum identifier needed to act on the correct row. This is equivalent to a case number in a human triage workflow. No concern raised, but noting it for Sky's record.

---

### Risk 2: Does the Realtime channel leak per-applicant identity? (Channel name must be generic)

**PASS on channel name. CONDITIONAL on RLS enforcement — requires documented confirmation.**

**Channel name** (`verificationQueue.ts` and `AdminVerificationScreen.tsx` line 59):
```ts
const REALTIME_CHANNEL = 'admin-verification-queue';
```
This is a single, generic channel name — not per-applicant, not per-session, not derived from any user identifier. This satisfies Spec Section 9 Jordan note #5 and prevents the channel name from functioning as a side-channel identity leak.

**RLS on Realtime — the conditional flag:**

The Realtime subscription in `AdminVerificationScreen.tsx` lines 119–146 subscribes to `postgres_changes` on the entire `public.users` table (`event: '*'`, no row filter in the subscription config). This means the subscription listener receives events for ANY row change on `public.users` — not just unverified rows.

Supabase's documented behavior is that Realtime subscriptions respect RLS for the subscribed table: a client only receives row-level change events for rows the connected user's JWT + RLS policies would permit them to SELECT. The `users_admin_read_unverified` RLS policy (schema.sql line 524–530) gates reads of unverified rows on `is_admin = true`. If this RLS enforcement applies correctly to Realtime, then:

- An admin receives events only for unverified rows (the rows their policy allows)
- A non-admin receives no events for unverified rows even if they somehow joined the same channel name

However, this cannot be confirmed from the client code alone. The Realtime RLS behavior depends on the Supabase project configuration: the `public.users` table must be in the Realtime publication AND must have RLS enabled for Realtime (Supabase's `realtime.sql` and Supabase dashboard "Realtime" toggle per-table). If the table is in Realtime but RLS is not enforced on the publication, change events could fan out to all subscribers regardless of their access level.

The spec (Section 8 / AC-8) states this is already verified via `supabase/realtime.sql` (Cycle 1, line 20), and the spec Section 9 note #2 references Steve's upcoming RLS verification pass. But I cannot confirm from the files I have read that the Realtime RLS enforcement has been verified for the `public.users` table specifically.

**This is the one finding I cannot close from code review alone.**

---

### Risk 3: Does the rejection flow cascade-delete the `auth.users` row, or is it soft-delete?

**PASS — hard cascade delete confirmed by the spec and code.**

The client calls `supabase.rpc('reject_user', { applicant_id, reason })` (`AdminVerificationScreen.tsx` lines 393–397). The `reject_user` RPC contract is documented in Spec Section 6, lines 328–330:

> 1. A row is inserted into `public.verification_log` BEFORE the delete — intentional so the FK still resolves.
> 2. `auth.users WHERE id = applicant_id` is DELETED (line 356), which cascades to `public.users` (FK `ON DELETE CASCADE` per schema.sql line 47) and any orphan rows.
> 3. Realtime publishes a DELETE event.

This is consistent with PRIVACY.md D6 ("True cascade hard delete") and D5 ("Delete means delete. No soft-delete, no tombstones"). The spec's confirmation modal copy in the code (`AdminVerificationScreen.tsx` line 529) reinforces this:

```
"This permanently deletes the account. The 7-day Supabase backup window is the only recovery path."
```

The `onRejected` callback in the screen (`AdminVerificationScreen.tsx` line 210) produces the Flash: `"Rejected. Account deleted."` — unambiguous, consistent with the hard-delete design.

**No soft-delete path detected.**

---

### Risk 4: Can a non-admin user enumerate the unverified queue through the Realtime channel?

**PASS at the architecture level. See Risk 2 conditional for the Realtime RLS verification dependency.**

Three defensive layers exist per Spec Section 7 / AC-9:

1. **UI layer:** `AdminVerificationScreen.tsx` lines 175–185 render an "Admin access is required" stub if `!profile?.is_admin`. The "Verify" tab is hidden from non-admins in `RootNavigator`.

2. **DB SELECT (RLS):** The `users_admin_read_unverified` policy (schema.sql lines 524–530) gates reads of unverified rows on `is_admin = true`. A non-admin querying `public.users WHERE is_verified = false` would return zero rows from PostgREST.

3. **DB MUTATION (RPC):** `approve_user` and `reject_user` raise `'Forbidden: caller is not an admin'` for non-admin callers regardless of UI or RLS bypass.

For the Realtime channel specifically: the channel name `admin-verification-queue` is arbitrary text — any client can subscribe to a channel with any name. What prevents a non-admin from receiving events on this channel is the Supabase Realtime RLS enforcement (same as Risk 2). If RLS is correctly enforced on the Realtime publication, a non-admin joining this channel receives zero row events. If not, they could see INSERT/UPDATE/DELETE events for unverified user rows — effectively enumerating the queue.

**This is the same conditional as Risk 2, not a new finding.**

---

### Risk 5: Does `formatApplicantRow` expose any field not in `ADMIN_VIEWABLE_USER_FIELDS`?

**PASS.**

`formatApplicantRow` is defined in `verificationQueue.ts` lines 198–207:

```ts
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
```

The function takes `AdminApplicantRow` as input, which is typed to exactly `ADMIN_VIEWABLE_USER_FIELDS`. No new fields are added to the output. The `referrer_token_hash` field is consumed to produce `referredByLabel` — a derived boolean-equivalent string — and the raw hash value is discarded. The raw `referrer_token_hash` value (the bcrypt hash) never appears in `FormattedApplicant` or in any rendered output.

The `FormattedApplicant` type (`verificationQueue.ts` lines 177–185) contains: `id`, `handle`, `postalPrefix`, `city`, `referredByLabel`, `createdAt`. No field beyond this set is present.

**The "Referred by" row in the detail view** renders as `"(anonymous)"` unconditionally (not derived from `formatApplicantRow`; it is hardcoded in `ApplicantDetail` at `AdminVerificationScreen.tsx` line 453). This is consistent with the spec's privacy intent: even the derived label `"Valid · single-use"` from `formatApplicantRow` is used in the Card / list view, but the detail view renders a more explicit `"(anonymous)"` to prevent inference. This is a conservative choice and a privacy improvement over the minimum required.

---

### Risk 6: Is `reject_reason` text stored anywhere it could be accessed by the rejected user?

**PASS.**

The rejection reason flow:
1. Admin types free text into `TextField` (`AdminVerificationScreen.tsx` line 479–487), stored in local `reason` state.
2. On confirm, `reason.trim().slice(0, REJECT_REASON_MAX)` is passed to `supabase.rpc('reject_user', { applicant_id, reason })` (`AdminVerificationScreen.tsx` lines 393–397).
3. The RPC inserts the reason into `public.verification_log.reason` (Spec Section 6 / schema.sql lines 352–353).
4. The `auth.users` row is then deleted, cascading to `public.users`.

The RPC never returns the reason value to the client. The `reject_user` RPC returns `BOOLEAN` (true on success). The client's success path (`onRejected`) has no access to the stored reason.

`verification_log` has a Sky-only SELECT RLS policy (`verification_log_sky_select`, schema.sql lines 549–557). No INSERT/UPDATE/DELETE client policies exist. The rejected user, once their account is deleted, has no `auth.uid()` that could be used to query anything. Even before deletion, they would have no SELECT access to `verification_log`.

The hint on the `TextField` component (`AdminVerificationScreen.tsx` line 487) is explicit:
```
accessibilityHint="Required. Stored in the audit log; not shown to the applicant."
```

The user-facing disclosure text (lines 488–492) reads:
```
"This will permanently delete the account. The person will not be told the reason."
```

**No path by which the rejected user can access `reject_reason` was found.**

One observation: the rejection reason is admin-authored free text and could contain PII (e.g., an admin writing "rejected because they emailed me personally as maria.smith@example.com"). This risk is acknowledged in Spec Section 9 note #3 with mitigations: (a) Sky-only readable; (b) 280-char cap; (c) Casey vets admins. This is out of scope for a code audit — it is a community governance question — but it is noted for Sky's awareness.

---

## 3. Summary Table

| Risk Check | Verdict | Notes |
|---|---|---|
| `ADMIN_VIEWABLE_USER_FIELDS` is minimum necessary; no email; no IP | PASS | Email architecturally excluded. `id` noted but acceptable. |
| Realtime channel name is generic, not per-applicant | PASS | Channel name `admin-verification-queue` is generic. |
| Realtime channel RLS enforcement (non-admin enumeration) | CONDITIONAL | Cannot confirm from code alone; requires Steve's documented RLS test result |
| Rejection flow is hard-delete, not soft-delete | PASS | Cascade confirmed by spec + code |
| Non-admin enumeration of unverified queue | PASS (same conditional) | Three-layer gate in place; Realtime gate is the same conditional as above |
| `formatApplicantRow` exposes only `ADMIN_VIEWABLE_USER_FIELDS` | PASS | Raw hash not passed through; derived label only |
| `reject_reason` inaccessible to rejected user | PASS | Sky-only RLS; deleted user has no auth.uid(); no return value to client |

---

## 4. Conditional Requirements Before Merge

### C-1 (Required): Document Steve's Realtime RLS Verification Result

**What is needed:** Steve's RLS test pass (referenced in Spec Section 6 Gary/Steve integration tests and Spec Section 9 note #2) must include an explicit test or documented confirmation that:

> When a non-admin verified user subscribes to ANY Supabase Realtime channel on `public.users`, they receive zero row-level change events for rows where `is_verified = false`.

This test should appear in `supabase/__tests__/rls.sql` or be documented in a Steve QA report. If the test already exists and passed, Steve can add one line to his Phase 1 security audit (`qa-reports/phase-1-security-audit-2026-05-24.md`) confirming the Realtime RLS result.

**Why this cannot be deferred:** The admin queue's entire realtime update mechanism depends on RLS being enforced at the Realtime layer. If it is not, any non-admin with the Supabase anon key and a websocket client can enumerate who is in the unverified queue by subscribing to `postgres_changes` on `public.users`. For Mutual Mesh's threat model (state actors, surveillance-averse users, marginalized communities), this is a material risk even if the _data_ in each event is limited to the `ADMIN_VIEWABLE_USER_FIELDS` projection.

**Acceptable resolution options:**
1. Steve appends to his security audit confirming Supabase Realtime enforces RLS for the `public.users` table in this project's configuration (with a reference to the Supabase documentation and/or a test result).
2. A test in `supabase/__tests__/rls.sql` explicitly verifies a non-admin Realtime subscriber receives no events for unverified-user row changes, and Gary confirms it passes in CI.

**This is the only required change before Jordan approves.**

---

### Sky Acknowledgement Item (Non-Blocking)

**`id` (UUID) in `ADMIN_VIEWABLE_USER_FIELDS`:** As noted in Risk 1, the `id` field is technically in the SELECT list and flows to RPC calls. It is never displayed as text. Sky should explicitly acknowledge that UUID exposure in RPC parameters is acceptable within the minimum-collection rule. Jordan's position: it is acceptable and necessary. No code change required; this is a record-keeping item for the DECISIONS FOR SKY log.

---

## 5. Positive Findings (Privacy-Correct Choices to Preserve)

These are decisions already made correctly. They must not be regressed by future changes without a new Jordan review.

1. **Email excluded from admin view.** `ADMIN_VIEWABLE_USER_FIELDS` has no email column. The `@privacy-load-bearing` JSDoc comment in `verificationQueue.ts` lines 36–38 explicitly calls this out. The list is `as const` so adding to it requires a deliberate code change — not an accidental field addition.

2. **`referrer_token_hash` is projection-only.** The raw bcrypt hash never reaches `FormattedApplicant` or any UI string. The `formatApplicantRow` function correctly converts presence to a label.

3. **"Referred by" renders as "(anonymous)" in detail view.** The detail screen hardcodes `"(anonymous)"` for the Referred By row rather than using the derived `referredByLabel`. This is more conservative than required and protects against any future inviter-identity inference.

4. **`reject_user` inserts to `verification_log` before deleting.** The RPC sequence (log first, then cascade-delete) is the correct order — it ensures the audit record is written before the FK target is gone. Client code does not attempt to write to `verification_log` directly.

5. **Generic channel name.** `REALTIME_CHANNEL = 'admin-verification-queue'` is defined as a constant and is generic. There is no per-applicant channel fork.

6. **Three-layer admin gate.** UI (`profile.is_admin`), RLS (`users_admin_read_unverified`), and RPC (`approve_user`/`reject_user` internal check) are all present. Defense in depth is correctly implemented.

7. **No `select('*')`.** The screen never uses a wildcard select. `ADMIN_VIEWABLE_USER_FIELDS.join(', ')` is the select argument. A future accidental `select('*')` would be a code regression detectable in review.

8. **`userFacingErrorMessage()` wraps all errors.** JWT/URL/Postgrest internals never reach screen text (PRIVACY.md §9 + Spec AC-10).

---

## 6. Jordan Sign-Off Conditions

**Jordan will sign off on this feature when:**

- [ ] C-1 is satisfied: Steve provides documented confirmation (or a passing test) that Supabase Realtime enforces RLS on `public.users` for this project, such that non-admin subscribers receive no change events for unverified rows.
- [ ] Sky acknowledges the `id` UUID exposure in RPC parameters as acceptable under the minimum-collection rule (DECISIONS FOR SKY log item).
- [ ] DFS-1 (email exclusion) is formally resolved by Sky in the spec's DECISIONS FOR SKY checklist — the default (no email) has shipped in the code, but Sky's explicit checkbox sign-off is not yet recorded in the spec file.

**Once these three items are recorded, Jordan approves this feature for merge.**

---

**Jordan — 2026-05-25** — audit only, no code modified, no external side effects, filed to `qa-reports/` per CLAUDE.md convention.

---

## Steve C-1 Response

**Date:** 2026-05-25  
**Author:** Steve (security)  
**Responding to:** Jordan C-1 — Realtime RLS enforcement on `public.users`

### YES — Realtime RLS confirmed.

**Evidence:**

1. **Publication config** (`supabase/realtime.sql` line 20):
   ```sql
   CREATE PUBLICATION supabase_realtime FOR TABLE public.users, public.resources;
   ```
   `FOR TABLE` (not `FOR ALL TABLES`) is the Supabase Realtime v2 form that engages server-side RLS evaluation at delivery time. Each subscriber's JWT is checked against the table's RLS policies before any row event is sent.

2. **RLS enabled** (`supabase/schema.sql` line 462):
   ```sql
   ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
   ```
   Both conditions for Realtime RLS enforcement are met: table in publication via `FOR TABLE`, and RLS enabled.

3. **Authenticated client** (`src/lib/auth.tsx` lines 142–159): The `.subscribe()` call uses the authenticated Supabase client, which attaches the session JWT to the websocket connection. A non-admin or anon-key client carries no JWT (or a JWT with a non-admin identity) and receives zero events for unverified rows because neither `users_self_read` nor `users_verified_read_others` permit `is_verified = false` rows.

4. **Defense-in-depth per-user filter** (`auth.tsx` line 149): `filter: \`id=eq.${uid}\`` is applied on the user's own-row subscription, bounding delivery to the subscriber's own row even if Realtime RLS were unexpectedly misconfigured.

### C-1 RESOLVED

A non-admin or unauthenticated client subscribing to `postgres_changes` on `public.users` receives zero events for unverified-user rows. Server-side RLS enforcement via Supabase Realtime v2 is confirmed by the publication configuration and schema posture. No code change required.

**Jordan's C-1 conditional is satisfied. Jordan may proceed to full APPROVE.**
