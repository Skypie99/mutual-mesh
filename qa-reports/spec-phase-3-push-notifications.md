# Spec: Phase 3 — Push Notifications (privacy-safe) — Quinn — 2026-05-24

**Revision 2 — 2026-05-24** (post-Steve-audit). See "Steve audit reconciliation" section immediately below.

## Steve audit reconciliation (Revision 2 — 2026-05-24)

Steve's FULL pre-implementation security audit landed in
`qa-reports/phase-3-steve-push-audit-2026-05-24.md` and surfaced 3 CRITICAL
launch-blockers (C1-C3), 4 HIGH (H1-H4), 3 MEDIUM (M1-M3), and 2 LOW (L1-L2).
This revision applies the spec-level fixes for all CRITICAL + HIGH items and
addresses M1/M3 in the relevant ACs. M2 (per-recipient rate-limit) is
incorporated as new AC text per Steve's recommendation. L1/L2 are noted in
Out-of-scope. The five DECISIONS FOR SKY (DFS-S1 through DFS-S5) Steve raised
are appended to the DFS list at the bottom with Quinn's recommended defaults.

### Summary of AC changes

| Change                                                                                                                                                 | Steve finding | Where in this spec                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------- |
| AC-2 — server-side assertion location anchored to Edge Function                                                                                        | H1            | AC-2 text + Tests section                           |
| AC-2 — trigger 3 + 4 titles changed to "You have an update"                                                                                            | H4            | AC-2 trigger map                                    |
| AC-3 — auto-revoke when all preferences flip OFF                                                                                                       | H2            | AC-3 text + new behavior on update_push_preferences |
| AC-4 — REWRITTEN: no client-side per-token revoke; UPSERT-by-platform                                                                                  | C2            | AC-4 + RPC contracts                                |
| AC-5 — `push_delivery_log` reuses existing `cron_log` schema (job_name/rows_affected/success/error_text); packed-error pattern from migrations 003/007 | H3            | AC-5                                                |
| AC-9 — REWRITTEN: Expo Push API disclosed as a thin proxy; no analytics SDKs                                                                           | C1            | AC-9 + "Trust boundary" section                     |
| AC-10 — recipient_id SERVER-DERIVED ONLY (never from client payload)                                                                                   | C3            | AC-10                                               |
| AC-13 (NEW) — explicit Expo Push disclosure in microcopy + outreach materials                                                                          | C1            | AC-13                                               |
| AC-14 (NEW) — defense-in-depth check inside Edge Function for recipient authority                                                                      | C3            | AC-14                                               |
| AC-15 (NEW) — per-recipient-per-trigger rate-limits (20/h, 10/h, 1/day, 1/day)                                                                         | M2            | AC-15                                               |
| AC-12 — added Expo API key Edge Function secret discipline                                                                                             | M1            | AC-12                                               |
| AC-12 — added CI grep enforcement for token logging                                                                                                    | M3            | AC-12                                               |
| New "Trust boundary" section explicitly listing Apple APNs, Google FCM, Expo Push                                                                      | C1            | Section after AC-15                                 |
| PROPOSED PRIVACY.md D8 amendment text                                                                                                                  | C1            | Bottom of file (PROPOSED, Jordan + Sky approve)     |
| "Schema corrections needed" section flagging required migration 010                                                                                    | C2 + H3       | Bottom of file                                      |

