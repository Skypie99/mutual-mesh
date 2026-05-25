# Privacy review — Phase 3.3 In-app Chat — Jordan — 2026-05-24

> **NOT A LAWYER DISCLAIMER.** Jordan is the Privacy Advisor role inside Sky's Claude Corp system, not a licensed attorney. Nothing in this document is legal advice. PIPEDA references, "trust boundary" claims, and statements about Supabase / Apple / Google / Expo retention behavior are reasoned from publicly-available documentation as of the review date. Before public launch — and especially before chat (a regulatory category change) ships — a qualified Canadian privacy lawyer must independently sign off on the privacy posture this spec implements. See PRIVACY.md D10 and Cycle 7 ship-readiness.

> **Status: APPROVED WITH CONDITIONS.** 5 BLOCKING conditions, 6 PRIVACY.md amendments proposed, 4 DECISIONS FOR SKY (one of which — DFS-J-1 — restates and elevates Quinn's DFS-1 sequencing question to Sky; Jordan does NOT make the sequencing call).

> **Mode: read-only review.** No code touched. No PRIVACY.md modification (file-only proposals). No external side effects. No message to Sky — Morgan owns that channel.

---

## Scope of this review

This is the FULL privacy review of `qa-reports/spec-phase-3-chat.md` against:

- `PRIVACY.md` (🟢 APPROVED 2026-05-23, locked) — particularly D2, D3, D5, D6, D8, B2 (no handle leakage), and the Data Inventory's 15 rows + "Fields NOT collected" line
- `CLAUDE.md` decisions log row: **"MVP scope — No in-app chat — claim reveals contact handle — Ships faster; keeps app out of 'messaging' regulatory category; chat is v2"**. Re-enabling chat is a deliberate re-opening of a Sky-locked MVP decision.
- Constitution Art. 7.6 — privacy review mandatory for marginalized-group + location data + Sky pre-merge approval required
- Constitution Art. 9 — Morgan-only external channel (this review surfaces to Morgan, not to Shamus or Sky directly)
- `research/personas/persona-mara-2026-05-23.md` — load-bearing on minimum disclosure to counterparty
- `research/personas/persona-keo-2026-05-23.md` — load-bearing on chat being OPT-IN even post-claim
- `research/personas/persona-deb-2026-05-23.md` — secondary beneficiary
- `qa-reports/2026-05-23_threat-model-stride.md` — chat re-opens several previously-Zero threat surfaces
- `qa-reports/phase-3-jordan-review-push.md` (peer review) — chat depends on push as a foundation; that review's conditions carry forward
- `supabase/schema.sql` + `supabase/__tests__/rls.sql` — existing RLS pattern Steve relies on for adversarial tests

The spec is architecturally sound on the load-bearing privacy boundary (AC-1: chat opens ONLY after `claim_resource()` succeeds; the `messages` table key is `claim_id`; no chat without a claim). The hard architectural commitments — RLS scoped to claim participants (AC-2), no admin read policy, text-only with no attachments (AC-12), opaque realtime channel name (AC-11), 30-day post-completion prune (AC-8), account-delete cascade with sentinel-replace (AC-6 + DFS-4), no third-party messaging SDKs (Section 5 item 9) — directly address the privacy threats that the MVP-scope decision originally avoided by excluding chat.

The five BLOCKING conditions below tighten the privacy contract in the migration + RLS + delete-account RPC layers. They MUST land in code before Shamus builds the screen. Without them, the spec is correct on paper but breakable in implementation.

---

## Verdict

**APPROVED WITH CONDITIONS** — Jordan's privacy-only verdict. **This is NOT a build-go signal.** Per the spec itself (line 11: "Sky's EXPLICIT approval is required before merge") and CLAUDE.md decisions log, **Sky's pre-merge approval is independently required**. Jordan's APPROVED-WITH-CONDITIONS only certifies that, IF Sky chooses to ship chat in some Phase (3.3, 4, 5, or never), the proposed design satisfies the privacy contract subject to the conditions below. The sequencing question (Quinn's DFS-1) is surfaced as DFS-J-1 below and is Sky's call, not Jordan's.

Chat is the highest-privacy-risk feature in the entire Phase 3 spec set because it:

1. **Creates a new PII category** — user-to-user message content. The 15-row PRIVACY.md data inventory does not currently enumerate any free-text user-to-user content. Pickup_text and contact_handle are user-supplied but their purpose is single-shot coordination metadata, not conversation. Chat introduces durable conversation as a new data class, with its own retention, cascade, and trust-boundary properties.
2. **Changes the app's regulatory category** — from "marketplace" to "marketplace + messaging." This is documented in the spec, the CLAUDE.md decisions log, and re-stated by Quinn in DFS-1. App-store classification, PIPEDA disclosure obligations (which, per PRIVACY.md D10, need a real lawyer's pre-launch sign-off anyway), and the threat model all shift.
3. **Adds Supabase Realtime as a new data transport for high-frequency PII** — until now, Realtime has carried only marketplace state deltas (resource INSERT/UPDATE/DELETE), which are not PII per se (the resource fields themselves are PII, but the channel is `public:resources`, not per-user). Chat introduces per-claim Realtime channels carrying message content. The channel name is the `claim_id` UUID (opaque per AC-11) — that's correct — but the payload carried over Realtime is the message body itself, which IS PII.
4. **Extends `delete_my_account()`** — PRIVACY.md D6's "true cascade hard-delete" promise. The spec's sentinel-replace path (DFS-4 default) does NOT hard-delete in the literal sense; it nulls `body` and replaces `sender_id` with a sentinel UUID, leaving the row in place. Jordan agrees with Quinn's recommendation (sentinel-replace + body NULL preserves counterparty context without re-exposing data) BUT this is a meaningful refinement to D6's wording that must be disclosed in PRIVACY.md.
5. **Extends `push_preferences`** — a fifth trigger, `chat_message`, with the same default-OFF posture as the four existing triggers. The push review's BLOCKING CONDITION 4 (default-OFF persists across reinstall, account migration, and any future migration script) carries forward to this fifth trigger verbatim.
6. **Depends on the Phase 3.1 push review's conditions being met first** — chat cannot ship unless push has shipped (Quinn's "Why now" item 1). If Phase 3.1's BLOCKING CONDITIONS 1.1–1.3 + 4.1–4.2 from `phase-3-jordan-review-push.md` are not satisfied, chat cannot ship either, regardless of this review's verdict.

