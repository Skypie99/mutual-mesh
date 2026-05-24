# Phase 3 — Push Notifications Security/Privacy Audit (Pre-Implementation)

**Author:** Steve (Safety Engineer)
**Date:** 2026-05-24
**Scope:** `qa-reports/spec-phase-3-push-notifications.md` (Quinn, 2026-05-24). FULL security + privacy audit BEFORE Shamus's implementation lands. No code exists yet for this surface — this audit operates on the spec, on the prior STRIDE model (`2026-05-23_threat-model-stride.md`), on PRIVACY.md D8 ("no third-party SDKs"), and on the Phase 1 baseline (`phase-1-security-audit-2026-05-24.md`).
**Authority:** Constitution v1.3 Art. 7.6 (privacy load-bearing — Sky approval required before merge), PRIVACY.md 🟢 APPROVED.
**Status:** READ-ONLY AUDIT. No code modified. File-only output. No external sends (Constitution v1.3 Art. 9 — Morgan is the sole channel to Sky).

---

## 1. TL;DR

**Overall verdict: SPEC IS STRUCTURALLY SOUND — but NOT yet safe to implement as-written. Twelve findings; three are launch-blockers that must be resolved before Shamus writes a line of code.**

The spec correctly identifies the load-bearing rules:
- **Default OFF per user per trigger (AC-1)** matches Mara/Keo anti-goals.
- **Title-only on lockscreen (AC-2)** is the single most important rule and the spec wires it into a server-side fail-closed assertion (good).
- **Three-layer enforcement (AC-8)** mirrors the `is_verified` gate pattern from gotcha #8 (good).
- **No third-party providers (AC-9)** keeps PRIVACY.md D8 intact (good — with one important caveat below).
- **Cascade through `delete_my_account()` (AC-3 + FK)** keeps PRIVACY.md D6 honest IF the FK is actually wired.
- **Failed-delivery log shape (AC-5)** correctly forbids token / handle / user_id leakage.

However, the spec also has the following gaps that would land a privacy or correctness regression if implemented as written:

- **CRITICAL** — AC-9 declares "no third-party push providers" but then mandates routing through Expo Push API. Expo IS a third party that sits between us and Apple/Google. The spec acknowledges this in §5 ("What Expo sees") but the AC text contradicts itself. This is the single biggest disclosure problem — the user-facing narrative ("no third-party server ever sees what was claimed") is technically true (the payload is title-only) but the architectural narrative is misleading. This must be reconciled before the in-app "Why we need this" microcopy is written or it WILL appear in a screenshot during seed-community outreach.
- **CRITICAL** — Token rotation as specified leaves a race condition: AC-4 has the client compare `getExpoPushTokenAsync()` to the "latest registered token for this user+platform," then revoke + re-register. Between those two calls, the user could be receiving a notification on the OLD token. More importantly: the spec's `register_push_token` RPC (§7) deletes the old row for the same `(user_id, platform)` pair BEFORE inserting the new — but the spec ALSO has `revoke_push_token()` (no-arg, deletes ALL rows for the user). This creates two divergent revoke paths (per-token implicit revoke inside register; full-wipe revoke as separate RPC), and the AC-4 wording ("revoke_push_token(old_token)") implies a per-token revoke that the RPC contract doesn't actually expose. The spec's revoke RPC takes no token argument, so AC-4's rotation flow CAN'T call it with `(old_token)`. This is a contract mismatch that needs fixing before Dana writes migration 009.
- **CRITICAL** — The Edge Function's data flow lets an attacker who controls the calling RPC's `recipient_id` parameter trigger arbitrary push deliveries. The Edge Function is "service-role only" per §7, called by `claim_resource()` / `confirm_pickup()` / `approve_user()` / `reject_user()`. But: those RPCs run as the *caller's* role; if any of them passes `recipient_id` from a parameter (rather than deriving it server-side from the resource/claim/user being acted on), a malicious user can pass another user's UUID and trigger push to that user. The spec doesn't explicitly say "derive recipient from the row being mutated," and the four RPCs were written before push existed. This must be specified explicitly OR a check added in `deliver_notification` that the caller has a legitimate relationship to the recipient.

Beyond the three CRITICALs: four HIGH (lockscreen body assertion location, opt-out cleanup scope, log-shape conflict with existing cron_log schema, deep-link bypass on rapid signOut), three MEDIUM (token plaintext storage vs DFS-1, no DoS rate-limit on delivery endpoint, sound-on-by-default platform default — DFS-4 dependency), and two LOW (Toggle component a11y if not yet built, `last_used_at` semantics for stale-token GC).

**Three launch-blockers; spec needs revision before Shamus can begin. Recommended path: Quinn updates the spec in-place to address C1-C3, Dana waits to write migration 009 until the revised spec lands.**

---

## 2. Trust-boundary update — Push surface

The original STRIDE model (`2026-05-23_threat-model-stride.md`) explicitly **excluded** push from v1 ("I5: NO PUSH NOTIFICATIONS IN V1. Pull-only.") and rated the residual at zero. Adding push in Phase 3 re-opens I5 and adds four new external surfaces:

```
[Untrusted user device]
    │ TLS
    ▼
[Supabase platform: Postgres + Edge Functions + Realtime]
    │
    │  Edge Function deliver_notification
    │  POST https://exp.host/--/api/v2/push/send
    ▼
[Expo Push API — THIRD PARTY, retains payload "only during delivery" per Expo docs]
    │
    │  proxies to Apple APNS  (iOS)
    │  proxies to Google FCM  (Android)
    ▼
[Apple APNS / Google FCM — THIRD PARTIES, payload retained in transit]
    │
    │  delivers to OS-level notification queue on device
    ▼
[Device OS lockscreen renderer (Apple iOS / Google Android system UI)]
    │
    │  renders title + (in our case empty) body
    ▼
[Anyone with physical access to the device — INCLUDES Mara's abusive ex]
```