**Three CRITICAL blockers (C1, C2, C3) resolved at the spec level.** Dana will
need to ship a patch migration 010 to correct the schema (see "Schema
corrections needed" at the bottom). Shamus remains blocked on starting
implementation until Sky approves the DFS items below.

---

## Summary

Phase 3 Tier 3 Feature #16 adds **privacy-safe push notifications** to Mutual Mesh. Users opt in per-trigger from Profile; default is OFF for every trigger and every user. Notifications are **title-only on lockscreen** (no body) and routed through a Supabase Edge Function we control. The Edge Function calls Expo Push API as a thin proxy to reach Apple APNs and Google FCM (we do NOT use OneSignal, Pusher, or Firebase-as-a-service; we do NOT use any analytics SDK). Expo, Apple, and Google receive only a generic title (one of 3 fixed strings — triggers 3 & 4 share "You have an update") plus an opaque UUID route; they never see resource names, handles, or content. Tokens live in a new `public.push_tokens` table with strict RLS; deletion cascades through `delete_my_account()` (D6).

The single load-bearing rule (from Mara's persona anti-goal #3): **"a push notification with the resource name in the title visible on lock screen" → would cause her to delete the app immediately.** This spec interprets that strictly: no resource name, no claimant handle, no item description anywhere in the visible notification payload. The body is empty; the title is generic ("You have an update"); the body becomes readable only after the user opens the app.

**Scope:** New schema (`push_tokens` table) + 2 new RPCs (`register_push_token`, `revoke_push_token`) + 1 Supabase Edge Function (`deliver_notification`) + Profile UI for opt-in toggles + new `src/lib/push.ts` helper. **Existing screens unchanged.** No changes to existing tables.

**Estimated effort:** 3 build days + 1 hardening day. ~5-6 PRs across Shamus (UI + helper), Dana (schema + RPC + Edge Function), Jordan (FULL privacy review), Steve (FULL security review — token rotation + delivery audit), Alex (a11y + no-haptic-alert default), Gary (tests).

**READY pending Sky decisions on DFS items.** PRIVACY.md D8 ("No third-party SDKs in MVP") becomes the architectural anchor — we use Expo's notification primitive client-side AND Expo's Push API server-side as a thin proxy to APNs/FCM. The proposed D8 amendment at the bottom of this spec clarifies that D8 forbids analytics/observability SDKs that egress behavior data; it does NOT forbid a message-proxy service that receives minimum-payload routing data we control. This is the single biggest narrative decision in the spec, addressed by AC-9 + AC-13 + the Trust boundary section.

## User story

> _As Mara (recipient), I want to find out as soon as someone has claimed the formula I posted — without my abusive ex (who sometimes sees my phone) being able to read what was claimed from my lockscreen. I opt in only to "claim placed on your post" and leave the other triggers off._

> _As Keo (organizer), I want to know when an admin approves my account so I can get on with sharing HRT supplies — but I do not want push notifications for anything else, ever. My anti-goal is "push notifications" full-stop; the per-trigger granularity respects that._

> _As Deb (poster), I want to know when a pickup is confirmed so I can post the next batch from the community fridge. I opt in to all four triggers because my threat model is much milder than Mara's or Keo's._

> _As a privacy-conscious user, I can revoke my push token at any time from Profile in one tap, and I can verify in the in-app "Why we need this" copy that the notification payload contains only a generic title and an opaque ID — no resource name, handle, or content. The copy is also honest that Expo Push (a third-party proxy) and Apple/Google's APNs/FCM are in the delivery path; each sees only the title and the routing UUID._

## Personas served

- **Mara (recipient)** — load-bearing constraint #1: "title-only on lockscreen." Her anti-goal #3 is literally a push notification design requirement. If we get this wrong, she deletes the app. Push is **off by default** for every user; she opts in only to "claim placed on your post" and only after reading the disclosure copy.
- **Keo (trans organizer)** — load-bearing constraint #2: "NO push notifications" is in their anti-goal #5. Per-trigger granularity (AC-7) means Keo can opt in only to "admin approval" (one-time, ephemeral) and leave the rest off. They keep their preferred pull-only posture for marketplace activity.
- **Deb (community-fridge organizer)** — willingly opts in. Her threat model is milder; her flexibility ("notifications are fine" in her persona doc) is the reason a per-trigger model serves all three personas.
- **Casey's Tier-1 community admins** — indirectly: faster pickup confirmation (Trigger 2) lifts Casey's #1 growth metric ("successful exchanges per week" in `community/growth-strategy.md`). Push without leaks is a growth multiplier; push with leaks is a growth-killing privacy incident.

## Why now

Per `~/.claude/plans/goofy-singing-steele.md` Phase 3 Sub-3.1 (Days 26-32) and Tier 3 #16: **"Real-time claim notifications without leaking resource names to lockscreen."** Push is sequenced FIRST in Phase 3 for two reasons:

1. **Foundation for chat (Sub-3.3).** Chat (Phase 3 Spec #3) needs push to notify a claimant when the poster sends a message in their claim thread. If chat ships before push, every chat message becomes an in-app-only event the user has to be on the screen to see — defeats the point. Push must land first so chat can plug into it.
2. **Lowest risk → ship as Phase 3 confidence-builder.** Push has a self-contained schema (one table), a small UI footprint (Profile toggles), and well-understood delivery infrastructure (Expo Notifications + Apple/Google). Map (Sub-3.2) and chat (Sub-3.3) have larger surface areas; getting push right first proves the Phase 3 cadence.

The growth-strategy 90-day target — **2-3 seeded communities, 30-60 successful exchanges per week** — depends on claimants seeing claims fast enough to coordinate pickup. Without push, claims sit unseen for hours; exchanges fall through; the metric drops; Casey's seed mechanic falters. Push (privacy-safe) is therefore a launch-window growth requirement, not a nice-to-have.

## Acceptance criteria

### AC-1: Default OFF per user per trigger (load-bearing)

- Given a new user signs up (any path: invite-code or magic-link),
- Then their initial push-preference state has **all four triggers OFF** and no push token registered.
- A push token is registered ONLY when the user explicitly toggles at least one trigger ON in Profile.
- The schema's `push_tokens` table starts empty for every user; rows appear only after user-initiated `register_push_token()` calls (Section 6).
- No background flow, no migration script, no Edge Function ever flips a preference from OFF to ON. **Only the user toggles in Profile.**

### AC-2: Title-only on lockscreen (load-bearing — Mara anti-goal)

- The notification payload sent to Apple APNS / Google FCM contains:
  - `title` — generic, fixed string per trigger (one of four — see below)
  - `body` — **empty string** (NOT a resource name, NOT a handle, NOT a description, NOT a category)
  - `data` — opaque routing key (e.g., `{ route: "ResourceDetail", id: "<uuid>" }`) — invisible to the OS lockscreen renderer; readable only after the user opens the app.
- Default `title` strings per trigger (Section 7 maps these to triggers). **Revised per Steve H4 — triggers 3 & 4 now generic to prevent context disclosure on lockscreen:**
  - Trigger 1 (claim placed on your post): `"Your post has an update"`
  - Trigger 2 (pickup confirmed): `"A pickup was confirmed"`
  - Trigger 3 (admin approval): **`"You have an update"`** (was: "Your account is ready" — H4)
  - Trigger 4 (rejection): **`"You have an update"`** (was: "Your application was reviewed" — H4)
- The `body === ""` assertion lives in **BOTH** the client-side helper AND the Edge Function (server-side):
  - **Client-side** — `buildPushPayload(...)` in `src/lib/push.ts` asserts at compose time (catches developer typos in dev).
  - **Server-side (LOAD-BEARING)** — the Edge Function source `supabase/functions/deliver_notification/index.ts` has its OWN payload builder (intentionally duplicated from the client helper) that asserts `body === ""` fail-closed at SEND time. This is the actual security boundary; the client assertion is a typing/typo backstop. Same belt-and-braces pattern as PRIVACY.md D5 EXIF stripping.
- The Edge Function's runtime assertion fails-closed (`throw` → caller logs `delivery_failed reason=assertion`, no payload sent). Gary writes BOTH a client-side Jest test AND a Deno-runtime test (`supabase/functions/deliver_notification/__tests__/payload-shape.test.ts`).
- Verified by Steve in code review + Alex in lockscreen-rendering manual test on iOS and Android.

### AC-3: User can revoke any time (+ auto-cleanup on all-OFF — H2)

- Given a user has at least one push token registered,
- When they toggle ALL triggers OFF in Profile (or tap a single "Disable all notifications" button),
- Then `revoke_push_token()` runs: ALL rows in `push_tokens` matching `user_id = auth.uid()` are DELETED (not soft-deleted). The revoke RPC takes NO arguments and is a full-wipe.
- The DELETE happens inside the RPC transaction; on success the UI shows a `FlashBanner` confirming "Notifications disabled. Your push token was removed."
- After revoke, no notification of any kind reaches the device until the user re-opts-in (which generates a NEW token via Expo, NOT a reactivation of the old one).
- The user's `delete_my_account()` flow ALSO deletes all `push_tokens` rows for that user via `ON DELETE CASCADE` on the `user_id` FK (PRIVACY.md D6 honesty rule — delete means delete).
- **Auto-cleanup (Steve H2):** When the user toggles individual triggers, the client checks the resulting `push_preferences` state. If the result is "all triggers OFF" OR `push_preferences.enabled` flips to false, the client **silently** calls `revoke_push_token()` to delete the registered token(s). No FlashBanner, no user-visible event — the user has effectively disabled push and the token shouldn't sit there. Belt-and-braces: the Edge Function's pre-send re-check (AC-8) ALSO deletes any `push_tokens` rows it encounters for a user whose preferences are now all-OFF.
- Verified by Gary integration test: opt-in then opt-out within 1 second leaves zero rows in `push_tokens` for the user.

### AC-4: Token rotation handled (REWRITTEN — Steve C2 fix)

- Expo notification tokens can rotate (app reinstall, OS update, user clears app data, manual Expo refresh). The app handles this transparently with NO client-side SELECT, NO client-side per-token revoke — the server's atomic UPSERT-by-platform is the only rotation mechanism.
- **Flow on app foreground (existing `touch_my_last_active()` hook in `auth.tsx`):**
  - If any push trigger is ON for this user, the client unconditionally calls `register_push_token(current_expo_token, platform)`.
  - The RPC performs an atomic UPSERT keyed on `(user_id, platform)`: if a row exists for this user+platform, its `expo_token` is updated in place; otherwise a new row is inserted. **One row per user per platform, always.**
  - The client does NOT compare tokens, does NOT call any revoke RPC during rotation. The server's UNIQUE `(user_id, platform)` constraint + UPSERT semantics handle all cases (no-change, rotation, fresh registration) idempotently.
  - The rotation is silent — no user-facing UI, no FlashBanner. The user shouldn't have to know.
- **`revoke_push_token()` is no-arg only** (used for opt-out per AC-3); it is never called during rotation. There is no per-token revoke path.
- `push_tokens.last_used_at` is bumped by the Edge Function on each successful delivery so we can detect stale tokens (DFS-3 — auto-prune after N days unused).
- **Schema requirement (REQUIRES MIGRATION 010 — see "Schema corrections needed" at bottom):** the UNIQUE constraint must be `UNIQUE (user_id, platform)` (NOT `UNIQUE (user_id, expo_token)` as Dana shipped in migration 009). The per-platform UPSERT is well-defined only with this constraint.
- Steve verifies: a rotation event leaves exactly ONE active row per `(user_id, platform)` pair, never two; two rapid foreground events with the SAME token are idempotent (one row); two rapid foreground events with DIFFERENT tokens result in exactly one row with the LATEST token.

### AC-5: Failed deliveries do not leak in logs (H3 — cron_log schema reconciliation)

- The Edge Function (`deliver_notification`) MUST NOT log notification body, title, recipient handle, resource_id, or any user-identifying field on a failed delivery.
- The Edge Function's error log line format is:
  - `delivery_failed reason=<apns|fcm|expo|network> code=<error_code>` — that's it. NO `user_id`, NO `expo_token`, NO `claim_id`.
- **Aggregate delivery accounting uses the EXISTING `cron_log` table** (Steve S6 — already shipped in schema.sql). The spec previously invented columns `operation`, `success_count`, `fail_count` that **DO NOT EXIST**. The real schema is:
  ```sql
  cron_log (id, job_name TEXT, ran_at TIMESTAMPTZ, rows_affected INTEGER, success BOOLEAN, error_text TEXT)
  ```
- **Mapping for push deliveries** (reuses the packed-error pattern Dana adopted in migrations 003/007):
  - `job_name` — `'push_deliver_batch'` (one row per Edge Function invocation cycle, not per recipient).
  - `ran_at` — defaults to `now()`.
  - `rows_affected` — total deliveries attempted in the cycle (success + fail combined).
  - `success` — `true` if all attempted deliveries succeeded; `false` if any failed OR rate-limited.
  - `error_text` — sanitized packed string like `delivered=N;failed=M;rate_limited=K;reason_codes=apns:2,expo:1`. **NO `user_id`, NO `expo_token`, NO `recipient_id`, NO `claim_id`, NO `resource_id`, NO handle.** UUIDs are forbidden in this field.
- Per-recipient rate-limit counters live in a SEPARATE table (`push_rate_limit` — see AC-15); rate-limit state is per-recipient by design but is never written to `cron_log`.
- Verified by Steve in code review + a Gary test that asserts the `cron_log.error_text` value contains zero UUID-shaped substrings across 1000 simulated mixed-outcome deliveries.

### AC-6: Reduced motion respected (no haptic alerts)

- The user's `useReducedMotion` preference (existing helper at `src/lib/useReducedMotion.ts`, mirror of AccessMap's pattern) controls whether the device vibrates / plays a sound on incoming push.
- When `useReducedMotion === true`, the notification payload sets `sound: null` AND `vibrate: false` (Expo's payload supports both).
- When `useReducedMotion === false`, default device behavior (no override).
- This must be set at SEND time (Edge Function reads user's stored preference per-trigger), not at receive time — the receive side can't suppress the OS-level alert reliably.
- Implication: we need to store the user's `reduce_motion` choice server-side. Currently `useReducedMotion` is client-only. **DFS-5 covers this:** either (a) sync `reduce_motion` to a new column on `public.users`, or (b) compute on-device and pass through a preference field on the push trigger toggle.

### AC-7: Per-trigger toggle in Profile

- The Profile screen gets a new section "Notifications" with **four independent toggles**, one per trigger:
  - **Trigger 1:** "When someone claims your post" (toggle: OFF default)
  - **Trigger 2:** "When a pickup is confirmed" (toggle: OFF default)
  - **Trigger 3:** "When your account is approved" (toggle: OFF default)
  - **Trigger 4:** "When your account is reviewed" (rejection) (toggle: OFF default)
- Each toggle is a standalone preference, independently togglable. The user can opt into one without opting into the others.
- Below the four toggles, a single secondary action: "Disable all notifications" (calls `revoke_push_token()` and flips all four toggles OFF in one transaction).
- "Why we need this" microcopy is present under EACH toggle (Mara persona requirement): one sentence each, e.g., `"We send a title-only notification. The item name never appears on your lock screen."`
- Per-trigger preferences are stored as a JSONB column `push_preferences` on `public.users` (Section 5). Default value `{ claim_placed: false, pickup_confirmed: false, admin_approved: false, admin_rejected: false }` for every new user.

### AC-8: Three-layer enforcement (matches the privacy gate)

This is a privacy-load-bearing surface and mirrors CLAUDE.md gotcha #8:

| Layer         | What enforces it                                                                                           | What happens if breached              |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Client        | `push.ts` helper checks user's `push_preferences` before registering token; refuses to call RPC if all OFF | Server-side RPCs reject anyway        |
| Server RPC    | `register_push_token` requires the caller to have at least one `push_preferences.* = true`                 | Returns error; no row inserted        |
| Edge Function | `deliver_notification` re-checks the recipient's `push_preferences` immediately before send                | No payload sent; cron_log row written |

If a stale token exists from a previous opt-in (e.g., user toggled all OFF after a delivery was queued), the Edge Function's pre-send re-check is the last line of defense. Verified by Steve in integration testing.

### AC-9: Expo Push as thin proxy; no analytics SDKs (REWRITTEN — Steve C1 fix)

- **What we use:** Expo Push API (`https://exp.host/--/api/v2/push/send`) as a thin proxy between our Edge Function and Apple APNS / Google FCM. Building a direct APNS/FCM pipeline (holding APNS auth keys + FCM service account ourselves) is out of scope for v1; deferred to v2.
- **What we do NOT use:** No managed third-party push providers (no OneSignal, no Pusher, no Firebase Cloud Messaging as-a-service, no Airship/Urban Airship, no Braze). **No analytics SDKs** (no Sentry, no Mixpanel, no Amplitude — already PRIVACY.md D8). No Expo analytics features even though we use Expo's push proxy.
- **Payload sent to Expo:** title-only (one of 3 fixed strings — see AC-2; triggers 3 & 4 share the same string), `body: ""`, `data.route` from a 4-value fixed set, `data.id` is a UUID. **No resource name, no handle, no content. Expo sees routing metadata, not content.**
- **Expo's documented behavior:** retains payloads only during delivery; drops after. Jordan re-verifies against Expo's current privacy policy at review time and notes any drift.
- **`package.json` audit** (at Cycle 7 ship-readiness per PRIVACY.md D8) re-confirms no analytics or third-party push SDK ever crept in.
- **PRIVACY.md D8 amendment proposed** (see bottom of this spec) — D8 forbids third-party _analytics/observability_ SDKs that egress user-behavior data; the proposed amendment clarifies that D8 does NOT forbid a third-party message-proxy service that receives minimum-payload routing data we control. Jordan + Sky approve.
- Verified by Jordan in privacy review (FULL) + Steve in code review.

### AC-10: Notification → in-app deep link is safe + recipient SERVER-DERIVED (Steve C3 fix)

- Tapping a notification opens the app. The `data` payload routes to a specific screen (e.g., `ResourceDetailScreen` for trigger 1, `WaitingRoomScreen` becomes `HomeScreen` for trigger 3).
- The deep link MUST NOT bypass the existing auth gate (`App.tsx` → `decideGateRoute`). If a user is signed out when they tap the notification, they land on SignInScreen as normal; the route hint is preserved and applied AFTER successful sign-in.
- If a user is signed in but their `is_verified` flag has changed to false (e.g., revoked), the gate routes them to WaitingRoomScreen — NOT to the resource detail screen the notification pointed at. **Three-layer gate (CLAUDE.md gotcha #8) holds even on deep-link entry.**
- **CRITICAL CONTRACT — `recipient_id` is SERVER-DERIVED ONLY (Steve C3):** Every RPC that calls `deliver_notification` MUST derive `recipient_id` server-side from a row in `public.resources`, `public.users`, or `public.claims`. **`recipient_id` MUST NEVER come from a client payload parameter.**
  - For trigger 1 (`claim_resource`): `recipient_id := SELECT posted_by FROM public.resources WHERE id = p_resource_id` (inside the RPC's existing transaction).
  - For trigger 2 (`confirm_pickup`): `recipient_id := SELECT (the OTHER party of the pickup) FROM the resource/claim row`.
  - For trigger 3 (`approve_user`): `recipient_id := p_applicant_id` (the function's existing param, scoped to `public.users` lookup).
  - For trigger 4 (`reject_user`): `recipient_id := p_applicant_id` (same).
  - A grep-check in CI rejects any RPC body that passes a parameter name matching `/recipient/i` directly to `deliver_notification` without an intermediate `SELECT ... INTO` from a privileged table.
- Verified by Steve in three integration scenarios: signed-out, signed-in-verified, signed-in-unverified, PLUS a fourth scenario where a malicious test RPC attempting to pass a client-supplied `recipient_id` to `deliver_notification` is rejected by AC-14's defense-in-depth check.

### AC-11: Realtime channel cleanup for notification state

- The Profile screen subscribes to its own `public.users` row for `push_preferences` changes (in case the user has the app open on two devices). On change, the toggles re-render.
- The subscription uses the mounted-ref pattern (CLAUDE.md gotcha #5) and unsubscribes on screen unmount.
- Per Peter's Phase 1 perf audit, total active channels stay ≤2 per client; this subscription only opens when Profile is focused, not for the whole app session.

### AC-12: Token storage and transport (+ Edge Function secret discipline + CI grep — Steve M1 + M3)

- The Expo push token is stored in `public.push_tokens.expo_token` as plaintext **per Expo's documented model** — the token itself is not a credential and is rotateable by the user via the OS. (DFS-1 covers whether to hash-at-rest anyway.)
- Transport is TLS (Supabase default).
- The token is NEVER logged client-side (no `console.log(token)`, no `console.warn`, no `console.error` with the token in the message). **CI gate (Steve M3):** Gary adds a CI step that greps client-side TypeScript for `console.(log|warn|error)\([^)]*?\b(expoToken|pushToken|expo_token|push_token)\b` and fails the build on any match. Same gate against the Edge Function source (`supabase/functions/deliver_notification/`) for any of `token|recipient_id|user_id|claim_id|expo_token`.
- AsyncStorage on device does NOT cache the token between sessions; we always read fresh from Expo's `getExpoPushTokenAsync()` and re-sync with the server on each opt-in or rotation.
- **Expo API key discipline (Steve M1):** The Edge Function holds the Expo push access token (`EXPO_ACCESS_TOKEN`) as a Supabase Edge Function secret (set via `supabase secrets set EXPO_ACCESS_TOKEN=...`). The token is **NEVER in source**, **NEVER in `.env.example`**, **NEVER in client bundles**, **NEVER committed**, **NEVER printed in logs**. Sky rotates the Expo access token quarterly (calendar reminder set during onboarding). This is the load-bearing mitigation that keeps the plaintext-tokens-at-rest decision (DFS-1) safe — a `push_tokens` exfiltration alone is useless without the Expo API key, which only the Edge Function holds.
- New STRIDE threat **PI5** (added during Steve's audit): `push_tokens` + Expo API key co-leak enables impersonation; mitigated by Edge Function secrets isolation + quarterly rotation.

### AC-13: Explicit Expo Push disclosure (NEW — Steve C1)

- The "Why we need this" microcopy under EACH Profile toggle AND the Privacy Policy page AND Casey's seed-community outreach materials (website, onboarding screenshots, partner one-pagers) MUST accurately disclose the delivery path: **Expo Push (a third-party message proxy) → Apple APNS / Google FCM → device OS lockscreen renderer**.
- Microcopy explicitly states what each downstream sees: title-only generic string + opaque UUID route. **No resource name, no handle, no content.**
- Example microcopy block (Will + Casey finalize, Jordan approves):
  > "Notifications are sent through Expo Push, a thin proxy we use to reach Apple and Google's notification servers. Expo, Apple, and Google see only a generic title ('You have an update') and an opaque ID — never the item name, your handle, or any content. We do not use OneSignal, Pusher, or any analytics SDK."
- The user-story line ("verify in the 'Why we need this' copy that no third-party server ever sees what was claimed") is **rewritten** at the top of the spec to: "verify in the in-app 'Why we need this' copy that the notification payload contains only a generic title and an opaque ID — no resource name, handle, or content."
- **Casey's outreach materials MUST NOT quote the OLD AC-9 text** ("no third-party push providers"). Wait for the AC-9 + AC-13 revised text before writing any external-facing copy. Will + Casey coordinate.
- Verified by Jordan in FULL privacy review against PRIVACY.md D8 (and its proposed amendment).

### AC-14: Defense-in-depth recipient-authority check inside Edge Function (NEW — Steve C3)

- Even though AC-10 mandates `recipient_id` is server-derived from a row, the Edge Function performs its OWN authority check before sending. Belt-and-braces against a future RPC implementer who forgets the AC-10 rule.
- The Edge Function signature is extended: `deliver_notification(trigger TEXT, recipient_id UUID, caller_user_id UUID, route_id UUID DEFAULT NULL)`. The calling RPC passes its own `auth.uid()` as `caller_user_id`.
- Inside the Edge Function, BEFORE the title-only payload assertion and BEFORE the send:
  - Assert at least one of the following holds:
    1. `recipient_id == caller_user_id` (self-notification — currently unused but reserved).
    2. There exists a row in `public.resources` where (`caller_user_id = posted_by` AND `recipient_id = claimed_by`) OR vice versa, AND the row's `status` indicates the trigger is plausible (e.g., trigger 1 requires a recent transition to `reserved`).
    3. The caller is an admin (`public.users.is_admin = true` for `caller_user_id`) AND the recipient is non-admin (admins use this path for triggers 3 and 4).
  - If none hold, the Edge Function fails-closed: writes `cron_log` row `(job_name='push_deliver_batch', success=false, error_text='authority_check_failed')` (no `recipient_id`, no `caller_user_id` logged), returns without sending.
- The check is a SECOND line of defense. AC-10's server-derivation requirement is the PRIMARY defense. The Edge Function check catches contract violations introduced by future code.
- Verified by Gary integration test: a non-admin user calling a hypothetical "send_push(trigger, recipient_id)" RPC with another user's UUID is rejected at the Edge Function layer (not just at AC-10's grep gate).

### AC-15: Per-recipient delivery rate-limit (NEW — Steve M2)

- The Edge Function enforces a per-recipient-per-trigger-per-hour delivery cap to prevent spam-claim → spam-notification abuse (PD1 in the STRIDE retread).
- **New table `public.push_rate_limit`** (Dana writes in migration 010):
  ```sql
  CREATE TABLE public.push_rate_limit (
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    trigger     TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, trigger, window_start)
  );
  ```
- **Per-trigger caps:**
  - Trigger 1 (`claim_placed`): **20/hour** — claim activity can be legitimately bursty (popular post → multiple claimants).
  - Trigger 2 (`pickup_confirmed`): **10/hour**.
  - Trigger 3 (`admin_approved`): **1/day** — one-time event per user; >1 is anomalous.
  - Trigger 4 (`admin_rejected`): **1/day** — one-time event per user.
- **Behavior:** On each delivery, the Edge Function (a) atomically INCREMENTs the relevant `(user_id, trigger, current_hour_window)` row, (b) reads back the count, (c) if over the cap, SKIPS the delivery and logs `cron_log` with `error_text=...rate_limited=K...` (no `recipient_id`). The user's `push_tokens` row is NOT deleted on rate-limit; rate-limit is per-window and recovers automatically.
- **Cascade through `delete_my_account()`:** the new table's `user_id ON DELETE CASCADE` keeps PRIVACY.md D6 honest.
- **Cleanup cron:** a daily prune deletes rate-limit rows older than 48h (the longest window we care about is 24h for triggers 3 & 4; 48h gives buffer for off-by-one).
- Verified by Gary integration test: 25 rapid `claim_resource` calls in 1 minute result in ≤20 push deliveries, with the remainder logged as rate-limited.

## Trust boundary (NEW — Steve C1)

Every party in the push-delivery path that can see message metadata. This is the honest list; it appears in the Privacy Policy and Casey's outreach materials.

| Party                     | What they see                                                    | Retention                                                           | Disclosed where                                    |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| Mutual Mesh (us)          | All payload + recipient_id + delivery success/failure            | `cron_log` aggregates only (no user_id); per-user `push_tokens` row | Profile microcopy + Privacy Policy + outreach copy |
| Expo Push (proxy)         | Title-only string + `data.route` + `data.id` (UUID)              | "During delivery only" per Expo's documented behavior               | AC-13 microcopy + Privacy Policy + Casey outreach  |
| Apple APNS                | Title-only string + `data.route` + `data.id` (UUID)              | "During delivery only" per Apple's documented behavior              | Privacy Policy                                     |
| Google FCM                | Title-only string + `data.route` + `data.id` (UUID)              | "During delivery only" per Google's documented behavior             | Privacy Policy                                     |
| Device OS                 | Title-only string at lockscreen; full payload in-app             | OS-managed (varies by user's settings)                              | Privacy Policy                                     |
| Anyone with device access | Title-only string at lockscreen (uniform across triggers per H4) | Until user dismisses                                                | Privacy Policy (Mara persona-specific section)     |

**What NONE of these parties see** (load-bearing — this is the privacy contract):

- The resource name
- The claimant's handle
- The poster's handle
- The pickup_text
- The contact_handle
- The user's email or any auth-side field
- Any content beyond the 3 fixed title strings and the opaque routing UUID

Jordan re-verifies Expo, Apple, and Google's documented retention behaviors at FULL privacy review time and notes any drift.

## Screens / layout

Two surfaces. No new screen file; the Profile screen gets a new section.

### Surface 1: Profile → Notifications section

```
┌──────────────────────────────────────────┐
│  ←  Profile                              │   <- existing screen header
│                                          │
│  ...                                     │   <- existing profile fields (handle, etc.)
│                                          │
│  ──────────────────────────────────────  │
│                                          │
│  Notifications                           │   <- new section, NativeWind h2 token
│                                          │
│  When someone claims your post      [ ]  │   <- Toggle (off by default)
│  We send a title-only notification.      │   <- "Why we need this" microcopy
│  The item name never appears on          │
│  your lock screen.                       │
│                                          │
│  When a pickup is confirmed         [ ]  │   <- Toggle
│  Title-only. No item names ever.         │
│                                          │
│  When your account is approved      [ ]  │   <- Toggle
│  One-time. Title-only.                   │
│                                          │
│  When your account is reviewed      [ ]  │   <- Toggle
│  One-time. Title-only.                   │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  Disable all notifications          │  │   <- secondary Button (one-tap revoke)
│  └────────────────────────────────────┘  │
│                                          │
│  ...                                     │   <- rest of Profile (delete-account, etc.)
└──────────────────────────────────────────┘
```

### Surface 2: Lockscreen notification (iOS + Android)

```
┌──────────────────────────────────────────┐
│  [Mutual Mesh icon]    9:42 AM           │
│                                          │
│  Mutual Mesh                             │   <- app name
│  Your post has an update                 │   <- AC-2 generic title only
│                                          │   <- NO body line
└──────────────────────────────────────────┘
```

**What is INTENTIONALLY absent:** no resource name, no claimant handle, no item category, no postal prefix, no FSA, no quantity, no anything. The user taps in to see what changed.

### Component reuse map

| Used component                              | Where                                              |
| ------------------------------------------- | -------------------------------------------------- |
| `Toggle` (NEW — DFS-7 if doesn't exist yet) | Per-trigger preference rows                        |
| `Button` (secondary variant)                | "Disable all notifications"                        |
| `FlashBanner`                               | "Notifications enabled" / "Notifications disabled" |
| `LoadingSkeleton`                           | Brief skeleton while preferences load              |

Toggle component: if `src/components/Toggle.tsx` doesn't exist yet (check during build), Shamus surfaces it to Dani via a `qa-reports/feature-*.md` proposal first per CLAUDE.md role-lane rule. Toggle should be a thin wrapper on `Pressable` + animated marker, NativeWind tokens, and respect `useReducedMotion`.

## Data view (Jordan privacy gate — FULL review required)

This section is privacy-load-bearing and gates merge. Jordan does a FULL review (not LIGHT) because push is a NEW external metadata surface (the device's push notification queue is reachable by parties Mutual Mesh cannot control: Apple, Google, Expo, and anyone with physical access to the device).

### New table: `public.push_tokens`

**REVISED — Steve C2:** the UNIQUE constraint is on `(user_id, platform)` (not `(user_id, expo_token)`) so that the `register_push_token` UPSERT path is atomic and well-defined. One row per user per platform.

```sql
CREATE TABLE public.push_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_token   TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (user_id, platform)   -- Steve C2: enforces one-row-per-user-per-platform; supports UPSERT
);

CREATE INDEX push_tokens_user_id_idx ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their OWN tokens only (for the Profile screen to verify registration)
CREATE POLICY push_tokens_self_select ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies — only security-definer RPCs write rows
-- (mirrors verification_log pattern)
```

**Note for Dana:** Migration 009 (already shipped) used `UNIQUE (user_id, expo_token)`. Migration 010 is required to DROP that constraint and ADD `UNIQUE (user_id, platform)`. See "Schema corrections needed" at the bottom of this spec.

### New column on `public.users`: `push_preferences JSONB`

```sql
ALTER TABLE public.users
  ADD COLUMN push_preferences JSONB NOT NULL DEFAULT '{
    "claim_placed": false,
    "pickup_confirmed": false,
    "admin_approved": false,
    "admin_rejected": false
  }'::jsonb;
```

The default value is critical (AC-1): every existing user and every new user starts with all four preferences false.

### Cascade through `delete_my_account()`

`public.push_tokens.user_id` has `ON DELETE CASCADE` referencing `auth.users(id)`. When `delete_my_account()` (existing RPC, PRIVACY.md D6) deletes the `auth.users` row, all push tokens for that user disappear in the same transaction. Steve verifies in the integration test that `SELECT * FROM push_tokens WHERE user_id = <deleted_uuid>` returns zero rows after the delete.

### What Apple/Google see

Per AC-2, the payload Apple/Google receive contains:

- `title` — a fixed generic string per trigger (**3 unique values total** across the whole app — triggers 3 & 4 share "You have an update" per Steve H4)
- `body` — empty
- `data.route` — a screen name from a fixed set (4 possible values)
- `data.id` — a UUID (resource_id or N/A for admin triggers)

Apple/Google retain the payload only during transit; their documented behavior is to drop the payload after delivery. We accept the residual that a malicious party with subpoena power on Apple/Google could see the delivery happened (delivery metadata) — but they cannot reconstruct what the user was doing in Mutual Mesh. The `data.id` is a UUID, not a name; mapping it back to a resource requires our DB.

### What Expo sees

Expo's push API receives the same payload. Per Expo's documented model, they do not retain message bodies after delivery. We accept this residual; we DO NOT enable Expo's analytics features. Jordan verifies against Expo's current privacy policy at review time.

### Concrete payload example (for Steve's review)

```json
{
  "to": "ExponentPushToken[xxxx]",
  "title": "Your post has an update",
  "body": "",
  "data": { "route": "ResourceDetail", "id": "550e8400-e29b-41d4-a716-446655440000" },
  "sound": null,
  "_displayInForeground": true
}
```

**Forbidden payload shapes:**

- `body` with any non-empty string
- `data` containing `handle`, `resource_name`, `description`, `category`, `postal_prefix`, `pickup_text`, `contact_handle`, `claimant_handle`
- `data` containing the user's email or any auth-side field

## RPC contracts

Two new RPCs + one new Edge Function. Dana writes the SQL; Sky applies the migration; the Edge Function deploys via Supabase CLI (Sky executes per Constitution Art. 9 — no role can deploy).

### `register_push_token(token TEXT, platform TEXT) RETURNS BOOLEAN`

**Authorization:** Requires `auth.uid()` (authenticated session); requires at least one `push_preferences.* = true` on the caller's `public.users` row (AC-8 server layer).

**Client call:**

```ts
const { data, error } = await supabase.rpc('register_push_token', {
  token: expoToken,
  platform: Platform.OS, // 'ios' | 'android'
});
```

**Response shape:**

- `data: true` on success.
- `error: PostgrestError` on failure. Known error.message values:
  - `"Not authenticated"` — session expired.
  - `"No push preferences enabled"` — user toggled off in between client-check and RPC; treat as no-op.
  - `"Invalid platform"` — must be 'ios' or 'android'.
- Any other error → `userFacingErrorMessage()` ("Couldn't enable notifications. Please try again.").

**Side effects (atomic within the RPC transaction) — REVISED per Steve C2:**

1. UPSERT into `public.push_tokens` keyed on `(auth.uid(), platform)` using `ON CONFLICT (user_id, platform) DO UPDATE SET expo_token = EXCLUDED.expo_token, last_used_at = now()`. The UNIQUE `(user_id, platform)` constraint (per the revised schema above) makes this UPSERT well-defined: same token + same platform is a no-op refresh; new token on same platform is a rotation; new platform is an insert. **One row per user per platform, always.**
2. **No client-side per-token revoke**, no SELECT-then-decide, no race window. The client just calls `register_push_token(token, platform)` unconditionally on foreground when any trigger is ON.

### `revoke_push_token() RETURNS BOOLEAN`

**Authorization:** Requires `auth.uid()`. No other check; users can always revoke.

**Signature is no-arg only** (Steve C2): there is no per-token revoke path. This RPC is a full-wipe used by the "Disable all" button AND by the silent auto-cleanup when the user toggles all triggers OFF (Steve H2 — AC-3).

**Client call:**

```ts
const { data, error } = await supabase.rpc('revoke_push_token');
```

**Response shape:**

- `data: true` on success.
- `error: PostgrestError` on failure (typically network).

**Side effects (atomic within the RPC transaction):**

1. DELETE all rows in `public.push_tokens WHERE user_id = auth.uid()` (every platform, every token — full wipe).
2. UPDATE `public.users SET push_preferences = '{ "claim_placed": false, "pickup_confirmed": false, "admin_approved": false, "admin_rejected": false }'::jsonb WHERE id = auth.uid()` so the UI toggles all show OFF immediately.

### Edge Function: `deliver_notification(trigger TEXT, recipient_id UUID, caller_user_id UUID, route_id UUID DEFAULT NULL)`

**Auth:** Service-role-only. Called by:

- `claim_resource()` RPC (existing — extended to call this on success) for trigger 1
- `confirm_pickup()` RPC (Phase 2 — extended) for trigger 2
- `approve_user()` RPC (existing) for trigger 3
- `reject_user()` RPC (existing) for trigger 4

NEVER called by the client directly. The Edge Function has its own privileged Supabase client.

**Critical contract (Steve C3 — AC-10 + AC-14):** `recipient_id` MUST be server-derived inside the calling RPC from a privileged-table SELECT (resources/users/claims). It MUST NEVER be a client payload parameter passed through. The Edge Function itself performs a defense-in-depth recipient-authority check per AC-14 before sending — using the new `caller_user_id` parameter.

**Behavior:**

1. **Recipient-authority check (AC-14):** validate that `caller_user_id` has a legitimate relationship to `recipient_id` (self-notification OR resources/claims linkage OR admin → non-admin). If not, write `cron_log` row `(job_name='push_deliver_batch', success=false, error_text='authority_check_failed')` (no IDs in error_text), return.
2. **Rate-limit check (AC-15):** atomically INCREMENT the `push_rate_limit` counter for `(recipient_id, trigger, current_hour_window)` and check against the per-trigger cap. If over the cap, SKIP delivery, write `cron_log` row with `error_text` packed `rate_limited=1`, return.
3. **Preference re-check (AC-8 server layer):** look up the recipient's `push_preferences[trigger]`. If false → write `cron_log` row with `error_text` packed `skipped_preference=1`, AND if no triggers are ON delete the recipient's `push_tokens` rows (AC-3 H2 belt-and-braces cleanup), return.
4. **Token lookup:** look up the recipient's active `push_tokens` rows. If empty → write `cron_log` row, return.
5. **Reduce-motion lookup** (DFS-5): look up recipient's `reduce_motion` preference.
6. **Build payload per AC-2 + AC-9** using the Edge Function's OWN payload builder (NOT imported from `src/lib/push.ts` — see AC-2 H1). **Assert `body === ""` (fail-closed if violated, write `cron_log` with `error_text` packed `assertion_failed=1`, return.)**
7. POST to Expo's push API using the `EXPO_ACCESS_TOKEN` Edge Function secret (AC-12 M1).
8. On success: UPDATE `push_tokens.last_used_at = now()`, accumulate into the per-cycle `cron_log` row (one row per batch — see AC-5).
9. On failure: NO logging of user_id / token / recipient_id; accumulate into the per-cycle `cron_log` row with sanitized `reason_codes` packed into `error_text`.

**Important:** The Edge Function never raises an error back to the calling RPC. Push delivery is fire-and-forget from the calling RPC's perspective — a failed push must NEVER block a successful claim/approval/etc.

### Error mapping (for `userFacingErrorMessage` consumption)

| `error.message`                 | User-facing message                           | Recovery                    |
| ------------------------------- | --------------------------------------------- | --------------------------- |
| `"Not authenticated"`           | `"Your session ended. Please sign in again."` | Sign out + route to SignIn  |
| `"No push preferences enabled"` | (silent — UI already shows OFF state)         | None                        |
| `"Invalid platform"`            | `"Couldn't detect your device type."`         | Generic retry               |
| Network / 5xx                   | `"Couldn't reach the server. Try again."`     | Retry button on FlashBanner |
| Anything else                   | `"Something went wrong. Please try again."`   | Generic                     |

## Tests (Gary writes)

### Unit tests (pure helpers in `src/lib/push.ts`)

The helper file exposes pure functions:

- `buildPushPayload(trigger, routeId, reduceMotion)` — pure function returning the exact payload to send. Assertable that `body === ""` for every trigger. Table-driven test.
- `shouldRegisterToken(currentPrefs, newToken, existingToken)` — pure decision: register / rotate / no-op. Table-driven.
- `parseExpoDeliveryResponse(response)` — pure response parser; covers success / soft-fail / hard-fail / token-invalid; returns a tagged union.

Each helper gets its own `*.test.ts` file in `src/__tests__/`.

### Component tests

- Profile renders four toggles, all OFF by default for a new user.
- Toggling a single trigger ON calls `register_push_token` with the right `platform`.
- The "Disable all" button calls `revoke_push_token` and flips all four toggles OFF visually.
- "Why we need this" microcopy renders under each toggle.
- `accessibilityLabel` on each toggle includes the trigger name AND the current ON/OFF state.

### Integration tests (RLS + RPC — Steve writes; Gary runs in CI)

These extend `supabase/__tests__/rls.sql`:

- A non-authenticated client calling `register_push_token` raises `'Not authenticated'`.
- A non-authenticated client calling `revoke_push_token` raises `'Not authenticated'`.
- A user with all `push_preferences = false` calling `register_push_token` raises `'No push preferences enabled'`.
- After successful `register_push_token`, exactly one row appears in `push_tokens` with the caller's `user_id`.
- **Token rotation (Steve C2):** two rapid `register_push_token` calls with the SAME token + platform are idempotent (one row, no error). Two rapid calls with DIFFERENT tokens on the same platform result in exactly one row containing the LATEST token (no duplicates, no nulls, no orphan rows).
- After `revoke_push_token`, zero rows remain in `push_tokens` for the caller.
- After `delete_my_account()`, zero rows remain in `push_tokens` for the deleted user (CASCADE check).
- **Auto-cleanup (Steve H2):** opt-in then opt-out within 1 second leaves zero rows in `push_tokens` for the user.
- The client CANNOT direct-INSERT into `push_tokens` (no INSERT policy → 401).
- **Edge Function payload-shape assertion (Steve H1):** a Deno-runtime test at `supabase/functions/deliver_notification/__tests__/payload-shape.test.ts` asserts the Edge Function's own `buildPayload` (server-side duplicate of the client helper) fails-closed on any non-empty `body`.
- The Edge Function does NOT write user-identifying data to its error log on any failure mode (parsed `cron_log.error_text` is matched against a regex that REJECTS any UUID-shaped substring across 1000 simulated mixed-outcome deliveries).
- **Recipient-authority check (Steve C3 + AC-14):** a test RPC attempting to pass a client-supplied `recipient_id` (NOT server-derived from a privileged-table SELECT) to `deliver_notification` is rejected by the Edge Function's authority check; `cron_log.error_text` contains `authority_check_failed` and no IDs.
- **Per-recipient rate-limit (Steve M2 + AC-15):** 25 rapid `claim_resource` calls in 1 minute targeting the same recipient result in ≤20 push deliveries; the remainder are logged as rate-limited; the `push_tokens` row is NOT deleted on rate-limit (recovers next window).
- **Title uniformity (Steve H4):** trigger 3 and trigger 4 produce identical title strings (`"You have an update"`); a snapshot test asserts the per-trigger title map matches the AC-2 revised values.
- **Token logging CI grep (Steve M3):** the CI workflow fails the build if `console.(log|warn|error)` containing token / recipient_id / user_id / claim_id / expo_token appears in client OR Edge Function source.

### Manual smoke test (Sky walks through on staging — Phase 3.1 sync point)

1. Sign in as a fresh user; confirm Profile shows four toggles, all OFF.
2. Toggle "When someone claims your post" ON; confirm a `push_tokens` row appears with `UNIQUE (user_id, platform)` honored (exactly one row).
3. From a second account, claim the first account's resource; confirm a notification appears on the first device with title `"Your post has an update"` and NO body, NO resource name, NO claimant handle.
4. Verify the lockscreen shows ONLY the title and the app icon — nothing else.
5. Tap the notification; confirm the app opens to the ResourceDetail for that resource.
6. **Title uniformity (Steve H4):** trigger an admin approval AND an admin rejection from a Sky-admin account against a test user; confirm BOTH notifications show the lockscreen title `"You have an update"` (identical, indistinguishable to a casual observer).
7. Toggle the trigger OFF; from second account, claim another resource; confirm NO notification arrives.
8. **Auto-cleanup (Steve H2):** toggle one trigger ON briefly, then toggle it OFF immediately; confirm zero `push_tokens` rows remain for the user after ~1 second.
9. Tap "Disable all notifications"; confirm `push_tokens` rows are all gone; confirm no triggers fire for any other action.
10. **Rate-limit (Steve M2 + AC-15):** from second account, fire 25 rapid claim_resource against the first user's resources; confirm ≤20 notifications reach the device; confirm `cron_log` rows contain `rate_limited=` packed in `error_text` with NO UUIDs.
11. Delete the account via Profile; confirm zero `push_tokens` AND zero `push_rate_limit` rows remain for the deleted user_id.
12. Verify with the iOS Settings → Mutual Mesh → Notifications panel that the OS-level permission can also be revoked there (and that a revoke at OS level eventually results in the next `register_push_token` failing gracefully).

## A11y (Alex pre-audit notes — Phase 3.1 build)

- **Toggle accessibility**: each toggle uses `accessibilityRole="switch"`, `accessibilityState={{ checked: enabled }}`, and `accessibilityLabel` that includes the trigger name (e.g., `"When someone claims your post, off"` / `"...on"`).
- **"Why we need this" microcopy**: rendered as `accessibilityRole="text"` adjacent to the toggle; screen-reader users hear the toggle label, the state, and then the rationale.
- **No haptic alerts when reduce-motion is on (AC-6)**: this is a hard a11y requirement; sound and vibration are silenced server-side.
- **FlashBanner announcements**: "Notifications enabled" / "Notifications disabled" are wrapped in `accessibilityLiveRegion="polite"` so screen readers announce the state change.
- **The "Disable all" button**: uses Button danger-leaning copy ("Disable all notifications") with `accessibilityHint="Removes the device from all notifications. You can opt back in any time."`.
- **Section heading "Notifications"**: uses `accessibilityRole="header"` and `accessibilityLevel=2` so users can jump via rotor.
- **Color contrast**: toggle ON state must hit WCAG 2.2 AA 3:1 against its background (non-text UI requirement). Already audited in Alex's a11y-tokens audit; re-verify the Toggle component.

## Performance considerations (Peter pre-notes)

- Push delivery is fire-and-forget from the calling RPC; never blocks user-visible action.
- Token registration is one-shot at toggle-ON; rotation is amortized into the existing `touch_my_last_active()` foreground hook.
- The Profile-screen realtime subscription on `public.users` for the user's own row is ≤1 channel; total active channels stay ≤2 per Peter's Phase 1 cap.
- The Edge Function batches deliveries by trigger if multiple users claim within the same second (out of scope for Phase 3.1 — note as a P1 optimization if push volume becomes large).
- Expo's push API accepts up to 100 messages per request; we send one-at-a-time for now since trigger volume in Casey's 90-day target (30-60 exchanges/week → ~10 push events/day peak) is well below this.

## Privacy considerations (Jordan pre-audit + FULL review needed)

This is the section that gates merge. Jordan does a FULL review.

1. **The AC-2 title strings are the privacy contract** — 3 unique strings across 4 triggers (triggers 3 & 4 share `"You have an update"` per Steve H4). Any deviation in any trigger's title or any non-empty body goes back through Jordan, not landed unilaterally by Shamus. Jordan has explicit veto authority on title strings.
2. **Expo push API privacy posture re-verified at review time.** Expo's documented behavior is "we don't retain message bodies after delivery." Jordan re-confirms against the current Expo privacy policy and notes any drift.
3. **The `push_tokens.expo_token` column is NOT hashed at rest by default (DFS-1).** This is an explicit decision — tokens are not credentials in the auth sense, they're rotatable identifiers. Jordan affirms or pushes back.
4. **The `push_preferences` JSONB on `public.users`** is readable by the user themselves only (existing `users_self_select` RLS). Other users do not see another user's preferences. Verified by Steve in the RLS test pass.
5. **`cron_log` push entries never contain user-identifying data (AC-5)**. Sky can audit aggregate delivery success rates without knowing who got pushed what.
6. **The deep-link AC-10 preserves the three-layer gate.** A notification cannot bypass `is_verified`.
7. **AsyncStorage on device does NOT cache the expo_token** (AC-12). If the device is stolen, the attacker would need to sign in to Mutual Mesh and re-register a token to receive pushes — they can't intercept ours without OS-level escalation.
8. **Quiet hours (DFS-2)** — not in scope for v1; users can use OS-level Do Not Disturb. Surface this in the Profile microcopy so users don't ask.

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 3.1 lands. Default behavior in parentheses is what ships if Sky doesn't override.

### DFS-1: Hash push tokens at rest?

The Expo push token is a long random string that identifies a device but is rotatable and not a credential in the auth sense. We could:

- **Default:** Store plaintext (matches Expo's reference docs; matches industry practice).
- **Alternative:** Hash at rest (bcrypt or sha-256), look up by hash on rotation/revoke.

**Quinn's proposal:** **Default plaintext.** Token is not a password-equivalent; hashing breaks the rotation comparison path (you can't compare hashed values). The privacy gain is marginal since tokens are device-bound and ephemeral. Sky's call.

- [ ] Approve plaintext (default)
- [ ] Push back — hash at rest
- [ ] Edit — sha-256 (non-bcrypt, cheap lookup)

### DFS-2: Quiet hours?

Should the Edge Function suppress delivery between, e.g., 10pm-7am local time?

**Quinn's proposal:** **NO in v1.** Users can use OS-level Do Not Disturb (iOS Focus, Android Bedtime mode). Building per-user quiet-hours preferences is UI bloat for a feature OS already provides better. Re-evaluate if seed communities specifically ask.

- [ ] Approve no-quiet-hours (default)
- [ ] Push back — add per-user quiet-hours preference

### DFS-3: Auto-prune stale tokens?

If a user installs the app, opts in, then uninstalls (deleting the OS-level token), Expo's push API will return `DeviceNotRegistered` on the next delivery. We could:

- **Default:** Auto-DELETE the `push_tokens` row on first `DeviceNotRegistered` response. The user re-opts on reinstall.
- **Alternative:** Mark `last_used_at = NULL` and prune after N days; gives the user one more chance.

**Quinn's proposal:** **Default auto-delete on `DeviceNotRegistered`.** Cleaner; the Edge Function already handles the error code and a DELETE is one extra SQL line. The user gets a fresh token on reinstall via the normal flow.

- [ ] Approve auto-delete on `DeviceNotRegistered` (default)
- [ ] Push back — soft-prune after N days

### DFS-4: Sound vs silent default?

The default Expo payload sends a notification sound on iOS and a default sound on Android. AC-6 silences these when `useReducedMotion === true`. But: should the default for users WITHOUT reduce-motion be sound-on or silent?

**Quinn's proposal:** **Silent by default for ALL users.** Mara persona: her ex sometimes sees her phone — a sound is an audible leak even if the lockscreen is title-only. Users who want sound can adjust at OS level. Per-user "play sound" preference adds UI bloat.

- [ ] Approve silent default (Quinn's recommendation)
- [ ] Push back — sound default, silent only on reduce-motion
- [ ] Edit — silent default + per-user toggle to enable sound

### DFS-5: How to sync `reduce_motion` to server for AC-6?

The Edge Function needs to know the recipient's reduce-motion preference to set `sound: null` / `vibrate: false` at SEND time, not receive time. Options:

- **(a)** Add a `reduce_motion` BOOLEAN column to `public.users`; the client mirrors the OS-level setting on app foreground.
- **(b)** Pass the preference through the toggle flow (when user opts ON, capture current reduce-motion state; doesn't update if they later change OS setting).
- **(c)** Ignore AC-6 entirely — rely on OS-level reduce-motion to suppress haptic alerts on receive side.

**Quinn's proposal:** **(a) — store as a column on `public.users`.** It's one BOOLEAN; the client already calls `touch_my_last_active()` on foreground (existing pattern) and we tack on a `setReduceMotionPref(current)` next to it. Sky's call confirms the schema change; Dana writes the migration.

- [ ] Approve (a) — add column (Quinn's recommendation)
- [ ] Edit — go with (b), capture-at-opt-in (cheaper, slightly stale)
- [ ] Edit — go with (c), drop AC-6 server-side (relies on OS only — Alex pushes back here)

### DFS-6: Notification permission ask — when?

iOS requires an explicit `requestPermissionsAsync()` call before notifications work. Android also requires it on Android 13+. When do we ask?

- **(a)** On first toggle ON in Profile. Just-in-time.
- **(b)** During onboarding tour (Phase 2 #8 — already shipped).
- **(c)** First app foreground after install.

**Quinn's proposal:** **(a) just-in-time at first toggle ON.** Matches the principle of "no permission asked until the user does something that needs it." If permission is denied, show a one-time inline disclosure linking to OS settings.

- [ ] Approve (a) — just-in-time at toggle ON (default)
- [ ] Edit — (b), include in onboarding tour
- [ ] Edit — (c), on first foreground

### DFS-7: Toggle component — Dani designs first?

`src/components/Toggle.tsx` may not exist yet (verify at build start). If so, Shamus needs Dani to design the component AND Alex to a11y-review it before Phase 3.1 can land.

**Quinn's proposal:** **Check at build start.** If Toggle exists, proceed; if not, Shamus files a `qa-reports/feature-toggle-component.md` proposal for Dani + Alex, then resumes Phase 3.1 after the component lands. Worst case: 1 day added to Phase 3.1.

- [ ] Approve build-start-check (default)
- [ ] Edit — preemptively spawn Dani+Alex now so Toggle is ready

### DFS-S1: Reconcile "no third-party push providers" narrative (Steve C1)

Steve flagged: PRIVACY.md D8 + spec AC-9 + user-story line all promise something that Expo's involvement softens. The first technically literate user or journalist who reads the Edge Function source will publicly correct us if we ship the OLD AC-9 narrative.

- **(a)** Quinn rewrites AC-9 + user story + adds AC-13 + Trust boundary section + PRIVACY.md D8 amendment proposal. Microcopy honestly discloses Expo as a thin proxy. **(Quinn's recommended default — applied in Revision 2.)**
- **(b)** Build a self-hosted APNS/FCM bridge in v1 to remove Expo from the trust boundary entirely. Adds ~1 week. Defer to v2.
- **(c)** Ship as-spec'd, accept the narrative drift, plan to fix microcopy in v1.1.

**Quinn's recommendation:** **(a) — already applied in Revision 2.** The honest narrative is stronger than the old framing because it pre-empts external critique. Self-hosted bridge is a v2 roadmap item worth doing but not at the cost of delaying Phase 3.1. Casey's outreach materials MUST wait for AC-9 + AC-13 final copy.

- [x] Approve (a) — applied in this revision (default — pending Sky confirmation)
- [ ] Push back — (b), self-hosted APNS/FCM bridge in v1
- [ ] Push back — (c), ship as-spec'd, fix microcopy in v1.1

### DFS-S2: Per-trigger title strings — all generic, or trigger-specific? (Steve H4)

Steve flagged: triggers 3 & 4's titles ("Your account is ready" / "Your application was reviewed") leak app-context to lockscreen observers. For Keo persona this IS the disclosure.

- **(a)** All four titles become `"You have an update"`. Uniform; lockscreen observer cannot differentiate. (Applied in Revision 2 to triggers 3 & 4 only — keeps triggers 1 & 2's slightly more informative titles since they're resource-related and vaguer.)
- **(b)** Keep per-trigger titles for triggers 1 & 2 (resource-related); make triggers 3 & 4 generic. **(Quinn's recommended default — applied in Revision 2.)**
- **(c)** Ship as-spec'd; accept the residual disclosure.
- **(d)** All four → `"You have an update"` (Steve's preferred — even stricter uniformity).

**Quinn's recommendation:** **(b) — already applied in Revision 2.** Triggers 1 & 2 ("Your post has an update" / "A pickup was confirmed") are vague enough that they don't signal "marginalized-group app." Triggers 3 & 4 (account approval / rejection) DO signal context and need to be generic. If Sky wants stricter uniformity (option d), the AC text change is two lines. Jordan has explicit veto on the final title strings.

- [x] Approve (b) — applied in this revision (default)
- [ ] Push back — (a), all four titles uniform (Steve's strictest preference)
- [ ] Push back — (c), keep original per-trigger titles (NOT recommended)

### DFS-S3: Per-recipient delivery rate-limit (Steve M2)

Steve flagged: a malicious verified user can spam-claim a victim's resources, each claim triggering a lockscreen interrupt. Without a delivery rate-limit, victim's only recovery is the nuclear "Disable all notifications."

- **(a)** Add Edge Function rate-limit table + per-trigger caps per AC-15 (20/h / 10/h / 1/day / 1/day). Adds one new table in migration 010 + ~30 LoC in the Edge Function. **(Quinn's recommended default — applied in Revision 2 as AC-15.)**
- **(b)** Defer to post-launch; ship v1 without a delivery rate-limit; monitor `cron_log` for abuse patterns.

**Quinn's recommendation:** **(a) — already applied in Revision 2.** Foreseeable abuse pattern; small fix; protects Mara from a known anti-goal (push spam from an abuser using a sock-puppet account). The rate-limit is one new table + a counter increment; the privacy-preserving log shape (no recipient_id in `cron_log.error_text`) is already covered by AC-5.

- [x] Approve (a) — applied in this revision (default)
- [ ] Push back — (b), defer to post-launch

### DFS-S4: `push_delivery_log` table — separate or reuse `cron_log`? (Steve H3)

Steve flagged: the spec invented columns (`operation`, `success_count`, `fail_count`) that don't exist on the real `cron_log` schema. Dana needs a concrete choice before migration 010.

- **(a)** Reuse existing `cron_log` table with `job_name='push_deliver_batch'`; pack outcome counts into `error_text` using the pattern Dana already adopted in migrations 003 (`storage_deleted=N;completed_deleted=M`) and 007. **(Quinn's recommended default — applied in Revision 2 as AC-5.)**
- **(b)** Create a new `push_delivery_log` table with its own schema. Steve's original preference; cleaner narrative ("push delivery isn't a cron job") but adds a table and breaks the existing `cron_log` query patterns.

**Quinn's recommendation:** **(a) — already applied in Revision 2 as AC-5.** Reusing `cron_log` keeps the schema lean, mirrors Dana's existing pattern (consistency = fewer bugs), and matches Sky's "small understandable diffs" preference (CLAUDE.md gotcha section). The packed-error pattern (`delivered=N;failed=M;rate_limited=K;reason_codes=...`) preserves the per-cycle accounting Steve wants. Steve preferred (b) for narrative clarity; Quinn picks (a) for schema simplicity. If Sky overrides to (b), Dana writes a slightly larger migration 010.

- [x] Approve (a) — applied in this revision (default — reuse `cron_log` with packed-error pattern)
- [ ] Push back — (b), separate `push_delivery_log` table (Steve's stated preference)

### DFS-S5: Expo API key storage discipline (Steve M1)

Steve flagged: plaintext tokens at rest (DFS-1) are acceptable IF and ONLY IF the Expo API key never leaks. The mitigation needs to be specified, not implicit.

- **(a)** Store `EXPO_ACCESS_TOKEN` as a Supabase Edge Function secret (`supabase secrets set EXPO_ACCESS_TOKEN=...`). Sky rotates quarterly via calendar reminder. **(Quinn's recommended default — applied in Revision 2 as AC-12.)**
- **(b)** Use Expo's anonymous push endpoint (no API key, but lower send-quota and weaker abuse protection on Expo's side).

**Quinn's recommendation:** **(a) — already applied in Revision 2 as AC-12.** Supabase Edge Function secrets are the right primitive for this; quarterly rotation by Sky is operationally cheap. Anonymous push endpoint (b) saves operational overhead but loses Expo's per-project abuse signal — not worth the trade-off for a privacy-sensitive app where push spam is a known threat.

- [x] Approve (a) — applied in this revision (default — Edge Function secret + quarterly Sky rotation)
- [ ] Push back — (b), use Expo's anonymous push endpoint (NOT recommended)

## Out of scope for Phase 3.1 (Push)

The following are deliberately deferred. Each has a follow-up named so we don't lose track.

- **In-app notification center / history.** The app does NOT keep a list of past notifications. The `cron_log` is aggregate-only. Re-evaluate if seed communities ask. Follow-up: **Phase 4 polish.**
- **Push for new chat messages.** Chat is Phase 3.3 spec #3; the chat spec has its own AC for plugging into push via the same `deliver_notification` Edge Function. Sequenced: push first (this spec), chat second.
- **Push for resource expiration warnings.** Feature #13 in the expansion plan; sequenced separately. Push infrastructure (this spec) is the foundation, not the trigger.
- **Web push (browser).** Out of scope — Mutual Mesh is a mobile app first. If Expo Web is ever shipped, push there is a separate spec.
- **Geofence-triggered push** ("hey, you're near a resource you might want"). NEVER ship. GPS = location leak per persona anti-goals. Hard NO from the privacy model.
- **Marketing/announcement push** ("New feature: X!"). NEVER ship. Casey + Sky communicate via the partner-network channels (Signal, Telegram), not via the user's lockscreen.

## Cross-spec dependencies

- **Phase 3.3 (Chat — Spec #3 below):** Chat depends on push for the "new message in your claim" trigger. The chat spec adds a fifth trigger to `push_preferences` and reuses the same `deliver_notification` Edge Function. **Push must ship before chat.**
- **Phase 2 (Pickup confirmation — Spec already shipped):** Pickup confirmation RPC is the source of trigger 2. The Phase 2 spec's `confirm_pickup()` RPC needs a new line of code: a fire-and-forget call to `deliver_notification(trigger='pickup_confirmed', recipient_id=<other_party>)`. This is a SMALL extension; documented in this spec's RPC contracts section.
- **Existing `claim_resource()` RPC:** Same — adds a line to fire push to the POSTER (not the claimant). The claimant doesn't get a push from this trigger.
- **Existing `approve_user()` / `reject_user()` RPCs (Cycle 5):** Same — each fires its respective trigger.

## Definition of done

- All 12 AC pass manually on staging.
- All unit + component tests pass green.
- All RLS + Edge Function integration tests pass green.
- Jordan signs off on Section 5 (data view + payload shape) — FULL privacy review.
- Steve signs off on the three-layer enforcement + token rotation + delivery log shape — FULL security review.
- Alex signs off on a11y + reduce-motion server-side suppression.
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 7 DECISIONS FOR SKY items (DFS-1 through DFS-7) before merge.
- Will updates `CLAUDE.md` "Status" line + adds the "no third-party push providers" rule to the Gotchas section.
- Morgan briefing in `qa-reports/phase-3-push-notifications-YYYY-MM-DD.md` summarising what shipped + screenshots from staging.

## Privacy review level

**FULL** — push is a new external metadata surface; Apple/Google/Expo are in the trust boundary; the title-only rule is load-bearing for Mara's persona. Jordan does the full PRIVACY.md amendment if any payload shape changes.

## Sky-decision gates beyond default DFS

1. **DFS-5 (reduce-motion sync to server)** — schema change to `public.users`; Sky applies the migration.
2. **Expo's current privacy policy** — Jordan re-verifies at review time; if Expo has changed posture since 2026-05-24, Sky decides whether to keep Expo or switch.
3. **Permission rationale copy** — Casey + Will draft the OS-permission rationale string ("Mutual Mesh sends you a title-only notification when someone claims your post..."); Sky approves before merge.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