---

## BLOCKING conditions

These MUST be in the migration + RLS + RPC before Shamus builds the chat screen. Each maps to a load-bearing privacy promise that the spec asserts but the build must enforce. Numbering parallels the push review's style.

### BLOCKING 1 — RLS adversarial test coverage on `messages` (AC-2 enforcement)

The spec's AC-2 is the entire privacy boundary. The proposed `messages_participant_select` policy (Section 5) joins through `public.resources` to check `r.posted_by = auth.uid() OR r.claimed_by = auth.uid()`. The policy is correct in design. The implementation is breakable in three known ways that the test suite must adversarially cover.

**BLOCKING 1.1:** `supabase/__tests__/rls.sql` must include all three adversarial SELECT tests **before** Shamus's screen code lands:

- **(a) Anonymous user (no JWT) querying `messages WHERE claim_id = <known_real_claim_id>`** — must return zero rows.
- **(b) Authenticated, verified, NON-participant user querying the same** — must return zero rows.
- **(c) Admin (`is_admin = true`) who is NOT a participant** — must return zero rows. Spec line 64 explicitly disclaims an admin read policy; the test enforces it.

These three tests are the spec's AC-2 verification artifact. Without them, AC-2 is unverified and the privacy contract is paper-only. Steve writes; Gary runs in CI.

**BLOCKING 1.2:** The RLS policy MUST also cover the **claim-canceled / claimed_by reset to NULL** case described in spec line 61. A user who briefly claims a resource, sends messages, then has the claim canceled (claimed_by → NULL) MUST lose SELECT access to those messages going forward. The policy as written satisfies this (the join returns zero rows when `claimed_by IS NULL`), but the test must assert it. Add as test (d): a former-claimant whose claim was canceled cannot SELECT their own prior messages.

**BLOCKING 1.3:** The RLS policy MUST cover the **resource-deleted-mid-flight** case. Because `messages.claim_id REFERENCES resources(id) ON DELETE CASCADE`, the rows are removed when the resource is deleted. A test must assert that a deleted resource leaves zero messages behind for either party. This is also AC-8's prune-cron verification, but the privacy contract requires it as a standalone test (not bundled with the cron test) because a privacy bug in the cascade would be invisible during normal operation.

### BLOCKING 2 — `delete_my_account()` extension test (PRIVACY.md D6 + AC-6)

PRIVACY.md D6 promises "true cascade hard-delete" on `delete_my_account()`. The spec's AC-6 introduces a sentinel-replace refinement for messages-sent-by-the-deleting-user (counterparty preservation). This is a meaningful divergence from "hard-delete" that requires:

**BLOCKING 2.1:** An integration test in `supabase/__tests__/` (or a `delete_account.sql` extension) that asserts, after `delete_my_account()`:

- Zero rows in `messages` with the deleted user's original `sender_id` (i.e., the UUID has been replaced).
- All such rows now have `sender_id = '00000000-0000-0000-0000-000000000000'::uuid` (DFS-4 default sentinel) AND `body = NULL` AND `deleted_at IS NOT NULL`.
- Cascade-via-resource: all messages belonging to claims for resources the deleting user POSTED are gone entirely (because the resource row is deleted, triggering `ON DELETE CASCADE` on `messages.claim_id`).
- No `messages` row anywhere in the database leaks the deleted user's original UUID. (Steve's existing trace test for D6 is extended; the spec already calls for this at line 94.)

**BLOCKING 2.2:** The PRIVACY.md D6 amendment (proposed below in "PRIVACY.md edits proposed") must land before this RPC extension ships. The amendment discloses sentinel-replace + body-NULL as the chat-specific refinement of D6. Without the amendment, the implementation is inconsistent with the published privacy contract.

**BLOCKING 2.3:** If Sky resolves DFS-4 as hard-delete (the alternative path), then the test asserts zero rows from `messages WHERE sender_id = <deleted_uuid>` AND PRIVACY.md D6 does NOT need amendment (the implementation matches the literal D6 wording). Either way, the test + the doc state must match.

### BLOCKING 3 — Message content excluded from all error reports and logs (PRIVACY.md D8 + AC-15)

PRIVACY.md D8 forbids third-party SDKs (Sentry, etc.) in MVP, so there is no Sentry destination for message content to leak to. But several internal logging paths could capture `messages.body` accidentally:

- `userFacingErrorMessage()` in `src/lib/errors.ts` — the spec says all `send_message` failures route through this (AC-15). The helper must be reviewed (Steve) to confirm it does not print the input arguments of the failed RPC anywhere — only the error code is consumed.
- The Edge Function `deliver_notification` (Phase 3.1) — chat_message trigger. Per AC-7 + Phase 3.1 AC-2, the push payload is title-only ("You have a new message"), NEVER the body. The Edge Function code must NEVER receive the body as an argument; the RPC's fire-and-forget call passes only `(trigger, recipient_id)`, not the message text. Confirmed by spec line 412.
- `cron_log` for the prune extension — must log aggregate counts only (`messages_deleted_count: N`), never per-message content or per-claim metadata that could correlate to a specific user.
- `rate_limit_log` — records `(user_id, operation, window_start, count)`. Operation field must be a fixed enum (e.g., `'send_message'`), NEVER include any user-controlled string (no message snippet, no claim_id concatenation).
- React Native's console.log / dev-mode UI — Shamus must NEVER `console.log(messageBody)` even during development. Add a CLAUDE.md Gotcha (proposed below).

