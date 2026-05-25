# deliver_notification — Supabase Edge Function

**Author:** Rory (DevOps), 2026-05-25
**Spec:** `qa-reports/spec-phase-3-push-notifications.md` Revision 2
**Branch:** `rory/deliver-notification-edge-fn-2026-05-25`
**Deploy:** Sky only — `supabase functions deploy deliver_notification`

---

## What this function does

Accepts a push-notification delivery request from a privileged Postgres RPC
(`claim_resource`, `confirm_pickup`, `approve_user`, `reject_user`) and:

1. **Verifies caller authority** (AC-14) — the calling RPC must have a
   legitimate resource/claim/admin relationship to the recipient.
2. **Rate-limits** (AC-15) — per-recipient, per-trigger, per-window caps
   (20/h for claims, 10/h for pickups, 1/day for admin events).
3. **Re-checks consent** (AC-8 Layer 3) — reads `push_preferences` for the
   recipient; skips delivery if the trigger is OFF or the master switch is OFF.
   Cleans up stale tokens if all triggers are now OFF (Steve H2).
4. **Builds a title-only payload** (AC-2) — body is always `""`. Fails-closed
   if the body-empty assertion is violated (Mara anti-goal #3).
5. **Delivers to Expo Push API** — `https://exp.host/--/api/v2/push/send`.
   Handles `DeviceNotRegistered` by deleting the stale token row (DFS-3).
6. **Logs aggregate counts** to `cron_log` with zero PII (AC-5).

This function is **NEVER called by the client directly.** Only SECURITY DEFINER
RPCs with service-role access invoke it.

---

## Privacy rules (load-bearing — do not relax without Jordan + Sky approval)

| Rule     | What it means here                                                                      |
|----------|-----------------------------------------------------------------------------------------|
| AC-2     | `body` is always `""`. Three fixed title strings. No resource name, handle, or content.|
| AC-5     | Logs contain NO `user_id`, `expo_token`, `recipient_id`, `claim_id`. Aggregates only.  |
| AC-8     | Consent re-checked before every send. Fails-closed on read error.                       |
| AC-10    | `recipient_id` must be server-derived by the calling RPC — never a client parameter.   |
| AC-12    | `EXPO_ACCESS_TOKEN` is an Edge Function secret. Never in source or logs.                |
| AC-14    | Authority check on every call. No relationship → no delivery.                           |
| AC-15    | Rate-limit protects recipients from spam-notification abuse (Mara anti-goal).           |

---

## Required Supabase secrets (set before deploying)

```sh
supabase secrets set EXPO_ACCESS_TOKEN=<your-expo-access-token>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the
Supabase runtime.

---

## Required database objects (not yet in a migration — open item for Dana)

This function references `public.push_rate_limit` and a helper RPC
`increment_push_rate_limit`. These are specified in the push spec (AC-15) but
were not included in migrations 009–011 because the Edge Function was not yet
written. Dana needs to write migration 012 containing:

1. **`public.push_rate_limit` table:**

   ```sql
   CREATE TABLE public.push_rate_limit (
     user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
     trigger      TEXT        NOT NULL,
     window_start TIMESTAMPTZ NOT NULL,
     count        INTEGER     NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, trigger, window_start)
   );
   ```

2. **`increment_push_rate_limit` RPC** (SECURITY DEFINER):

   ```sql
   CREATE OR REPLACE FUNCTION public.increment_push_rate_limit(
     p_user_id     UUID,
     p_trigger     TEXT,
     p_window_start TIMESTAMPTZ
   )
   RETURNS INTEGER
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     new_count INTEGER;
   BEGIN
     UPDATE public.push_rate_limit
     SET count = count + 1
     WHERE user_id = p_user_id
       AND trigger  = p_trigger
       AND window_start = p_window_start
     RETURNING count INTO new_count;
     RETURN COALESCE(new_count, 0);
   END;
   $$;
   ```

3. **Daily prune cron** for `push_rate_limit` rows older than 48 hours.

Sky: please ask Dana to write migration 012 before deploying this function.

---

## Caller contract (for Shamus / Dana extending existing RPCs)

```typescript
// Inside a SECURITY DEFINER RPC (Postgres plpgsql):
//
// 1. Derive recipient_id server-side from a privileged-table SELECT.
//    NEVER pass a client-supplied parameter as recipient_id directly.
//
// 2. Call the Edge Function fire-and-forget using the service-role client:
//    (Pseudo-code — actual implementation is in the calling RPC's plpgsql)
//
//   PERFORM net.http_post(
//     url       := current_setting('app.supabase_url') || '/functions/v1/deliver_notification',
//     headers   := jsonb_build_object(
//       'Content-Type',  'application/json',
//       'Authorization', 'Bearer ' || current_setting('app.service_role_key')
//     ),
//     body      := jsonb_build_object(
//       'trigger',         '<claim_placed|pickup_confirmed|admin_approved|admin_rejected>',
//       'recipient_id',    <server-derived UUID>,
//       'caller_user_id',  auth.uid(),
//       'route_id',        <resource_id or NULL>
//     )::text
//   );
//
// 3. Ignore the response — push delivery is fire-and-forget.
//    A failed push MUST NEVER block a successful claim/approval/etc.
```

---

## Payload shape (AC-2 — never deviate without Jordan + Sky approval)

```json
{
  "to": "ExponentPushToken[...]",
  "title": "Your post has an update",
  "body": "",
  "data": { "route": "ResourceDetail", "id": "<uuid>" },
  "sound": null,
  "_displayInForeground": true
}
```

Valid title strings:
- `"Your post has an update"` — trigger: `claim_placed`
- `"A pickup was confirmed"` — trigger: `pickup_confirmed`
- `"You have an update"` — trigger: `admin_approved` OR `admin_rejected`

Body is always `""`. Sound is always `null`. These are hard-coded; any
deviation requires Jordan + Sky approval (spec §DFS-S2).

---

## Testing

Gary's test suite should include:

- `__tests__/payload-shape.test.ts` — Deno runtime test asserting:
  - `buildPayload(...)` always returns `body === ""`
  - Each trigger maps to the correct AC-2 title string
  - Payload does not contain any of: resource name, handle, email, content
- Integration test: 25 rapid `claim_resource` calls → ≤20 push deliveries
  (AC-15 rate-limit enforced)
- Integration test: recipient with `push_preferences.on_claim = false` →
  no delivery (AC-8 preference gate)
- Integration test: `cron_log.error_text` matches regex that rejects UUID-shaped
  substrings across 1000 mixed-outcome simulated deliveries (AC-5)
- Authority check test: non-admin caller with no resource linkage to recipient
  → `skipped_authority=1` in cron_log, no delivery

---

## Open questions for Sky

1. **Migration 012** — the `push_rate_limit` table and `increment_push_rate_limit`
   RPC are required before this function can rate-limit. Dana needs to write it.
   The function degrades gracefully (logs the error, does not skip delivery) if
   the table is missing, so it is safe to deploy before migration 012 with the
   understanding that rate-limiting will not be active.

2. **AC-6 reduced-motion preference** — DFS-5 is unresolved: the function sets
   `sound: null` (silent) unconditionally, which is the safest default. If Sky
   wants to honor the device's reduced-motion preference at send time, a new
   column on `public.users` (or a field in `push_preferences`) must be added so
   the Edge Function can read it. Currently deferred; the silent default is
   privacy-safe.

3. **Authority check for trigger 2 (pickup_confirmed)** — the authority check
   for `pickup_confirmed` uses a broad resource-linkage query. If a more
   specific check is needed (e.g., only allow if the `resources` row's status
   is `completed` and both user IDs appear), Dana can tighten the query in a
   follow-up. The current check is correct for MVP volume.
