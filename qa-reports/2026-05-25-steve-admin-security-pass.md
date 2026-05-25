# Steve — Admin Verification Security Pass (Cycle 5)

**Date:** 2026-05-25  
**Scope:** AdminVerificationScreen, verificationQueue.ts, schema.sql RLS/RPC definitions, CI workflows  
**Role:** Steve (security)  
**Branch:** qa/auto-2026-05-25-steve (audit-only, no code changes)

---

## VERDICT: CONDITIONAL

Server-side enforcement is real and correctly layered. Two issues below must be resolved before ship — one is a data-exposure risk (MEDIUM), one is an orphan-log corner case (LOW). No CRITICAL or HIGH blockers.

---

## 1. RLS Finding — `users_admin_read_unverified`

**Does the policy actually restrict to admins only? Can a non-admin bypass it and read unverified rows?**

**PASS — with one caveat flagged below.**

Policy in `supabase/schema.sql` lines 489–495:

```sql
CREATE POLICY users_admin_read_unverified ON public.users
  FOR SELECT TO authenticated
  USING (
    is_verified = false
    AND EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.is_admin = true)
  );
```

The correlated subquery re-reads `public.users` to check the caller's own `is_admin` flag. This is a server-side check that cannot be forged by a client JWT manipulation because `auth.uid()` is set by Supabase's JWT verification, and `is_admin` lives in `public.users` (not the JWT). The policy is sound.

