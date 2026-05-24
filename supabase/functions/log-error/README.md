# log-error — Supabase Edge Function

Self-hosted anonymous error reporting per **PRIVACY.md D8** ("NO third-party SDKs in MVP. No Sentry, no Mixpanel, no analytics."). Closes Phase 4 Tier 4 item #22 in `~/.claude/plans/goofy-singing-steele.md`.

The client (`src/lib/errorReporting.ts`) sends the raw error message + stack ONLY IF the user has opted in (default OFF). This function:

1. Rate-limits per IP at 10/min (in-process, no DB hit when limited).
2. Strips `X-Forwarded-For` and `User-Agent` from anything it logs.
3. SHA-256-hashes message + stack **server-side** so the raw text NEVER reaches the Postgres table, the Edge Function logs, or any backup.
4. Calls the `public.log_error` RPC with hashes only.
5. Returns 204 on success; never returns details on failure.

**This file is the deploy guide for Sky. The function source is `index.ts` next to this file. The pair that wrote it did NOT deploy — Sky deploys.**

---

## Prerequisites

- Supabase CLI installed locally: `npm i -g supabase` (or `brew install supabase/tap/supabase`).
- Logged in: `supabase login` (uses Sky's Supabase account).
- Project linked from the repo root: `supabase link --project-ref <project-ref>`.
- **Migration 008 applied first.** This function calls `public.log_error` which is defined in `supabase/migrations/008_error_reports.sql`. Apply that via the dashboard SQL editor BEFORE deploying this function.

Verify migration 008 landed:

```sql
SELECT proname FROM pg_proc WHERE proname = 'log_error';
-- should return one row
SELECT to_regclass('public.error_reports');
-- should return 'error_reports'
```

---

## 1. Deploy the function

From the repo root:

```sh
supabase functions deploy log-error
```

The CLI prints the function URL:

```
https://<project-ref>.supabase.co/functions/v1/log-error
```

The function uses the auto-injected `SUPABASE_URL` and `SUPABASE_ANON_KEY` secrets — no `supabase secrets set` needed.

---

## 2. Wire the URL into the client

The client helper `src/lib/errorReporting.ts` reads the endpoint URL from an env var:

```
EXPO_PUBLIC_LOG_ERROR_URL=https://<project-ref>.supabase.co/functions/v1/log-error
```

Add this to your `.env` file (the same one that holds `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY`). If the var is unset, the client falls back to derivation from `EXPO_PUBLIC_SUPABASE_URL` (it appends `/functions/v1/log-error`) — so for the standard Supabase deployment you may not need to add this at all, but setting it explicitly is the safer pattern for multi-environment setups.

The client also needs the anon key in the Authorization header — it already uses `EXPO_PUBLIC_SUPABASE_ANON_KEY` which is shared with the rest of the Supabase client.

---

## 3. Verify it works

### 3a. Toggle opt-in inside the app

1. Run the app: `npm start`.
2. Sign in as a verified test user.
3. Open the Profile tab.
4. Scroll to the "Help improve Mutual Mesh" section.
5. Toggle the "Send anonymous error reports" switch ON.
6. Background-then-foreground the app once so the AsyncStorage write commits.

### 3b. Trigger a fake error

The fastest way to confirm the pipeline works without breaking the UX:

```ts
// Temporarily add to the bottom of App.tsx (REMOVE BEFORE COMMITTING):
import { logError } from '@/lib/errorReporting';
setTimeout(() => {
  void logError(new Error('test ping from deploy verification'), 'warning');
}, 5000);
```

Reload the app. Wait 5 seconds.

### 3c. Inspect the table (Sky only — RLS is Sky-only SELECT)

In the Supabase Dashboard → SQL Editor:

```sql
SELECT id, created_at, app_version, platform, severity, count, last_seen_at
FROM public.error_reports
ORDER BY last_seen_at DESC
LIMIT 20;
```

A successful round-trip shows one row with `severity = 'warning'`, the current `app_version`, and `count = 1`. **You will not see the error message or stack** — only hashes (`message_hash`, `stack_hash`) are stored, and the SELECT above intentionally omits them so casual inspection cannot brute-force common shapes.

If you want to see the hash columns (e.g. to compare two crashes):

```sql
SELECT message_hash, stack_hash, count, last_seen_at
FROM public.error_reports
WHERE created_at > now() - INTERVAL '1 hour';
```

### 3d. Trigger the same error again

Reload the app twice more. The `count` column on the same row should bump to 3 (upsert via `ON CONFLICT` in the RPC).

### 3e. Confirm rate-limit kicks in

Trigger 11 errors in under a minute from the same device. The 11th request returns HTTP 429 (visible in the function logs as the Deno serve response). The client (errorReporting.ts) silently swallows 429s, so the user sees nothing.

---

## 4. Query the audit dashboard via SQL (the only "UI")

Per the brief, **there is no in-app dashboard.** Sky queries the table directly. Common queries:

### Most recent crash fingerprints

```sql
SELECT
  app_version,
  platform,
  severity,
  substring(message_hash, 1, 12) AS msg_h12,
  substring(stack_hash, 1, 12) AS stk_h12,
  count,
  last_seen_at
FROM public.error_reports
ORDER BY last_seen_at DESC
LIMIT 25;
```

### Crashes by platform (last 24h)

```sql
SELECT platform, SUM(count) AS total_events, COUNT(*) AS distinct_shapes
FROM public.error_reports
WHERE last_seen_at > now() - INTERVAL '24 hours'
GROUP BY platform
ORDER BY total_events DESC;
```

### Loudest fingerprints (top 10 by event count this week)

```sql
SELECT
  app_version,
  platform,
  severity,
  substring(message_hash, 1, 12) AS msg_h12,
  count,
  last_seen_at
FROM public.error_reports
WHERE last_seen_at > now() - INTERVAL '7 days'
ORDER BY count DESC
LIMIT 10;
```

### Cron health (is the prune running?)

```sql
SELECT job_name, ran_at, rows_affected, success, error_text
FROM public.cron_log
WHERE job_name = 'prune_error_reports'
ORDER BY ran_at DESC
LIMIT 5;
```

The most recent row should be <36 hours old; matches the existing `prune_expired_resources` freshness convention.

---

## 5. Watch the function logs

Dashboard → **Edge Functions** → **log-error** → **Logs** tab.

The function deliberately logs almost nothing per invocation (to keep logs free of any signal that could correlate to a user). Expect to see:

- Nothing on success (just the access-log line Supabase adds automatically).
- `[log-error] rpc_failed code=...` on RPC failures (very rare; usually a migration regression).
- `[log-error] missing env` if `SUPABASE_URL` / `SUPABASE_ANON_KEY` somehow aren't auto-injected (would mean a Supabase platform issue).

---

## 6. Rollback procedure

If something is wrong and you want to disable error reporting:

### Soft disable (recommended first step)

```sh
supabase functions delete log-error
```

The client (`errorReporting.ts`) silently swallows network errors, so the in-app experience is unchanged. The DB table remains in place; existing aggregate counts persist until the 30-day prune sweeps them.

### Hard rollback (also drop the table)

In the Supabase Dashboard SQL editor, run the commented-out rollback block at the bottom of `supabase/migrations/008_error_reports.sql`. This:

1. Unschedules `prune_error_reports_nightly`.
2. Drops `public.log_error` and `public.prune_error_reports`.
3. Drops `public.error_reports` (loses all aggregate rows — but they were only hashes, no PII).

After hard rollback, re-applying `008_error_reports.sql` restores everything.

---

## 7. Cost & quota notes

- Each invocation is one INSERT or one UPDATE (via `ON CONFLICT`). Negligible DB load.
- Two SHA-256 calls per request (message + stack). Web Crypto subtle digest is native — well under 1ms even on 32 KB inputs.
- Max payload size: 256 KB. Rate-limited at 10/min/IP. Worst case per IP per minute = 2.5 MB ingress.
- For Mutual Mesh's expected volume (Phase 4 = launched, a few Tier-1 communities, ~1-5 errors/user/week if any), this is negligible.

---

## 8. What this function deliberately does NOT do

- **Does not store IP, user-agent, user-id, session-id, or any other correlator.** The Edge Function strips `X-Forwarded-For` from its in-process rate-limit key before any persistence and never writes it. STRIDE I7 mitigation.
- **Does not require authentication.** The whole point is anonymous reporting; the per-call gate is the project's standard anon key (which the client already has) plus rate-limiting.
- **Does not return details on failure.** All non-2xx responses are short status strings — no echoed request data, no stack frames.
- **Does not retry on RPC failure.** The client (errorReporting.ts) is fire-and-forget; transient failures simply don't get reported. Acceptable because the data is a low-signal aggregate.
- **Does not surface logs externally.** Console errors go to Supabase function logs; nothing is emailed, no webhook, no third-party.

---

## 9. Environment variable summary

| Var                         | Source                                   | Required | Notes                                                                                          |
| --------------------------- | ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Auto-injected by Supabase Edge Functions | yes      | Read in `index.ts` to build the anon client.                                                   |
| `SUPABASE_ANON_KEY`         | Auto-injected by Supabase Edge Functions | yes      | Anon key — has GRANT EXECUTE on `public.log_error` (migration 008).                            |
| `EXPO_PUBLIC_LOG_ERROR_URL` | Client `.env` (optional)                 | no       | Client-side override. If unset, the client derives the URL from `EXPO_PUBLIC_SUPABASE_URL`.    |

---

## 10. Backup honesty (PRIVACY.md D6 echo)

Supabase keeps point-in-time-recovery snapshots for ~7 days on Pro plan. A row in `public.error_reports` deleted by the nightly prune is technically still recoverable from a backup for that window. Since the rows contain only SHA-256 hashes and aggregate counts (no PII, no user link), the backup retention is **not** a privacy regression — but worth noting for completeness.

---

## DECISIONS FOR SKY

1. **Verify migration 008 lands before deploying this function.** The function will return 500 on every call until `public.log_error` exists.
2. **Set `EXPO_PUBLIC_LOG_ERROR_URL` in `.env` if your deployment differs from the standard `<project>.supabase.co/functions/v1/log-error` shape.** Otherwise the client auto-derives.
3. **The default opt-in is OFF** (per the brief and PRIVACY.md D8 spirit). Users must explicitly enable in Profile. No promotional UI prompts them to enable.
4. **If you want a stricter posture (e.g. require Sky-issued webhook secret like exif-strip does)**, swap the auth gate in `index.ts` — but note that this would require the client to embed the secret, which would defeat the anonymous-from-the-network design.