**BLOCKING 3.1:** A Gary CI test that greps the built bundle (or the source tree) for `console.log` calls that include any variable named like a message body. Implementation: a `scripts/no-message-content-in-logs.sh` script Gary writes, run as part of `npm run lint`. Reject if any of `console.log.*messag(e|es)\.body`, `console.error.*body`, or similar patterns appear.

**BLOCKING 3.2:** Steve's code-review checklist for the chat PR must include an explicit line item: "Verified `messages.body` is read in exactly one place (the participant-scoped SELECT inside the ChatScreen's realtime subscription helper) and is never logged, never passed to a non-RPC server-side function, and never serialized to AsyncStorage."

### BLOCKING 4 — Push trigger `chat_message` inherits the push review's BLOCKING conditions (Concern 4 carry-forward)

The push review's BLOCKING 4 (default-OFF persists across reinstall, account migration, and any future migration script) is a **forever-rule** that applies to every push trigger, including the new `chat_message` trigger this spec adds.

**BLOCKING 4.1:** The migration that extends `push_preferences` with `chat_message` MUST use the same `ADD KEY ... DEFAULT false` pattern as the existing four triggers. Spec lines 314–328 use the correct form. Confirmed.

**BLOCKING 4.2:** The push review's `delete_my_account` + re-signup integration test (push review BLOCKING 4.2) must be extended to also assert that `push_preferences.chat_message` returns to OFF after delete + re-signup with the same email. Gary writes the extension.

**BLOCKING 4.3:** The new "Push preferences are opt-in forever" CLAUDE.md Gotcha (push review BLOCKING 4.1) must explicitly call out `chat_message` as one of the protected triggers. Will updates when the Gotcha is added — adding chat_message to that list is a one-line change.

**BLOCKING 4.4:** The Phase 3.1 push review's BLOCKING CONDITION 1 (Apple/Google/Expo enter the trust boundary; PRIVACY.md inventory amendment + microcopy + Expo policy re-verification) **must already be satisfied** before chat ships. Chat does not introduce new Apple/Google/Expo data — the title is the same generic "You have a new message" — but chat depends on the push subsystem. Push must land cleanly first.

### BLOCKING 5 — Rate-limit table privacy properties (AC-3 + Section 5)

The `rate_limit_log` table (Section 5) has correct RLS (no client policies; service-role only via RPCs). Two properties must be tested:

**BLOCKING 5.1:** The hourly prune of `rate_limit_log` (spec line 354) MUST land in the SAME migration as the table creation. Otherwise, the table grows unboundedly until someone notices, and the resulting metadata trail (which user sent how many messages per minute over a long window) is itself a privacy leak. Cron extension lives in `prune_expired_resources()` or a sibling cron — Dana picks. Test: a cron-run assertion that rows older than 1 hour are deleted.

**BLOCKING 5.2:** The `operation` column MUST be a fixed enum (recommend: `CHECK (operation IN ('send_message'))` in the schema, expanded as future rate-limited operations land). A free-text operation column would allow an RPC author to accidentally store user-controlled content (a snippet, a claim_id, a handle). Defense in depth: the CHECK constraint is the schema-layer enforcement; Steve verifies in code review that no RPC passes a non-literal string for the operation argument.

---

## Non-blocking conditions (advisory for build)

These do not block the migration or the build, but Shamus + Dana + Steve should adopt them. They strengthen the privacy contract without being load-bearing for the boundary.

### Advisory 1 — Realtime channel name documentation (AC-11)

AC-11 specifies the channel name is the `claim_id` UUID (opaque, no handle, no resource name). Correct. Recommendation: add a JSDoc comment in `src/lib/chat.ts` (or wherever the channel subscription lives) explicitly naming this property as a privacy invariant. Example: `// PRIVACY INVARIANT: Realtime channel name MUST remain claim_id-only. Adding handle, resource name, or any free-text to the channel name would leak metadata to anyone with passive access to Supabase Realtime subscription logs.` Surface to Shamus.

### Advisory 2 — Message body length cap as defense in depth (DFS-5)

Quinn's DFS-5 recommends 1000 chars. Privacy-wise: a low cap discourages the "chat as conversation" drift that would expand the PII surface (long messages contain more disclosure: addresses, names, life-context). Jordan supports DFS-5 (a) 1000 chars as a privacy-favorable choice (not the maximum; not the minimum). If Sky chooses 2000 (option c), Jordan does not block but notes the privacy posture shifts marginally toward conversation.

### Advisory 3 — Read receipts (DFS-2) is a metadata leak vector

Quinn recommends NO read receipts in v1 (option b). Jordan agrees. Read receipts are a metadata leak (the sender learns when the recipient looked at the message). Keo's threat model (spec line 23: realtime channel name does NOT reveal who I'm talking to) extends to read-state metadata. Jordan supports DFS-2 (b) "no read receipts in v1" as a privacy-favorable default. The `read_at` column being present-but-unused (per spec line 374) is acceptable — it occupies one nullable TIMESTAMPTZ; nothing leaks if nothing reads it. Strong recommendation: do not add a per-user toggle (DFS-2 option c) in v1 — toggles are signal to the counterparty about the user's privacy posture, which is itself a leak.

### Advisory 4 — Typing indicators (DFS-2 mention in AC-9)

