# Phase 1 — Dana: Storage cascade fix (Steve C2 + C3)

**Author:** Dana (Backend Engineer)
**Date:** 2026-05-24
**Branch:** `data/auto-2026-05-24-dana` (file output only; Sky applies)
**Authority:** Constitution v1.3 Art. 7 (privacy load-bearing), PRIVACY.md D6 ("delete means delete"), Steve's audit `qa-reports/phase-1-security-audit-2026-05-24.md` findings **C2** and **C3** (launch-blockers).
**Status:** FILES ONLY — no live database changes. Sky applies via dashboard.

---

## 1. TL;DR

Migration `supabase/migrations/003_storage_cascade_on_delete_and_prune.sql` replaces the existing `delete_my_account()` and `prune_expired_resources()` RPCs so that **Storage objects in the `resource-photos` bucket are now swept before any matching rows are deleted from `public.resources`**. This closes both of Steve's launch-blocker findings (C2 and C3) with a single migration.

No new tables, columns, or cron jobs. CREATE OR REPLACE for both functions — safe to re-run. Rollback block at the bottom restores the prior bodies, with a documented caveat that the storage side is one-way (Supabase PITR does not snapshot bucket contents).

---

## 2. What it does

### 2.1 `delete_my_account()` (Steve C2 — orphan photos after account-delete)

**Before:** Locks `auth.users` row → deletes my posted resources → NULLs out claims I placed on others' resources → deletes `auth.users` row. Storage objects under `resource-photos/<my-uuid>/*.jpg` are **never touched**. PRIVACY.md D6 ("delete means delete") is silently broken.

**After:**

1. Same `FOR UPDATE` lock on `auth.users` (preserved verbatim).
2. **New:** Inside a `BEGIN…EXCEPTION…RAISE` block — collect every non-NULL `photo_url` from `public.resources` where `posted_by = auth.uid()`, then `DELETE FROM storage.objects` for each matching `(bucket_id = 'resource-photos', name = path)` pair.
3. Existing `DELETE FROM public.resources WHERE posted_by = me` runs after the storage sweep.
4. Existing claim-NULL and cascading `DELETE FROM auth.users` steps preserved verbatim.
5. If anything in steps 2-4 raises, the inner `BEGIN` rolls back and re-raises — the client sees a real error rather than a half-deleted account. (Fail-loud, not fail-silent.)

### 2.2 `prune_expired_resources()` (Steve C3 — same root cause, cron path)

**Before:** Single CTE: `DELETE FROM public.resources WHERE <expired> RETURNING id` → `cron_log` row with `rows_affected = count`. Storage objects orphan forever; 30 days × N posts/day × M users = unbounded growth.

**After:**

1. Snapshot the expired-row set into a temp table (`_prune_targets`, `ON COMMIT DROP`) so storage sweep and row delete see the same set without re-evaluating the `WHERE` (avoids a row aging in/out of "expired" between the two reads).
2. `DELETE FROM storage.objects` joined to `_prune_targets` where `photo_url IS NOT NULL`. Capture count.
3. `DELETE FROM public.resources` joined to `_prune_targets`. Capture count.
4. `INSERT INTO cron_log` with `rows_affected = row count`, `success = true`, `error_text = 'storage_deleted=<N>'`. The existing 36h freshness alert keys off `success` and `ran_at`, so it is unaffected. Storage count is auditable via the new `error_text` prefix.
5. Existing exception handler preserved verbatim (re-raises on failure with a `success=false` log row).

---

## 3. How it relates to Steve's audit

| Steve finding                                                                           | Severity                  | Fix in this migration                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| **C2** — `delete_my_account` does not cascade Storage objects (PRIVACY.md D6 violation) | CRITICAL / launch-blocker | `delete_my_account()` now sweeps `storage.objects` before the row cascade.                      |
| **C3** — `prune_expired_resources` does not cascade Storage objects                     | CRITICAL / launch-blocker | `prune_expired_resources()` now sweeps `storage.objects` before the row delete, logs the count. |

**Not addressed in this migration (out of scope per task brief):**