**Each arrow downward is a place the title text exists in plaintext.** The body is empty (AC-2 — load-bearing); the `data.id` is a UUID (not a name); the title is one of four fixed strings (high cardinality of trigger but low cardinality of message). This is the right design — we minimize what each downstream sees.

**But the spec's narrative needs to be honest about this.** PRIVACY.md D8 says "no third-party SDKs in MVP." The spec's AC-9 says "no third-party push providers." Both are technically false the moment we call Expo. The correct framing is: "We use Expo as a thin proxy because building our own APNS/FCM pipeline is out of scope, and we send the minimum possible payload (4 fixed titles, no body, opaque UUID route) so Expo sees only metadata, not content." See finding C1 for the recommended reconciliation.

---

## 3. STRIDE retread — push-specific threats

| ID | Threat | L | I | Risk | Mitigation in spec | Residual |
|----|--------|---|---|------|--------------------|----------|
| **PS1** (Spoofing) | Attacker registers another user's expo_token to receive THEIR notifications | 2 | 4 | 8 | RPC requires `auth.uid()`; UNIQUE (user_id, expo_token) — but: if attacker steals victim's token, RPC will accept it under attacker's user_id, NOT victim's. So token theft alone doesn't enable interception — Expo routes by token, not by user_id. Acceptable. | L |
| **PT1** (Tampering) | Attacker mutates the notification payload between Edge Function and Expo | 2 | 3 | 6 | TLS to Expo. Expo authenticates payloads per Expo's HTTP API model. Acceptable. | L |
| **PT2** (Tampering) | Attacker bypasses `body === ""` assertion via crafted trigger string | 2 | 5 | 10 | AC-2 requires runtime assertion in Edge Function. **NEEDS CODE LOCATION SPECIFIED** — finding H1 below. | M until fix |
| **PR1** (Repudiation) | Sender denies they triggered a notification | 1 | 2 | 2 | cron_log records aggregate counts per trigger but NOT sender identity. Acceptable for v1 — push is a side effect of an action that's already logged elsewhere (claim_resource, approve_user). The action's audit trail (verification_log, etc.) IS the repudiation defense. | L |
| **PI1** (Info disclosure) | Token visible in client console.log | 3 | 2 | 6 | AC-12 forbids `console.log(token)`. Steve grep-checks at code review. NEEDS the same enforcement against TYPESCRIPT-SOURCE grep in CI. Finding M3. | M until CI check |
| **PI2** (Info disclosure) | Token visible in Edge Function error log | 4 | 3 | 12 | AC-5 explicitly forbids. Test regex rejects UUID-shaped substring. Good. | L |
| **PI3** (Info disclosure) | Body content leaks via Expo's outage / retry log | 1 | 4 | 4 | Body is empty by construction. If AC-2 holds, this is moot. | L if AC-2 holds |
| **PI4** (Info disclosure) | Title alone discloses sensitive context to ex / coworker | 5 | 2 | 10 | Titles are generic ("Your post has an update") — DESIGNED for this threat. But "Your application was reviewed" (trigger 4 — rejection) is itself contextually disclosing if user just applied to a community known to serve marginalized groups. **Finding H4 below.** | M |
| **PD1** (DoS) | Attacker triggers high-volume spam claims to flood a victim's lockscreen | 4 | 3 | 12 | NO rate-limit specified anywhere in the spec on the delivery endpoint OR on the calling RPCs. The threat exists today even WITHOUT push (spam claims), but push amplifies it — every claim is a lockscreen interrupt. **Finding M2 below.** | M until rate-limit |
| **PD2** (DoS) | Attacker registers thousands of bogus tokens to inflate delivery cost | 2 | 2 | 4 | UNIQUE (user_id, expo_token) caps per user, but a user can still register many platform+token combos by re-installing. Expo's API itself caps per IP. Acceptable. | L |
| **PE1** (Privilege escalation) | Non-admin triggers admin-style notification (trigger 3 / 4) to other users | 3 | 4 | 12 | Edge Function is service-role-only — but its CALLERS aren't. The spec doesn't say `approve_user` / `reject_user` already check `is_admin` before calling the Edge Function. They DO check admin at the start (verified in schema.sql). But if any *future* RPC adds a `deliver_notification` call with a caller-supplied trigger string, it could send fake admin notifications. **Finding C3 below.** | H until fix |

---

## 4. Findings

### CRITICAL

#### C1 — AC-9 narrative contradicts itself; "no third-party push providers" is false the moment we call Expo

**File:** `qa-reports/spec-phase-3-push-notifications.md:124-128` (AC-9 text), §5 "What Expo sees" (273), §"Privacy considerations" item 2 (444), and the user story "verify in the 'Why we need this' copy that no third-party server ever sees what was claimed" (23).

**What's wrong:** AC-9 reads "The Edge Function `deliver_notification` calls Expo Push API (`https://exp.host/--/api/v2/push/send`) which forwards to Apple APNS and Google FCM. It does NOT route through OneSignal, Pusher, Firebase Cloud Messaging as-a-service, or any analytics-enabled push provider." That paragraph is correct in narrow technical terms (we avoid OneSignal/Pusher/FCM-as-a-service) but the user-facing claim in the user story — "no third-party server ever sees what was claimed" — is **misleading the user**. Expo's push API IS a third-party server (Expo, Inc. — a separate corporate entity from Mutual Mesh and from Apple/Google). The payload Expo sees is title + empty body + UUID, which is the minimum, but Expo IS in the trust boundary.

PRIVACY.md D8 ("No third-party SDKs in MVP") is also under stress. The spec uses Expo's *server* (not their SDK) — Expo's SDK is bundled into Expo Go and into Expo's build of the React Native runtime, but the network call is to their server. The D8 spirit ("every SDK is a data-egress surface") applies equally to a server-side API call to a third party.