Same posture as Advisory 3. Quinn correctly recommends no typing indicators in v1. They leak compose-time metadata. Jordan agrees.

### Advisory 5 — Active-chat push suppression (DFS-6) — privacy of presence column

Quinn's DFS-6 recommends (a) suppress push if recipient is foreground + on ChatScreen for the same claim_id. Implementation note: this requires a "presence signal" — either a `last_active_chat_claim` column on `public.users` or Supabase Realtime presence. Either way, this is a new field that the counterparty's side of the system can read indirectly (the absence of a push notification when one would normally fire signals that the other person is actively looking at the chat). Net: presence is a soft metadata leak. Jordan accepts the trade-off (the UX win is real: receiving a push for a message you're literally reading is annoying and erodes trust in the notification system as a whole), but recommends documenting the trade-off in the spec's "Privacy considerations" section and in PRIVACY.md (proposed amendment below). If Sky chooses (b) always push, this concern goes away.

### Advisory 6 — Delete-my-message RPC (DFS-8) is the privacy-correct path

Quinn recommends (a) new RPC `delete_my_message(message_id)`. Jordan strongly agrees. The alternative (b — direct UPDATE via scoped RLS) opens the door to client-side update-shape attacks (e.g., a malicious client trying to update `created_at` or `sender_id` as part of the same UPDATE). Server-definer RPC is the established pattern in this codebase (claim_resource, approve_user, delete_my_account); chat should follow it. No new privacy concern; reinforces existing posture.

### Advisory 7 — Empty-state copy disclosure (AC-14)

Spec line 158 has the empty-state copy: `"Send a message to <handle> to arrange pickup. The contact handle they shared is also above."`. Recommendation: add a one-line privacy disclosure to the chat input area (per spec privacy consideration 4 — "Text only — no images, files, or voice."). The current spec mentions this disclosure in the privacy-considerations section but does not pin it to a specific UI location. Jordan recommends: render it directly below the message input as fixed gray italic text. Same screen real estate where users decide what to send. Casey + Will collaborate on wording; Jordan re-reviews at design-review.

### Advisory 8 — Closed-chat read-only window (AC-8)

Spec line 107: 7 days post-completion the chat is readable but new sends are blocked. Then at 30 days the resource + messages are pruned. Jordan supports this design — it gives both parties a window to copy out coordination details if they need to. Recommendation: when the chat enters the read-only state mid-session via realtime (per spec line 527), the announceForAccessibility message should be wording-reviewed by Will to make sure it doesn't sound like a delete (which it isn't yet). Current proposed copy: `"This pickup is complete. The chat is now closed."` — fine.

### Advisory 9 — No AI translation / summarization (AC-9 area, AC-12 brand rule)

Spec is silent on whether translation services touch chat content in Phase 3.4 (i18n). Confirming via cross-reference with `phase-3-jordan-review-i18n.md`: chat content MUST NOT be auto-translated by any third-party service. The i18n surface is UI strings (button labels, error messages), NOT user-generated content. Spec line 142 ("AC-12 attachments / link previews / etc. — FOREVER out of scope") implicitly covers this for the attachments side. Jordan extends: NO AI translation, NO AI summarization, NO AI suggested-replies. These would each be a third-party data-egress surface (per PRIVACY.md D8). Add to the spec's "Out of scope for Phase 3.3 (Chat)" section as a NEVER-ship line (proposed amendment below).

### Advisory 10 — "Mutual Mesh" brand not translated (AC-12 mention)

The push review covered this for the four push titles (each title is a fixed string per locale, not interpolated). For chat, the brand name "Mutual Mesh" should never appear in a message body or be interpolated into UI copy in a way that gets translated separately from the body. Cross-check with `phase-3-jordan-review-i18n.md` Concern 5 (or equivalent) for the brand-translation rule. No new chat-specific issue here; reaffirming.

---

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 3.3 lands. Jordan's privacy-only recommendation in parentheses. These pass to Morgan (per Constitution Art. 9), NOT to Shamus.

### DFS-J-1: Phase 3.3 NOW or post-launch? (sequencing — Quinn's DFS-1 re-stated to Sky from a privacy angle)

Quinn's DFS-1 (spec line 565-579) recommends sliding chat from Phase 3.3 to Phase 5 (post-launch). Jordan supports surfacing this as a Sky decision rather than letting it default. The privacy-and-trust angle on each option:

- **(a) Ship in Phase 3.3 as currently planned.** The full privacy infrastructure (BLOCKING 1–5 + push review conditions + PRIVACY.md amendments + a Sky-approved CLAUDE.md decisions-log row change) all has to land in the same Phase. High-velocity privacy work concurrent with launch-blocker triage is the riskiest possible time to introduce a new PII category.

- **(b) Ship in Phase 4 (launch infrastructure phase, pre-TestFlight).** Slightly more isolated from feature-build chaos, but still entangled with launch-blocker triage. The regulatory category change becomes a TestFlight-submission-time question (does Apple/Google route us through a different review track?), which is the worst time for that question.

- **(c) Ship in Phase 5 (post-launch enhancement) — Quinn's recommendation.** Maximum isolation: seed users live on contact_handle for the first launch cohort, Casey collects feedback on coordination friction, and chat ships as a deliberate post-launch enhancement with its own Sky-approval gate, its own privacy-policy update, and its own app-store re-classification disclosure. PRIVACY.md D2's "Chat can be added as v2 without changing existing data" was written exactly for this option.

- **(d) Don't ship chat at all.** v1 ships with contact_handle (the current MVP-scope decision); chat stays NEVER-built. This is the most privacy-conservative option and Mara's threat model is most directly served by it (no in-app messaging surface = no in-app messaging risk). Casey's growth metric may or may not require chat; Casey + Quinn need to argue it.

