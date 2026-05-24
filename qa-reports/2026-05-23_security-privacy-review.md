# Security review of Jordan's PRIVACY.md draft — Steve — 2026-05-23

## Summary

Reviewed Jordan's `PRIVACY.md` v1 draft. Strong starting position — drops the worst PII risks from the PRD and lays out an auditable data inventory. Eight findings worth surfacing to Sky alongside Jordan's DECISIONS list. None are showstoppers; most are implementation specifics for Cycle 0 Phase 0b. One (S4) is a meaningful risk Sky should consciously accept or push back on.

## DECISIONS FOR SKY

### S1: Specify the entropy of the invite-token (referrer)

**What's being asked:** Pin the invite token format at 12+ chars from a 36-char alphabet (alphanumeric, mixed case-insensitive) — that's ~62 bits of entropy, sufficient against brute-forcing even with no rate limit.
**Why:** Jordan's draft says "8-character alphanumeric" which is ~41 bits — guessable with a moderately determined adversary on an unrated endpoint.
**Exact steps to apply:** Update D4 in `PRIVACY.md` to specify "12+ char invite token, base32-alphabet (Crockford), single-use, hashed with bcrypt cost 10 before storage." Dana's `users` table column becomes `referrer_token_hash TEXT` storing the bcrypt result, not the raw token.
**Rollback:** If 12 chars feels long to type, downgrade to 10 (50 bits) — still acceptable. Don't go below 10.

### S2: Rate-limit the invite-token verification endpoint

**What's being asked:** Add a 10/min/IP rate limit on the signup RPC that consumes an invite token.
**Why:** Even with high entropy, an adversary could try invite codes through a script. A simple rate limit makes brute-force impractical.
**Exact steps to apply:** Add an Edge Function fronting the signup flow with a 10/min/IP limit. Alternative: do it at the Postgres level with `pg_stat_statements` and a trigger that raises after N attempts/min/IP.
**Rollback:** Disable the limit if it false-positives on shared NATs. Document the trade-off.

### S3: `pickup_text` and `contact_handle` are XSS / phishing surfaces

**What's being asked:** Sanitize and length-cap both fields. Render as plain text (no Markdown, no URLs auto-linked) in the client.
**Why:** A poster could put `<script>` or a phishing URL in `pickup_text`. Without escaping at render time, claimants would be exposed. A phishing handle in `contact_handle` is the most plausible attack — "DM me on Signal at +1 555-0100" with a number that's actually a SIM-swap target.
**Exact steps to apply:**

1. `pickup_text`: cap at 280 chars in schema (`CHECK (length(pickup_text) <= 280)`). Render with React Native `<Text>` (which is escape-safe by default) — do NOT use `dangerouslySetInnerHTML` or equivalent.
2. `contact_handle`: cap at 64 chars. In the UI, warn the user explicitly before showing it: "This handle is provided by the poster. Verify before sharing personal details."
3. Add a server-side regex to reject `contact_handle` containing URLs (`/(https?:\/\/|www\.)/i`) — force users to provide a handle, not a link.
   **Rollback:** Loosen rejection regex if it false-positives on legitimate use cases.

### S4: Storage URL signing expiry and rotation (load-bearing)

**What's being asked:** Photos in Storage must use signed URLs with a short TTL (e.g., 1 hour) regenerated on every fetch. Public-bucket photos are NOT acceptable for this audience.
**Why:** Supabase Storage supports public buckets (URLs anyone can hit) and private buckets (signed URLs only). A public bucket means a leaked URL is forever public — and an attacker who knows the path scheme `<userId>/<timestamp>.<ext>` can enumerate.
**Exact steps to apply:**