**Why it's load-bearing:** When Casey writes the seed-community outreach materials, the "no third-party server ever sees what was claimed" line will end up on the website / in onboarding screenshots. The first technically literate user (or journalist, or attacker preparing a critique) who looks at the Edge Function source and sees `https://exp.host/--/api/v2/push/send` will publicly correct us. That's a trust hit we can't afford with a surveillance-averse audience that includes activists and journalists.

The honest framing is **stronger**, not weaker: "We send Expo only a title (4 fixed strings) and an opaque UUID route. Expo never sees the resource name, your handle, or what was claimed. Expo's documented behavior is to retain payloads only during delivery." That sells just as well and is true.

**Recommended fix:**
1. Rewrite AC-9 to say "No managed third-party push providers (OneSignal/Pusher/FCM-as-a-service). Expo Push API is used as a thin proxy because building a direct APNS/FCM pipeline is out of scope for v1; payload sent to Expo is title-only + opaque UUID route, no body."
2. Rewrite the user story line (spec line 23) to: "verify in the in-app 'Why we need this' copy that the notification payload contains only a generic title and an opaque ID — no resource name, handle, or content."
3. Add a new AC-13: "The 'Why we need this' microcopy AND the privacy page accurately disclose that Expo Push (a third-party proxy) and Apple/Google's APNS/FCM are in the delivery path. Microcopy explicitly states what Expo, Apple, and Google can see (= title + UUID route, no content)."
4. Jordan re-reads PRIVACY.md D8 in light of this and amends if needed. The amendment is: D8 forbids third-party *analytics/observability* SDKs that egress user-behavior data; D8 does NOT forbid third-party message-proxy services that receive minimum-payload routing data we control. Make the line explicit.
5. Defer to v2: a self-hosted APNS/FCM bridge (server-side Rust or Go service holding APNS auth keys + FCM service account). This is real engineering work (~1 week) but removes Expo from the trust boundary entirely.

**Launch-blocker:** YES — for the spec, not for the code. Quinn must revise AC-9 + user story + add AC-13 before Shamus writes the microcopy.

---

#### C2 — Token rotation contract mismatch + race window

**File:** `qa-reports/spec-phase-3-push-notifications.md:74-82` (AC-4), §"`register_push_token`" (320-322), §"`revoke_push_token()`" (323-340).

**What's wrong:** Two interlocking problems.

**Problem 2A — Contract mismatch:** AC-4 says: "If different, the OLD token is revoked (`revoke_push_token(old_token)`) and the NEW token is registered (`register_push_token(new_token, platform)`)." But the spec's RPC contract for `revoke_push_token()` (line 325) takes NO arguments — it deletes ALL rows for the user (line 339: "DELETE all rows in `public.push_tokens WHERE user_id = auth.uid()`"). So `revoke_push_token(old_token)` IS NOT A VALID CALL — the function signature doesn't accept a token. If Shamus implements AC-4 literally, it'll either fail typecheck or (worse) call the no-arg revoke and nuke ALL tokens for the user, including the one we're about to register.

The spec also has an *implicit* rotation mechanism inside `register_push_token` itself (line 320-321): "If a row already exists for `(user_id, platform)` with a DIFFERENT `expo_token`, the old row is DELETED first (rotation handling — AC-4). This is also inside the same transaction." This implicit per-platform rotation is the correct path. AC-4's client-side flow should just call `register_push_token(new_token, platform)` and let the server-side UPSERT logic handle deletion of the stale row.

**Problem 2B — Race window:** Even with the implicit rotation, AC-4 says the client compares to "the latest registered token for this user+platform" — which means a SELECT round-trip before the rotation decision. Between SELECT and UPSERT, another foreground hook could fire (multi-tab web, app split-screen on iPad, OS waking the app for a notification while the user is also in the app). That's racy.

The fix is to always call `register_push_token(new_token, platform)` unconditionally on foreground; let the UNIQUE constraint + the implicit per-platform deletion handle idempotency. No client-side SELECT, no per-token revoke RPC.

**Why it's load-bearing:** Token rotation IS the most common path for stale-token cleanup. If it's wrong, we either (a) accumulate stale rows that the Edge Function tries to deliver to and fail (cost + noise), or (b) accidentally nuke all of a user's tokens on every foreground (effectively making push not work after the first session). Either way, the "Disable all" button and the OS-level revoke must remain the only paths to a full wipe.

**Recommended fix:**
1. Remove the `revoke_push_token(old_token)` call from AC-4. Replace with: "On app foreground, if any push trigger is ON, call `register_push_token(current_expo_token, platform)`. The RPC's per-platform UPSERT handles rotation atomically."
2. Clarify the RPC contract: `register_push_token(token, platform)` UPSERTs by `(user_id, platform)` (NOT by `(user_id, expo_token)` — the UNIQUE constraint should be on `(user_id, platform)`). The schema in §5 has `UNIQUE (user_id, expo_token)` — change to `UNIQUE (user_id, platform)` so the UPSERT is well-defined.
3. Add an integration test (Gary writes; Steve specifies): two rapid foreground events with the SAME token are idempotent (one row); two rapid foreground events with DIFFERENT tokens result in exactly one row with the LATEST token (no duplicates, no nulls).
4. Keep `revoke_push_token()` as the no-arg full-wipe (the "Disable all notifications" button calls it). This is the right behavior — when the user revokes, ALL platforms go.

**Launch-blocker:** YES — Dana cannot write migration 009 (the schema) until §5's UNIQUE constraint is resolved AND Quinn cannot finalize AC-4 until the RPC contract is consistent.

---

#### C3 — `deliver_notification` has no recipient-authorization check; caller can target arbitrary users

