# Phase 3+4 Security Sweep — Steve
**Date:** 2026-05-24  
**Scope:** Phase 3 + 4 code (pushNotifications.ts, pushPreferences.ts, errorReporting.ts, mapHelpers.ts, i18n.ts, Toggle.tsx, PrivacyPolicyScreen.tsx, TermsOfServiceScreen.tsx, supabase/migrations/010_fix_push_token_unique.sql)  
**Auditor:** Steve (Security Engineer)  
**Mode:** Read-only audit — no code changes

---

## Findings Summary

| # | Severity | File | Line(s) | Title | Fix |
|---|----------|------|---------|-------|-----|
| F1 | HIGH | `src/lib/pushNotifications.ts` | 30–32 + `migrations/009` + `migrations/010` | Server-side preference gate is documented but not implemented | Add `is_verified` + preference check to `register_push_token` RPC |
| F2 | HIGH | `src/lib/errorReporting.ts` | 98–168 | PII heuristic gap: Expo push token format not caught | Add bracket-aware regex variant to `PII_HEURISTICS` |
| F3 | HIGH | `src/lib/errorReporting.ts` | 116–120 | PII heuristic gap: `apikey: <value>` HTTP header format not caught | Extend token regex to match colon-delimited header format |
| F4 | HIGH | `supabase/migrations/009_push_notifications.sql` | 272 + `migrations/010` line 171–210 | Unbounded `expo_token TEXT` — no max-length constraint | Add `CHECK (length(p_expo_token) <= 4096)` in the RPC and a column-level `CHECK` |
| F5 | HIGH | `src/lib/policyText.ts` | 117, 186, 226 | Real email address hardcoded in user-facing UI text | Replace with a role-based or alias address before public launch; flag as DECISION FOR SKY |

---

## Detailed Findings

---

### F1 — HIGH: Claimed server-side preference gate is not implemented

**File:** `src/lib/pushNotifications.ts` lines 28–34; `supabase/migrations/009_push_notifications.sql`; `supabase/migrations/010_fix_push_token_unique.sql`

**Description:**  
The JSDoc comment in `pushNotifications.ts` explicitly documents a three-layer enforcement model:

> Layer 1: client refuses to register without a trigger ON.  
> Layer 2: Server RPC `register_push_token` returns "No push preferences enabled" if the gate fails.  
> Layer 3: Edge Function re-checks preferences before send.

Layer 2 is **not implemented** in either migration. The `register_push_token` function in migration 009 (lines 391–428) and migration 010 (lines 171–210) only check:
- `auth.uid()` is not NULL (authenticated)
- `p_expo_token` is not empty
- `p_platform` is a valid value

It does **not** read `users.push_preferences` and does **not** raise `"No push preferences enabled"`. Migration 009 has a comment at line 388 explicitly deferring this: `"If Sky wants server-side enforcement here, a follow-up migration can add..."`.

Additionally, there is **no `is_verified` check** in the RPC. An authenticated but unverified user (pre-admin-approval, still in the waiting room) can call `register_push_token` and have their device registered as a push target. The client-side gate in `pushNotifications.ts` delegates to `hasAnyTriggerEnabled(prefs)`, which reads the caller's local `PushPreferences` object — but a stale-cache or API-call bypass could circumvent this.

**Risk:** Without Layer 2, the only runtime guard against a verified user opting out on the server and then receiving notifications is the Edge Function's pre-send re-check (Layer 3, per spec AC-8). That is the correct last-line defense, but the documentation claims a Layer 2 that does not exist. A stale or compromised client could register tokens for opted-out users. Unverified users should not be push targets.

**Fix:**
1. In a `migration/011_register_push_token_pref_gate.sql`, add to `register_push_token`:
   ```sql
   -- Verify caller is verified
   IF NOT (SELECT is_verified FROM public.users WHERE id = caller) THEN
     RAISE EXCEPTION 'Account not verified';
   END IF;
   -- Verify at least one preference is enabled
   DECLARE prefs JSONB;
   SELECT push_preferences INTO prefs FROM public.users WHERE id = caller;
   IF NOT (COALESCE((prefs->>'enabled')::boolean, false)) THEN
     RAISE EXCEPTION 'No push preferences enabled';
   END IF;
   ```
2. Update the `pushNotifications.ts` JSDoc to accurately reflect that Layer 2 is pending until migration 011 is applied, or remove the false claim.

---

### F2 — HIGH: Expo push token format bypasses PII heuristic

**File:** `src/lib/errorReporting.ts` lines 98–168 (`PII_HEURISTICS`)

**Description:**  
The token heuristic regex at line 118 is:
```
/((?:\b(?:access_)?token|\bapi[_-]?key|\bjwt|\bsecret|\bauth(?:orization)?|Bearer\s+|\bkey)\s*=?\s*)[A-Za-z0-9\-_.~+/=]{16,}/gi
```

