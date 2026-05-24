# Phase 3 — Dana — Migration 009: Push Notifications Schema — 2026-05-24

## Summary

Wrote `supabase/migrations/009_push_notifications.sql` — the schema backbone
for Quinn's Phase 3 push notifications spec. This is a **FILE-ONLY** migration
in the Dana lane; **Sky applies via the Supabase dashboard.** Nothing is
applied to any live database by this work.

The Edge Function (`deliver_notification`) that consumes this schema is OUT
of scope for this migration — Dana writes files; Sky deploys Edge Functions
via Supabase CLI (Constitution Art. 9).

**Constitution authority:** Art. 7.6 (privacy-load-bearing, FULL Jordan
review required per spec). Mode: BACKGROUND-eligible? No — this is
**ACTIVE mode** work for a file-only schema task; the BACKGROUND-mode AUDIT-
ONLY constraint applies to code branches, not to file authorship by Dana on
explicit invocation.

## What landed

### File created

- `/Users/skypie/MutualMesh/supabase/migrations/009_push_notifications.sql`
  (~520 lines including header rationale, RLS, RPCs, cron, test stub,
  rollback block — mirrors the format of migrations 003/005/007.)

### Schema delivered (per task brief)

1. **`public.push_tokens` table**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE`
     (D6 cascade)
   - `expo_token TEXT NOT NULL`
   - `platform TEXT NOT NULL CHECK (platform IN ('ios','android','web'))`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `UNIQUE (user_id, expo_token)` — one row per token per user, supports
     UPSERT path.
2. **`public.users.push_preferences` JSONB NOT NULL DEFAULT
   `'{"enabled": false}'::jsonb`** — default-OFF per Quinn AC-1.
3. **RLS on `push_tokens`** — four self-only policies (SELECT, INSERT,
   UPDATE, DELETE). Defense in depth over the SECURITY DEFINER RPCs.
4. **Three RPCs** (SECURITY DEFINER, grants to `authenticated`):
   - `register_push_token(p_expo_token, p_platform) RETURNS BOOLEAN` —
     UPSERT pattern (insert OR bump last_used_at).
   - `revoke_push_token(p_expo_token) RETURNS BOOLEAN` — DELETE own row;
     returns TRUE if deleted, FALSE if no matching row (idempotent).
   - `update_push_preferences(p_prefs JSONB) RETURNS JSONB` — shallow
     JSONB merge; returns merged result.
5. **Index** `push_tokens_user_last_used_idx ON (user_id, last_used_at
   DESC)` — supports cleanup cron AND future per-user device-listing.
6. **`prune_stale_push_tokens()` + pg_cron job at 03:30 UTC** — deletes
   tokens older than 60 days; logs aggregate count to `cron_log` per spec
   AC-5 (no per-recipient identifiers).
7. **Idempotent** (CREATE IF NOT EXISTS / OR REPLACE everywhere; cron
   unschedule-then-schedule).
8. **Rollback block** commented out at the bottom; unwinds in reverse-
   dependency order.

### Privacy & security alignment

- **PRIVACY.md D6 (delete-cascade honesty):** `user_id` has `ON DELETE
  CASCADE`. The existing `delete_my_account()` (schema.sql L365-392)
  cascades through `auth.users → public.users → push_tokens` automatically.
  No new code path needed; the cascade is structural.
- **PRIVACY.md D8 (no third-party SDKs):** This migration adds NO npm
  dependency, NO external service hook, NO webhook. The Edge Function
  (out of scope) will call Expo's push API directly; Expo is a thin
  proxy, not a third-party push provider in the OneSignal/Pusher sense
  (spec AC-9).
- **Spec AC-1 (default OFF):** `push_preferences` defaults to
  `{"enabled": false}` at the column level → every existing user is
  migrated with the opted-OUT state at apply time.
- **Spec AC-5 (no PII in delivery logs):** `prune_stale_push_tokens()`
  logs only the aggregate `rows_affected` count to `cron_log`. The
  forthcoming Edge Function MUST follow the same pattern.
- **Spec AC-3 (revoke any time):** `revoke_push_token` deletes the row
  in the RPC's transaction; the existing `users_self_update` policy lets
  the client also update `push_preferences` to flip the toggle in the
  same client flow.
- **Three-layer enforcement** (spec AC-8): Client (push.ts) + Server RPC
  (register_push_token) + Edge Function (deliver_notification re-check).
  This migration delivers the SERVER RPC layer; the client and Edge
  Function layers are Shamus and the Edge Function deployment
  respectively. NOTE: server-side preference-on enforcement in
  register_push_token is deferred (see DFS-MIG9-6 below).

## Apply steps for Sky

Sky applies via the Supabase dashboard SQL editor. Numbered, copy-paste-able:

1. Open the Supabase dashboard for the Mutual Mesh project (URL in your
   `.env` / Supabase account). Confirm you're on the right project — this
   migration is destructive (CREATE TABLE + ALTER TABLE + cron schedule).
2. Verify the prerequisite extensions are enabled:
   - Database → Extensions → confirm `pgcrypto` ENABLED (already on from
     schema.sql).
   - Database → Extensions → confirm `pg_cron` ENABLED (already on from
     schema.sql; required for the new cleanup cron).
3. Open SQL Editor → New Query.
4. Paste the entire contents of
   `~/MutualMesh/supabase/migrations/009_push_notifications.sql` into the
   editor.
5. Run. Expected output: one `CREATE TABLE`, one `CREATE INDEX`, one
   `ALTER TABLE` (add column), four `CREATE POLICY`, four `CREATE OR
   REPLACE FUNCTION` (3 RPCs + cleanup), four `GRANT EXECUTE`, one
   `DO` block (cron schedule). No errors.
6. Verify the cron job is registered:
   ```sql
   SELECT jobname, schedule, command
   FROM cron.job
   WHERE jobname = 'prune_stale_push_tokens_nightly';
   ```
   Expected: one row, schedule `30 3 * * *`,
   command `SELECT public.prune_stale_push_tokens();`.
7. Verify the column default applied to existing users:
   ```sql
   SELECT count(*)
   FROM public.users
   WHERE push_preferences = '{"enabled": false}'::jsonb;
   ```
   Expected: count = (total user count). All existing users opted-OUT.
8. Smoke test as an authenticated user (use a non-admin test account via
   the app or curl with a user JWT):
   ```sql
   -- as authenticated user
   SELECT public.register_push_token('ExponentPushToken[test1234]', 'ios');
   -- expected: true
   SELECT count(*) FROM public.push_tokens WHERE user_id = auth.uid();
   -- expected: 1
   SELECT public.update_push_preferences('{"enabled": true, "claim_placed": true}'::jsonb);
   -- expected: {"enabled": true, "claim_placed": true}
   SELECT public.revoke_push_token('ExponentPushToken[test1234]');
   -- expected: true
   SELECT count(*) FROM public.push_tokens WHERE user_id = auth.uid();
   -- expected: 0
   ```
9. After smoke test, hand off to Steve for FULL security review (RLS
   coverage + RPC error-path testing) and Jordan for FULL privacy review
   (data view + Edge Function payload shape confirmation when that ships).

If anything errors during step 5, the migration is wrapped in CREATE-IF-
NOT-EXISTS / OR REPLACE, so partial apply is safe to re-run — fix the
error and re-paste.

## DECISIONS FOR SKY (DFS)

Numbered. Each item is documented in detail in the migration file's
header (DECISIONS / ASSUMPTIONS section). All have a default ship behavior
in case Sky doesn't override.

### DFS-MIG9-1: push_preferences default shape

**Task brief:** `{"enabled": false}` (single bool gate).
**Spec AC-7:** `{"claim_placed": false, "pickup_confirmed": false,
"admin_approved": false, "admin_rejected": false}` (per-trigger keys).

This migration ships the **task brief shape** (`{"enabled": false}`) as the
column DEFAULT. The merge semantics of `update_push_preferences` let the
client populate per-trigger keys at first toggle-ON without a schema
change. If Sky wants the per-trigger shape at creation time, a one-line
follow-up migration changes the DEFAULT.

- [ ] Approve task brief shape (default ship)
- [ ] Push back — change DEFAULT to the per-trigger shape

### DFS-MIG9-2: platform CHECK includes 'web'

**Task brief:** `('ios','android','web')` (includes web for future
Expo Web).
**Spec draft:** `('ios','android')` (no web).

This migration ships the **task brief CHECK** including web. Costs nothing
now and avoids a future CHECK migration. If Sky prefers strict ios/android-
only, change one line.

- [ ] Approve 'web' inclusion (default ship)
- [ ] Push back — strict ios/android only

### DFS-MIG9-3: One-row-per-platform vs dual-device support

The spec's AC-4 says "exactly ONE active row per (user_id, platform)
pair." The task brief's UNIQUE constraint is `(user_id, expo_token)` only,
which allows multiple devices on the same platform (legitimate: phone +
tablet, both iOS).

This migration ships the **task brief UNIQUE** (allows dual-device). The
spec's rotation logic (delete-old-then-insert-new) should happen client-
side per spec AC-4 ("OLD token is revoked, NEW token is registered") —
the client is the only party that knows "this is my old token, replace
it."

If Sky wants server-side enforcement of one-row-per-platform, a future
migration adds a `UNIQUE (user_id, platform)` constraint + rotation logic
in `register_push_token`.

- [ ] Approve dual-device support (default ship)
- [ ] Push back — enforce one-row-per-platform server-side

### DFS-MIG9-4: revoke_push_token signature

**Task brief:** `revoke_push_token(p_expo_token TEXT)` (delete ONE token).
**Spec:** `revoke_push_token()` no params (delete ALL caller's tokens).

This migration ships the **task brief signature** (per-token revoke). More
granular; matches the client's natural flow ("this device knows its own
token; revoke that one"). A future helper RPC
`revoke_all_push_tokens()` can be added if the "Disable all" button
needs single-call atomic revoke.

- [ ] Approve per-token revoke (default ship)
- [ ] Push back — switch to revoke-all signature

### DFS-MIG9-5: 60-day stale-token threshold

Task brief says 60 days. Migration uses `INTERVAL '60 days'` literal.
Reasoning vs other candidates documented in the migration header
(DECISIONS #8). Easy retune if Sky prefers 30, 90, or another window.

- [ ] Approve 60 days (default ship)
- [ ] Push back — change to N days: _____

### DFS-MIG9-6: Server-side preference-on enforcement in register_push_token

The spec's AC-8 (server layer) calls for `register_push_token` to refuse
when no preference is ON. This migration **does NOT enforce that**
server-side. Reasoning (DECISIONS #4 in migration header):

- The default JSONB shape (`{"enabled": false}`) is a flat single-key
  gate; the per-trigger key list is application-layer responsibility.
- The client-side check (push.ts) is the primary gate; the Edge Function's
  pre-send re-check is the last line of defense.
- Coupling the schema to a specific JSONB shape via the RPC body would
  break if the shape evolves.

Server-side enforcement is a one-line addition once the JSONB shape is
locked.

- [ ] Approve deferred server-side enforcement (default ship)
- [ ] Push back — add server-side `(prefs->>'enabled')::boolean` check now
- [ ] Push back — lock the per-trigger JSONB shape first, then enforce

### DFS-MIG9-7: Edge Function deployment timing

Out of scope for this migration but needs Sky's call before Phase 3.1
lands:

The Edge Function `deliver_notification` consumes this schema. Sky deploys
Edge Functions via Supabase CLI (Constitution Art. 9 — no agent role can
deploy). The Edge Function spec is in `qa-reports/spec-phase-3-push-
notifications.md` §"RPC contracts → Edge Function".

- [ ] Sky writes the Edge Function (against the spec) before Shamus
      starts UI work
- [ ] Dana writes the Edge Function as a FILE in
      `supabase/functions/deliver_notification/index.ts` (file only;
      Sky deploys); Shamus starts UI work in parallel
- [ ] Defer the Edge Function until after the UI is wired (notifications
      land as no-ops until then)

## Risks & open items

1. **No live database touched.** This migration is FILES ONLY. The Mutual
   Mesh project has no production users yet (`STATUS line in CLAUDE.md
   says "Schema is a FILE — not yet applied to any live Supabase
   project"`); apply timing is at Sky's discretion.