**File:** `qa-reports/spec-phase-3-push-notifications.md:342-362` (Edge Function spec), and implicit in "Auth: Service-role-only. Called by: claim_resource() RPC ... for trigger 1" (line 344-348).

**What's wrong:** The Edge Function `deliver_notification(trigger, recipient_id, route_id)` is service-role and called by four RPCs. The spec assumes those RPCs pass `recipient_id` derived from the row being mutated (e.g., `claim_resource` passes the resource's `posted_by` as recipient). But:

1. **The spec doesn't explicitly require this.** Nothing in §7's contract for `deliver_notification` says "the recipient_id MUST be the posted_by of the resource_id." A future RPC implementer could accept `recipient_id` as a user-controlled parameter and pass it through. That would let any authenticated user push-spam any other user (PE1 / PD1 combined).
2. **The current four RPCs (claim_resource, approve_user, reject_user, confirm_pickup) all derive the recipient server-side from the row being acted on.** Good. But that's a property of their existing code, not of the Edge Function's contract. New RPCs (or refactors) won't automatically preserve it.
3. **There's no validation in `deliver_notification` itself.** The Edge Function could check "does the recipient_id have a legitimate relationship to the calling context?" but doing so would require passing additional context (e.g., the resource_id, the caller's user_id). The simpler defense is: derive recipient_id INSIDE the calling RPC from the row, never accept it as a parameter from the *client*.

**Why it's load-bearing:** A user who can call any RPC that calls `deliver_notification(trigger, recipient_id)` with a controllable `recipient_id` can push-spam ANY other user. Combined with the lack of a delivery rate-limit (M2), a single bad actor can deliver hundreds of notifications/hour to a victim.

This is the same shape as the E1 threat in the original STRIDE model (privilege escalation) but on the notification side.

**Recommended fix:**
1. Add an explicit AC: "Every RPC that calls `deliver_notification` MUST derive `recipient_id` server-side from a row in `public.resources`, `public.users`, or `public.claims` — NEVER from a client-supplied parameter. A grep-check in CI rejects any RPC body that passes a parameter name matching `/recipient/i` to `deliver_notification` without an intermediate `SELECT ... INTO` from a privileged table."
2. Add a defense-in-depth check inside `deliver_notification`: before sending, verify the recipient has at least one valid relationship to the calling context. The simplest version: require the calling RPC to pass `caller_user_id` (the original `auth.uid()`), then assert that `recipient_id == caller_user_id` OR there exists a row in `public.resources` where (`caller_user_id = posted_by` AND `recipient_id = claimed_by`) OR vice versa OR (caller is admin AND recipient is unverified). This is more code but it makes the Edge Function self-defensive.
3. Add an integration test (Gary writes; Steve specifies): a non-admin user calling a hypothetical "send_push(trigger, recipient_id)" RPC with someone else's UUID is rejected at the Edge Function layer.

**Launch-blocker:** YES — this is a privilege-escalation vector that the spec implicitly allows. Quinn needs to add the explicit contract requirement AND Dana needs to wire the defense-in-depth check before the Edge Function ships.

---

### HIGH

#### H1 — `body === ""` assertion location not specified; could land in client-side helper only

**File:** `qa-reports/spec-phase-3-push-notifications.md:62-63` (AC-2), §"Tests" (376-407).

**What's wrong:** AC-2 says "The Edge Function's delivery code MUST have a JSDoc-level comment and a runtime assertion that fails-closed if `body !== ""` for any payload." Good. But the spec ALSO says (line 378): `buildPushPayload(trigger, routeId, reduceMotion)` is a pure function in `src/lib/push.ts` — which is the CLIENT-SIDE codebase. The Edge Function runs on Deno (Supabase Edge Functions), not on React Native. If Shamus reads the spec naively, they might put the assertion ONLY in the client-side `buildPushPayload` (which the Edge Function never imports) and assume that satisfies AC-2.

The assertion MUST live in the Edge Function source code (Deno-resident, in `supabase/functions/deliver-notification/index.ts`), and the Edge Function must use ITS OWN `buildPayload` (a duplicate of the client-side helper, copy-pasted into the Edge Function so the assertion runs server-side).

The client-side helper is fine for typing the shape, but the SECURITY assertion lives server-side. Same belt-and-braces pattern as the EXIF strip (PRIVACY.md D5 — client + server).

**Why it's wrong:** A client-side assertion is bypassable by anyone running a forked app or calling the RPC directly with their anon key. A server-side assertion is the actual gate. The spec conflates them.

**Recommended fix:**
1. Add to AC-2: "The fail-closed assertion lives in the Edge Function source (`supabase/functions/deliver-notification/index.ts`), NOT in `src/lib/push.ts`. The client-side helper exists for typing; the server-side assertion is the security boundary."
2. Add to §"Tests": A test in `supabase/functions/deliver-notification/__tests__/payload-shape.test.ts` (Deno tests) that asserts the Edge Function's payload builder fails-closed on non-empty body.
3. Gary's CI gate runs both Jest (client) and Deno test (Edge Function).

