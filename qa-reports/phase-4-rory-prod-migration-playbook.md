# Phase 4 — Rory — Production Supabase Migration Playbook

**Author:** Rory (DevOps)
**Date:** 2026-05-24
**Phase:** 4 (Launch infrastructure) — Tier 4 item #23 in `plans/goofy-singing-steele.md`
**Status:** FILE ONLY — Sky executes every numbered step on the Supabase dashboard. Rory does not apply.

---

## Purpose

We currently run on a single staging Supabase project (Kelowna + Nelson seeded, applied 2026-05-24). Going public requires a **separate production project** with the identical schema, applied in a deterministic order, with a documented rollback for each step and a smoke test at the end.

This playbook is the script Sky follows once. Every step is reversible (or has a documented "no rollback" with reason). Nothing here runs automatically — Rory wrote it; Sky executes it.

---

## Pre-flight checklist (before Step 1)

- [ ] All 7 migration files exist in `supabase/migrations/` and are committed to `main`
- [ ] `supabase/schema.sql` and `supabase/realtime.sql` are committed to `main`
- [ ] `supabase/functions/exif-strip/index.ts` exists and is committed to `main`
- [ ] Steve's Phase-1 security audit is GREEN (`qa-reports/phase-1-security-audit-2026-05-24.md`)
- [ ] Jordan has signed off on every privacy-touching feature shipped so far
- [ ] `eas.json` has the placeholder `YOUR-PRODUCTION-PROJECT.supabase.co` / `YOUR-PRODUCTION-ANON-KEY` strings ready to be swapped in after Step 1

If anything above is unchecked, STOP and resolve before continuing.

---

## Migration order

Apply files in this exact order. Each file is idempotent (CREATE IF NOT EXISTS / DROP IF EXISTS at the top of each policy block), so a re-run is safe — but the **order matters** because later migrations reference earlier objects.

```
1. supabase/schema.sql                            (full Day-0 schema)
2. supabase/migrations/001_fix_users_rls_recursion.sql
3. supabase/migrations/002_inactive_admin_autosuspend.sql
4. supabase/migrations/003_storage_cascade_on_delete_and_prune.sql
5. supabase/migrations/004_resource_categories.sql
6. supabase/migrations/005_pickup_confirmation.sql
7. supabase/migrations/006_onboarding_complete.sql
8. supabase/migrations/007_prune_completed_resources.sql
9. supabase/migrations/008_*.sql                  (IF Steve's error-reporting migration has shipped — see Step 2 note)
10. supabase/realtime.sql                         (realtime publication, applied LAST)
```

---

## Numbered steps (Sky executes)

---

### Step 1 — Create new Supabase project "mutual-mesh-production"

**Why:** True isolation from staging. A separate organization (not just a separate project inside the staging org) ensures (a) billing isolation, (b) no shared API keys, (c) no chance a staging dashboard mis-click hits production.

**Do:**