2. **Migration ordering:** This is 009. Migration 008 exists in the
   directory but was not read for this work — Dana confirmed via `ls` that
   001-007 cover the existing schema chain; 008's contents do not affect
   009's correctness (no shared columns, no shared functions). If 008
   adds anything that conflicts with `push_tokens` or
   `push_preferences`, the apply will fail loud (CHECK / CONSTRAINT name
   collision); easy to rename and re-apply.
3. **Test coverage:** A `T-PUSH-1` through `T-PUSH-18` stub list is in
   the migration's test-stub section. Steve and Gary need to extend
   `supabase/__tests__/rls.sql` with these scenarios before Phase 3.1
   merge. The list is exhaustive; Steve may collapse some.
4. **Edge Function load-bearing:** The actual delivery path (Edge
   Function `deliver_notification`) is the **other** load-bearing
   surface for the title-only privacy rule. This migration cannot
   enforce the empty-body assertion (that's runtime, in the Edge
   Function). Jordan's FULL review of the Edge Function (when deployed)
   is where the title-only rule is finally locked.
5. **Existing user migration:** The `ADD COLUMN ... DEFAULT '{"enabled":
   false}'` is non-locking in recent Postgres (>11) — applies the default
   without rewriting the table. Confirmed; no apply-time table lock
   expected even at scale.