**Launch-blocker:** NO (the spec gets to this in §"Tests" line 406 — "the Edge Function's payload-shape assertion (body === "") is tested with a malicious-input fixture" — but the AC text doesn't clearly anchor the assertion to the Edge Function).

---

#### H2 — Opt-out cleanup scope: AC-3 says DELETE rows, but doesn't address tokens accumulated under DIFFERENT preference combinations

**File:** `qa-reports/spec-phase-3-push-notifications.md:66-72` (AC-3), §"`revoke_push_token`" (339).

**What's wrong:** The spec says revoke deletes all rows in `push_tokens` for the user. Good — Sky asked for this in the audit task ("revoking opt-in should DELETE rows from push_tokens, not just flip a flag"). The spec gets this right.

However, the spec's `register_push_token` (line 320) only checks "at least one `push_preferences.* = true`" before allowing registration. It DOES NOT check that the specific trigger the user is toggling on is now true. So this race exists:
- T0: User has all OFF, no token.
- T1: User toggles "claim_placed" ON in UI.
- T2: Client calls `register_push_token`.
- T3: User toggles "claim_placed" OFF immediately (before the RPC returns).
- T4: RPC succeeds (it saw at least one ON when it ran).
- T5: Now token is registered, but all preferences are OFF.

The Edge Function's pre-send re-check (AC-8 server-side row) catches this for delivery — no notification arrives. But the TOKEN is still registered, creating a privacy leak: Expo + Apple/Google now know this device has the app installed even though the user has effectively disabled push.

**Recommended fix:**
1. Add to AC-3: "After ANY toggle change, if the resulting preference state is `all-false`, the client auto-calls `revoke_push_token()` to clean up the registered token. This is silent — no FlashBanner."
2. Add to the Edge Function's pre-send re-check (AC-8 server-side row): "If the user's preference for the SPECIFIC trigger being delivered is false, AND no other trigger is true, ALSO delete the user's `push_tokens` rows as a cleanup (the token shouldn't be there)."
3. Add an integration test: opt-in → opt-out within 1s leaves zero rows in push_tokens.

**Launch-blocker:** NO (the leak window is short and the Edge Function still gates delivery; but cleanup hygiene matters for Mara's threat model — she wants minimal residual data anywhere).

---

#### H3 — Log shape conflicts with existing `cron_log` schema; spec invents fields that don't exist

**File:** `qa-reports/spec-phase-3-push-notifications.md:85-89` (AC-5), `supabase/schema.sql:109-120` (existing cron_log table).

**What's wrong:** The spec says (line 88): "The `cron_log` table (Steve S6 — existing) gets a new row format for push deliveries: `(operation='push_deliver', success_count, fail_count, run_at)`." But the EXISTING `cron_log` table schema is:

```sql
CREATE TABLE IF NOT EXISTS public.cron_log (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows_affected INTEGER,
  success BOOLEAN NOT NULL,
  error_text TEXT
);
```

The columns are: `job_name` (not `operation`), `ran_at` (not `run_at`), `rows_affected` (single INTEGER, not split into success_count / fail_count), `success` (single BOOLEAN). The spec's `operation='push_deliver'` maps to `job_name='push_deliver'`. The spec's `success_count` / `fail_count` don't map at all.

If Dana writes migration 009 mirroring the spec literally, they'll either (a) add new columns to `cron_log` (schema migration that Steve hasn't reviewed) or (b) invent a separate `push_log` table (also unspecified).

**Why it's wrong:** Schema drift between spec and reality. Either the spec adapts to the existing shape (preferred — `job_name='push_deliver_2026-05-24T10:00'`, `rows_affected=success_count`, `success=true_if_any_succeeded`, `error_text=null`), OR a new `push_delivery_log` table is created with its own schema (more honest — push delivery isn't a "cron job," it's per-event).

Either way, the spec needs to be specific so Dana knows what migration to write.

**Recommended fix:**
1. Quinn picks one of:
   - **(a)** Reuse `cron_log` with `job_name='push_deliver_batch'` and use `rows_affected` for success count, `success=true` if all delivered, `error_text=` sanitized failure reason (no UUIDs). Aggregate per-cycle, not per-event.
   - **(b)** Create a new `push_delivery_log` table with `(id, trigger TEXT, success_count INT, fail_count INT, run_at TIMESTAMPTZ, reason_code TEXT)`. NO `user_id`, NO `expo_token`, NO `recipient_id`. Sky-only SELECT (same policy as cron_log + verification_log).
2. Specify the choice in AC-5 with the column list.
3. Test asserts the chosen table contains zero UUID-shaped substrings across 1000 simulated failed deliveries.

**Steve's recommendation:** Option (b) — separate `push_delivery_log` table. Push delivery isn't a cron job; conflating shapes invites confusion. The new table is one migration line.

**Launch-blocker:** NO (cosmetic schema choice), but Dana NEEDS this resolved before writing migration 009.

---

#### H4 — Trigger 4 ("Your application was reviewed") is itself sensitive context

**File:** `qa-reports/spec-phase-3-push-notifications.md:61` (AC-2 trigger 4), §"Personas served" (27-28).

**What's wrong:** AC-2 sets trigger 4's title to `"Your application was reviewed"`. This is the rejection trigger. For Keo (trans organizer) and similarly-situated users:
- If Keo's abusive housing situation puts them at risk for being identified as applying to a marginalized-group mutual-aid network, the title "Your application was reviewed" — visible on lockscreen to anyone looking at their phone — IS the disclosure. The lockscreen viewer learns: "this person applied to something."
- Combined with trigger 3 ("Your account is ready"), an observer can deduce "applied to something + got accepted/rejected" = "user has been engaging with some application process."

This is subtler than the original Mara threat (resource name in body), but it's the same class of risk: the user opted into push for one purpose; the title carries unintended context.

**Why it's wrong:** The four trigger titles are not equally innocuous. Triggers 1 ("Your post has an update") and 2 ("A pickup was confirmed") are vague-enough to not signal "marginalized-group app." Triggers 3 and 4 are app-specific in a way that, combined with the app icon being visible on the lockscreen ("[Mutual Mesh icon]" per spec line 192), identifies the user as engaging with this specific community.

**Recommended fix:**
1. Change trigger 3 title to: `"You have an update"` (the spec's generic catch-all from line 56's example).
2. Change trigger 4 title to: `"You have an update"`.
3. Accept the trade-off: users get less informative titles (they have to open the app to learn what happened), but lockscreen disclosure is uniform across all four triggers. This actually IMPROVES the privacy story — every title is the same generic phrase, so an observer can't differentiate.
4. Alternative: keep the per-trigger titles but add a Profile option "Use generic titles for all notifications" (default ON). This adds UI bloat but lets advanced users self-tune.
5. Run this past Jordan in the FULL privacy review specifically — Jordan should have veto on title strings since this is the privacy contract.