This pattern catches tokens that appear as `token=<value>`, `Bearer <value>`, `jwt=<value>`, etc. However, **Expo push tokens have the format `ExponentPushToken[AbCdEfGhIjKlMnOpQrStUvWx]`** — the brackets `[` and `]` are NOT in the character class `[A-Za-z0-9\-_.~+/=]`, and the string "ExponentPushToken" does not match any keyword prefix in the regex.

Verified with Python regex test: a bare `ExponentPushToken[...]` string does NOT match. If a Supabase RPC error (e.g., from the deliver_notification Edge Function returning a DeviceNotRegistered response body) or a network stack trace includes a raw Expo push token, it will not be stripped before the error is sent to the Edge Function.

Expo tokens are treated as non-credentials in the spec (DFS-1), but they are still device-identifying metadata. A token that is unstripped in an error report enables token-to-user correlation and undermines the anonymization goal of the error reporting system.

**Fix:**  
Add a fifth heuristic entry to `PII_HEURISTICS`:
```ts
{
  label: 'expo_token',
  regex: /ExponentPushToken\[[A-Za-z0-9_\-]+\]/g,
  replacement: '[REDACTED_TOKEN]',
},
```
Place it before the generic token heuristic so the more specific pattern fires first.

---

### F3 — HIGH: `apikey: <JWT>` HTTP header format not caught by PII heuristic

**File:** `src/lib/errorReporting.ts` line 118 (token heuristic regex)

**Description:**  
The Supabase anon key is sent as both `Authorization: Bearer <key>` and `apikey: <key>` in the fetch call at line 361. The `Bearer <value>` form IS caught by the regex (verified: matches). The `apikey: <value>` form (HTTP header with colon-space separator rather than equals-sign separator) is **not caught**.

The current regex uses `\s*=?\s*` to match the separator, which allows optional whitespace and an optional `=`. A HTTP header format uses `:` as the separator, which is not `=`, so the regex does not match `apikey: eyJ...`.

In practice, the anon key would only appear in an error-report payload if a network-layer error threw an exception that serialized the request headers into the error message. React Native's `fetch` typically does not include headers in thrown errors. The risk is low in current RN fetch implementations but is a forward-looking gap if the error-reporting pipeline ever logs raw request details.

**Fix:**  
Extend the token regex to also match colon-space separators, or add a second entry specifically for HTTP header format:
```ts
{
  label: 'http_header_token',
  regex: /(?:\bapikey|authorization):\s*(?:Bearer\s+)?[A-Za-z0-9\-_.~+/=]{16,}/gi,
  replacement: `$&`.replace(/[A-Za-z0-9\-_.~+/=]{16,}$/, REDACTED_TOKEN),
}
```
(Exact replacement string needs a function form — use `String.prototype.replace` with a callback in practice.)

---

### F4 — HIGH: `expo_token` column and RPC parameter have no max-length constraint

**File:** `supabase/migrations/009_push_notifications.sql` line 272; `supabase/migrations/010_fix_push_token_unique.sql` line 198–201

**Description:**  
The `expo_token` column is declared as `TEXT NOT NULL` (migration 009, line 272) with no `CHECK` constraint on length. The RPC `register_push_token` in both migrations only validates `length(p_expo_token) > 0` — no upper bound.

Real Expo push tokens are approximately 50–80 characters. An authenticated user can call `register_push_token` with an arbitrarily long string (e.g., 1 MB), which will:
1. Be inserted into the `push_tokens` table, consuming disk space.
2. Potentially propagate to the `deliver_notification` Edge Function, which would then attempt to send to an invalid token.
3. Accumulate in the `push_tokens` table until the stale-token cleanup cron runs (60-day window).

This is a denial-of-wallet / storage-abuse vector since Supabase bills on storage. The UNIQUE (user_id, platform) constraint from migration 010 limits this to 2 rows per user (ios + android), but the rows themselves could each be multi-MB.

**Fix:**  
Add to `register_push_token` in migration 011:
```sql
IF length(p_expo_token) > 4096 THEN
  RAISE EXCEPTION 'Token too long';
END IF;
```
Also add a column-level CHECK to the table definition (or via a migration ALTER):
```sql
ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_expo_token_length
    CHECK (length(expo_token) <= 4096);
```
Note: Expo tokens are currently ~64 chars, so even 512 chars would be a safe cap. Using 4096 gives headroom for format evolution.

---

### F5 — HIGH: Real email address hardcoded in user-facing policy text

**File:** `src/lib/policyText.ts` lines 117, 186, 226

**Description:**  
The `PRIVACY_POLICY_TEXT` and `TERMS_OF_SERVICE_TEXT` constants hard-code `skylerhalisky@gmail.com` in three places as the public contact address for privacy requests, abuse reports, and general disputes. These strings are shipped in the app bundle and rendered directly to users in `PrivacyPolicyScreen` and `TermsOfServiceScreen`.