## Constitution compliance check

- **Art. 1 — never modify main:** N/A; file-only authorship, no git
  operation performed.
- **Art. 5 — never apply to live database:** PASS. Migration is a file at
  `supabase/migrations/009_push_notifications.sql`; Sky applies via
  dashboard.
- **Art. 7.6 — privacy-load-bearing surface, Sky approval required:**
  Surfaced via this report + DFS items. Jordan FULL review required per
  spec; flagged.
- **Art. 9 — only Morgan messages Sky:** PASS. This report is written to
  `qa-reports/`; Morgan picks it up. Dana (this work) does NOT email/
  Slack/notify Sky.
- **Art. 12 — BACKGROUND mode:** N/A; this is ACTIVE mode (explicit
  Dana invocation for Phase 3 spec work).

## Files (absolute paths)

- Migration: `/Users/skypie/MutualMesh/supabase/migrations/009_push_notifications.sql`
- This report: `/Users/skypie/MutualMesh/qa-reports/phase-3-dana-migration-009-2026-05-24.md`
- Source spec: `/Users/skypie/MutualMesh/qa-reports/spec-phase-3-push-notifications.md`
- Schema context: `/Users/skypie/MutualMesh/supabase/schema.sql`
- Pattern references:
  `/Users/skypie/MutualMesh/supabase/migrations/005_pickup_confirmation.sql`
  +  `/Users/skypie/MutualMesh/supabase/migrations/007_prune_completed_resources.sql`

---

**Dana — 2026-05-24** — file-only schema authorship; no live DB touched;
no Sky message sent (Morgan owns that channel per Constitution Art. 9).