**Steve's recommendation:** Change all four titles to `"You have an update"`. Strictly title-only-AND-uniform. Quinn updates the AC.

**Launch-blocker:** NO (mitigated by the title-only rule itself; this is hardening), but should be resolved before the seed-community launch since Casey's outreach materials will quote these titles.

---

### MEDIUM

#### M1 — Token plaintext storage (DFS-1) accepts a residual risk worth re-examining

**File:** `qa-reports/spec-phase-3-push-notifications.md:144-148` (AC-12), DFS-1 (456-468).

**What's wrong:** The spec defaults to plaintext storage for `expo_token` with Quinn's reasoning: "tokens are not credentials in the auth sense, they're rotateable identifiers." This is correct for the auth-credential-equivalence question. But there's a separate question the spec doesn't address: **what happens if the `push_tokens` table is exfiltrated** (e.g., a backup leak per STRIDE I4)?

A plaintext token, combined with the user_id and platform, lets the attacker:
1. Send a notification to the device via Expo's API (Expo doesn't verify the sender beyond the API key, which is project-level — but they DO require an API key; we'd need to leak that too).
2. Correlate `user_id` ↔ `device` across leaks (the same device fingerprint via expo_token persists across reinstalls; the token typically rotates on reinstall, but not on every session).

The "attacker needs our Expo API key too" mitigation IS load-bearing. As long as the API key is never in the codebase / never in a leaked env file / never client-side, the plaintext tokens are useless to an external attacker.