1. Storage bucket `resource-photos` is PRIVATE.
2. Client fetches signed URLs via `supabase.storage.from('resource-photos').createSignedUrl(path, 3600)` per photo per session.
3. RLS on the bucket: only verified users can `createSignedUrl`; only the poster can delete their own photos.
4. Add a test in `supabase/__tests__/storage_rls.sql` that asserts an unverified user cannot generate a signed URL.
   **Rollback:** N/A — this is a foundational decision.
   **Note:** Jordan's draft mentioned "signed URL" once (item 9, table column). Steve recommends elevating it to a numbered decision because it's load-bearing.

### S5: `delete_my_account()` race conditions

**What's being asked:** Wrap the deletion RPC in a single transaction with `SELECT ... FOR UPDATE` on `auth.users` to serialize concurrent deletes/posts.
**Why:** If a user deletes while a claim is in flight, the claim could succeed against a half-deleted user, leaving an orphan row.
**Exact steps to apply:** In Dana's `delete_my_account()` RPC:

```sql
BEGIN;
SELECT id FROM auth.users WHERE id = auth.uid() FOR UPDATE;
-- cascade deletes here
DELETE FROM public.resources WHERE posted_by = auth.uid();
UPDATE public.resources SET claimed_by = NULL WHERE claimed_by = auth.uid();
DELETE FROM public.users WHERE id = auth.uid();
DELETE FROM auth.users WHERE id = auth.uid();
COMMIT;
```

Photos cascade via the Storage trigger Dana defines.
**Rollback:** N/A — must be atomic.

### S6: `prune_expired_resources()` failure observability

**What's being asked:** The nightly cron job must log to a `cron_log` table with success/failure + row count, and a separate alert if N consecutive failures.
**Why:** Silent cron failures = listings accumulate forever = retention promise broken.
**Exact steps to apply:** Dana adds a `public.cron_log(job_name, ran_at, rows_affected, success, error_text)` table. The prune job's last statement inserts a row. Steve adds a check (Cycle 7) that the most-recent prune row is < 36h old.
**Rollback:** N/A — observability is non-negotiable for a retention promise.

### S7: Auth-session storage on device

**What's being asked:** Confirm `@react-native-async-storage/async-storage` is used (not SecureStore). Document that local device theft = session theft. Add a "Sign out" prompt that's prominent.
**Why:** AsyncStorage is unencrypted at rest on the device. A surveillance-averse user whose phone is seized may have an open session. SecureStore (iOS Keychain / Android Keystore) is encrypted but has size limits.
**Exact steps to apply:**

- For MVP, stay on AsyncStorage (matches AccessMap) but disclose in `PRIVACY.md` and in the in-app onboarding.
- For v2, evaluate Supabase auth + SecureStore wrapper; the size limit may bite us if we add features.
  **Rollback:** N/A — this is a disclosure, not a code change.

### S8: Verification log integrity

**What's being asked:** The `verification_log` table should have an append-only constraint (no UPDATE, no DELETE except by the prune job). Sky should be the only one able to SELECT it.
**Why:** Jordan said admins shouldn't see each other's notes. An admin with database access (via compromise) could modify the log. Append-only at the RLS level enforces this.
**Exact steps to apply:**

```sql
CREATE POLICY verification_log_insert_only ON public.verification_log
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
-- No UPDATE policy, no DELETE policy (except service_role / pg_cron)
CREATE POLICY verification_log_select_sky_only ON public.verification_log
  FOR SELECT TO authenticated USING (
    auth.uid() = '<SKY_USER_UUID>'::uuid  -- or via a config table
  );
```

**Rollback:** Loosen SELECT later if Sky wants to delegate audit-review to a trusted reviewer.

## FAIL_FAST / BLOCKER states

None. All findings are advisory and can be applied during Phase 0b without re-architecting Jordan's model.

## What I shipped

- This audit report at `qa-reports/2026-05-23_security-privacy-review.md`
- Appended a summary into `PRIVACY.md` "Steve's security audit notes" section (links back here)

Proposal only — no schema files or code changed.

## What's next

Sky's review of Jordan's D1–D10 + Steve's S1–S8 together. Once both are approved, Dana writes `supabase/schema.sql` reflecting both. Until then, Phase 0b is still gated.