- **C1** — Server-side EXIF strip via Edge Function. This is a separate Edge Function + storage trigger, not an SQL change. Sky's DFS-1 decision will dictate the path. Steve's recommendation was option (a) — restore the spec.
- **DFS-2 option (c)** — Nightly orphan-cleanup cron that scans `storage.objects` for files whose `(uid, ts)` doesn't match a live row. Steve recommended (a)+(c) together. This migration is (a) only; (c) can be a follow-up migration (call it 004) if Sky wants the defense-in-depth.
- **H1-H4 and lower** — Out of scope; separate fixes.

---

## 4. Numbered Sky-apply steps (via Supabase dashboard)

1. Open Supabase project for Mutual Mesh → **SQL editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/003_storage_cascade_on_delete_and_prune.sql`.
3. Click **Run**. Expected output: success on both `CREATE OR REPLACE FUNCTION` statements and on the `DO $$ … $$` permission-grant block. If the GRANT block emits a NOTICE about insufficient privilege (see DECISION #1 below), record the exact text and stop — do not proceed to step 4 until the grant question is resolved.
4. Smoke-test `delete_my_account()` against a throwaway account:
   - Sign up a new test user via the app, get them verified, post a resource WITH a photo.
   - Confirm `storage.objects` has the photo: in the dashboard, **Storage → resource-photos** → the user's folder shows the file.
   - From the app, **Profile → Delete my account**.
   - Confirm `storage.objects` no longer has the photo, and `public.resources` no longer has the row.
5. Smoke-test `prune_expired_resources()` manually:
   - In the dashboard SQL editor, manually backdate a test resource:
     `UPDATE public.resources SET created_at = now() - INTERVAL '31 days' WHERE id = '<test-id>';`
   - Run: `SELECT public.prune_expired_resources();`
   - Verify the row is gone, the storage object is gone, and the latest `cron_log` row for `prune_expired_resources` has `success=true` and `error_text LIKE 'storage_deleted=%'`.
6. (Optional) Confirm the nightly cron picks up the new function body automatically — no cron re-schedule needed because `CREATE OR REPLACE` updates the function in-place and `pg_cron`'s `cron.schedule` references the function by name.

If step 3 fails on the GRANT block specifically, see **DECISIONS FOR SKY** §1 below.

---

## 5. Edge cases flagged

1. **`photo_url IS NULL` (photo-optional posts).** Resources can be created without a photo (Cycle 4 photo-optional flow). The storage sweep filters on `photo_url IS NOT NULL` so the DELETE never receives a NULL path. Row delete still removes the row. Verified in migration logic; test stub T12 covers it.
2. **Malformed `photo_url`.** If a row historically stored a full URL or junk in `photo_url` (shouldn't happen — `photos.ts` always uploads to `<userId>/<ts>.<ext>` — but defensive), the `DELETE FROM storage.objects WHERE name = <junk>` matches zero rows and is a no-op. The row delete proceeds; the orphan object (if any) is unaffected. This is a pre-existing data-shape issue, not a regression.
3. **Race: another transaction inserts a photo for the same user while delete is mid-flight.** `delete_my_account()` already takes `FOR UPDATE` on the `auth.users` row. The storage sweep runs inside that lock window. A concurrent INSERT into `resources` for `posted_by = me` would block on the FK reference to `public.users.id` while the delete is in progress; either it commits before the lock is taken (and gets swept), or it blocks and fails after the user row is gone.
4. **Race: a resource ages into "expired" between the snapshot and the row delete in `prune_expired_resources`.** The temp table `_prune_targets` is the snapshot. The row delete joins to that snapshot, not to the live `WHERE` clause, so a row that becomes expired mid-function is simply caught in the NEXT nightly run. Inverse race (a row that was expired but now isn't — claimed mid-function) is logically impossible because expiration is monotonic in our schema (`status_changed_at` and `created_at` only move forward).
5. **Storage object exists but no matching row (orphan from prior failures).** This migration does NOT sweep pre-existing orphans. Steve's audit DFS-2 option (c) suggests a nightly orphan-cleanup cron for exactly this — out of scope here. If Sky wants the orphan sweep, it's a separate migration 004.
6. **Many resources at once (a poster with hundreds of listings deletes their account).** The storage sweep is a single `DELETE … USING paths` statement, not a loop. Postgres handles the set deletion in one pass. The `auth.users FOR UPDATE` lock holds for the duration; users with thousands of resources will see a slower delete but it's bounded by the row count, not unbounded.
7. **pg_cron not enabled.** The migration does NOT create a cron schedule (the schedule was created in `schema.sql`). If pg_cron is somehow disabled, the function still works when called manually; the nightly automation just doesn't run. Steve's existing 36h freshness alert would surface this.

---

## 6. DECISIONS FOR SKY

### DFS-1: `GRANT DELETE ON storage.objects TO postgres` — does your project allow this?

**Context:** Both new function bodies are `SECURITY DEFINER` and execute as the function owner (the `postgres` role when applied via the Supabase dashboard SQL editor). On a default Supabase project the `postgres` role owns `storage.objects` and has full DML, so the `DELETE FROM storage.objects` inside the function "just works."

**Risk:** Some hardened Supabase setups or self-hosted instances restrict `postgres` on `storage.objects` to read-only. In that case the GRANT in section 3 of the migration emits a NOTICE and the functions still install — but they FAIL at call time with `permission denied for table objects`. The user would see "Could not delete your account" and the row would NOT delete (because the inner BEGIN re-raises).

**Question for Sky:** When you run step 3 of the apply (paste + run the migration), does the output contain a NOTICE about "insufficient privilege" for the GRANT? If yes:

- Pause apply at step 3.
- In the dashboard, **Database → Roles → postgres** — verify whether `storage.objects` is in the role's owned tables list.
- If not, ask Supabase support what role owns `storage.objects` in your project; the GRANT needs to be issued by that owner, or the function owner needs to change to a role that has DELETE on `storage.objects`.

**Default expected outcome:** No NOTICE; functions install cleanly; smoke tests in step 4-5 pass. This is what we expect on a standard Supabase project.

### DFS-2: `error_text` repurposed as a success-side notes field — OK or do you want a real column?

**Context:** The migration packs the storage-object count into `cron_log.error_text` as `storage_deleted=<N>` on successful prune runs. `error_text` was originally only used for SQLERRM on failure. This keeps `rows_affected` semantics unchanged (preserving the 36h freshness alert wiring), but it overloads `error_text`.

**Options:**

- **(a) Accept the overload** — minimal schema churn; one prefix `storage_deleted=` is unambiguous; parseable. **Dana recommends.**
- **(b) Add a column** — `ALTER TABLE public.cron_log ADD COLUMN storage_rows_affected INTEGER;` in a follow-up migration 004. Cleaner long-term; introduces a non-zero schema change.

**Default:** (a). If you want (b), let Morgan know and Dana will write 004.

### DFS-3: Nightly orphan-cleanup cron (Steve's audit DFS-2 option (c)) — fold in now or defer?

**Context:** Steve recommended (a)+(c). This migration is (a). Option (c) is a separate cron job that scans `storage.objects` for files whose `(uid, ts)` doesn't match a live row in `public.resources`, and deletes them. This catches orphans from any historical bugs OR from future code paths that bypass `delete_my_account` / `prune_expired_resources`.

**Recommendation:** Defer to migration 004 unless you want it now. Reason: (a) alone closes the launch-blocker; (c) is defense-in-depth that's cleaner as its own change with its own test coverage.

**Default:** Defer.

---

## 7. Files touched

- **Wrote:** `supabase/migrations/003_storage_cascade_on_delete_and_prune.sql`
- **Wrote:** `qa-reports/phase-1-dana-storage-cascade-2026-05-24.md` (this brief)
- **Read-only:** `supabase/schema.sql`, `supabase/migrations/001_fix_users_rls_recursion.sql`, `supabase/migrations/002_inactive_admin_autosuspend.sql`, `qa-reports/phase-1-security-audit-2026-05-24.md`, `PRIVACY.md`
- **Not touched (per constraint):** `supabase/schema.sql`, `supabase/migrations/001_*`, `supabase/migrations/002_*`

---

## 8. What's next

1. Morgan picks up this brief in the next briefing.
2. Sky reviews DECISIONS FOR SKY §1-§3, then applies via dashboard following section 4.
3. Steve / Gary add test stubs T10-T12 in `supabase/__tests__/rls.sql` per the test-stub block in the migration.
4. Steve re-audits once C2 + C3 are confirmed closed on a real Supabase instance.
5. If Sky picks DFS-3 option (c), Dana writes migration 004 (orphan-sweep cron).

---

**End of brief.**