**Recommended fix:**
1. Add to AC-12: "The Edge Function holds the Expo push access token (`EXPO_ACCESS_TOKEN`) as a Supabase Edge Function secret (`supabase secrets set EXPO_ACCESS_TOKEN=...`). The token is NEVER in source, NEVER in `.env.example`, NEVER in client bundles. Rotated quarterly by Sky."
2. Add to STRIDE update: a new threat "PI5: push_tokens + Expo API key co-leak enables impersonation. Mitigation: Expo API key is in Edge Function secrets only, rotated quarterly."
3. Sky's DFS-1 answer is acceptable IF (1) is enforced. If Sky wants hash-at-rest, sha-256 (DFS-1 option) is fine — the rotation path uses `(user_id, platform)` as the UNIQUE key, not `(user_id, expo_token)`, so hashing doesn't break anything. But sha-256 adds friction (you can't see the actual token to debug a delivery failure) without much additional security.

**Steve's recommendation:** Approve plaintext (DFS-1 option A) WITH the Edge Function secrets discipline above. Adopt sha-256 only if Sky wants the extra layer.

**Launch-blocker:** NO.

---

#### M2 — No rate-limit on delivery endpoint enables spam-claim → spam-notification abuse

**File:** `qa-reports/spec-phase-3-push-notifications.md` — NOT ADDRESSED ANYWHERE in the spec. Sky's audit task explicitly flagged this ("Rate-limit on delivery endpoint — prevents spam-claim → spam-notification abuse").

**What's wrong:** A malicious verified user can:
1. Spam-claim a victim's resources (each `claim_resource` call → 1 push to the poster).
2. Spam-create resources and claim them from another account (each cycle → push to original poster if they're the same person).
3. Spam-spam any sequence that triggers `deliver_notification`.

The spec's only mitigation is the Edge Function being "fire-and-forget" — it doesn't block the calling RPC. But the calling RPC ITSELF has no rate-limit beyond Supabase's project-level limits.

Without a rate-limit, a single bad actor can deliver hundreds of notifications/hour to a single victim. The victim's only recovery is "Disable all notifications" — which is a privacy loss they shouldn't have to take to escape spam.

**Recommended fix:**
1. Add an AC-14: "Per-recipient delivery rate-limit. The Edge Function maintains an in-Postgres counter: `push_delivery_log` (or a new `push_rate_limit` table) tracks deliveries-per-recipient-per-trigger-per-hour. If a recipient has received more than 10 push events of the same trigger in the past hour, subsequent deliveries are SKIPPED with `cron_log` reason `rate_limited`."
2. Per-recipient-per-trigger limits (suggestion):
   - Trigger 1 (claim_placed): 20/hour (high — claim activity can be legitimately bursty)
   - Trigger 2 (pickup_confirmed): 10/hour
   - Trigger 3 (admin_approved): 1/day (one-time event)
   - Trigger 4 (admin_rejected): 1/day (one-time event)
3. The CALLING RPC (claim_resource etc.) doesn't need a rate-limit — the existing D1 (posting flood) controls live elsewhere. The Edge Function is the right enforcement point.
4. Add an integration test: 25 rapid claim_resource calls in 1 minute result in ≤20 push deliveries, with the rest logged as `rate_limited`.

**Launch-blocker:** NO (mitigatable post-launch as an Edge Function patch), but should be in v1 because the abuse pattern is foreseeable and the fix is small.

---

#### M3 — `console.warn` token-leak grep should be in CI, not just code-review

**File:** `qa-reports/spec-phase-3-push-notifications.md:147` (AC-12 — "The token is NEVER logged client-side (no `console.log(token)`) — Steve grep-checks during code review").

**What's wrong:** Manual grep at code review is bypassable (Steve has bad days, or the grep terms don't match a creative variable name). A CI check is the durable defense.

**Recommended fix:** Gary adds a CI step in `.github/workflows/ci.yml`:
```bash
# Reject any client-side logging of expo_token / push_token variables.
if rg --type ts "console\.(log|warn|error)\([^)]*?\b(expoToken|pushToken|expo_token|push_token)\b" src/; then
  echo "FAIL: Token logging detected in client source."
  exit 1
fi
```
And the Edge Function side:
```bash
if rg --type ts "console\.(log|warn|error)\([^)]*?\b(token|recipient_id|user_id|claim_id)\b" supabase/functions/deliver-notification/; then
  echo "FAIL: Token / PII logging detected in Edge Function."
  exit 1
fi
```

**Launch-blocker:** NO.

---

### LOW

#### L1 — Toggle component a11y dependency (DFS-7) not surfaced as a build-order constraint

**File:** `qa-reports/spec-phase-3-push-notifications.md:528-535` (DFS-7).

**What's wrong:** DFS-7 says "Check at build start" for the Toggle component. If it doesn't exist, Shamus pauses Phase 3.1 and files a `feature-toggle-component.md` proposal for Dani + Alex. That's correct process. But there's no explicit AC tying the Toggle's existence/quality to push-feature merge. If Shamus ships the Toggle hastily (no Alex review), the a11y story breaks (AC-6 reduce-motion, accessibilityRole="switch", etc.).

**Recommended fix:** Add a precondition to "Definition of done" (line 555-566): "The Toggle component used in the Notifications section has passed Alex's a11y audit AND Dani's component review. If the component is new, both reviews are documented in `qa-reports/feature-toggle-component-<date>.md`."

**Launch-blocker:** NO (process gap, not a security issue).

---

#### L2 — `last_used_at` semantics are ambiguous for stale-token GC

**File:** `qa-reports/spec-phase-3-push-notifications.md:80, 226` (AC-4 + schema), DFS-3 (478-488).

**What's wrong:** DFS-3 default is "auto-DELETE on first `DeviceNotRegistered`" — that's correct. But the spec also keeps `last_used_at` updated on each successful delivery. If a user opts in, gets one delivery, then their device sits idle for weeks (no rotation event because they're not foregrounding the app), `last_used_at` accurately reflects "last successful delivery" but tells us nothing about whether the token is STILL valid. Expo returns `DeviceNotRegistered` only on the NEXT attempted send.

This is fine for trigger-driven delivery (most notifications) but means we keep "dead but unproven dead" tokens indefinitely. Mara's threat model (minimal residual data) prefers we prune unused tokens.

**Recommended fix:** Add to the prune cron: weekly sweep deleting any `push_tokens` row with `last_used_at < now() - INTERVAL '90 days'` (or `last_used_at IS NULL AND created_at < now() - INTERVAL '90 days'` — registered but never used). The user can re-register on next foreground if they're still active.

**Launch-blocker:** NO (long-tail cleanup; covered post-launch as a small migration).

---

## 5. Per-feature launch-blocker verdicts

For each piece of the push spec, whether it can ship with Phase 3.1 as currently specified:

| Feature / AC | Status | Blocker(s) | Notes |
|--------------|--------|------------|-------|
| AC-1 (Default OFF) | OK | None | Correctly specified. |
| AC-2 (Title-only on lockscreen) | NEEDS REVISION | H1 (assertion location), H4 (trigger 3/4 titles too specific) | Both are simple text edits to the AC. |
| AC-3 (User can revoke any time) | NEEDS REVISION | H2 (auto-cleanup on all-OFF) | Add one line to AC. |
| AC-4 (Token rotation) | BLOCKED | C2 (contract mismatch + race) | Quinn must rewrite. Dana cannot start. |
| AC-5 (No leak in delivery logs) | NEEDS REVISION | H3 (cron_log schema conflict) | Quinn picks (a) or (b); Steve recommends (b). |
| AC-6 (Reduce motion respected) | OK (pending DFS-5) | None | Sky's DFS-5 answer needed. |
| AC-7 (Per-trigger toggle) | OK | None | Correctly specified. |
| AC-8 (Three-layer enforcement) | OK | None | Correctly specified; pre-send re-check is the critical layer. |
| AC-9 (No third-party providers) | BLOCKED | C1 (narrative contradiction) | Must reconcile before microcopy is written. |
| AC-10 (Deep-link is safe) | OK | None | Three-layer gate holds. |
| AC-11 (Realtime cleanup) | OK | None | Matches Peter's channel cap. |
| AC-12 (Token storage + transport) | NEEDS REVISION | M1 (Edge Function secret discipline), M3 (CI grep) | Both additive. |
| `deliver_notification` Edge Function | BLOCKED | C3 (no recipient-auth check) | Add explicit contract requirement. |
| `register_push_token` RPC | BLOCKED | C2 (UNIQUE constraint should be `(user_id, platform)` not `(user_id, expo_token)`) | Schema change. |
| `revoke_push_token` RPC | OK | None | Correctly the no-arg full-wipe. |
| `push_tokens` table | NEEDS REVISION | C2 (UNIQUE constraint), L2 (90-day prune) | Two schema lines. |
| `push_preferences` JSONB on users | OK | None | Default value correctly all-false. |
| Cascade through `delete_my_account()` | OK | None | FK is correctly specified. |
| Failed-delivery logging | BLOCKED | H3 (schema), M2 (rate-limit) | Quinn + Dana coordinate. |
| Lockscreen content rule | NEEDS REVISION | H1 (assertion server-side) | Already AC-2's intent; clarify location. |

**Summary:**
- **3 features BLOCKED** (cannot start coding until spec revises): AC-4 token rotation, AC-9 third-party narrative, deliver_notification + register_push_token contracts.
- **6 features NEED REVISION** (text edits to AC, then OK): AC-2, AC-3, AC-5, AC-12, push_tokens, failed-delivery logging.
- **8 features OK as-specified.**

---

## 6. DECISIONS FOR SKY

### DFS-S1: Reconcile "no third-party push providers" narrative

**Context:** C1 above. PRIVACY.md D8 + spec AC-9 + user-story line all promise something that Expo's involvement softens.

**Options:**
- **(a)** Quinn rewrites AC-9 + user story + adds AC-13 disclosing Expo as a "thin proxy." Microcopy is honest. (Steve's recommendation.)
- **(b)** Build a self-hosted APNS/FCM bridge in v1. Adds ~1 week. Removes Expo from trust boundary entirely.
- **(c)** Ship as-spec'd, accept the narrative drift, plan to fix microcopy in v1.1.

**Steve recommends:** (a). Honest narrative is the safest first move. (b) is a v2 roadmap item.

### DFS-S2: Per-trigger title strings — all generic, or trigger-specific?

**Context:** H4 above. Trigger 3 ("Your account is ready") and trigger 4 ("Your application was reviewed") leak app-context to lockscreen viewers.

**Options:**
- **(a)** All four titles become "You have an update." Uniform. Lockscreen viewer cannot differentiate.
- **(b)** Keep per-trigger titles for triggers 1 & 2 (resource-related); make triggers 3 & 4 generic.
- **(c)** Ship as-spec'd; accept the residual disclosure.

**Steve recommends:** (a). Uniform title strictly enforces the title-only-AND-uniform privacy contract. Jordan owns the final call on title strings per AC-9.

### DFS-S3: Per-recipient delivery rate-limit

**Context:** M2 above. Sky's audit task explicitly flagged this. Spec doesn't address.

**Options:**
- **(a)** Add Edge Function rate-limit table + checks per the suggestion in M2. Adds ~30 LoC + a new migration.
- **(b)** Defer to post-launch; ship v1 without a delivery rate-limit; monitor cron_log for abuse patterns.

**Steve recommends:** (a). Foreseeable abuse pattern; small fix; protects Mara from a known anti-goal (push spam from an abuser using a sock-puppet account).

### DFS-S4: `push_delivery_log` table — separate or reuse cron_log?

**Context:** H3 above.

**Options:**
- **(a)** Separate `push_delivery_log` table with its own schema. (Steve's recommendation.)
- **(b)** Reuse `cron_log` with a `job_name='push_deliver_batch'` convention.

**Steve recommends:** (a). Push deliveries aren't cron jobs; conflating shapes invites confusion.

### DFS-S5: Expo API key storage discipline

**Context:** M1 above. Plaintext tokens are acceptable IF the Expo API key never leaks.

**Options:**
- **(a)** Store `EXPO_ACCESS_TOKEN` as a Supabase Edge Function secret (`supabase secrets set ...`). Sky rotates quarterly. (Steve's recommendation.)
- **(b)** Use Expo's anonymous push endpoint (no API key, but lower send-quota and weaker abuse protection on Expo's side).

**Steve recommends:** (a).

---

## 7. Items deferred to later cycles (audit-only, not fixes)

- **Self-hosted APNS/FCM bridge** — v2 path; removes Expo from trust boundary. Defer.
- **Quiet hours / Do Not Disturb sync** — DFS-2 deferred to OS-level; revisit if seed communities ask.
- **Notification center / history in-app** — Phase 4 polish per spec line 541.
- **Cross-device push consistency** — multi-device push (Sky has phone + tablet) is currently handled via the per-(user_id, platform) UNIQUE constraint. Untested under multi-device scenarios. Add to Gary's manual smoke test.
- **TOTP / 2FA on push toggle** — opting INTO push doesn't currently require re-auth. For Mara's threat model (abuser has occasional access to phone), should toggling ON require fresh OTP? Probably v2.
- **Penetration test of the Edge Function** — Phase 4 ship-readiness work.

---

## 8. What I shipped

This audit report. No code changed. No external sends. No spec modified (the spec is Quinn's lane — this audit is the input Quinn uses to revise).

**Findings counts: 3 CRITICAL · 4 HIGH · 3 MEDIUM · 2 LOW = 12 total.**

**Launch-blocker count for Phase 3.1 push feature: 3 (C1, C2, C3).**

All three are SPEC-level fixes — Quinn revises the spec, Dana writes migration 009 against the revised spec, Shamus implements against the revised spec. No partial implementation should begin while C1-C3 are open or we'll cement contradictions into code.

---

## 9. Key recommendations for Sky (one-page)

1. **APPROVE Quinn to revise the spec in-place** to address C1, C2, C3. No new spec file; edit `spec-phase-3-push-notifications.md` and bump a "Revision 2 — 2026-05-24" header.
2. **APPROVE the five DFS-S items above** OR provide alternative direction. All five are small.
3. **HOLD migration 009 + Edge Function implementation** until the revised spec is in place.
4. **CONFIRM** Jordan has final veto on the four trigger title strings (per AC-9 / H4 / DFS-S2). The title is the privacy contract.
5. **CONFIRM** Casey's seed-community outreach materials do NOT quote AC-9's current text — wait for the revised AC-9 + AC-13 before any external-facing copy is written.

---

## FAIL_FAST / BLOCKER states

None for Steve's read-only spec audit. The audit completes cleanly.

The three CRITICAL findings (C1-C3) are launch-blockers for Phase 3.1 push but are NOT blockers for Phase 3.2 (map) or Phase 3.3 (chat) starting in parallel — those have their own specs and can proceed independently.

---

## What's next

- Morgan picks up this report and surfaces the three CRITICAL findings + five DFS-S items to Sky in the next briefing.
- If Sky accepts Steve's recommendations: Quinn revises the spec; Dana writes `supabase/migrations/009_push_notifications.sql` + Edge Function spec; Shamus waits.
- Steve re-audits the revised spec (LIGHT review) before Dana applies migration 009.
- After Edge Function ships: Steve runs the integration tests specified in C2, C3, H1, H2, H3, M2.

---

**End of audit.**