**Jordan's recommendation:** **(c) Phase 5 post-launch enhancement.** Privacy-and-trust reasoning: every privacy promise this app makes is most easily verified by users when the surface is small. Adding a chat surface in the same Phase as TestFlight submission compounds the verification burden on Sky, on the seed community, and on any pre-launch privacy review. Decoupling the two is worth weeks of calendar time. Sequencing is Sky's call, not Jordan's; this is Jordan's recommendation, not a verdict.

- [ ] Approve (a) Phase 3.3 as planned
- [ ] Approve (b) Phase 4 pre-TestFlight
- [ ] Approve (c) Phase 5 post-launch (Quinn + Jordan recommendation)
- [ ] Approve (d) NEVER ship; contact_handle is sufficient v1

### DFS-J-2: PRIVACY.md amendment timing — strict-serial or parallel?

Per BLOCKING 2.2 above, PRIVACY.md must be amended to disclose:

- D6 refinement (sentinel-replace + body-NULL for sent messages; cascade-delete via resource for received messages)
- New "Chat data inventory" row(s) for `messages.body`, `messages.sender_id`, `messages.read_at`, `messages.deleted_at`, `rate_limit_log` (aggregate)
- New D12 decision row documenting chat as a v2 feature with the regulatory category change
- New CLAUDE.md decisions-log row update (the existing "No in-app chat" row needs revision)
- "Fields NOT collected" line update (add: message attachments, message location, link previews, read receipts in v1)

Two sequencing options:

- **(a) PRIVACY.md amendment FIRST (Jordan PR), Sky reviews, status stays APPROVED with the new rows, THEN Dana writes the migration, Sky applies, THEN Shamus builds.** Strict serial.
- **(b) Jordan + Dana work in parallel; Sky applies migration only AFTER PRIVACY.md amendment is reviewed.** Wall-clock-faster but creates a moment where the schema exists in a draft state misaligned with the published privacy contract.

**Jordan's recommendation:** **(a) strict-serial**, matching the push review's DFS-PR-3. Same reasoning: PRIVACY.md is the source-of-truth for what data Mutual Mesh collects and who sees it. Adding a new PII category (message content) without updating the doc first creates a moment-in-time misalignment.

- [ ] Approve (a) strict-serial PRIVACY.md first (Jordan's recommendation)
- [ ] Edit — (b) parallel, gated apply

### DFS-J-3: Confirm DFS-4 (sentinel-replace) as the privacy-correct default

Quinn's DFS-4 (spec line 615) recommends (a) sentinel-replace + body NULL. Jordan strongly agrees from a privacy angle:

- (a) sentinel-replace + body NULL: counterparty sees "(message from a deleted user)" with no body. **Mara persona served:** she can fully disappear without orphaning context for her counterparty. **D6 honored:** her body is gone, her UUID is replaced, no trace remains that links the deleted user's identity to the conversation.
- (b) hard-delete: counterparty's bubbles are missing entirely; conversation context broken. **Mara persona LESS served:** her counterparty may be confused (did Mara delete her account? Did the message fail to send? Was the conversation tampered with?) — confusion erodes trust in the platform.

This is a confirm-the-default DFS, included here because (a) it's the load-bearing path for BLOCKING 2 and (b) Sky needs to explicitly own the refinement of D6.

**Jordan's recommendation:** **(a) sentinel-replace + body NULL (default).** Pair with PRIVACY.md D6 amendment (proposed below).

- [ ] Approve (a) sentinel-replace + body NULL (Quinn + Jordan recommendation)
- [ ] Edit — (b) hard-delete; PRIVACY.md D6 stays literal

### DFS-J-4: What happens if recipient has not opted into `chat_message` push?

Spec line 102 mentions that if recipient is foreground on the chat screen, push is suppressed (DFS-6). But it doesn't address: what if the recipient has `push_preferences.chat_message = false` (the default-OFF state per Phase 3.1)? Two possibilities:

- **(a) The message is delivered (stored in `messages`, visible on ChatScreen when the user next opens it) but no push fires.** The recipient may not know a message arrived until they happen to open the chat. **Privacy-and-UX implication:** Mara's persona is well-served (no push = no lockscreen leak), but a sender might believe the message was received-and-read when it was only stored. Optional surface to the SENDER: a "Sent — recipient may not be notified" footnote.
- **(b) Block the send entirely with a "recipient hasn't opted into chat notifications" error.** Privacy nightmare: discloses the recipient's push preferences to the sender (per-user preference is itself a privacy leak — Mara wouldn't want a counterparty to know she has all-pushes-OFF).

**Jordan's recommendation:** **(a) deliver silently; never disclose recipient's preferences to sender.** The "Sent" indicator on the sender's UI says "delivered to the database." Whether the recipient sees it depends on their app behavior, which is correctly opaque to the sender. Do NOT add the "recipient may not be notified" footnote — it leaks preference state. Recipient discovers messages the next time they open the chat screen (which is the existing behavior for any messaging app with notifications-off; nothing new).

