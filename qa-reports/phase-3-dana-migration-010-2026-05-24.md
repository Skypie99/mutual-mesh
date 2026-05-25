# Phase 3 — Dana — Migration 010: Fix push_token UNIQUE Constraint — 2026-05-24

## Summary

Wrote `supabase/migrations/010_fix_push_token_unique.sql` — a patch migration
that corrects the UNIQUE constraint on `public.push_tokens` from
`UNIQUE (user_id, expo_token)` (wrong) to `UNIQUE (user_id, platform)` (correct).

This fixes the bug identified by **Steve's security audit** (C2 in
`qa-reports/phase-3-steve-push-audit-2026-05-24.md`) and implements the
schema correction specified in **Quinn's Revision 2** (AC-4 in
`qa-reports/spec-phase-3-push-notifications.md`).

This is a **FILE-ONLY** migration. Dana writes; **Sky applies via the
Supabase dashboard.** Nothing is applied to any live database by this work.

**Constitution authority:** Art. 5 (migrations are files, never applied
live). Art. 7.6 (privacy-load-bearing — push tokens are an external
metadata surface). Mode: ACTIVE (explicit Dana invocation).

## DECISIONS FOR SKY

**No new DFS items.** This migration resolves the existing DFS-MIG9-3
("One-row-per-platform vs dual-device support") from the migration 009
report. Steve's audit and Quinn's Revision 2 both agree: the correct
constraint is `UNIQUE (user_id, platform)`. The dual-device case (same
platform, two devices) is not supported in v1; if Sky wants to revisit,
a future migration can change the constraint.

The `revoke_push_token` signature change (from per-token to no-arg) follows
Quinn's Revision 2 spec. If Sky prefers the old per-token revoke, the
rollback block at the bottom of the migration restores it.

## What it does

1. **Cleans up duplicate rows:** If migration 009 was already applied and
   users registered tokens before this migration runs, there may be
   multiple rows per `(user_id, platform)`. The migration deletes
   duplicates, keeping the row with the most recent `last_used_at`.

2. **DROPs** the incorrect constraint `push_tokens_user_id_expo_token_key`
   (`UNIQUE (user_id, expo_token)` from migration 009).

3. **ADDs** the correct constraint `push_tokens_user_id_platform_key`
   (`UNIQUE (user_id, platform)`).

4. **REPLACEs `register_push_token()`** — the UPSERT now keys on
   `ON CONFLICT (user_id, platform)` and updates `expo_token` + `last_used_at`
   on conflict. Token rotation is fully server-side and atomic.

5. **REPLACEs `revoke_push_token()`** — drops the old `(TEXT)` overload,
   creates a no-arg version that deletes ALL tokens for the caller. Used
   by the "Disable all notifications" button only.

6. **Re-GRANTs EXECUTE** on the changed function signatures.

## Apply steps for Sky

Sky applies via the Supabase dashboard SQL editor. Numbered, copy-paste-able:

1. **Prerequisite:** Migration 009 must already be applied. If not, apply
   009 first (see `qa-reports/phase-3-dana-migration-009-2026-05-24.md`).

2. Open the Supabase dashboard for the Mutual Mesh project. Confirm you're
   on the right project.

3. Open SQL Editor, then New Query.

4. Paste the entire contents of
   `~/MutualMesh/supabase/migrations/010_fix_push_token_unique.sql` into
   the editor.

5. Run. Expected output: one DELETE (duplicate cleanup — may affect 0 rows),
   two DO blocks (constraint drop + add), two CREATE OR REPLACE FUNCTION,
   one DROP FUNCTION, two GRANT EXECUTE. No errors.

6. Verify the constraint swap:

   ```sql
   -- Old constraint should NOT exist:
   SELECT 1 FROM pg_constraint
   WHERE conname = 'push_tokens_user_id_expo_token_key'
     AND conrelid = 'public.push_tokens'::regclass;
   -- Expected: 0 rows

   -- New constraint should exist:
   SELECT 1 FROM pg_constraint
   WHERE conname = 'push_tokens_user_id_platform_key'
     AND conrelid = 'public.push_tokens'::regclass;
   -- Expected: 1 row
   ```

