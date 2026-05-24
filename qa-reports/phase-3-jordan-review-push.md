# Privacy review — Phase 3.1 Push Notifications — Jordan — 2026-05-24

> **NOT A LAWYER DISCLAIMER.** Jordan is the Privacy Advisor role inside Sky's Claude Corp system, not a licensed attorney. Nothing in this document is legal advice. PIPEDA references, "trust boundary" claims, and statements about Apple / Google / Expo's retention behavior are reasoned from publicly-available documentation as of the review date. Before public launch, a qualified Canadian privacy lawyer must independently sign off on the privacy posture this spec implements — see PRIVACY.md D10 and Cycle 7 ship-readiness.

> **Status: APPROVED WITH CONDITIONS.** 3 BLOCKING conditions, 5 PRIVACY.md amendments proposed, 3 DECISIONS FOR SKY.

---

## Scope of this review

This is the FULL privacy review of `qa-reports/spec-phase-3-push-notifications.md` against:

- `PRIVACY.md` (🟢 APPROVED 2026-05-23, locked)
- Constitution Art. 7.6 — privacy review mandatory for marginalized-group + location data; Sky approval required before merge
- `research/personas/persona-mara-2026-05-23.md` — load-bearing on the lockscreen rule
- `research/personas/persona-keo-2026-05-23.md` — load-bearing on opt-out posture
- `research/personas/persona-deb-2026-05-23.md` — load-bearing on opt-in granularity
- `qa-reports/2026-05-23_threat-model-stride.md` — I5 push-notification leak threat (currently scored Zero because v1 excluded; this spec re-opens it)

The spec is sound architecturally. The architectural anchor — "title-only on lockscreen, body always empty, Expo as a thin relay, never a managed push provider" — directly addresses Mara's anti-goal #3 and Keo's anti-goal #5. The decisions below are tightening, not rewriting.

---

## Verdict

**APPROVED WITH CONDITIONS.**

Push notifications are a privacy-sensitive surface because they:

1. Add three new parties (Apple, Google, Expo) to the data-flow trust boundary that PRIVACY.md's "data inventory" table currently does not enumerate.
2. Reintroduce STRIDE threat I5 (push-notification copy on lock screen, scored Risk 20 in the threat model) — which the model currently marks as "Zero in v1" because v1 explicitly excluded push. This spec re-opens the threat; the spec's AC-2 (title-only, empty body) is the mitigation, and it must be load-bearing in code, not just in copy.
3. Touch Mara's persona anti-goal #3 verbatim — "a push notification with the resource name in the title visible on lock screen" → Mara deletes the app. There is zero margin for drift on the lockscreen rule. A single trigger that ships with a non-empty body would constitute a privacy incident, not a bug.
4. Touch Keo's persona anti-goal #5 — "Push notifications. They prefer pull-only." The per-trigger granularity (AC-7) plus default-OFF (AC-1) means Keo can keep their pull-only posture for marketplace activity while still opting into a one-time admin-approval ping. This is the right design IF the OFF default is honored across reinstall, account migration, and any future migration script.

The spec satisfies these constraints in design. The verdict is conditional because three of those mitigations need stronger commitments at the code and operational layers than the spec currently makes explicit.

---

## Concerns and recommendations

### Concern 1 — Apple / Google / Expo enter the trust boundary (BLOCKING)

The PRIVACY.md "data inventory" table currently lists 15 fields and discloses Supabase as the only platform party. This spec adds three new parties to the data flow:

- **Apple (APNS)** receives delivery metadata: that a notification went to a given device token, the (non-PII) generic title string, and an opaque UUID in `data.id`. Per Apple's documented APNS behavior, the payload is dropped after delivery, but delivery metadata (which devices received pushes from us, when) may be retained for operations / abuse-prevention.
- **Google (FCM)** — same posture as Apple for the Android side. FCM's documented behavior is similar: payload is delivery-only, metadata is retained.
- **Expo** (expo.io infrastructure) is a thin relay between our Edge Function and APNS/FCM. Per Expo's documented behavior, they do not retain message bodies after delivery. We rely on this claim.