- [ ] Approve (a) deliver silently; opaque to sender (Jordan's recommendation)
- [ ] Edit — (b) block send with error (REJECTED — leaks preference state)
- [ ] Edit — (c) deliver but tell sender "recipient may not be notified" (also leaks preference state)

---

## PRIVACY.md edits proposed (DO NOT APPLY — Sky approves; Jordan writes via separate `privacy/auto-DATE-jordan` PR)

These are proposed edits to PRIVACY.md. Jordan does NOT apply them in this review (file-only). Sky reviews; if approved, Jordan writes them in a follow-up privacy branch. Numbering continues from the push review's 5 edits.

### Edit 6 — Add new "Chat messages" subsection after the (push-review-proposed) "Push notification delivery — third-party recipients" subsection

```
## Chat messages — data class and trust boundary (Phase 3.3)

When a user posts a resource AND a second user claims it via `claim_resource()`, both parties unlock an OPTIONAL in-app chat thread scoped to that single claim. The thread coexists with the existing `contact_handle` reveal (D2 unchanged) — chat is additive, not replacement. The user can use either channel.

Privacy contract for chat:

- **Boundary:** chat exists ONLY post-claim. Browsing users cannot enumerate, initiate, or read any chat thread. The `messages` table's RLS scopes every row to the two participants of the corresponding claim.
- **Content class:** text only. No image attachments, no file uploads, no voice messages, no link previews. FOREVER out of scope.
- **Server-side visibility:** the message body is server-readable (not E2EE in v1). The body is read by exactly one path: the participant-scoped Realtime subscription and SELECT on `messages`. No background job, no admin tool, no Edge Function reads message body.
- **Realtime transport:** Supabase Realtime carries the INSERT/UPDATE events for `messages` filtered by `claim_id`. The channel name is the claim_id UUID — opaque; no handle, no resource name. The payload over Realtime IS the message body itself (encrypted in transit by Supabase's TLS).
- **Account deletion (D6 refinement):** when a user runs `delete_my_account()`, all messages they SENT are sentinel-replaced (sender_id → '00000...0000', body → NULL, deleted_at → now()) so their counterparty sees "(message from a deleted user)" without a body. All messages in claims for resources the user POSTED cascade-delete entirely (via resources.id ON DELETE CASCADE on messages.claim_id).
- **Retention:** chats are readable while the claim is active. 7 days after the claim's resource is marked `completed` (pickup confirmed), the chat becomes read-only (no new sends). 30 days after `completed`, the resource is pruned by the nightly cron, and all messages cascade-delete in the same transaction.
- **No third-party messaging SDKs:** zero (no Twilio Chat, no SendBird, no Stream Chat, no Pusher). Verified at every Phase boundary per D8.
- **No AI:** no auto-translation, no auto-summarization, no AI-suggested replies. Chat content is never sent to any third-party AI service in v1 or planned v2.
```

### Edit 7 — Add rows 18–22 to the "Data inventory (final)" table

| 18 | message body | `public.messages.body` (TEXT, ≤1000 chars) | When user sends a chat message | Per-claim coordination | Until either: user deletes the message (body→NULL); user deletes their account (body→NULL + sender_id replaced); claim's resource is deleted (cascade); 30 days after claim's resource is `completed` (prune) | Server (Supabase); the two claim participants (via RLS) | Supabase platform default (disk-level); NOT E2EE in v1 |
| 19 | message sender | `public.messages.sender_id` (UUID) | When user sends a chat message | Distinguishing sender vs recipient in UI | Same as body, except on `delete_my_account()` the sender_id is replaced with the sentinel '00000...0000' (D6 refinement); cascade-delete on resource delete | Server; the two claim participants | No (UUID is a server-side reference, not user-supplied content) |
| 20 | message read state | `public.messages.read_at` (TIMESTAMPTZ, nullable) | Set by recipient's client when scrolling past (Phase 3.3 schema; UI use deferred per DFS-2) | Future read-receipt feature; nullable until then | Same as body | Server; the two claim participants | No |
| 21 | message deletion state | `public.messages.deleted_at` (TIMESTAMPTZ, nullable) | When user soft-deletes their own message OR on account delete | Soft-delete marker; preserves conversation flow | Same as body | Server; the two claim participants | No |
| 22 | rate-limit log | `public.rate_limit_log` (user_id, operation, window_start, count) | When user calls a rate-limited RPC (`send_message`) | Anti-flood; per-user per-minute counter | Pruned after 1 hour (cron) | Server-side only (no client RLS policy) | No |

### Edit 8 — Amend D2 with chat addendum

Append to the existing D2 EDITED note (after the existing addition about contact_handle not being a real name):

```
**FURTHER EDITED (Phase 3.3, pending Sky approval):** In-app chat is ADDED as v2 (Phase 3.3 or later — Sky decides per DFS-J-1). Chat is ADDITIVE: contact_handle reveal on claim is unchanged. The user can use either channel. Chat does not replace contact_handle; the original "chat can be added as v2 without changing existing data" provision is exercised. Conversely, chat can be REMOVED in any future version without breaking existing flows — the contact_handle path remains the load-bearing fallback.

- [ ] (Sky reviews after Phase 3.3 amendment lands)
```

### Edit 9 — Amend D6 with chat-specific refinement

Append to the existing D6 (the "true cascade hard-delete" decision):

```
**REFINED (Phase 3.3, pending Sky approval):** For chat messages, "hard-delete" has two paths depending on which side of the conversation the deleted user was on:

- **Messages the deleted user SENT:** sender_id is replaced with '00000000-0000-0000-0000-000000000000'::uuid, body is set to NULL, deleted_at is set to now(). Counterparty sees "(message from a deleted user)" with no body content. The row is preserved to maintain the counterparty's conversation context, but contains no trace of the deleted user's identity or content.
- **Messages in claims for resources the deleted user POSTED:** cascade-delete entirely via messages.claim_id REFERENCES resources(id) ON DELETE CASCADE. When the resource row is deleted as part of the user's account cleanup, all messages in its claim disappear in the same transaction.

This is the chat-specific refinement of D6's "true cascade hard-delete" promise. The end-state for the deleted user is the same — no part of their identity or content remains in the database. The refinement exists to preserve the counterparty's UX while honoring the deleted user's right to disappear. Backup retention per D6 (Supabase 7-day PITR) is unchanged.

- [ ] (Sky reviews after Phase 3.3 amendment lands)
```

### Edit 10 — Amend "Fields NOT collected" line

Append to the existing "Fields NOT collected" sentence (which already includes "...payment info, OR the body of any push notification ... aggregate counts only" from push review Edit 4):

> "...payment info, OR the body of any push notification, OR per-recipient identifiers in cron_log for push deliveries, OR any chat-message attachments (text only), OR any per-message location coordinates, OR any third-party AI translation / summarization / suggested-reply of chat content."

### Edit 11 — Add new D12 decision

```
### D12: In-app chat — post-claim only, additive to contact_handle (Phase 3.3 — added 2026-05-24)

**Proposal:** In-app text chat scoped to a single claim, between exactly two parties (poster + claimant), that opens ONLY after `claim_resource()` succeeds. Additive to the existing contact_handle reveal; the user can use either channel. Text only; no attachments forever. 7-day read-only post-completion window; 30-day prune via cascade. Sentinel-replace on account delete for sent messages; cascade-delete for posted-resource messages.

**Why:** Coordination friction is Casey's measured #1 drop-off point (growth-strategy.md). The contact_handle reveal is sufficient for users with shared messaging-app comfort; chat is an in-app alternative for users who prefer not to disclose their Signal/Proton handle to a partial-trust counterparty.

**Regulatory category change:** Mutual Mesh becomes a "marketplace + messaging" app under common app-store classifications. The CLAUDE.md decisions-log row that previously read "No in-app chat — claim reveals contact handle" is amended to reflect chat being shipped (or NOT shipped) per Sky's DFS-J-1 call.

**Alternative considered:** Stay with contact_handle only (D2 as written). Rejected at design time because the growth-strategy metric prefers chat for users without Signal/Proton; ACCEPTED at any time as a rollback (chat can be REMOVED in any future version without breaking existing flows — D2 covers).

**Rollback:** Chat can be removed; contact_handle reveal remains the load-bearing fallback. Removal would drop the `messages` table and `rate_limit_log` table; no other change.

- [ ] (Sky reviews after Phase 3.3 amendment lands; DFS-J-1 sequencing call is a precondition)
```

---

## CLAUDE.md edits proposed (DO NOT APPLY — Will writes via separate `docs/auto-DATE-will` PR after Sky resolves DFS-J-1)

### Edit C1 — Amend the "MVP scope" decisions-log row

Current row reads:

> | MVP scope | **No in-app chat — claim reveals contact handle** | Ships faster; keeps app out of "messaging" regulatory category; chat is v2 |

Proposed amendment (assumes Sky resolves DFS-J-1 in favor of shipping chat — adjust wording if Sky resolves to never-ship):

> | MVP scope | **No in-app chat in MVP — claim reveals contact handle. Chat ships in Phase 3.3 (DFS-J-1: confirmed by Sky [DATE]).** Chat is ADDITIVE — contact_handle reveal remains. | MVP ships faster on contact_handle; chat adds in v2 per D12. App moves from "marketplace" to "marketplace + messaging" regulatory category at chat ship-time. |

### Edit C2 — Add a new Gotcha after #10

```
### 11. Chat is post-claim only — never browsing-stage

The `messages` table key is `claim_id` (= `resources.id`). There is no chat without a claim. The chat screen is only reachable from ResourceDetailScreen AFTER a successful claim. There is no pre-claim chat surface; no nav link, no deep link, no menu item. The RLS policy on `messages` enforces this server-side: a query against `messages WHERE claim_id = <any_uuid>` returns zero rows unless the caller is a participant in that claim (poster or claimant of the resource). Admins do NOT have a special read policy.

Implementation rules:
- The chat screen (`ChatScreen`) accepts ONE param: `claim_id`. It verifies via AuthProvider + a helper that the current user is the poster OR claimant of that claim_id; otherwise it errors and pops back.
- The Realtime channel name is the claim_id UUID — opaque. NEVER add the handle, the resource name, or any free-text to the channel name. (Privacy invariant; would leak metadata to passive Realtime observers.)
- `messages.body` is read in exactly ONE place: the participant-scoped SELECT inside the ChatScreen's Realtime subscription helper. NEVER console.log message body. NEVER pass message body to the push Edge Function. NEVER serialize message body to AsyncStorage.
- No file/image/voice attachments. Text only. Forever.

If chat is removed in a future version, the contact_handle reveal (D2) remains the fallback. Chat can be added or removed without breaking existing flows.
```

### Edit C3 — Extend the "Push preferences are opt-in forever" Gotcha (proposed in push review BLOCKING 4.1)

The push review BLOCKING 4.1 proposed a Gotcha. Extend its body to explicitly list `chat_message` as a protected trigger:

> "...The protected push trigger keys are: `claim_placed`, `pickup_confirmed`, `admin_approved`, `admin_rejected`, `chat_message`. Any migration that touches any of these must be reviewed by Jordan + Sky and may not flip any preference from OFF to ON without explicit user re-consent."

---

## Spec edits proposed (DO NOT APPLY — Quinn writes via separate `product/auto-DATE-quinn` PR if Sky resolves to ship)

### Spec edit S1 — Add to "Out of scope for Phase 3.3 (Chat)" section

Add three NEVER-ship lines (Advisory 9 above):

- **AI translation of chat content.** NEVER ship. Third-party AI service is a data-egress surface per PRIVACY.md D8.
- **AI summarization / smart-reply on chat content.** NEVER ship. Same reason.
- **Per-message AI moderation.** NEVER ship. Admins do not read chat content (AC-2); a third-party AI doing so for them is the same privacy violation via different route.

### Spec edit S2 — Strengthen AC-4 with rate_limit_log scope

Append to AC-4: "The `rate_limit_log.operation` column is constrained to a fixed enum (`CHECK (operation IN ('send_message', ...))`); no RPC may pass a user-controlled string for the operation argument. Defense in depth against accidental PII leak through the log."

### Spec edit S3 — Strengthen AC-6 with explicit body-null assertion

Append to AC-6 (sentinel-replace path): "The integration test asserts that, after `delete_my_account()`, no row in `messages` contains the deleted user's original UUID anywhere AND no row sent by the deleted user contains any body text. Both invariants are checked."

---

## What this review does NOT cover

- The cryptographic correctness of Supabase Realtime TLS (platform-default; out of scope).
- The Edge Function's deployment / key management (Steve's security review covers).
- The render-perf impact of the FlatList chat (Peter's perf review covers).
- The exact wording of the empty-state / closed-state / deleted-message copy (Casey + Will collaborate; Jordan re-reviews at design-review).
- The translation of the chat UI strings into French / Spanish (Phase 3.4 i18n spec).
- A real Canadian privacy lawyer's PIPEDA analysis (Cycle 7 ship-readiness per PRIVACY.md D10; especially load-bearing given the regulatory category change).
- The actual Sky-approval gate for the regulatory category change (Sky personally signs off — that's the spec's "Sky's EXPLICIT approval is required before merge" gate, not Jordan's verdict).
- The cross-impact with the future Report & Block flow (Tier-1 #3) — spec line 688 notes this is TBD; Jordan re-reviews when the Report spec lands.

---

## Summary table

| #   | Topic                                                     | Verdict                                                                      | Blocking?                     |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| 1   | RLS adversarial test coverage on messages (AC-2)          | Address via 3 mandatory test cases + claim-canceled + resource-deleted cases | BLOCKING (1.1, 1.2, 1.3)      |
| 2   | delete_my_account() extension + PRIVACY.md D6 amendment   | Address via integration test + PRIVACY.md amendment landing first            | BLOCKING (2.1, 2.2, 2.3)      |
| 3   | Message content excluded from all logs (D8 + AC-15)       | Address via console.log lint + Steve code-review checklist                   | BLOCKING (3.1, 3.2)           |
| 4   | Push trigger chat_message inherits push review BLOCKING 4 | Carries forward from phase-3-jordan-review-push.md                           | BLOCKING (4.1, 4.2, 4.3, 4.4) |
| 5   | rate_limit_log privacy properties (AC-3)                  | Address via hourly prune + enum CHECK constraint                             | BLOCKING (5.1, 5.2)           |
| A1  | Realtime channel name documentation                       | JSDoc invariant comment                                                      | NO                            |
| A2  | Message body length cap (DFS-5)                           | Support 1000 char default                                                    | NO                            |
| A3  | Read receipts (DFS-2)                                     | Support no-receipts in v1                                                    | NO                            |
| A4  | Typing indicators (AC-9 / DFS-2)                          | Support no-indicators in v1                                                  | NO                            |
| A5  | Active-chat push suppression (DFS-6)                      | Accept presence trade-off; document                                          | NO                            |
| A6  | Delete-my-message RPC (DFS-8)                             | Support new RPC                                                              | NO                            |
| A7  | Empty-state privacy disclosure (AC-14)                    | Add chat-input disclosure line                                               | NO                            |
| A8  | Closed-chat read-only window (AC-8)                       | Approved as designed                                                         | NO                            |
| A9  | No AI translation/summarization on chat content           | Add NEVER-ship lines to spec                                                 | NO                            |
| A10 | Mutual Mesh brand not translated                          | Reaffirm push review's brand rule                                            | NO                            |

**BLOCKER count: 5 clusters (1.1–1.3, 2.1–2.3, 3.1–3.2, 4.1–4.4, 5.1–5.2 = 14 sub-conditions total).**
**PRIVACY.md edits proposed: 6 (1 new chat subsection + 5 inventory rows + D2 chat addendum + D6 refinement + Fields-NOT-collected line + new D12 decision = grouped as Edits 6–11 to continue numbering from push review).**
**CLAUDE.md edits proposed: 3 (decisions-log row amendment + new Gotcha #11 + push-Gotcha trigger-list extension).**
**Spec edits proposed: 3 (NEVER-ship AI lines + AC-4 rate_limit_log enum + AC-6 body-null assertion).**
**DECISIONS FOR SKY: 4 (DFS-J-1 sequencing, DFS-J-2 PRIVACY.md timing, DFS-J-3 confirm sentinel-replace, DFS-J-4 push-opt-out behavior).**

---

## Final verdict

**APPROVED_WITH_CONDITIONS** — Jordan's privacy-only verdict on the proposed design.

This verdict does NOT supplant the spec's own "Sky's EXPLICIT approval is required before merge" gate. Two independent gates remain open after this review:

1. **Sky's pre-merge approval** for the regulatory category change (CLAUDE.md decisions-log row, app-store classification, PRIVACY.md amendment text) — Sky personally, via Morgan briefing. Not Jordan's call.
2. **Sky's DFS-J-1 sequencing call** — Phase 3.3 NOW vs Phase 4 vs Phase 5 post-launch vs never. Quinn and Jordan both recommend (c) Phase 5 post-launch; the call is Sky's. Not Jordan's.

If Sky resolves both gates in favor of shipping in some Phase, Jordan's privacy conditions (BLOCKING 1–5) become precondition work for that Phase's build. None of the conditions are inherently hard; all are testable; all parallel existing patterns (RLS adversarial tests already exist for resources + users; delete-account trace tests already exist; rate-limit table is novel but small; PRIVACY.md amendments are documentation work).

---

**Jordan — 2026-05-24** — file-only privacy review, no PRIVACY.md modification, no code touched, no external side effects, no message to Sky (Morgan owns that channel per Constitution Art. 9).
