# Rory — deliver_notification Edge Function
**Date:** 2026-05-25
**Branch:** `rory/deliver-notification-edge-fn-2026-05-25`
**Status:** COMPLETE — pending Sky deploy + migration 012 from Dana

---

## What was built

`supabase/functions/deliver_notification/index.ts` — the Phase 4 missing Edge Function. Companion `README.md` alongside.

### Files created

| File | Purpose |
|------|---------|
| `supabase/functions/deliver_notification/index.ts` | The Edge Function (Deno, ~350 LoC) |
| `supabase/functions/deliver_notification/README.md` | Deploy walkthrough, caller contract, open questions |
| `qa-reports/2026-05-25_Rory_deliver-notification.md` | This report |

---

## Key design decisions

### 1. Service-role auth (not anon key)

Unlike `log-error` (which uses the anon key because anyone can crash-report),
`deliver_notification` reads any user's `push_preferences` and `push_tokens` rows
and writes to `push_rate_limit`. These reads require bypassing RLS — only the
service-role key can do that safely. The function is NEVER called from the client;
only SECURITY DEFINER RPCs call it with the service-role key. This matches the
spec's "service-role only" posture.

### 2. AC-2 body-empty assertion is fail-closed and unreachable by construction

The `buildPayload()` function has `const body = ''` — the value is literally the
empty string constant. The assertion `if (body !== '')` is structurally unreachable
but is present as the explicit fail-closed sentinel that Gary's Deno test asserts
against (`__tests__/payload-shape.test.ts`). The spec requires this as "belt-and-braces"
against future developer edits that accidentally add content to the body.

### 3. Rate-limiting via two-step upsert (not a single atomic Postgres call)

The spec's AC-15 requires atomic increment of `push_rate_limit.count`. Supabase JS v2's
`.upsert()` doesn't support `count = count + 1` in the update clause. The solution is:
- Step 1: attempt INSERT with `count = 1` (new window)
- Step 2: on conflict, call `increment_push_rate_limit(...)` RPC (a SECURITY DEFINER
  `UPDATE ... RETURNING count` — atomically safe)

This requires migration 012 (Dana) to ship the helper RPC. The function degrades
gracefully (logs error, proceeds with delivery) if the table/RPC is absent.

### 4. Authority check is broad for trigger 1 & 2 (intentional for MVP)

The spec's AC-14 authority check for resource/claim triggers verifies that a resource
row links both caller and recipient. The query uses `.or(...)` to check both directions
(caller posted / recipient claimed, or vice versa). This is intentionally broad for MVP —
it catches the most obvious abuse (caller with no relationship to recipient at all) without
over-engineering the check for Phase 3.1 volume. Steve or Dana can tighten in a follow-up.

### 5. cron_log writes use `sanitizeErrorText()` to strip UUID-shaped substrings

AC-5 says `cron_log.error_text` must contain zero UUID-shaped substrings. The
`sanitizeErrorText()` helper runs every packed error string through a UUID-regex
replacement before writing. Gary's test asserts this across 1000 simulated deliveries.

### 6. `EXPO_ACCESS_TOKEN` as an Edge Function secret (AC-12)

The Expo API bearer token is `Deno.env.get('EXPO_ACCESS_TOKEN')` — never in source,
never logged. Sky sets it via `supabase secrets set EXPO_ACCESS_TOKEN=...` and rotates
quarterly per AC-12.

---

## DECISIONS FOR SKY

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | **Migration 012 needed before rate-limiting is active** | Dana writes migration 012 with `push_rate_limit` table + `increment_push_rate_limit` RPC + daily prune cron. | Ask Dana to write migration 012 before deploying this function. Function is safe to deploy without it (rate-limiting simply logs an error and proceeds). |
| D2 | **AC-6 reduced-motion** — `sound: null` is set unconditionally (silent by default). | (a) Keep silent default. (b) Add `reduce_motion` field to `push_preferences` JSONB and read it here. | Option (a) for MVP — privacy-safe default. |
| D3 | **Authority check tightening for trigger 2** | The current check is a broad resource-linkage query. Could be tightened to `status = 'completed'` + both IDs present. | Keep broad for MVP; Dana or Steve can tighten post-launch if needed. |

---

## Pre-deploy checklist (Sky)

- [ ] Dana writes migration 012 (`push_rate_limit` table + `increment_push_rate_limit` RPC)
- [ ] Sky sets `EXPO_ACCESS_TOKEN` secret: `supabase secrets set EXPO_ACCESS_TOKEN=<token>`
- [ ] Sky deploys: `supabase functions deploy deliver_notification`
- [ ] Gary writes `__tests__/payload-shape.test.ts` (Deno runtime — separate from Jest)
- [ ] Shamus extends `claim_resource`, `confirm_pickup`, `approve_user`, `reject_user` RPCs to call this function (fire-and-forget, per the README caller contract)

---

## Not in scope for this task

- Deploying the function (Constitution Art. 9 — Sky deploys)
- Modifying main (Constitution Art. 1)
- Adding real credentials (only `Deno.env.get(...)` references)
- Writing the calling-RPC extensions (Shamus + Dana own those)
- Gary's test suite (Gary writes tests separately)