Each of these is a residual privacy risk that Mara's threat model (stalking-survivor → identity-minimization) takes seriously. The spec acknowledges this in Section 5 ("What Apple/Google see" + "What Expo sees") but the PRIVACY.md inventory itself does not.

**BLOCKING CONDITION 1.1:** PRIVACY.md must be amended to add three new rows to the data inventory disclosing Apple, Google, and Expo as recipients of delivery metadata. See "PRIVACY.md edits proposed" below for exact text. This amendment must land BEFORE the push schema migration is applied — not as a follow-up.

**BLOCKING CONDITION 1.2:** The Profile screen's "Why we need this" microcopy under the first trigger toggle must disclose Apple/Google/Expo in plain language. Recommended copy: `"We send a title-only notification through Apple's, Google's, and Expo's delivery systems. The item name never appears on your lock screen. Those companies see that a notification was delivered but not what it was about."` Casey + Will collaborate on the exact wording; Jordan re-reviews before merge.

**BLOCKING CONDITION 1.3:** Jordan must re-verify Expo's current privacy policy at the time of the build (AC-9 already calls for this, but the spec leaves it as a soft "Jordan re-verifies in their review"). Hard requirement: if Expo's documented retention posture has changed between 2026-05-24 and the build date, the spec is paused, briefed to Morgan, and Sky decides whether to keep Expo or pivot to direct APNS/FCM (which adds significant Edge Function complexity and is DECISION FOR SKY #1 below).

### Concern 2 — Title-only lockscreen rule is load-bearing for Mara (REINFORCE)

AC-2 specifies four generic titles, empty body, and a runtime assertion that fails-closed if `body !== ""` for any payload. This is exactly the right architecture.

What the spec does well:

- The four titles are concrete, English-finalized strings, not "TBD." Reduces drift risk between spec and code.
- The runtime assertion is at the Edge Function layer, the last place the payload is mutated before send. Right layer.
- Gary writes the test (per the spec).

What needs reinforcement:

- The assertion must run **in production**, not just in dev. The spec says "JSDoc-level comment AND a runtime assertion that fails-closed." Confirm in Steve's code review that the assertion is not behind `if (__DEV__)`.
- The four AC-2 titles are translated in Phase 3.4 i18n (AC-13 of the i18n spec — see jordan-review-i18n.md). For every additional locale, the title must be a fixed string per trigger per locale — not a template, not interpolated, not concatenated. Every locale's title string lands in the PRIVACY.md "privacy contract" (proposed edit below).
- Trigger 4 ("Your application was reviewed") is the rejection trigger. The current title is intentionally ambiguous (doesn't say "approved" or "rejected"). Confirmed correct — disclosing rejection on lockscreen would be a soft identity leak (someone seeing a "rejected" notification knows the user tried to join). Keep ambiguous.

**RECOMMENDATION (non-blocking):** Add to AC-2 an explicit test that asserts the title is selected from a fixed enum at Edge Function build time. If a future commit adds a fifth title that wasn't reviewed by Jordan, the test fails. Surface this to Gary as a CI gate.

### Concern 3 — Token rotation handles reinstall / migration cleanly (APPROVED with one caveat)

AC-4 + AC-12 cover Expo token rotation: app foreground triggers a comparison; if the OS-level token has rotated (reinstall, OS update, manual Expo refresh), the old `push_tokens` row is deleted and the new one inserted in the same RPC transaction. This is the right design.

Caveat — account migration / reinstall case:

- AC-1 requires that "default OFF persists across reinstall." The spec's design ensures this because `push_preferences` lives on `public.users` (server-side, persistent), not in AsyncStorage. On reinstall, the user signs in, the server returns their existing `push_preferences` (which were never flipped on by a script — only by user action), and the UI renders the toggles in their last state.
- **But:** the spec doesn't explicitly call out what happens if a user toggles ON, uninstalls the app for 30 days, the token goes stale, Expo returns `DeviceNotRegistered`, DFS-3 auto-deletes the `push_tokens` row, then the user reinstalls and signs in. In this case, `push_preferences` still says ON for that trigger, but no token is registered. The spec's AC-8 server-layer check ("requires at least one `push_preferences.* = true`") doesn't help here — the preferences ARE ON; it's the token that's missing.
- The right behavior on reinstall: on app foreground, if any `push_preferences.* = true` AND `push_tokens` is empty for this user+platform, prompt the user once with a non-modal banner ("Notifications are enabled in your settings but disconnected from this device. Tap to reconnect.") which re-runs the permission prompt + `register_push_token`. This avoids silently failing to notify a user who thinks they're opted in.

**RECOMMENDATION (non-blocking):** Add an acceptance criterion AC-13 to the spec covering this reconnect case. Surface this to Quinn for spec amendment before Shamus builds. Without it, users in Mara's persona may believe notifications are off (because they don't arrive) when in fact they're on but disconnected — confusing and erodes the trust contract.

### Concern 4 — Opt-in default OFF must persist across reinstall (BLOCKING)

This is the single most important persistence guarantee in the spec. AC-1 says it. The schema column default (`push_preferences JSONB NOT NULL DEFAULT '{all-false}'`) enforces it for new rows. But:

- For EXISTING users (everyone who signed up before this migration lands), the `ALTER TABLE ... ADD COLUMN ... DEFAULT` statement applies the default to existing rows. Postgres handles this; not a code change needed, but the migration must use the default form (which the spec does — `ADD COLUMN push_preferences JSONB NOT NULL DEFAULT '{all-false}'::jsonb`).
- For users who delete their account and re-sign-up with the same email: `delete_my_account()` (PRIVACY.md D6) hard-deletes the `public.users` row. On re-signup, the `handle_new_user()` trigger creates a fresh row with the column default — preferences all OFF. Confirmed correct.
- For users whose `public.users` row is somehow updated by a future migration: ANY migration that touches `push_preferences` must be reviewed by Jordan + Sky and may not flip any preference from OFF to ON without explicit user re-consent. This is a forever-rule.

**BLOCKING CONDITION 4.1:** The forever-rule above must be documented in `CLAUDE.md` Gotchas (under a new entry "Push preferences are opt-in forever — never flip OFF→ON in a migration"). Will writes; Jordan re-reviews.

**BLOCKING CONDITION 4.2:** The `delete_my_account()` integration test (Steve's existing test) must be extended to assert that after delete + re-signup with the same email, `push_preferences` returns to all-OFF (not retaining prior state). Gary writes.

### Concern 5 — Failed-delivery logging hygiene (APPROVED, watch in code review)

AC-5 is well-specified: delivery failures log only `reason` + `code`, never `user_id` / `expo_token` / `claim_id`. The Gary test that asserts log lines do not contain UUID-shaped substrings is the right test.

One addition: the spec's AC-5 log format is `delivery_failed reason=<apns|fcm|expo|network> code=<error_code>`. The `error_code` field needs an allow-list — APNS / FCM / Expo return error codes that are documented and non-PII (e.g., `BadDeviceToken`, `MessageRateExceeded`). If a future error format includes a hash or substring of the token, that's a leak. The test should reject any error code containing `:`, `[`, `]`, or strings that look like UUIDs / push tokens.

**RECOMMENDATION (non-blocking):** Strengthen Gary's log-shape test to reject error codes containing characters typical of push tokens (`[`, `]`, `:`). Currently the spec says "REJECTS any UUID-shaped substring" — extend to push-token shape.

### Concern 6 — `cron_log` rows are aggregate-only (APPROVED)

AC-5 + Section 5 specify that `cron_log` push entries are aggregate (`success_count`, `fail_count`) with no per-recipient identifiers. This matches PRIVACY.md Steve S6 ("the prune job logs success/failure with row counts").

One observation: aggregate success counts CAN leak meta-data if they're queried at high temporal resolution. E.g., if the `cron_log` shows `(success_count=1)` at 02:13:47.123 and the next at 02:13:47.456, an attacker with `cron_log` SELECT access could infer two distinct users were pushed in that window. Mitigated because:

- `cron_log` SELECT is Sky-only per Steve S6.
- The Edge Function batches all triggers in the same second (planned per Peter's Phase 3 note as a P1 optimization).

**RECOMMENDATION (non-blocking):** Confirm with Steve in code review that `cron_log` SELECT remains Sky-only (no other admin sees it). No new DFS needed; PRIVACY.md already covers this in S6.

### Concern 7 — Deep-link auth-gate preservation (APPROVED)

AC-10 covers the deep-link case: tapping a notification routes to a screen, but the auth gate is preserved. If the user is signed out → SignInScreen → after sign-in, route hint applied. If the user is signed in but `is_verified` is now false → WaitingRoomScreen (not the resource detail).

This is the right design and mirrors CLAUDE.md gotcha #8 (three-layer verification gate). Steve verifies in three integration scenarios per the spec. Approved.

### Concern 8 — Quiet hours deferred to OS (APPROVED, Mara-specific footnote)

DFS-2 defers quiet hours to OS-level Do Not Disturb. For most users, this is the right call (OS-level is more reliable than per-app). For Mara specifically — her persona note mentions her ex "sometimes sees her phone" — the silent-default decision in DFS-4 is more load-bearing than quiet hours. As long as DFS-4 lands as silent-default, Mara is protected even if she forgets to enable Do Not Disturb.

**RECOMMENDATION (non-blocking):** When Sky resolves DFS-2 and DFS-4, both should be considered together in light of Mara's persona. Jordan recommends approving DFS-2 (no in-app quiet hours) AND DFS-4 (silent default for all users). The combined effect: no sound, no vibration, no body text, generic title → maximum lockscreen privacy. See DECISIONS FOR SKY below.

### Concern 9 — AsyncStorage does NOT cache the push token (APPROVED)

AC-12: the Expo push token is not stored in AsyncStorage; we re-read fresh from Expo's API on each session. This aligns with PRIVACY.md Steve S7 (AsyncStorage is unencrypted on device) and means a stolen phone does NOT yield a usable push token to the attacker — they'd need to also sign in to Mutual Mesh and re-register.

Approved as-specified. Steve verifies in code review (no `AsyncStorage.setItem` calls with the token).

### Concern 10 — Geofence push is permanently excluded (APPROVED, surface to CLAUDE.md)

The spec's "Out of scope" section names "Geofence-triggered push" as NEVER ship. This is the right call (GPS = location leak per Deb anti-goal #1 + Keo anti-goal location-finer-than-city + Mara persona).

**RECOMMENDATION (non-blocking):** Add this NEVER-rule to CLAUDE.md Gotchas alongside the "FSA polygon is the smallest map unit" rule (which lands in Phase 3.2). Will writes both together.

---

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 3.1 lands. Jordan's recommendation in parentheses.

### DFS-PR-1: Direct APNS/FCM if Expo's privacy posture has drifted?

The spec uses Expo's push API as a thin relay. AC-9 + Concern 1 above require Jordan to re-verify Expo's current privacy policy at build time. If Expo's documented retention or sharing posture has changed unfavorably between 2026-05-24 and the build date, the options are:

- **(a)** Stay with Expo (accept the drift; document in PRIVACY.md). Cheapest.
- **(b)** Replace Expo's relay with direct APNS (Apple Push Notification Service via HTTP/2 with auth tokens) + direct FCM (Firebase Cloud Messaging HTTP v1 API). Adds significant Edge Function complexity (key management, retries, certificate refresh) and requires Sky to enroll in Apple's developer push program (already required for the app anyway). Eliminates Expo as a relay.
- **(c)** Pause push entirely and re-evaluate.

**Jordan's recommendation:** **(a) by default IF Expo's policy is unchanged.** If unchanged, the residual risk is the same as it was at 2026-05-24 spec time. Defer (b) to v1.5 only if a concrete incident or policy drift forces it. If policy is changed, escalate to Morgan → Sky → re-decide.

- [ ] Approve (a) stay with Expo (Jordan's recommendation, contingent on no policy drift)
- [ ] Edit — (b) direct APNS + FCM, no Expo
- [ ] Edit — (c) pause push; re-evaluate

### DFS-PR-2: Silent-default + no-quiet-hours pair?

Quinn's DFS-2 (no in-app quiet hours) and DFS-4 (silent default for all users) should be resolved together for Mara's threat model.

**Jordan's recommendation:** **Approve both as Quinn proposes.** The combined effect is maximum lockscreen privacy. Sound is an audible leak even if the lockscreen is title-only. OS-level Do Not Disturb is more reliable than in-app quiet hours. Users who want sound can flip OS-level settings.

- [ ] Approve silent-default + OS-level quiet-hours (Jordan + Quinn alignment)
- [ ] Edit — per-user sound preference (rejects Jordan's posture)
- [ ] Edit — per-user quiet-hours preference

### DFS-PR-3: PRIVACY.md amendment timing — before or after migration applied?

Per Concern 1 above, PRIVACY.md must be amended to disclose Apple/Google/Expo. The question is sequencing:

- **(a)** Amend PRIVACY.md FIRST (Jordan PR), Sky reviews, status stays APPROVED with the new rows, THEN Dana writes the migration, Sky applies.
- **(b)** Dana writes the migration in parallel with Jordan's PRIVACY.md amendment; Sky applies migration only AFTER PRIVACY.md amendment is reviewed.

**Jordan's recommendation:** **(a) strict ordering.** PRIVACY.md is the source of truth for what data Mutual Mesh collects and who sees it. Adding a recipient to the data flow without updating that document first creates a moment in time where the schema is misaligned with the privacy contract. Strict serial ordering is the right discipline.

- [ ] Approve (a) PRIVACY.md amendment first (Jordan's recommendation)
- [ ] Edit — (b) parallel work, gated apply

---

## PRIVACY.md edits proposed (DO NOT APPLY — Sky approves; Jordan writes via separate PR)

The following are proposed edits to PRIVACY.md. Jordan does NOT apply them in this review (file-only, no PRIVACY.md modification per constraint). Sky reviews these edits and, if approved, Jordan writes them in a follow-up privacy branch.

### Edit 1 — Add new "Push notification recipients" subsection after "Data inventory (final)"

Insert after the "Fields NOT collected" paragraph:

```
## Push notification delivery — third-party recipients (Phase 3.1)

When a user opts in to one or more push notification triggers (default OFF), the delivery flow involves three external parties beyond Supabase. We disclose them here as part of the trust boundary.

| Party | What they see | What they retain | Why |
| ----- | ------------- | ---------------- | --- |
| Apple (APNS) | Generic title string (one of 4 fixed strings); opaque UUID in `data.id`; device token | Delivery metadata per their documented APNS policy; payload dropped after delivery | iOS notification delivery |
| Google (FCM) | Same as Apple | Delivery metadata per their documented FCM policy; payload dropped after delivery | Android notification delivery |
| Expo (expo.io) | Same as Apple/Google (thin relay) | No payload retention per Expo's documented policy; verified at build time and re-verified at each privacy audit | Cross-platform abstraction over APNS/FCM |

**What is never sent in the payload:** resource name, claimant handle, item description, category, postal prefix, FSA, pickup_text, contact_handle, user email, or any free-text user-generated content. The body is empty; the title is one of 4 fixed generic strings per trigger.

Users can revoke push notifications at any time from Profile → Notifications → "Disable all notifications." Revoking deletes the device's push token from our database in the same transaction.
```

### Edit 2 — Add row to the "Data inventory (final)" table for `push_tokens.expo_token`

Add as row 16:

| 16 | Expo push token | `public.push_tokens.expo_token` | When user opts in to push | Notification delivery routing | Until user revokes OR account delete OR `DeviceNotRegistered` from Expo (auto-prune per DFS-3) | Server-side only; Apple/Google/Expo see it as the routing target | No (token is not credential-equivalent per DFS-1; see "Push notification delivery — third-party recipients" subsection above) |

### Edit 3 — Add row to the "Data inventory (final)" table for `users.push_preferences`

Add as row 17:

| 17 | Push preferences (per-trigger opt-in flags) | `public.users.push_preferences` (JSONB) | Set by user in Profile | Per-trigger opt-in state for push delivery | Until account delete; default all-OFF for new and re-signed-up users | Self-read only (RLS `users_self_select`); Edge Function reads on delivery | No |

### Edit 4 — Add a fields-NOT-collected entry under "Fields NOT collected" section

Append to the existing "Fields NOT collected" sentence (after "payment info"):

> "...payment info, OR the body of any push notification (always empty by AC-2 contract), OR per-recipient identifiers in `cron_log` for push deliveries (aggregate counts only)."

### Edit 5 — Add new decision D11 to "DECISIONS FOR SKY" section

```
### D11: Push notification delivery via Expo + APNS/FCM (Phase 3.1 — added 2026-05-24)

**Proposal:** Opt-in push notifications routed through Expo as a thin relay to Apple APNS and Google FCM. Default OFF per user per trigger. Title-only on lockscreen; body always empty. No third-party push provider (no OneSignal, no Pusher, no Firebase-as-a-service).

**Why:** Real-time claim notifications are a launch-window growth requirement (Casey's 90-day seed target) but the surveillance-averse audience requires zero-leak design. The title-only rule maps directly to Mara persona anti-goal #3.

**Trust boundary additions:** Apple, Google, Expo each see delivery metadata. Payload contains only a generic title + opaque UUID; never resource names, handles, or descriptions. Disclosed in the "Push notification delivery — third-party recipients" subsection above.

**Alternative considered:** Pull-only (no push at all, as in MVP). Rejected because seed-community engagement metric depends on fast claim coordination.
**Rollback:** Users revoke any time; admins can disable push triggers via a future kill-switch DECISION.

- [ ] (Sky reviews after Phase 3.1 amendment lands)
```

---

## What this review does NOT cover

- The cryptographic correctness of TLS-on-the-wire (Supabase platform-default; out of scope).
- The Edge Function's deployment process or key management (Steve's security review covers).
- The bundle-size or render-perf impact of the Profile screen's new Toggle (Peter's perf review covers).
- The exact wording of the "Why we need this" microcopy (Casey + Will collaborate; Jordan re-reviews).
- The translation of the four AC-2 titles into French / Spanish (Phase 3.4 i18n spec; see jordan-review-i18n.md).
- A real Canadian privacy lawyer's PIPEDA analysis (Cycle 7 ship-readiness per PRIVACY.md D10).

---

## Summary table

| Concern # | Topic | Verdict | Blocking? |
| --------- | ----- | ------- | --------- |
| 1 | Apple/Google/Expo enter trust boundary | Address via PRIVACY.md amendment + microcopy | BLOCKING (3 sub-conditions) |
| 2 | Title-only lockscreen rule | APPROVED, reinforce via production assertion + enum test | NO |
| 3 | Token rotation across reinstall/migration | APPROVED with caveat on reconnect-prompt UX | NO |
| 4 | OFF default persists across reinstall | APPROVED with two BLOCKING sub-conditions (Gotcha doc + delete-test extension) | BLOCKING |
| 5 | Failed-delivery logging hygiene | APPROVED, recommend log-shape test strengthening | NO |
| 6 | `cron_log` aggregate-only | APPROVED | NO |
| 7 | Deep-link auth-gate preservation | APPROVED | NO |
| 8 | Quiet hours deferred to OS | APPROVED, pair with DFS-4 silent default | NO |
| 9 | AsyncStorage does NOT cache token | APPROVED | NO |
| 10 | Geofence push permanently excluded | APPROVED, surface to CLAUDE.md | NO |

**BLOCKER count: 3 (Concern 1.1, 1.2, 1.3 are one cluster; Concern 4.1 + 4.2 are the other).**
**PRIVACY.md edits proposed: 5 (3 inventory rows / subsections + 1 fields-NOT-collected addition + 1 new D11 decision).**
**DECISIONS FOR SKY: 3 (DFS-PR-1, DFS-PR-2, DFS-PR-3).**

---

**Jordan — 2026-05-24** — file-only privacy review, no PRIVACY.md modification, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