Consequences:
1. **Harassment / spam surface:** any published app exposes this email to scraping by malicious actors. A privacy-first app with marginalized-community users is a higher-than-average target.
2. **Personal email conflation:** mixing Sky's personal Gmail with the project's legal-contact role is a PIPEDA risk. Personal accounts lack audit logging, retention controls, and role separation.
3. **Drift risk:** if Sky ever changes email, the policy text is outdated and the user has no valid contact path — a PIPEDA compliance failure.

The `policyText.test.ts` asserts `NOT LEGAL ADVICE` is the first line, but there is no test guarding this email address. A routine text edit could silently change it.

**Fix:**
1. **DECISION FOR SKY:** Register a dedicated contact address before launch (e.g., `privacy@mutualmesh.ca` or a ProtonMail alias). The policy text must use the project role address, not Sky's personal Gmail.
2. Externalize the contact address to an env-driven or config-driven constant (`CONTACT_EMAIL`) so it can be updated without a release.
3. Add a CI assertion in `policyText.test.ts` that the email present matches the expected contact address constant.
4. This is a Jordan/Will handoff item — the text change itself is in Will's lane; the address decision is Sky's.

---

## No-Issue Items (reviewed, clean)

| File | Area | Result |
|------|------|--------|
| `pushPreferences.ts` | Default-OFF posture, `hasAnyTriggerEnabled`, `shouldDeliverFor`, `mergePushPreferences` master-OFF cascade | Clean — all defaults correctly off; logic is sound |
| `pushNotifications.ts` | Token not logged (AC-12 compliance) | Clean — no `console.log(token)` present |
| `pushNotifications.ts` | `requestPermission` — just-in-time prompt, no provisional/carPlay/criticalAlerts | Clean |
| `errorReporting.ts` | Opt-in default `DEFAULT_OPT_IN = false` | Clean — correct privacy default |
| `errorReporting.ts` | PII strip → truncate ordering | Clean — strips full text before truncation; correct |
| `errorReporting.ts` | Email, postal full, postal FSA, handle heuristics | Clean for their intended patterns |
| `errorReporting.ts` | Anon key in Authorization header — Bearer prefix IS caught by regex | Acceptable — Bearer form caught; apikey colon-form gap noted in F3 |
| `mapHelpers.ts` | GPS-free, no `expo-location`, hardcoded city center default | Clean — no location data |
| `mapHelpers.ts` | `clampRegionZoom` — MIN_DELTA enforcement (Jordan 2.1) | Clean |
| `i18n.ts` | No server-side language lookup, locale stored device-local only | Clean |
| `i18n.ts` | ICU MessageFormat used for catalogs; no `innerHTML` or `eval` | Clean — RN Text renders strings as text, no XSS vector |
| `Toggle.tsx` | No data handling; pure UI; no console output | Clean |
| `PrivacyPolicyScreen.tsx` | Renders `PRIVACY_POLICY_TEXT` constant in RN `Text`; no WebView | Clean — no XSS injection vector |
| `TermsOfServiceScreen.tsx` | Same as above | Clean |
| `migration/010` | `auth.uid()` NULL check in both RPCs | Clean |
| `migration/010` | Platform enum check `IN ('ios', 'android', 'web')` | Clean |
| `migration/010` | Duplicate-row cleanup before constraint add | Clean — correct data migration |
| `migration/010` | `SECURITY DEFINER` with `SET search_path = public, auth` | Clean — search_path locked, no schema injection |
| `migration/010` | `revoke_push_token()` deletes ALL caller rows — no cross-user delete possible | Clean |
| `migration/010` | GRANT EXECUTE TO authenticated (not anon) | Clean |

---

## DECISIONS FOR SKY

1. **F5 — Contact email:** Before public launch, establish a dedicated non-personal contact address for privacy and abuse requests. The PIPEDA contact requirement must be a role address, not a personal Gmail. Will + Jordan coordinate the text change; Sky provides the address.
2. **F1 — Server-side preference gate:** Confirm whether the Layer 2 server-side preference gate should be implemented in migration 011 before the app goes to any test users. Even with Layer 3 (Edge Function) as last-line defense, an explicit server gate prevents token accumulation for opted-out users and makes the code match its own documentation.
3. **F4 — Token max-length:** Confirm a safe max-length for `expo_token` (recommendation: 512 chars). Low urgency pre-launch with small user count; becomes higher priority at scale.

---

## Scope Notes

- `src/lib/messages/en`, `fr`, `es` (message catalog files) were not in the task scope. The i18n interpolation mechanism itself is clean (RN `Text` renders as text); catalog content injection risk depends on catalog contents — recommend Gary adds a CI lint that flags non-ICU patterns in catalogs.
- The `deliver_notification` Edge Function is referenced throughout but is out of scope for this review. The Layer 3 pre-send re-check in that function is critical to the push privacy model and should be audited separately.
- Migration 008 (error_reports schema) was not in scope but is referenced by `errorReporting.ts`. The server-side SHA-256 hashing claim is unverified in this sweep.

---

*Steve — Security Engineer. Read-only audit. No code modified. Findings escalated per CLAUDE.md qa-reports convention.*