7. Smoke-test token rotation (as an authenticated test user):

   ```sql
   -- Register an iOS token
   SELECT public.register_push_token('ExponentPushToken[aaa111]', 'ios');
   -- Expected: true

   -- "Rotate" — register a DIFFERENT token on same platform
   SELECT public.register_push_token('ExponentPushToken[bbb222]', 'ios');
   -- Expected: true

   -- Verify exactly ONE row for this user+platform, with the NEW token:
   SELECT expo_token, platform FROM public.push_tokens WHERE user_id = auth.uid();
   -- Expected: 1 row, expo_token = 'ExponentPushToken[bbb222]', platform = 'ios'

   -- Revoke all (no args):
   SELECT public.revoke_push_token();
   -- Expected: true

   SELECT count(*) FROM public.push_tokens WHERE user_id = auth.uid();
   -- Expected: 0
   ```

8. Verify the old per-token revoke is gone:
   ```sql
   SELECT public.revoke_push_token('ExponentPushToken[anything]');
   -- Expected: ERROR — function does not exist (the TEXT overload was dropped)
   ```

## Rollback steps

If anything goes wrong, the commented-out ROLLBACK block at the bottom of
the migration file restores migration 009's original behavior:

1. Open SQL Editor in the Supabase dashboard.
2. Copy the ROLLBACK block from the bottom of migration 010 (lines between
   `-- BEGIN;` and `-- COMMIT;`), uncomment them, and run.
3. This restores:
   - `UNIQUE (user_id, expo_token)` constraint
   - `register_push_token` with `ON CONFLICT (user_id, expo_token)`
   - `revoke_push_token(TEXT)` per-token signature
4. After rollback, client-side token rotation (AC-4 original) is required
   again — the client must call `revoke_push_token(old_token)` before
   `register_push_token(new_token, platform)`.

## Risks

1. **Data migration:** If tokens exist before this migration runs, the
   duplicate-cleanup step deletes all but the most recent row per
   `(user_id, platform)`. This is the correct behavior (latest token =
   valid token), but it means older tokens for the same platform are lost.
   Acceptable: those tokens were stale anyway (the latest one is the one
   the OS will deliver to).

2. **Client code dependency:** Shamus's `push.ts` helper must be updated
   to call `revoke_push_token()` with no arguments (not per-token). If
   Shamus has already wired the per-token call, it will error after this
   migration. Shamus should be notified via Morgan.

3. **No live database touched.** FILE ONLY. The Mutual Mesh project has no
   production users yet.

## Constitution compliance check

- **Art. 1 — never modify main:** N/A; file-only authorship.
- **Art. 5 — never apply to live database:** PASS. Migration is a file;
  Sky applies via dashboard.
- **Art. 7.6 — privacy-load-bearing:** Constraint change does not alter
  the privacy posture (same data, same RLS, same CASCADE). No new Jordan
  review needed for this patch.
- **Art. 9 — only Morgan messages Sky:** PASS. This report is written to
  `qa-reports/`; Morgan picks it up.

## Files (absolute paths)

- Migration: `/Users/skypie/MutualMesh/supabase/migrations/010_fix_push_token_unique.sql`
- This report: `/Users/skypie/MutualMesh/qa-reports/phase-3-dana-migration-010-2026-05-24.md`
- Patched migration: `/Users/skypie/MutualMesh/supabase/migrations/009_push_notifications.sql`
- Steve audit: `/Users/skypie/MutualMesh/qa-reports/phase-3-steve-push-audit-2026-05-24.md`
- Quinn spec: `/Users/skypie/MutualMesh/qa-reports/spec-phase-3-push-notifications.md`

---

**Dana -- 2026-05-24** -- file-only schema patch; no live DB touched;
no Sky message sent (Morgan owns that channel per Constitution Art. 9).