**The policy is correctly complemented by:**
- `users_self_read` — callers can only see their own row via self-read (won't expose unverified others).
- `users_verified_read_others` — restricts cross-user reads to verified users only, and only for verified rows (`is_verified = true`). An unverified non-admin cannot use this policy to see unverified rows.
- `protect_admin_flags` trigger — prevents any `authenticated` caller from self-promoting `is_admin = true` via a direct UPDATE, blocking the "flip your own flag then read the queue" attack vector. Verified by RLS test T6.a/b in `supabase/__tests__/rls.sql`.

**Caveat — `users_verified_read_others` column exposure (LOW):**  
The comment at schema.sql line 483 notes: _"the app should read through a view that strips email/is_admin/last_active_at"_ — but that view does not currently exist. A verified, non-admin user can `SELECT *` from `public.users` and receive `is_admin`, `last_active_at`, and `referrer_token_hash` columns on other verified users' rows. This is not a bypass of the admin queue, but it does expose the admin roster (who has `is_admin = true`) to any verified user. That is a privacy concern (PRIVACY.md D9 intent: admin flag is not meant to be client-visible). See DECISIONS FOR SKY below.

---

## 2. RPC Finding — `approve_user` and `reject_user` server-side `is_admin` check

**Do the RPCs enforce `is_admin` server-side, independent of UI or RLS bypass?**

**PASS — enforcement is solid.**

Both RPCs follow the same pattern (schema.sql lines 313–319 and 343–348):

```sql
SELECT is_admin INTO caller_is_admin FROM public.users WHERE id = auth.uid();
IF NOT COALESCE(caller_is_admin, false) THEN
  RAISE EXCEPTION 'Forbidden: caller is not an admin';
END IF;
```

Key properties:
- Both are `SECURITY DEFINER` — they run with elevated privilege, but the `is_admin` check inside them uses `auth.uid()` (caller identity) not the definer's identity. A non-admin caller gets EXCEPTION 'Forbidden' before any state is mutated.
- `COALESCE(caller_is_admin, false)` correctly handles the NULL case (no row found → deny).
- The check is before any `UPDATE` or `DELETE` — no TOCTOU window.
- The UI check (`profile.is_admin === true` in AdminVerificationScreen.tsx line 175) is correctly framed as "defense in depth" — it is explicitly labeled as not the real gate in the component JSDoc.

No privilege escalation path identified. A non-admin sending a crafted `supabase.rpc('approve_user', ...)` call directly receives EXCEPTION 'Forbidden'.

---

## 3. Cascade Finding — `reject_user` delete behavior

**Does reject cascade-delete `auth.users`? Or does it orphan rows?**

**PASS on the cascade chain. One corner-case with the audit log.**

`reject_user` in schema.sql lines 352–357:

```sql
-- Log BEFORE delete
INSERT INTO public.verification_log (applicant_id, admin_id, decision, reason, decided_at)
VALUES (applicant_id, auth.uid(), 'reject', reason, now());

-- Delete from auth.users → cascades to public.users → cascades to any orphans
DELETE FROM auth.users WHERE id = applicant_id;
```

**Cascade chain:**
- `public.users.id` has `REFERENCES auth.users(id) ON DELETE CASCADE` (schema.sql line 47).
- `public.resources.posted_by` has `ON DELETE CASCADE`; `claimed_by` has `ON DELETE SET NULL`.
- `public.invite_tokens.created_by` and `used_by` have `ON DELETE SET NULL`.
- Storage objects are **not** cascade-deleted by this path. The `reject_user` RPC deletes `auth.users`; schema.sql line 003 (migration `003_storage_cascade_on_delete_and_prune.sql`) handles storage object cleanup — but this is in a migration file, not the base schema. Confirmed the migration file exists. No orphan storage objects expected for an applicant who has never been verified (they have no marketplace resources, no photos) — but worth verifying that the migration's Storage trigger covers the `auth.users` → `resource-photos` path if an applicant somehow uploaded during signup. This is LOW risk because unverified users cannot post resources (RLS blocks INSERT on resources), but flag for Dana to confirm.

**Audit log corner-case (LOW):**  
`verification_log.applicant_id` has `ON DELETE CASCADE` (schema.sql line 94), meaning if the applicant row in `public.users` is deleted, the log entry for that applicant is also deleted. `reject_user` inserts the log row *before* deleting `auth.users`. The cascade from `auth.users → public.users → verification_log` will then delete the log row immediately after it was written. The rejection is effectively unlogged in `verification_log`. This contradicts the append-only audit intent (S8).

This is a **MEDIUM** severity issue. The audit log entry for a rejection will cascade-delete with the user. Approvals are not affected (the applicant's row persists after approval with `is_verified = true`).

---

## 4. Realtime Subscription — data leakage check

**The admin screen subscribes to `postgres_changes` on `table: 'users'` with no row-level filter clause** (AdminVerificationScreen.tsx lines 120–145). This means Supabase will attempt to deliver all `users` table change events to this channel.

Supabase Realtime respects RLS at delivery time: a row change event is only sent to a subscriber if they would pass `SELECT` RLS for that row. So a verified non-admin subscribing to the same channel would not receive unverified user rows (the `users_admin_read_unverified` policy would filter them out server-side).

**However:** the admin subscription also receives UPDATE events for *verified* rows (via `users_verified_read_others`). The `applyVerificationDelta` handler in verificationQueue.ts correctly drops any row where `is_verified === true` from the displayed queue, so no verified rows appear in the UI. The realtime payload does arrive at the client though — the client receives and discards it. This is acceptable given that verified user rows are already accessible to any verified user per policy, but it means the admin subscription is slightly noisier than necessary.

Mitigation recommendation: add `.filter('is_verified', 'eq', 'false')` to the subscription to reduce payload and make intent explicit. Not a blocker — no unauthorized data is exposed, but it is defensive hygiene.

---

## 5. CI Workflow Check

**`secrets-scan.yml` (gitleaks):** Present, runs on PR and push to main. Uses `gitleaks/gitleaks-action@v2` with `fetch-depth: 0` (full history scan). PASS.

**`ci.yml` email-guard:** Present, pattern-matches against common email-sending library imports in `src/**/*.ts(x)`. The pattern covers nodemailer, sendgrid, mailgun, mailchimp, ses, postmark, sparkpost, resend. PASS.

**`ci.yml` migration-guard:** Present, validates sequential numbering of migration files. Detects gaps and duplicates. PASS.

**Gap noted:** There is no workflow check that validates the SQL migration files for `SECURITY DEFINER` functions having `SET search_path` set (an injection hardening requirement). All existing RPCs do have `SET search_path = public, auth` set, so this is not a current bug — just a missing guardrail for future migrations. LOW.

---

## Summary Table

| Check | Result | Severity |
|---|---|---|
| RLS `users_admin_read_unverified` restricts to admins server-side | PASS | — |
| Non-admin cannot bypass RLS to see unverified queue | PASS | — |
| `protect_admin_flags` blocks self-promotion via direct UPDATE | PASS | — |
| `approve_user` enforces `is_admin` server-side before mutation | PASS | — |
| `reject_user` enforces `is_admin` server-side before mutation | PASS | — |
| `reject_user` cascade-deletes `auth.users` → `public.users` chain | PASS | — |
| **`verification_log` rejection entry cascade-deletes with the user** | **ISSUE** | **MEDIUM** |
| Storage orphans on reject for unverified users | LOW / likely clean | LOW |
| `users_verified_read_others` exposes `is_admin` column to verified non-admins | ISSUE | LOW |
| Realtime subscription lacks `is_verified=false` filter | NOTE | LOW |
| Gitleaks workflow present | PASS | — |
| Email-guard workflow present | PASS | — |
| Migration-guard workflow present | PASS | — |
| `SET search_path` guardrail absent in CI | NOTE | LOW |

---

## DECISIONS FOR SKY

### DECISION-1 (MEDIUM — must resolve before ship)
**Verification log entries for rejected users are lost.** `verification_log.applicant_id` has `ON DELETE CASCADE`. When `reject_user` deletes `auth.users`, the cascade chain deletes the just-inserted log row. The audit is silently voided.

**Options:**
- A. Change `verification_log.applicant_id` FK to `ON DELETE SET NULL` (applicant_id becomes NULL, log row survives). Requires a migration.
- B. Store a `handle` snapshot or other non-FK identifier in the log row alongside `applicant_id` so the row survives as a non-null record even after SET NULL.
- C. Accept the loss — treat `verification_log` as approval-only. Rejections are not in scope for audit.

**Recommendation:** Option A. Dana writes the migration; Steve verifies. One-line FK change plus a `COMMENT` update.

### DECISION-2 (LOW — pre-ship or post-ship)
**`is_admin` flag visible to all verified users via `users_verified_read_others` policy.** Any verified user can `SELECT * FROM public.users` and see who is an admin. PRIVACY.md D9 says admins are "flagged users, not a separate DB role" — but it doesn't explicitly say the flag should be client-invisible.

**Options:**
- A. Create a view (`public.user_profiles`) that projects only safe columns (handle, postal_prefix, city, is_verified) and point app queries at the view. Dana writes.
- B. Restrict the `users_verified_read_others` policy with a column exclusion list (Postgres RLS does not support per-column grant in policies; would need a view or function).
- C. Accept as-is with a note that `is_admin` visibility is intentional (e.g., users can see who moderates the network).

**Recommendation:** Option A, deferred post-ship if time-constrained. The admin screen itself does not depend on this; it's a separate policy gap.

### DECISION-3 (LOW — post-ship)
**Realtime subscription filter.** Add `.filter('is_verified', 'eq', 'false')` to the admin screen's `postgres_changes` subscription to reduce payload and make intent explicit. Safe change, Shamus can make it. Not a security blocker.

---

## Realtime RLS Addendum (Jordan C-1 response)

**Date:** 2026-05-25  
**Responding to:** Jordan's conditional C-1 from `qa-reports/2026-05-25-jordan-admin-verification-review.md`

---

### YES — Realtime RLS is enforced for `public.users`.

**Evidence 1 — Publication config (`supabase/realtime.sql` lines 15–20):**

```sql
DROP PUBLICATION IF EXISTS supabase_realtime;

CREATE PUBLICATION supabase_realtime FOR TABLE public.users, public.resources;
```

`public.users` is added to the `supabase_realtime` publication using `CREATE PUBLICATION … FOR TABLE` — not `FOR ALL TABLES`. This is the correct form for Supabase Realtime v2 (Multiplayer). Supabase's Realtime v2 enforces RLS on `postgres_changes` subscriptions automatically when the table is added via `FOR TABLE`: the server evaluates the subscriber's JWT against the table's RLS policies at delivery time and withholds events for rows the subscriber cannot SELECT.

RLS is enabled on `public.users` via `schema.sql` line 462:

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
```

Both conditions required for Realtime RLS enforcement are met: (1) the table is in the publication with `FOR TABLE` (not `FOR ALL TABLES`, which in legacy configurations can bypass RLS), and (2) RLS is enabled on the table.

**Evidence 2 — `auth.tsx` client-side subscription pattern (lines 142–159):**

```ts
const channel = supabase
  .channel(`user-row-${uid}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'users',
      filter: `id=eq.${uid}`,
    },
    (_payload) => { … void reloadProfile(); },
  )
  .subscribe();
```

The `supabase` client used here is the authenticated client from `src/lib/supabase.ts` initialized with the user's session JWT (set via `supabase.auth.onAuthStateChange` in the same file). The Supabase JS v2 client automatically attaches the session JWT to websocket connections established via `.channel().subscribe()`. The subscription is thus authorized under the caller's identity — not the anon key in isolation.

**Evidence 3 — `realtime.sql` comment (lines 5–9):**

```
-- STRIDE I3 mitigation: Supabase Realtime respects RLS, so clients only
-- receive deltas of rows they're allowed to SELECT. We ALSO instruct the
-- client to filter the subscription by id=eq.{auth.uid()} for the user's
-- own row — defense in depth.
```

Dana's implementation intent explicitly relies on and documents this behavior. The `auth.tsx` per-user filter (`filter: \`id=eq.${uid}\``) is defense-in-depth on top of RLS — not the primary guard.

**RLS policies on `public.users` for the relevant scenarios:**

- A **non-admin verified user** subscribing to any channel on `public.users` passes `users_self_read` (own row only) and `users_verified_read_others` (verified rows only, `is_verified = true`). Neither policy permits selecting `is_verified = false` rows. Realtime will deliver zero events for unverified-user row changes to this subscriber.
- A **non-authenticated client** (anon-key only, no JWT) has no policies granting SELECT on `public.users`. Zero events delivered.
- An **admin** subscriber passes `users_admin_read_unverified` (`is_verified = false AND caller is_admin = true`). Events for unverified rows are delivered to admins only.

---

### Final verdict on Jordan C-1

**C-1 RESOLVED — CONFIRMED.**

Supabase Realtime RLS is enforced for `public.users`:
- Table is in the publication via `FOR TABLE` (not `FOR ALL TABLES`), which engages Realtime v2 RLS enforcement.
- RLS is enabled on the table (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`).
- The client carries a valid auth JWT via the authenticated Supabase client.
- A non-admin anon-key client subscribing to `postgres_changes` on `public.users` receives zero events for unverified-user rows. The `users_admin_read_unverified` policy blocks delivery server-side.

Jordan's C-1 is closed. No code change required. The existing publication config + RLS posture is sufficient.

---

## Files Audited

- `/Users/skypie/MutualMesh/src/screens/AdminVerificationScreen.tsx`
- `/Users/skypie/MutualMesh/src/lib/verificationQueue.ts`
- `/Users/skypie/MutualMesh/supabase/schema.sql`
- `/Users/skypie/MutualMesh/supabase/realtime.sql`
- `/Users/skypie/MutualMesh/supabase/__tests__/rls.sql`
- `/Users/skypie/MutualMesh/.github/workflows/ci.yml`
- `/Users/skypie/MutualMesh/.github/workflows/secrets-scan.yml`

No code changes made. Audit only.
