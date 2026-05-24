# Dana — Phase 1 briefing: inactive-admin auto-suspend migration

**Date:** 2026-05-24
**Author:** Dana the Backend Engineer
**Branch:** intended for `data/auto-2026-05-24-dana` (Dana's worktree lane)
**Source finding:** S-CYC1-1 in `qa-reports/2026-05-23_security-cycle-1.md` (Steve)
**Privacy authority:** PRIVACY.md Q4 — Sky resolved 2026-05-23, "auto-suspend after inactivity; Steve drafts the exact threshold + reinstatement flow. Starting point ~30 days no-action → suspended, reinstated on request."

---

## What I built

A new migration file at:

> `supabase/migrations/002_inactive_admin_autosuspend.sql`

It is FILE ONLY. Not applied to any environment. Sky applies via the Supabase dashboard SQL editor (steps below).

The migration:

1. **Extends `verification_log.decision` CHECK constraint** to add a fourth allowed value, `'demote'`. The existing values (`approve`, `reject`, `escalate`) are preserved.
2. **Creates `public.auto_suspend_inactive_admins()`** — a `SECURITY DEFINER` plpgsql function that:
   - Atomically demotes every admin whose `last_active_at` is older than 30 days (`is_admin = false`). `is_verified` is intentionally not touched — demoted admins keep marketplace access.
   - Inserts one row per demotion into `public.verification_log` with `decision='demote'`, `reason='inactive_30d'`, `admin_id=NULL` (the actor is the cron job, not a human admin).
   - Inserts one summary row into `public.cron_log` per nightly run (`rows_affected = count`, `success = true`).
   - Mirrors the error-handling shape of `prune_expired_resources` — on exception, logs `success = false` with `SQLERRM` and re-raises so the failure surfaces.
3. **Schedules the cron job** `auto_suspend_inactive_admins_nightly` at `15 3 * * *` (03:15 UTC), staggered 15 minutes after the existing `prune_expired_resources_nightly` (03:00 UTC).
4. **Includes a commented rollback block** at the bottom of the file. The rollback explicitly warns that if any `decision='demote'` rows already exist in `verification_log`, the CHECK-constraint revert step must be skipped (those rows are append-only audit evidence per S8).
5. **Flags an integration point for Gary/Steve** via inline comment: where to add a test scenario in `supabase/__tests__/rls.sql`.

The migration is idempotent — re-runnable safely.

---

## How it relates to Steve's draft

Steve's S-CYC1-1 draft is the seed. Differences:

| Aspect                            | Steve's draft                       | This migration                                                                                    | Why                                                                                       |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Function name                     | `suspend_inactive_admins`           | `auto_suspend_inactive_admins`                                                                    | Task brief specifies the `auto_` prefix; signals "machine-driven, no user-facing surface" |
| Per-user audit                    | None (only counted in cron_log)     | Inserts one verification_log row per demoted admin (`decision='demote'`, `reason='inactive_30d'`) | Task brief requires it; gives Sky a per-user audit trail beyond aggregate counts          |
| verification_log CHECK constraint | Untouched (would have failed)       | Extended to allow `'demote'`                                                                      | Necessary precondition for the verification_log INSERT                                    |
| Cron schedule                     | `15 3 * * *` (03:15 UTC)            | Same                                                                                              | Staggered from prune (03:00) per Steve and task brief                                     |
| Cron observability                | `cron_log` summary row + error path | Same                                                                                              | Mirrors prune's pattern                                                                   |
| Reinstatement                     | Service-role only (no RPC)          | Same — explicitly documented in file header                                                       | D9 + privilege-escalation-surface concern; matches Steve's recommendation                 |

Steve's draft was sound. This migration adds the per-user audit row, fixes the constraint, and documents the rollback path.

---

## Sky apply steps (numbered)

When you (Sky) are ready to apply this migration:

1. **Pre-check:** Confirm `pg_cron` is enabled in the dashboard (Database → Extensions). It already is per cycle-1, but verify:

   ```sql
   SELECT extname FROM pg_extension WHERE extname = 'pg_cron';
   ```

   Must return one row. If empty, enable it before continuing.

2. **Pre-check:** Confirm `sky_uuid` in `public.config` is set to your real auth.users.id (not the placeholder `00000000-...`). If still placeholder, you will not be able to read `verification_log` or `cron_log` to verify the migration worked:

   ```sql
   SELECT value FROM public.config WHERE key = 'sky_uuid';
   ```

3. **Apply:** Open Supabase dashboard → SQL editor. Paste the entire contents of `supabase/migrations/002_inactive_admin_autosuspend.sql`. Run.

4. **Verify the cron job is scheduled:**

   ```sql
   SELECT jobname, schedule, command, active
   FROM cron.job
   WHERE jobname = 'auto_suspend_inactive_admins_nightly';
   ```

   Expect one row, `schedule = '15 3 * * *'`, `active = true`.

5. **Verify the function exists:**

   ```sql
   SELECT proname, prosecdef
   FROM pg_proc
   WHERE proname = 'auto_suspend_inactive_admins';
   ```

   Expect one row, `prosecdef = true` (SECURITY DEFINER).

6. **Verify the CHECK constraint update:**

   ```sql
   SELECT pg_get_constraintdef(c.oid)
   FROM pg_constraint c
   JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'verification_log' AND c.conname = 'verification_log_decision_check';
   ```

   Expect output containing `'approve'`, `'reject'`, `'escalate'`, `'demote'`.

7. **Smoke test (optional, recommended):** Call the function manually as service_role to confirm it runs without error:

   ```sql
   SELECT public.auto_suspend_inactive_admins();
   SELECT * FROM public.cron_log
     WHERE job_name = 'auto_suspend_inactive_admins'
     ORDER BY ran_at DESC LIMIT 1;
   ```

   Expect one row with `success = true`, `rows_affected = 0` (no inactive admins yet on Day 0).

8. **Watch for the first scheduled run:** Tomorrow at 03:15 UTC, the job runs automatically. The morning after, run:

   ```sql
   SELECT * FROM public.cron_log
     WHERE job_name = 'auto_suspend_inactive_admins'
     ORDER BY ran_at DESC LIMIT 5;
   ```

   Expect a new row dated within the last 24 hours. If not, check `cron.job_run_details` for errors.

---

## Edge cases observed

1. **Dashboard-only admins.** If an admin only uses the dashboard SQL editor to approve users (instead of opening the app), their `last_active_at` will never be touched and they will be auto-demoted at 30 days. Currently this only affects Sky. Acceptable because re-instatement is a one-line SQL UPDATE. If a Cycle 5 admin tool ever ships, the admin tool should call `touch_my_last_active()` on use to avoid surprise demotions.
2. **A demoted-then-reinstated admin** has two verification_log rows (`demote` then potentially nothing — re-instatement is service_role manual UPDATE and does NOT log to verification_log by design, because re-instatement is a direct service-role write, not an RPC). If Sky wants re-instatement logged, that's a small follow-on migration: add a `record_admin_reinstatement(target_user_id, reason)` SECURITY DEFINER function callable from service_role only. Out of scope for this migration.
3. **Concurrent run.** If two cron workers somehow fire the same job (shouldn't happen, but Postgres is honest), the second run sees no eligible admins (already demoted) and inserts a `rows_affected = 0` row. No corruption risk.
4. **Append-only invariant preserved.** The INSERT goes through the existing append-only model (no UPDATE/DELETE policies on verification_log). The function is SECURITY DEFINER so it bypasses the no-INSERT-policy posture by virtue of being the only path; this matches how `approve_user` and `reject_user` write.

---

## DECISIONS FOR SKY

1. **Constraint literal `'demote'`.** I chose `'demote'` over `'auto_demote'` or `'suspend'` for parallelism with the existing `'approve'` / `'reject'` values. If you prefer a different literal, change it in both the ALTER CONSTRAINT and the INSERT statement before applying. Two single-word swaps.
2. **30-day threshold hardcoded.** If you want this tunable without a code change, the right place is a `public.config` row (e.g. `admin_inactivity_days = '30'`) read inside the function. Not done because the only known admin is currently Sky, and changing the literal + re-applying the migration is faster than wiring a config lookup. Flag if you want this changed.
3. **No notification.** The function does not email/notify demoted admins. Constitution Art. 9 restricts external side effects to Morgan-only. If Sky decides demoted admins should know, that's a Cycle 5+ feature.
4. **Test stub.** I left a comment block in the migration pointing Gary/Steve to where to add the test scenario in `supabase/__tests__/rls.sql`. I did not write the test (out of Dana's lane).

---

## Files written

- `supabase/migrations/002_inactive_admin_autosuspend.sql` (new — migration file)
- `qa-reports/phase-1-dana-autosuspend-2026-05-24.md` (this briefing)

No edits to `supabase/schema.sql` (migrations are separate per convention).
No edits to any source code.
No edits to PRIVACY.md (this is implementation of an already-resolved Q4).

---

## FAIL_FAST / BLOCKER states

None. Sky can apply at any time after reading Steps 1–8 above.

---

## What's next

- Steve / Gary add a test scenario in `supabase/__tests__/rls.sql` (pointed to from an inline comment in the migration).
- Morgan can surface the apply-step list to Sky on next `/morgan` invocation.
- After Cycle 5 (admin tool) ships, revisit edge case #1 (admin tool should call `touch_my_last_active()` to keep dashboard-only admins from being surprised by demotion).