1. Log into <https://supabase.com/dashboard>.
2. Click "New organization." Name: `mutual-mesh-prod`. Region: `ca-central-1` (Montreal — Canadian data residency; matches Jordan's privacy posture).
3. Inside the new org, click "New project." Name: `mutual-mesh-production`. Region: `ca-central-1`. DB password: generate fresh, store in 1Password (NOT in any repo, NOT in `.env`, NOT pasted into chat).
4. Wait for provisioning (~2 min).
5. Settings → API → copy the **Project URL** and the **`anon` public key**. These go into `eas.json` `production.env` (replace the `YOUR-PRODUCTION-PROJECT` / `YOUR-PRODUCTION-ANON-KEY` placeholders) and into Sky's local `.env.production` if you build a local production-target dev client.
6. Settings → API → also copy the **`service_role` key**. This goes into:
   - 1Password (primary store)
   - The Edge Function env var `SUPABASE_SERVICE_ROLE_KEY` (Step 7)
   - NEVER into the repo, NEVER into `.env`, NEVER into `eas.json`.

**Rollback:** Delete the project from Settings → General → "Delete project". No external state is created at this step; deletion is clean. (Note: org deletion is a separate, slower operation; delete the project first, then the org if you want full teardown.)

**EAS profile pointer:**

- `production` profile in `eas.json` uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from this new project.
- `development` and `preview` profiles continue to point at **staging**. Do NOT update them.

---

### Step 2 — Apply schema + migrations in order

**Why:** Schema is a file in our repo; the production database needs to be brought up to the same state. Each migration was written to be idempotent and Sky-applied (per `~/MutualMesh/CLAUDE.md` "Schema changes are FILES, never live applies").

**Do:** For each file in the migration-order list above, in order:

1. Open Supabase dashboard → SQL Editor → "New query".
2. Paste the entire contents of the file.
3. Click "Run" (or Cmd+Enter).
4. Verify "Success. No rows returned" (or row count if the migration includes a one-time data backfill).
5. Open SQL Editor → run a verification query specific to that migration (see "Per-migration verification" section below).
6. Move to the next file. Do NOT run more than one migration in the same SQL Editor session — keep them as discrete pastes so you can see exactly which one failed if any does.

**Per-migration verification queries:**

```sql
-- After schema.sql:
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- Expect: config, cron_log, invite_tokens, resources, users, verification_log (6 tables)

-- After 001_fix_users_rls_recursion.sql:
SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' ORDER BY policyname;
-- Verify no policy references public.users in its USING clause (recursion fix).

-- After 002_inactive_admin_autosuspend.sql:
SELECT proname FROM pg_proc WHERE proname IN ('suspend_inactive_admins', 'touch_my_last_active');
-- Expect both rows present.

-- After 003_storage_cascade_on_delete_and_prune.sql:
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE '%cascade%' OR routine_name LIKE '%prune%';

-- After 004_resource_categories.sql:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'resources' AND column_name = 'category';
-- Expect: category | USER-DEFINED (the enum)

-- After 005_pickup_confirmation.sql:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'resources'
  AND column_name IN ('confirmed_at_by_giver', 'confirmed_at_by_receiver', 'completed_at');

-- After 006_onboarding_complete.sql:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'onboarding_completed_at';

-- After 007_prune_completed_resources.sql:
SELECT proname FROM pg_proc WHERE proname = 'prune_completed_resources';
```

**Step-2 note on migration 008 (Steve's anonymous error reporting — Tier 4 #22):**
If Steve has shipped 008 by the time Sky runs this playbook, apply it in slot 8 (between 007 and realtime.sql). If not yet shipped, skip slot 8 and proceed to Step 3.

**Rollback for Step 2:**
Each migration ships with a `-- ROLLBACK:` comment block at the bottom (Dana's convention). If a migration partially fails:

1. Read the error in the SQL Editor output.
2. Open the migration file, scroll to the `-- ROLLBACK:` block.
3. Paste and run the rollback SQL.
4. Verify the verification query for the PREVIOUS migration still passes (proving you're back at a known-good state).
5. Surface to Morgan with the exact error message; do not retry blindly.

If a migration cannot be cleanly rolled back (rare — happens only if you ran it twice without idempotency), the safest option is **delete the production project and restart from Step 1**. The project has no production data yet, so cost = zero.

---

### Step 3 — Apply `realtime.sql`

**Why:** Enables Postgres realtime CDC on `public.resources` so the marketplace feed can subscribe to live changes. This is a separate file because realtime publication membership is not RLS — it's a Postgres-level publication that the Supabase Realtime worker reads from.

**Do:**

1. SQL Editor → paste full contents of `supabase/realtime.sql`.
2. Run.
3. Verify:
   ```sql
   SELECT schemaname, tablename FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime';
   ```
   Expect at least `public.resources` in the output.

**Rollback:**

```sql
ALTER PUBLICATION supabase_realtime DROP TABLE public.resources;
```

This stops realtime broadcasts without affecting any data.

---

### Step 4 — Verify Storage bucket is PRIVATE

**Why:** PRIVACY.md D4 and Steve C1: `resource-photos` MUST be private (`public = false`). Public buckets bypass RLS — any URL anyone constructs hits the file. Our model relies on signed URLs gated by `is_verified = true`.

**Do:**

1. Dashboard → Storage → Buckets. Verify `resource-photos` exists.
   - If it doesn't exist, create it: name `resource-photos`, **Public = OFF**, file size limit 10 MB (matches `MAX_BYTES` in the exif-strip function), allowed MIME types `image/jpeg, image/png`.
2. Click the bucket → Configuration → confirm "Public bucket" is OFF.
3. Verify Storage RLS policies are in place:
   ```sql
   SELECT policyname, cmd FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
   ORDER BY policyname;
   ```
   Expect the four policies from `schema.sql` lines around the `storage.objects` section (verified users SELECT, owner INSERT, owner UPDATE/DELETE).
4. Manual probe (do this from an unauthenticated browser tab, NOT logged into Supabase):
   ```
   curl -i https://YOUR-PRODUCTION-PROJECT.supabase.co/storage/v1/object/public/resource-photos/test.jpg
   ```
   Expect 400 or 404. If you get 200 with any image bytes, the bucket is public — STOP and surface to Morgan immediately.

**Rollback:** If the bucket was accidentally created public, toggle "Public bucket" to OFF, then re-run the probe.

---

### Step 5 — Promote first admin (Sky) via service-role SQL

**Why:** `protect_admin_flags` trigger blocks `UPDATE … SET is_admin = true` from the `authenticated` role. Only the `service_role` (used by Supabase dashboard SQL Editor, by definition) can bypass the trigger. This is a one-time bootstrap; after Sky exists as admin, future admins are promoted via the in-app Admin UI.

**Do:**

1. Sign Sky up via the production app (built from `production` EAS profile — see release runbook Step 4). Complete the 3-step signup flow. Sky's row exists in `public.users` with a `pending-XXX` handle, `is_verified = false`, `is_admin = false`.
2. In the Supabase dashboard SQL Editor, find Sky's auth UUID:
   ```sql
   SELECT id, email, created_at FROM auth.users WHERE email = 'skylerhalisky@gmail.com';
   ```
3. Copy the UUID.
4. Promote:
   ```sql
   UPDATE public.users
   SET is_verified = true, is_admin = true
   WHERE id = 'PASTE-SKY-UUID-HERE';
   ```
5. Verify:
   ```sql
   SELECT id, handle, is_verified, is_admin FROM public.users WHERE id = 'PASTE-SKY-UUID-HERE';
   ```
   Expect: `is_verified = t, is_admin = t`.

**Rollback:**

```sql
UPDATE public.users SET is_verified = false, is_admin = false WHERE id = 'PASTE-SKY-UUID-HERE';
```

Or, in extreme case, delete the row and re-signup.

---

### Step 6 — Set `config.sky_uuid`

**Why:** `verification_log` (S8) and `cron_log` (S6) are Sky-only-SELECT, gated by a `public.config` row keyed `sky_uuid`. Without this row, even Sky cannot read the audit log.

**Do:**

1. SQL Editor:
   ```sql
   INSERT INTO public.config (key, value)
   VALUES ('sky_uuid', 'PASTE-SKY-UUID-HERE')
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   ```
2. Verify:
   ```sql
   SELECT * FROM public.config WHERE key = 'sky_uuid';
   ```
3. Sanity check the audit-log read path:
   ```sql
   -- Run as Sky (authenticated session via the app, NOT the SQL Editor service-role).
   SELECT count(*) FROM public.verification_log;
   ```
   Expect: a number (0 is fine; production hasn't approved anyone yet). If you get a permission-denied, the config row is wrong.

**Rollback:**

```sql
DELETE FROM public.config WHERE key = 'sky_uuid';
```

This removes Sky's audit-log access but doesn't break anything else; you can re-insert at any time.

---

### Step 7 — Deploy `exif-strip` Edge Function

**Why:** PRIVACY.md D5 second layer. The client-side strip in `src/lib/photos.ts` is the primary defense; this function re-strips server-side after upload as defense-in-depth against a tampered/forked client.

**Do:** This step uses the Supabase CLI (`supabase functions deploy exif-strip`). **Rory does not run this** — Sky does. Pre-requisites:

1. `supabase` CLI installed (`brew install supabase/tap/supabase`).
2. `supabase login` (browser auth).
3. Inside `~/MutualMesh`:
   ```
   supabase link --project-ref YOUR-PRODUCTION-PROJECT-REF
   ```
   (Project ref is the subdomain portion of the URL, e.g. `abcd1234efgh5678`.)
4. Generate a webhook secret:
   ```
   openssl rand -hex 32
   ```
   Copy the 64-char hex string. Store in 1Password as `MutualMesh prod STRIP_WEBHOOK_SECRET`. This goes into Step 8.
5. Set the function's required env vars in the Supabase dashboard:
   - Dashboard → Edge Functions → Settings → Secrets (function-level).
   - Add `STRIP_WEBHOOK_SECRET` = (the hex string from step 4).
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase at runtime — do NOT override them.
6. Deploy:
   ```
   supabase functions deploy exif-strip --project-ref YOUR-PRODUCTION-PROJECT-REF
   ```
7. Smoke test via curl (substitute your URL + secret):
   ```
   curl -i -X POST "https://YOUR-PRODUCTION-PROJECT.supabase.co/functions/v1/exif-strip" \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: YOUR-SECRET-FROM-STEP-4" \
     -d '{"type":"INSERT","table":"objects","schema":"storage","record":{"id":"smoke","bucket_id":"resource-photos","name":"nonexistent.jpg","metadata":{}}}'
   ```
   Expect either 500 with `download_failed` (function reached, file doesn't exist) or 200 (function reached, processed). 401 means your secret is wrong; 404 means the function wasn't deployed.

**Rollback:**

```
supabase functions delete exif-strip --project-ref YOUR-PRODUCTION-PROJECT-REF
```

Then immediately disable the Storage webhook (Step 8 rollback) — otherwise new uploads will retry against a missing function and pile up errors.

---

### Step 8 — Wire Storage webhook → `exif-strip`

**Why:** The function only runs if Storage events trigger it. Storage webhooks are configured in the Supabase dashboard, not in code.

**Do:**

1. Dashboard → Database → Webhooks → Create a new hook.
2. Name: `resource-photos-exif-strip`.
3. Table: `storage.objects`.
4. Events: `Insert` ONLY (uncheck Update + Delete).
5. Type: HTTP Request.
6. HTTP method: `POST`.
7. URL: `https://YOUR-PRODUCTION-PROJECT.supabase.co/functions/v1/exif-strip`.
8. HTTP headers:
   - `Content-Type: application/json`
   - `x-webhook-secret: PASTE-STRIP_WEBHOOK_SECRET-FROM-STEP-7`
9. HTTP params: leave default.
10. Conditions: add a filter `bucket_id = resource-photos` so we only fire on the right bucket (saves cost on any future buckets).
11. Save.
12. Smoke test:
    - Open the production app as a verified user.
    - Post a resource with a photo.
    - Dashboard → Edge Functions → exif-strip → Logs. Expect to see `[exif-strip] ok path=...` within ~2 seconds.
    - Download the photo back via the app (ResourceDetail screen). Verify the photo displays.
    - Optional deep verification: SSH-equivalent download the raw bytes and run `exiftool` on them — expect "No EXIF data" or only width/height/encoder metadata.

**Rollback:**

1. Dashboard → Database → Webhooks → find `resource-photos-exif-strip` → Disable (don't delete; you may want to re-enable after a fix).
2. Re-enable: same path, click Enable.

---

### Step 9 — Verify RLS test suite against a SEPARATE test project

**Why:** Steve's `supabase/__tests__/rls.sql` exercises every RLS policy. Running it against production would (a) create test users in production, (b) write to production tables. We need to verify against a separate test project that mirrors the production schema.

**Do:**

1. Create a third Supabase project: `mutual-mesh-rls-test` (same org as production is fine — it's still isolated).
2. Apply Steps 2 + 3 against this test project (schema + all migrations + realtime).
3. Open `supabase/__tests__/rls.sql` — read the "How to run" comment block at the top.
4. In the test project's SQL Editor, run the suite. Verify ALL assertions pass.
5. If anything fails, the issue is in the migrations as applied, not in the test — STOP, surface to Morgan, do NOT proceed to Step 10 with broken RLS.
6. After the test passes, delete `mutual-mesh-rls-test` (don't leave test projects accumulating).

**Rollback:** Delete the test project. Test data was confined to it.

**Why a separate project, not staging:** Staging has real seed data (Kelowna + Nelson). Running the RLS suite there would create test users mixed in with real-looking data, contaminating Casey's seed metrics.

---

### Step 10 — Smoke test: signup → claim → confirm pickup

**Why:** End-to-end verification that the production project actually works for a normal user flow. Catches misconfigurations that per-step verification misses (e.g., realtime not flowing, signed URLs returning 403, claim RPC erroring).

**Do (Sky executes from the production EAS build):**

1. **Signup as a brand-new user** (use a second email; NOT Sky's primary):
   - Open the production app.
   - Sign up → enter email → receive OTP → enter OTP → choose a generated handle → land in WaitingRoom.
   - Verify in dashboard: `SELECT id, handle, is_verified FROM public.users WHERE email = 'test-user-email';` → row exists, `is_verified = false`.
2. **Promote test user** (Sky as admin):
   - Dashboard SQL Editor: `UPDATE public.users SET is_verified = true WHERE email = 'test-user-email';`
   - In the test-user app session, watch the WaitingRoom flip to Home within ~5s (realtime subscription).
3. **Post a resource** (Sky as already-verified):
   - Open Sky's production app session.
   - Tap FAB → fill in title "Smoke test apples" → attach a photo → choose category "food" → submit.
   - Verify it appears in the feed within ~3s (realtime).
   - Dashboard verification: `SELECT id, title, status, photo_url FROM public.resources WHERE title = 'Smoke test apples';` → row exists, `status = 'available'`.
   - Verify the photo URL is a Storage path (not a signed URL); the client converts to signed at view-time.
4. **Claim** (from test-user session):
   - Open the resource detail → tap Claim.
   - Verify status flips to `reserved`, contact handle reveals.
   - Dashboard verification: `SELECT id, status, claimed_by FROM public.resources WHERE title = 'Smoke test apples';` → `status = 'reserved'`, `claimed_by = test-user-uuid`.
5. **Confirm pickup** (both sides):
   - Test user (claimant) taps "Confirm I got it."
   - Sky (poster) taps "Confirm I handed it over."
   - Verify resource status flips to `completed`.
   - Dashboard verification:
     ```sql
     SELECT id, status, confirmed_at_by_giver, confirmed_at_by_receiver, completed_at
     FROM public.resources WHERE title = 'Smoke test apples';
     ```
     Expect all three timestamps populated, `status = 'completed'`.
6. **Delete test data**:
   ```sql
   DELETE FROM public.resources WHERE title = 'Smoke test apples';
   ```
   (Cascade trigger from migration 003 removes the Storage photo too.)
7. **Delete test user**:
   - Sky opens admin UI → rejects/deletes the test user, OR
   - SQL: `SELECT public.reject_user('test-user-uuid', 'smoke-test cleanup');` — note this cascade-deletes the auth.users row.
8. **Verify cleanup**:
   ```sql
   SELECT count(*) FROM public.resources WHERE title = 'Smoke test apples';  -- expect 0
   SELECT count(*) FROM public.users WHERE email = 'test-user-email';  -- expect 0
   SELECT count(*) FROM auth.users WHERE email = 'test-user-email';  -- expect 0
   ```

**Rollback:**
There's nothing to roll back — if anything in this step fails, surface to Morgan with the exact failure and DO NOT proceed to public launch. The point of Step 10 is to find issues before any real user touches production.

---

## After all 10 steps pass

- [ ] Update `eas.json` `production.env` values with the real production URL + anon key.
- [ ] Commit the eas.json change on a `release/` branch.
- [ ] Sky merges to `main`.
- [ ] First production build via `eas build --profile production` — see `qa-reports/phase-4-rory-release-runbook.md` for the platform-specific submission steps.
- [ ] Notify Morgan: "Production Supabase is live. Smoke test passed. Ready for first store submission."

---

## EAS profile pointers (for cross-reference with `eas.json`)

| Profile       | Supabase project               | Bundle ID            | Channel       | Distribution                |
| ------------- | ------------------------------ | -------------------- | ------------- | --------------------------- |
| `development` | staging                        | `com.mutualmesh.app` | `development` | EAS Internal (sim + device) |
| `preview`     | staging                        | `com.mutualmesh.app` | `preview`     | TestFlight + Play Internal  |
| `production`  | **production (this playbook)** | `com.mutualmesh.app` | `production`  | App Store + Play Store      |

The `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in each profile's `env` block control which Supabase project that build talks to. The keys themselves are NOT secrets (RLS gates them); the placeholders in `eas.json` exist so the project can be cloned without secrets leaking, and Sky fills the real values locally before the first build.

---

## DECISIONS FOR SKY

1. **Region for production:** I've assumed `ca-central-1` (Montreal). Confirms with Jordan's "Canadian data residency" preference but adds ~30ms latency for Vancouver/Toronto users vs `us-east-1`. **Decide: ca-central-1, or override?**
2. **Separate organization (not just project):** Step 1 creates a NEW organization, not just a new project under the staging org. This is true isolation but means a separate billing relationship. **Decide: separate org, or same org with a new project?**
3. **Database password storage:** I've specified 1Password. **Decide: 1Password, or different password manager?**
4. **Service-role key handling:** Per the Constitution and AGENT_OS, secrets never enter the repo. The service-role key lives only in 1Password and in the Edge Function's secrets config. **Confirm: this matches your preference.**
5. **RLS test on a third project:** I've recommended a separate `mutual-mesh-rls-test` project for Step 9. The cheaper alternative is to skip Step 9 and trust the staging RLS tests. **Decide: extra rigor (recommended), or trust staging?**
6. **Storage webhook secret rotation:** No automated rotation. If `STRIP_WEBHOOK_SECRET` ever leaks, rotate manually (generate new secret → update Edge Function env var → update webhook header → reload webhook). **Note this; no action needed unless a leak happens.**
7. **Migration 008 (Steve's error reporting) — does it exist yet?** Phase 4 Tier 4 #22 is "Anonymous error reporting." If Steve hasn't shipped that migration by the time you run this playbook, skip slot 8. If he has, slot 8 between 007 and realtime.sql.
