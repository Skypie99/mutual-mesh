# Spec: Phase 3 — In-app Chat (post-claim only) — Quinn — 2026-05-24

## Summary

Phase 3 Tier 3 Feature #18 adds **in-app chat scoped to a single claim, between exactly two parties (poster + claimant)**, that opens ONLY after `claim_resource()` succeeds — never during browsing. Chat is additive to the existing `contact_handle` reveal, not a replacement: claimants still see the poster's chosen contact handle on claim (Signal/Proton/etc.), AND can choose to use the in-app chat thread for coordination. The handle reveal remains the load-bearing "go talk on Signal" fallback for users who prefer their existing trusted channels.

The single load-bearing rule: **chat opens ONLY after `claim_resource()` succeeds and is scoped to that claim_id.** Browsing users cannot enumerate, initiate, or read any chat. The `messages` table's RLS scopes every row to claim_id participants only. This is the post-claim privacy boundary — the moment of claim is when the two parties consent to a coordination channel.

**Scope:** New schema (`messages` table) + new RPC (`send_message`) + realtime per-claim channel + new screen (`ChatScreen`) + push integration (Phase 3.1 dependency) + cleanup-on-completion + account-delete cascade. **Largest surface area in Phase 3** — touches schema, RPC, realtime, push, and a new screen.

**Estimated effort:** 4 build days + 2 hardening days. ~7-8 PRs across Shamus (screen + helper), Dana (schema + RPC + realtime), Jordan (FULL privacy review — new messaging surface), Steve (FULL security review — new attack surface), Alex (a11y on new screen), Gary (tests). **Per Constitution Art. 7.6 and the per-spec rule in this project, Sky's EXPLICIT approval is required before merge** (regulatory category change per the CLAUDE.md decisions log: "MVP scope — No in-app chat — claim reveals contact handle — Ships faster; keeps app out of 'messaging' regulatory category; chat is v2"). v2 is now Phase 3.3; Sky has greenlit but the merge gate is explicit.

**RECOMMEND: Ship AFTER TestFlight launch, not before.** Chat is the highest-risk feature in Phase 3 and changes the app's regulatory category (no longer "marketplace only"; now includes "messaging"). Launching it post-TestFlight isolates launch-blocker triage from chat-specific issues. Quinn's recommendation: sequence chat to Phase 4 (launch infrastructure) or Phase 5 (post-launch), not Phase 3.3 as the plan currently has it. **This sequencing is itself a Sky decision** (DFS-1).

**READY pending Sky decisions on DFS items + explicit pre-merge approval per Const. Art. 7.6.** PRIVACY.md D2 (per-resource contact handle replaces in-app chat AND phone) becomes the rollback safety net — if chat ever proves problematic, the contact_handle path is the documented fallback (Jordan D2: "Chat can be added as v2 without changing existing data" — and conversely, chat can be REMOVED in v3 without breaking existing flows).

## User story

> _As Mara (claimant), after I claim a tin of formula, I want to coordinate pickup with the poster WITHOUT giving them my Signal handle if they happen to be someone I don't fully trust. The in-app chat lets me say "M5V park bench, Tuesday 2pm" and then forget the whole thing exists when I delete my account. The contact_handle is still visible too — I can choose._

> _As Deb (poster), when someone claims one of my community-fridge items, I get a fast in-app way to confirm "yes, it's still in the bike room" without my phone number ever entering the conversation. The chat thread closes on pickup confirmation; nothing lingers._

> _As Keo (organizer), chat is OPTIONAL. I can claim a resource, look at the contact_handle, and use the Signal handle the poster provided. The chat thread is still scoped to my claim — I never see chats from any other pair, and nobody sees mine. The realtime channel name does NOT reveal who I'm talking to._

> _As a privacy-conscious user, when I delete my account, ALL my chat messages disappear from the database (cascade per PRIVACY.md D6). My counterparty's view of those messages shows "(message from a deleted user)" — preserving the conversation context they may need but never re-revealing my data._

> _As an attacker who's pre-claim browsing, the chat surface does NOT EXIST for me. I cannot enumerate threads, cannot create one, cannot read one. The chat tables return zero rows for any non-participant query, including admin queries._

## Personas served

- **Mara (recipient)** — primary beneficiary. The chat gives her a coordination channel without disclosing her Signal handle to a poster she's only mildly comfortable with. She can still see the poster's contact_handle as a fallback. Her anti-goal #4 ("anyone — even verification admins — knowing what she's claimed") is preserved: admins do NOT see chat content, and chat is scoped to a single claim, not a profile.
- **Keo (organizer)** — load-bearing CONSTRAINT. Chat is OPT-IN even after claim (Keo can ignore it and use the contact_handle); chat NEVER triggers a push notification unless the recipient has opted in to the push trigger (Phase 3.1 dependency); the realtime channel name is opaque (claim_id, not handle).
- **Deb (poster)** — secondary beneficiary. Chat reduces the "exchange friction" Casey measures in `community/growth-strategy.md` (her #1 metric: successful exchanges/week). Without chat, every claim depends on the claimant reaching out via the poster's chosen external channel; with chat, the in-app path is one tap away.
- **Casey's Tier-1 community admins** — indirectly: faster pickup coordination → more successful exchanges → growth metric improves. Casey's seeding mechanic depends on the exchange-success rate.

## Why now

Per `~/.claude/plans/goofy-singing-steele.md` Phase 3 Sub-3.3 (Days 38-43) and Tier 3 #18: **"Currently claim reveals contact_handle. Chat replaces the 'go talk on Signal' step — but only post-claim, never browsing-stage."** Chat is sequenced THIRD in Phase 3 (after push + map) for several reasons:

1. **Push is required for chat to work.** A chat message that doesn't notify the recipient (when they're not on the chat screen) is invisible — they'll see it next time they open the app, by which point coordination might be moot. Push (Phase 3.1) MUST land first so chat plugs into the same `deliver_notification` Edge Function for the new "new message in your claim" trigger.
2. **Highest privacy + security risk.** A messaging surface is a regulatory category change (chat = messaging app per Apple/Google app-store classification), changes the threat model (now we have user-to-user content), and adds the largest new attack surface in Phase 3. Sequencing it AFTER push and map (which are smaller-surface) means push + map are stable and proven before this lands.
3. **Sky approval gate is explicit.** Per CLAUDE.md decisions log, the MVP explicitly excluded chat. Re-enabling it requires Sky's EXPLICIT approval. This spec is the artifact Sky uses to make that decision.

The growth-strategy 90-day target — **30-60 successful exchanges per week** — sees coordination friction as the biggest drop-off point. Successful exchanges drop when a claimant claims but can't quickly reach the poster (the poster's contact_handle is Signal, claimant doesn't use Signal, claimant gives up). Chat closes that loop. But: the privacy + security cost is real. Quinn's view: **ship chat AFTER TestFlight launch is stable**, so chat is an add-value upgrade, not a launch-blocking risk.

## Acceptance criteria

### AC-1: Chat opens ONLY after `claim_resource()` succeeds (load-bearing — privacy boundary)

- Chat threads are created automatically by the `claim_resource()` RPC on success. The `messages` table key is `claim_id` (= `resources.id`); there's no chat without a claim.
- The chat screen route (`ChatScreen`) accepts ONE param: `claim_id`. The screen verifies via the existing AuthProvider + a new helper that the current user is EITHER the poster OR the claimant of that claim_id; otherwise it shows an error and pops back.
- Pre-claim navigation to `ChatScreen` is impossible from any UI surface — no nav link, no deep link, no menu item. The screen is only reachable from `ResourceDetailScreen` AFTER a successful claim.
- The `messages` table's RLS policy (Section 5) GUARANTEES that even if a user crafts a Supabase query against `messages WHERE claim_id = <some_uuid>`, they get zero rows unless they're a participant in that claim.
- Verified by Steve in RLS test pass + manual smoke test (anonymous query, unverified query, verified-non-participant query).

### AC-2: RLS scoped to claim participants (load-bearing — defense in depth)

- The `messages` table has RLS policies that allow SELECT/INSERT only when `auth.uid()` is one of:
  - The poster of the claim's resource (`resources.posted_by = auth.uid()`)
  - The claimant of the claim's resource (`resources.claimed_by = auth.uid()`)
- The policy joins to `public.resources` via `claim_id`. If the resource is deleted, or if `claimed_by` is reset to NULL (claim canceled), the policy returns false → zero rows for everyone except the poster (until a new claim).
- Admins do NOT have a special "read all chats" policy. Their `is_admin = true` does not grant message visibility. This is the explicit data-minimum extension of PRIVACY.md D6.
- An admin who ALSO happens to be a participant in a specific claim (e.g., the admin's own claim) can read their own chat — same as any user.
- Verified by Steve in RLS test pass (admin role + non-participant + participant tests).

### AC-3: Rate-limited send (load-bearing — anti-flood)

- `send_message(claim_id, body)` RPC checks a per-user rate limit: **30 messages per minute per user**, across all chats (not per-chat).
- Rate limit is enforced server-side via a `rate_limit_log` table tracking `(user_id, operation, count, window_start)`. The RPC raises `'Rate limited'` on excess.
- Client surfaces `'Rate limited'` as a FlashBanner: `"You're sending too fast. Try again in a minute."`
- The rate limit is intentionally generous — chat is for coordination, not bots — but a malicious participant can't spam-DOS the other party.
- Verified by Steve in integration test (send 31 messages in 60s; 31st fails).

### AC-4: Encryption-at-rest required (Supabase default acceptable)

- `messages.body` is stored at rest using Supabase's default Postgres encryption (Supabase manages disk-level encryption per their platform docs).
- End-to-end encryption (E2EE) is NOT in v1 (DFS-3). The trade-off: E2EE prevents server-side recovery of messages, breaks `delete_my_account` cleanup completeness, requires client-side key management we'd need extensive crypto review for. Supabase-managed disk encryption is the minimum bar.
- The privacy policy and PRIVACY.md will be updated to disclose: "Chat messages are encrypted in transit (TLS) and at rest at the disk level. They are NOT end-to-end encrypted; the server can technically read them. We do not query message bodies from the application code outside the RPC the chat screen uses."
- Steve verifies: no application code (cron jobs, Edge Functions, admin tools) reads `messages.body` outside the participant-scoped query.

### AC-5: User can delete their own messages

- Each message renders with a long-press action menu (or swipe — Dani picks) offering "Delete this message" for messages sent by the current user.
- Deleting a message UPDATEs the row: sets `body = NULL` and `deleted_at = now()`. The row is NOT hard-deleted (preserves the conversation flow for the counterparty).
- The counterparty sees the message replaced with "(message deleted)" in italics.
- The original `body` is NOT recoverable from the live tables. (Backup retention applies per PRIVACY.md D6 — 7-day PITR window.)
- Verified by component test + manual test.

### AC-6: Chat history deleted on account-delete (PRIVACY.md D6)

- `delete_my_account()` (existing RPC) is extended to: DELETE all rows in `messages WHERE sender_id = auth.uid()` for messages the deleting user sent.
- Messages the deleting user RECEIVED are kept (the counterparty's view) but their `sender_id` is set to a sentinel value (`'00000000-0000-0000-0000-000000000000'::uuid` or a special "deleted_user" UUID — DFS-4) so the counterparty sees "(message from a deleted user)" instead of a stale handle reference.
- Alternative (DFS-4): hard-delete BOTH sides' messages on account delete (clean slate, breaks conversation context).
- Verified by Steve in `delete_account.sql` extension; the existing trace test is extended to assert zero rows from `messages WHERE sender_id = <deleted_uuid>`.

### AC-7: Push notification on new message (depends on Phase 3.1)

- When a user sends a message via `send_message`, the RPC fires `deliver_notification(trigger='chat_message', recipient_id=<other_party>)`.
- The Phase 3.1 spec's `push_preferences` JSONB gets a new key `chat_message` (default false). Adding this key to existing users is handled by the migration in this spec.
- Per Phase 3.1 AC-2 (title-only), the notification reads `"You have a new message"` — NO sender handle, NO message body, NO claim_id, NO resource name.
- Tapping the notification deep-links to ChatScreen with the right `claim_id` (Phase 3.1 AC-10 routing).
- If the recipient is currently ACTIVE on ChatScreen for that claim_id (foreground + same screen), suppress the push (Edge Function checks a `last_active_chat_claim` field or similar lightweight presence — DFS-6).

### AC-8: 30-day archive after pickup confirmed (mirrors resource retention D7)

- When the resource's `status` flips to `'completed'` (pickup confirmed per Phase 2), the chat thread enters a READ-ONLY window.
- For 7 days post-completion, the chat is readable but no new messages can be sent. The `ChatScreen` shows a disabled input with copy: `"This pickup is complete. Chat is closed."`
- After 30 days (mirroring PRIVACY.md D7 resource retention), `prune_expired_resources()` (existing cron) is extended to also DELETE all `messages` for completed claims older than 30 days. Chat threads cascade-disappear with the resource row.
- Verified by Steve in the cron-extension test + manual time-shift test on staging.

### AC-9: Reduce motion respected (no animated typing indicators)

- The user's `useReducedMotion` preference (existing helper) controls chat UI animations:
  - When ON: no typing indicator dots animation, no "message arrived" slide-in, no animated send button.
  - When OFF: subtle animations on send / receive (≤300ms).
- Typing indicators themselves: DFS-2 covers whether to ship them at all. Quinn's recommendation: NO typing indicators in v1 (Keo's threat model: "I don't want my counterparty to know exactly when I'm composing a thought"). Default: no typing indicators.
- Verified by Alex in manual test with reduce-motion enabled.

### AC-10: contact_handle reveal STILL HAPPENS — chat is additive (load-bearing)

- The existing ResourceDetailScreen behavior of revealing `contact_handle` on successful claim is UNCHANGED.
- After claim, the user sees:
  - The `contact_handle` (Signal handle, etc.) the poster typed (existing).
  - **AND** a new button "Open chat" that opens the in-app ChatScreen.
- The user can use EITHER channel — the poster's chosen external (contact_handle) OR the in-app (chat). The choice is the claimant's.
- Removing the `contact_handle` reveal would be a regression (breaks users on Signal who never want to use in-app chat); keeping both is the additive design.
- Verified by manual test + a regression test that the contact_handle reveal still appears post-claim.

### AC-11: Realtime channel cleanup on screen unmount

- ChatScreen subscribes to a per-claim realtime channel (`messages` table filtered by `claim_id`).
- Channel name does NOT include the user's handle or any identifying info — only the claim_id (a UUID).
- On screen unmount (navigate away, app background), the channel is explicitly unsubscribed (mounted-ref pattern per CLAUDE.md gotcha #5).
- Per Peter's Phase 1 perf audit: total active channels ≤2 per client. The chat channel is opened only while the user is on ChatScreen.
- A poster with multiple active claims does NOT subscribe to all of them simultaneously — they subscribe one at a time as they open each ChatScreen.
- Verified by Peter in a manual channel-count test.

### AC-12: NO file/image/voice attachments (load-bearing — privacy + safety)

- Messages are TEXT ONLY. No image attachments, no file uploads, no voice messages, no link previews.
- The `messages.body` column is TEXT with a length cap (DFS-5 — recommend 1000 chars; matches "coordination" use case, not "conversation").
- Image attachments would multiply the EXIF / photo-storage attack surface (PRIVACY.md D5 — current strip is for resource photos only) and create a new content-moderation surface we're not prepared to staff.
- Voice messages add automatic-transcription pressure (third-party) and audio-storage retention questions.
- File uploads add malware vectors.
- All of these are FOREVER out of scope. Re-evaluate at v3 with a separate spec each.

### AC-13: Sender / receiver clarity in UI

- Messages are visually distinct between "you" and "the other person" (bubble alignment, color tinting per Dani's chat design).
- The other person's handle is shown ONCE at the top of the screen (e.g., `"Chat with brave-otter-1234"`) — NOT next to every message.
- Hiding the handle per-message reduces visual clutter and respects the "handle as identifier" minimalism in the rest of the app.
- Verified in design review with Dani.

### AC-14: Empty chat state

- A freshly-opened ChatScreen (just after claim, before any messages) renders an EmptyState:
  - Title: `"Start coordinating"`
  - Description: `"Send a message to <handle> to arrange pickup. The contact handle they shared is also above."`
  - No CTA button (the text input is already focused).
- Reuses the existing `EmptyState` component pattern.

### AC-15: Error handling consistent with rest of app

- All `send_message` failures route through `userFacingErrorMessage()` from `src/lib/errors.ts` (no JWT/URL/PGRST internals leak to UI).
- Network failure: message stays in the input, user can retry (no auto-retry — would surprise on intermittent connectivity).
- Rate limit: FlashBanner shows the retry-after message.
- Forbidden (not a participant): impossible by UI design, but if hit, navigate to Home + log to error helper.

## Screens / layout

One new screen + extensions to two existing screens.

### Surface 1: ResourceDetailScreen (extended)

After claim, in addition to the existing contact_handle reveal:

```
┌──────────────────────────────────────────┐
│  ←  Hypoallergenic formula                │
│                                          │
│  ...                                     │   <- existing claimed-by-you content
│                                          │
│  Contact: @brave-otter on Signal         │   <- existing contact_handle reveal
│                                          │
│  ┌────────────────────────────────────┐  │
│  │       Open chat with poster         │  │   <- NEW button (primary)
│  └────────────────────────────────────┘  │
│                                          │
│  ...                                     │
└──────────────────────────────────────────┘
```

### Surface 2: ChatScreen (new)

```
┌──────────────────────────────────────────┐
│  ←  Chat with brave-otter-1234            │   <- header: counterparty handle
│                                          │
│  ┌─────────────────────────────────┐    │
│  │ M5V park bench, Tuesday 2pm?    │    │   <- received message (left-aligned)
│  └─────────────────────────────────┘    │
│  9:42 AM                                 │
│                                          │
│       ┌──────────────────────────┐     │
│       │ Sounds good. I'll be     │     │   <- sent message (right-aligned)
│       │ wearing a red jacket.    │     │
│       └──────────────────────────┘     │
│                                  9:43 AM │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │ See you then.                    │    │
│  └─────────────────────────────────┘    │
│  9:43 AM                                 │
│                                          │
├──────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌─────┐      │
│  │ Type a message       │  │Send │      │   <- input + send button
│  └──────────────────────┘  └─────┘      │
└──────────────────────────────────────────┘
```

### Surface 3: ChatScreen — closed state (after pickup confirmation)

```
┌──────────────────────────────────────────┐
│  ←  Chat with brave-otter-1234            │
│                                          │
│  ...                                     │   <- existing messages
│                                          │
│  This pickup is complete. Chat is closed.│   <- disabled state notice
│                                          │
├──────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌─────┐      │
│  │ (disabled)           │  │Send │      │   <- input disabled
│  └──────────────────────┘  └─────┘      │
└──────────────────────────────────────────┘
```

### Surface 4: ChatScreen — deleted message

```
│  ┌─────────────────────────────────┐    │
│  │ (message deleted)               │    │   <- italic gray
│  └─────────────────────────────────┘    │
│  9:42 AM                                 │
```

### Surface 5: ChatScreen — deleted sender (counterparty deleted their account)

```
│  ┌─────────────────────────────────┐    │
│  │ M5V park bench, Tuesday 2pm?   │     │   <- body preserved
│  └─────────────────────────────────┘    │
│  (message from a deleted user) 9:42 AM   │   <- sender attribution replaced
```

### Component reuse map

| Used component                                      | Where                                                     |
| --------------------------------------------------- | --------------------------------------------------------- |
| `Button` (primary)                                  | "Open chat with poster" / "Send"                          |
| `TextField` / `TextInput`                           | Message composer                                          |
| `EmptyState`                                        | Brand new chat                                            |
| `FlashBanner`                                       | Rate-limit notice / network errors                        |
| `Card` (or new `MessageBubble`)                     | Per-message render — Shamus + Dani decide                  |
| `LoadingSkeleton`                                   | Initial chat-load placeholder                             |

New components: `MessageBubble` (likely) — Shamus files a `qa-reports/feature-messagebubble.md` proposal with Dani before building (left-aligned vs right-aligned, color tinting, deleted-state rendering, timestamp positioning).

## Data view (Jordan privacy gate — FULL review required + Sky explicit approval)

This section is privacy-load-bearing and gates merge. Per Constitution Art. 7.6 (privacy review mandatory for marginalized-group + location data) AND per CLAUDE.md decisions log (chat is a regulatory category change), Sky's EXPLICIT pre-merge approval is required IN ADDITION to Jordan's review.

### New table: `public.messages`

```sql
CREATE TABLE public.messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL,
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  CHECK (length(body) <= 1000),
  CHECK ((body IS NOT NULL AND deleted_at IS NULL) OR (body IS NULL AND deleted_at IS NOT NULL))
);

CREATE INDEX messages_claim_id_created_at_idx ON public.messages (claim_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Participants of the claim's resource can SELECT
CREATE POLICY messages_participant_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.resources r
      WHERE r.id = messages.claim_id
        AND (r.posted_by = auth.uid() OR r.claimed_by = auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policies — only security-definer RPCs write rows
-- (mirrors verification_log + push_tokens pattern)
```

**Note on `sender_id`:** Intentionally NOT a foreign key to `auth.users(id)` — so the sentinel "deleted user" UUID (DFS-4) is valid without violating FK constraints. The sender's identity is resolved client-side via the existing `public.users` query (which is itself RLS-scoped).

### New column on `public.users`: extend `push_preferences` JSONB

Add the `chat_message` key (Phase 3.1 dependency):

```sql
UPDATE public.users
SET push_preferences = push_preferences || '{"chat_message": false}'::jsonb
WHERE NOT (push_preferences ? 'chat_message');

-- And update the column default
ALTER TABLE public.users
  ALTER COLUMN push_preferences SET DEFAULT '{
    "claim_placed": false,
    "pickup_confirmed": false,
    "admin_approved": false,
    "admin_rejected": false,
    "chat_message": false
  }'::jsonb;
```

### Cascade through `delete_my_account()` and through resource deletion

- `messages.claim_id` has `ON DELETE CASCADE` referencing `public.resources(id)`. When a resource is deleted (e.g., by `prune_expired_resources()`), all its messages disappear in the same transaction.
- `delete_my_account()` (existing) is extended to:
  1. UPDATE messages SET sender_id = '00000000-0000-0000-0000-000000000000', body = NULL, deleted_at = now() WHERE sender_id = auth.uid() (sentinel-replace; counterparty sees "(message from a deleted user)").
  2. Existing cascade through resources → cascade-deletes claim threads for resources the user posted.
- DFS-4 lets Sky choose between sentinel-replace (above) and hard-delete (cleaner but breaks counterparty's conversation context).

### `rate_limit_log` table (Steve's anti-flood mechanism)

```sql
CREATE TABLE public.rate_limit_log (
  user_id      UUID NOT NULL,
  operation    TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', now()),
  count        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, operation, window_start)
);

CREATE INDEX rate_limit_log_window_idx ON public.rate_limit_log (window_start);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
-- No client policies; service-role only (RPCs write)

-- Periodic prune (extend prune_expired_resources or a new cron):
-- DELETE FROM rate_limit_log WHERE window_start < now() - interval '1 hour';
```

### What is INTENTIONALLY excluded

| Field                                       | Why excluded                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Attachments (images, files, voice)          | AC-12 — out of scope forever.                                                                  |
| Per-message location coordinates            | Never collected.                                                                                |
| Link previews / URL unfurling               | Out of scope; would add third-party fetch surface.                                              |
| Reactions (emoji, like)                     | Out of scope for v1; UX bloat for a coordination tool.                                          |
| Threading / replies                         | Out of scope; chat is linear coordination, not Slack.                                           |
| Group chats (more than 2 participants)      | Out of scope; the post-claim contract is 1:1 (poster + claimant).                              |
| Encryption keys per user                    | E2EE deferred to v2 with full crypto review (DFS-3).                                            |
| Cross-claim message search                  | Out of scope; the user can scroll the per-claim chat.                                          |
| Admin moderation tools                      | Out of scope; admins do not read chat content (Section 5 AC-2).                                |
| Message editing                             | Out of scope for v1; delete-and-resend is the workaround. Re-evaluate post-launch.             |

### The `read_at` column

`read_at` is set by the recipient's client when they scroll past the message on ChatScreen. This is the "read receipts" feature — DFS-2 covers whether to ship it. Default: ship read receipts (the column is in the schema either way; the client just doesn't display the receipt UI if DFS-2 says no).

## RPC contracts

One new RPC + extensions to existing RPCs.

### `send_message(claim_id UUID, body TEXT) RETURNS UUID`

**Authorization:** Requires `auth.uid()`. Caller must be the poster OR claimant of the claim_id's resource (server-side check; mirrors the SELECT policy).

**Client call:**

```ts
const { data, error } = await supabase.rpc('send_message', {
  claim_id: claimId,
  body: messageText,
});
```

**Response shape:**
- `data: <message_id_uuid>` on success.
- `error: PostgrestError` on failure. Known error.message values:
  - `"Not authenticated"` — session expired.
  - `"Forbidden: not a participant"` — caller is neither poster nor claimant of this claim.
  - `"Rate limited"` — 30/min/user exceeded; retry after 60s.
  - `"Empty body"` — body is empty or only whitespace.
  - `"Body too long"` — body exceeds 1000 chars (also enforced by CHECK constraint).
  - `"Chat closed"` — claim status is 'completed' and the 7-day post-completion window has passed.
- Any other error → `userFacingErrorMessage()` ("Couldn't send. Please try again.").

**Side effects (atomic within the RPC transaction):**

1. Verify caller is poster OR claimant of the claim_id resource. Otherwise raise `'Forbidden'`.
2. Verify rate limit not exceeded; otherwise raise `'Rate limited'`.
3. Verify resource status is NOT 'completed' for >7 days; otherwise raise `'Chat closed'`.
4. INSERT into `public.messages` with `(claim_id, auth.uid(), body, now(), NULL, NULL)`.
5. UPSERT into `public.rate_limit_log` (increment count for this minute).
6. Fire-and-forget call to `deliver_notification(trigger='chat_message', recipient_id=<other_party>)` (Phase 3.1).
7. Realtime publishes the INSERT event on `messages` filtered by claim_id; counterparty's subscription receives it.

### Extension: `claim_resource(resource_id UUID) RETURNS BOOLEAN`

Existing RPC. Extension: on success, NO direct message creation — the chat thread is empty until the first `send_message`. This is intentional: a claim doesn't auto-send a message; the user types whatever they want first.

### Extension: `delete_my_account() RETURNS BOOLEAN`

Existing RPC. Extension per AC-6 (sentinel-replace OR hard-delete per DFS-4):

```sql
-- Sentinel-replace path (DFS-4 default):
UPDATE public.messages
SET sender_id = '00000000-0000-0000-0000-000000000000',
    body = NULL,
    deleted_at = now()
WHERE sender_id = auth.uid();

-- Hard-delete path (DFS-4 alternative):
DELETE FROM public.messages WHERE sender_id = auth.uid();
```

Then the existing cascade (resources → cascade-deletes messages for those resources' claim_ids) takes care of the rest.

### Extension: `prune_expired_resources() RETURNS VOID`

Existing nightly cron RPC. Extension: also DELETE messages for resources with `status = 'completed' AND status_changed_at < now() - interval '30 days'`. This happens AS PART OF the existing cascade since `messages.claim_id` references `resources.id ON DELETE CASCADE`.

### Edge Function: `deliver_notification` (Phase 3.1 — extended)

Per Phase 3.1 AC-2: title-only. Add the fifth trigger:

- Trigger 5 (chat_message): `"You have a new message"` — NO sender handle, NO body, NO claim_id.

Per AC-7 here: if the recipient is currently ACTIVE on ChatScreen for the same claim_id, suppress the push (DFS-6).

### Error mapping (for `userFacingErrorMessage` consumption)

| `error.message`                       | User-facing message                            | Recovery                             |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `"Not authenticated"`                 | `"Your session ended. Please sign in again."`  | Sign out + route to SignIn           |
| `"Forbidden: not a participant"`      | `"You're not part of this conversation."`     | Pop to Home                          |
| `"Rate limited"`                      | `"You're sending too fast. Try again in a minute."` | FlashBanner; input stays         |
| `"Empty body"`                        | (silent — Send button is disabled anyway)      | UI prevents                          |
| `"Body too long"`                     | `"Message is too long. Trim to 1000 characters."` | Counter on input                  |
| `"Chat closed"`                       | `"This chat is closed because pickup is complete."` | Input disabled                  |
| Network / 5xx                         | `"Couldn't reach the server. Try again."`     | Retry; input stays                   |
| Anything else                         | `"Something went wrong. Please try again."`   | Generic                              |

## Tests (Gary writes)

### Unit tests (pure helpers in `src/lib/chat.ts`)

The helper file exposes:

- `applyMessageDelta(state, event)` — pure merge function for realtime subscription. Mirror of `applyResourceDelta` pattern. Table-driven test for INSERT / UPDATE (deleted_at) / DELETE / no-op events.
- `formatMessageForDisplay(message, currentUserId, counterpartyHandle)` — pure formatter that returns the bubble's rendered shape: `{ side: 'left' | 'right', body: string, timestamp: string, isDeleted: boolean, senderLabel: string | null }`.
- `validateMessageInput(text)` — pure validator returning `{ valid, reason? }` for empty / whitespace-only / too-long / valid.
- `shouldDisplayChatAsClosed(resourceStatus, statusChangedAt)` — pure decision: open / read-only-window / closed.

Each helper gets its own `*.test.ts` file in `src/__tests__/`.

### Component tests

- ChatScreen renders the EmptyState when there are no messages.
- ChatScreen renders sent messages right-aligned and received messages left-aligned.
- Send button is disabled when input is empty.
- Long-press on own message reveals "Delete" action.
- Deleting a message UPDATEs to show "(message deleted)" without removing the row.
- Counterparty's deleted account renders "(message from a deleted user)" attribution.
- Closed-state shows the disabled input + closed copy.
- `accessibilityLabel` on each message bubble includes sender, body, and timestamp.

### Integration tests (RLS + RPC — Steve writes; Gary runs in CI)

These extend `supabase/__tests__/rls.sql`:

- A non-participant verified user's SELECT on `messages WHERE claim_id = <other_claim>` returns zero rows.
- A non-participant calling `send_message` raises `'Forbidden: not a participant'`.
- An unauthenticated client calling `send_message` raises `'Not authenticated'`.
- A user sending 31 messages in 60s gets `'Rate limited'` on the 31st.
- A user sending an empty body raises `'Empty body'`.
- A user sending a 1001-char body raises `'Body too long'` AND the CHECK constraint catches it as defense in depth.
- After successful `send_message`, exactly one row appears in `messages` and the realtime channel for that claim_id receives the INSERT event.
- The client cannot direct-INSERT into `messages` (no INSERT policy → 401).
- The client cannot direct-UPDATE `messages.deleted_at` (no UPDATE policy → 401); deletion must go through an RPC (DFS-5 covers whether to add a `delete_my_message` RPC).
- After `delete_my_account()`, all messages sent by the deleted user have `sender_id = '00000...0000'` and `body = NULL`.
- After 30+ days post-completion, the prune cron deletes the resource AND cascades to delete the messages.
- An admin (non-participant) querying `messages` returns zero rows.

### Manual smoke test (Sky walks through on staging — Phase 3.3 sync point)

1. Sign in as two test users (Account A poster, Account B claimant) in two different sessions.
2. Account A posts a resource; Account B claims it.
3. Account B sees the contact_handle AND the "Open chat with poster" button on ResourceDetailScreen.
4. Account B taps "Open chat"; ChatScreen opens to the EmptyState.
5. Account B sends "Hi"; Account A's app receives the message in realtime (≤1s).
6. If Account A has `push_preferences.chat_message = true`, a push notification appears on Account A's device with title "You have a new message" and NO body, NO sender handle.
7. Account A sends a reply; Account B sees it.
8. Account B long-presses their own message and selects "Delete"; Account A sees "(message deleted)" replace the body.
9. Account A confirms pickup (Phase 2 RPC); both apps see the chat enter the closed state.
10. Account A tries to send a message; gets "Chat closed" error.
11. Account A deletes their account; Account B sees "(message from a deleted user)" attribution on Account A's prior messages.
12. After 30 days simulated (manual DB time-shift on staging), the prune cron runs; messages for completed claims older than 30 days are gone.
13. With VoiceOver on Account B's device, the ChatScreen reads "Chat with brave-otter-1234, 3 messages"; each message bubble reads sender + body + time.
14. Anonymous query (using Supabase anon key directly) on `messages` returns zero rows for any claim_id.
15. Account C (verified, non-participant) queries `messages WHERE claim_id = <A-B claim>`; returns zero rows.

## A11y (Alex pre-audit notes — Phase 3.3 build)

- **Message bubble accessibility**: each bubble has `accessibilityLabel` including sender label, body, and time (e.g., `"You: M5V park bench, Tuesday 2pm, 9:42 AM"`).
- **Sent vs received distinction**: rely on `accessibilityLabel` ("You: ..." vs "brave-otter-1234: ...") not just visual alignment. Screen-reader users get the same context.
- **Input announcement**: the message input has `accessibilityLabel="Type a message to brave-otter-1234"`.
- **Send button state**: `accessibilityState={{ disabled: !canSend }}`; disabled state announces.
- **Closed-state announcement**: when the chat closes (mid-session via realtime status change), `AccessibilityInfo.announceForAccessibility("This pickup is complete. The chat is now closed.")` runs once.
- **Deleted message announcement**: on receive of a delete-update via realtime, `AccessibilityInfo.announceForAccessibility("A message was deleted.")` runs once.
- **No haptic alerts when reduce-motion is on (AC-9)**: applies to both sender-side animations and recipient-side push haptics (covered in Phase 3.1).
- **Color contrast on sent vs received bubbles**: must hit WCAG 2.2 AA 4.5:1 against backgrounds. Dani designs with this in mind.
- **No typing indicators** (Quinn's recommendation in AC-9 / DFS-2): reduces cognitive load and respects Keo's threat model.
- **Tab order**: input → send → first message → second message → ... → header back button. Logical reading flow.

## Performance considerations (Peter pre-notes)

- Per-claim realtime channel: one channel per active ChatScreen mount. Closes on unmount.
- Total channels per client: chat (1, only when ChatScreen is mounted) + resources (1, always) = 2. Matches Peter's Phase 1 cap.
- Rate limit table cleanup: prune cron extension to prune `rate_limit_log` entries >1 hour old. Otherwise table grows unbounded.
- Message-list rendering: FlatList with `inverted={true}` for chat order; existing `keyExtractor` pattern; `.limit(500)` on the initial load (most chats will be ≤20 messages).
- Optimistic-send UI (DFS-7): if shipped, requires careful state reconciliation when the RPC ultimately fails. Default: NOT optimistic; show a brief spinner on send. Sky picks.
- Cron-extension prune: adds one cascading DELETE per prune run; negligible.
- Push fire-and-forget on every send: bounded by rate limit (30/min/user).

## Privacy considerations (Jordan pre-audit + FULL review + Sky explicit approval)

This is the section that gates merge. Jordan does a FULL review. AND Sky explicitly approves before merge.

1. **The post-claim boundary (AC-1) is the privacy contract.** Chat is a coordination tool for an active claim, NOT a general messaging app. Any drift toward general messaging (e.g., "chat with anyone in your community") goes back through Jordan AND Sky AND a PRIVACY.md amendment.
2. **AC-2 RLS is load-bearing.** A bug in the participant-check would break the privacy promise. Steve's RLS test suite has THREE adversarial tests covering this.
3. **AC-4 (no E2EE in v1)** is a privacy-vs-recovery trade-off. Disclosed honestly in the privacy policy and in-app onboarding. PRIVACY.md is amended.
4. **AC-12 (no attachments)** is privacy + safety. Disclosed in-app under the chat input (`"Text only — no images, files, or voice."`).
5. **The 7-day read-only post-completion window + 30-day prune (AC-8)** mirrors PRIVACY.md D7 for resources. Disclosed.
6. **Account-delete cascade (AC-6) honors PRIVACY.md D6.** The sentinel-replace (DFS-4) preserves counterparty context without re-exposing the deleted user.
7. **The rate_limit_log table (Section 5 + AC-3)** records `(user_id, operation, window_start, count)` only — no message content. Pruned hourly.
8. **Realtime channel name (AC-11) is the claim_id UUID** — no handle, no resource name. An eavesdropper on Supabase Realtime metadata sees opaque UUIDs.
9. **No third-party messaging SDKs.** `package.json` re-audit (PRIVACY.md D8) confirms no Twilio Chat, no SendBird, no Stream Chat, no Pusher Chat. Steve verifies.
10. **The push trigger payload (chat_message) is title-only** (Phase 3.1 AC-2). The push contains no message body or sender attribution.
11. **The "deleted by counterparty" sentinel UUID (DFS-4 default)** does NOT introduce a footprint for the deleted user — the message body is also NULL.
12. **Regulatory category change** — chat moves the app from "marketplace" to "marketplace + messaging." App-store review teams may classify Mutual Mesh differently. Will / Jordan update the privacy policy and ToS pages (Phase 4 #21) to reflect this BEFORE chat ships.

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 3.3 lands. Default behavior in parentheses is what ships if Sky doesn't override. **In addition, Sky must EXPLICITLY pre-approve the merge** per Constitution Art. 7.6 and the regulatory category change.

### DFS-1: Ship in Phase 3.3 OR post-TestFlight?

Quinn's recommendation in the Summary: **ship AFTER TestFlight launch is stable**, not in Phase 3.3 as the expansion plan currently has it. Reasoning:

- Chat is the highest-risk feature in Phase 3.
- Launching it pre-TestFlight conflates launch-blocker triage with chat-specific issues.
- The current `contact_handle` reveal is functional for v1 launch.
- Casey's growth-strategy metric ("successful exchanges per week") can be met with `contact_handle` alone for the first cohort of seed users; chat is an exchange-friction reducer, not a precondition.

**Quinn's proposal:** **Re-sequence chat to Phase 5 (post-launch).** Phase 3.3 ships push + map; chat slides to a post-launch enhancement. This makes the regulatory category change a deliberate post-launch decision rather than a launch-week one.

- [ ] Approve re-sequence to Phase 5 (Quinn's recommendation; CHANGES THE EXPANSION PLAN)
- [ ] Push back — ship in Phase 3.3 as planned
- [ ] Edit — ship in Phase 4 between launch infrastructure work and TestFlight submission

### DFS-2: Read receipts yes/no?

- **(a) Ship read receipts** (the `read_at` column is set when recipient scrolls past). Default for many messaging apps.
- **(b) NO read receipts** (the column is in the schema for future use but the UI never shows them).

**Quinn's proposal:** **(b) NO read receipts in v1.** Keo's threat model: "knowing exactly when my counterparty saw a message is metadata I don't want anyone to have." Read receipts add cognitive pressure to respond and don't help coordination. Re-evaluate if seed communities ask.

- [ ] Approve (b) no read receipts (default; Quinn's recommendation)
- [ ] Edit — (a) ship read receipts
- [ ] Edit — per-user toggle in Profile ("Show read receipts: ON/OFF")

### DFS-3: Encryption-at-rest — Supabase default vs explicit pgcrypto?

- **(a) Supabase default (disk-level encryption managed by Supabase platform).** Messages are encrypted at rest by the platform; we don't manage keys.
- **(b) pgcrypto column-level encryption** (`messages.body BYTEA` encrypted with a server-side key). Adds operational complexity; still not E2EE (server can decrypt).
- **(c) End-to-end encryption (E2EE)** with client-managed keys. Out of scope per AC-4; would require a separate crypto-review spec.

**Quinn's proposal:** **(a) Supabase default.** Adequate for the threat model (the database is privileged); E2EE is a future v3 feature with its own spec. pgcrypto adds operational burden without changing the threat model meaningfully (server can still decrypt either way).

- [ ] Approve (a) Supabase default (Quinn's recommendation)
- [ ] Edit — (b) pgcrypto column-level
- [ ] Edit — (c) E2EE — REJECTED for v1; separate spec required if pursued

### DFS-4: Account-delete behavior — sentinel-replace vs hard-delete?

- **(a) Sentinel-replace: counterparty sees "(message from a deleted user)"** with the body preserved IF body was deleted by the user OR with `body = NULL` if not.
- **(b) Hard-delete: counterparty loses access to the deleted user's messages entirely** (rows removed; conversation has gaps).

Wait — the spec wording in AC-6 actually had `body = NULL` for both paths to be safe. Let me clarify:

- **(a) Sentinel-replace + body NULL: counterparty sees "(message from a deleted user)" with no body**. Cleanest privacy; conversation flow visibly broken at deleted user's bubbles.
- **(b) Hard-delete: rows are gone**. Counterparty's bubbles are missing entirely; surrounding context may not make sense.

**Quinn's proposal:** **(a) sentinel-replace + body NULL.** Preserves the visual "this thread had a third party" context for the counterparty without re-exposing any data. Mara persona: she wants to be able to fully disappear AND not strand the counterparty.

- [ ] Approve (a) sentinel-replace (Quinn's recommendation)
- [ ] Edit — (b) hard-delete (cleaner; breaks counterparty context)

### DFS-5: Message body length cap?

- **(a) 1000 chars** (Quinn's spec default). Generous for coordination; short enough to discourage chat-as-conversation.
- **(b) 280 chars** (matches `pickup_text` cap). Forces brevity.
- **(c) 2000 chars** (more permissive).

**Quinn's proposal:** **(a) 1000 chars.** 280 is too short for coordination needing two paragraphs; 2000 invites long-form chat we're not designed for. Re-tune post-launch.

- [ ] Approve (a) 1000 chars (default)
- [ ] Edit — (b) 280 chars
- [ ] Edit — (c) 2000 chars

### DFS-6: Active-chat suppression of push?

- **(a) Suppress push if recipient is foreground + on ChatScreen for the same claim_id** (requires a lightweight presence signal — DB column or Realtime presence).
- **(b) Always push regardless of active screen** (simpler; users get duplicate notification if they're already looking).

**Quinn's proposal:** **(a) suppress.** UX win without much complexity (a presence column or Realtime presence is small). Otherwise it's annoying to receive a notification for a message you're literally reading.

- [ ] Approve (a) suppress (Quinn's recommendation)
- [ ] Edit — (b) always push

### DFS-7: Optimistic send UI?

- **(a) Show the message in the chat immediately on tap-send; reconcile on RPC response** (faster perceived UX; complex error handling).
- **(b) Spinner on send button until RPC returns** (simpler; small latency visible to user).

**Quinn's proposal:** **(b) spinner.** Optimistic UX is a Slack/iMessage expectation but adds reconciliation bugs. For coordination chat at our scale, spinner is fine.

- [ ] Approve (b) spinner (default)
- [ ] Edit — (a) optimistic

### DFS-8: Delete-my-message RPC vs direct UPDATE?

Per AC-5, deleting a message should set `body = NULL, deleted_at = now()`. Two implementation paths:

- **(a) New RPC `delete_my_message(message_id)` that does the UPDATE** (cleaner; mirrors the no-direct-mutation pattern elsewhere).
- **(b) Allow direct UPDATE via an RLS policy** scoped to `sender_id = auth.uid()` and updates only the `body` and `deleted_at` columns.

**Quinn's proposal:** **(a) new RPC.** Mirrors the pattern of `claim_resource`, `approve_user`, etc. — mutations go through RPCs; tables have no UPDATE policies. Adds one tiny RPC; that's fine.

- [ ] Approve (a) new RPC (Quinn's recommendation)
- [ ] Edit — (b) direct UPDATE with scoped policy

## Out of scope for Phase 3.3 (Chat)

The following are deliberately deferred. Each has a follow-up named.

- **Image attachments.** AC-12. FOREVER out of scope.
- **Voice messages.** AC-12. FOREVER out of scope.
- **File uploads.** AC-12. FOREVER out of scope.
- **Group chats / >2 participants.** AC-12 implicit. Out of scope; revisit if a "group account" feature (expansion plan #12) ships and creates the need.
- **Cross-claim message search.** Out of scope; chat is per-claim only.
- **Reactions / emoji / likes.** Out of scope. Cognitive bloat for coordination.
- **Reply-to-message threading.** Out of scope. Linear chat.
- **Message editing.** Out of scope for v1. Delete-and-resend is the workaround. Re-evaluate.
- **End-to-end encryption.** AC-4 / DFS-3. v2+ with separate spec.
- **Admin moderation tools** (read flagged chats, etc.). NEVER ship. Admins do not read chat content. If a chat needs moderation, the affected party uses the future Report flow (expansion plan Tier-1 #3).
- **Chat from the verification-queue UI.** NEVER ship. Admins do not chat with applicants in-app; that's an explicit anti-pattern.
- **Chat on resources you haven't claimed.** Violates AC-1 boundary. NEVER ship.

## Cross-spec dependencies

- **Phase 3.1 (Push — Spec #1):** REQUIRED FOUNDATION. Chat depends on push for the `chat_message` trigger. This spec adds the trigger to `push_preferences` and reuses the same Edge Function. **Push must ship before chat.**
- **Phase 3.4 (i18n — Spec #4):** Chat introduces new strings ("Open chat with poster", "This pickup is complete. Chat is closed.", "(message deleted)", etc.) that must be in the i18n bundle. If i18n ships before chat, the strings are added in this spec's PR. If chat ships first, i18n PR includes them.
- **Phase 2 (Pickup confirmation — shipped):** The `confirm_pickup()` RPC's success drives the chat's transition to read-only-then-closed state. Existing RPC; no extension needed beyond status field consumption on the chat side.
- **Existing `claim_resource()` RPC:** No change; chat appears post-success automatically because the messages table is keyed on claim_id.
- **Existing `delete_my_account()` RPC:** EXTENDED — adds the sentinel-replace UPDATE per AC-6.
- **Existing `prune_expired_resources()` cron:** EXTENDED — cascade through messages.claim_id ON DELETE CASCADE handles automatic cleanup.
- **NO dependency on Phase 3.2 (Map).** Independent.
- **Tier-1 #3 (Report & Block, sequenced):** If a user reports another via the future report flow, that user's chat threads with the reporter should be... TBD. Out of scope here; the Report spec will handle.

## Definition of done

- All 15 AC pass manually on staging.
- All unit + component tests pass green.
- All RLS integration tests pass green (3 adversarial tests for AC-2 minimum).
- Jordan signs off on Section 5 (data view + payload shape + cascade behavior) — FULL privacy review.
- Steve signs off on the rate limit, the RPC contract, the realtime channel naming, the cascade behavior — FULL security review.
- Alex signs off on the screen-reader experience + reduce-motion + bubble accessibility.
- Dani signs off on the MessageBubble component + the chat aesthetic.
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 8 DECISIONS FOR SKY items (DFS-1 through DFS-8) AND given EXPLICIT pre-merge approval per Constitution Art. 7.6 (regulatory category change documented in CLAUDE.md decisions log).
- Will updates `CLAUDE.md` "Status" line + amends the MVP-scope row in the decisions log to reflect chat shipping + adds the "chat is post-claim only, never browsing" rule to the Gotchas section.
- Will + Jordan amend `PRIVACY.md` to disclose chat's privacy posture (encryption-at-rest level, retention, cascade behavior, no E2EE).
- Casey writes copy for the chat onboarding ("Text only. No images. Closes when pickup is confirmed.").
- Morgan briefing in `qa-reports/phase-3-chat-YYYY-MM-DD.md` summarising what shipped + screenshots from staging + the explicit Sky-approval timestamp.

## Privacy review level

**FULL + EXPLICIT SKY PRE-MERGE APPROVAL** — chat is a regulatory category change AND a new messaging surface AND a new attack surface. Jordan does a FULL PRIVACY.md amendment. Sky personally approves at the Morgan briefing before merge. Per Constitution Art. 7.6 + the CLAUDE.md decisions log entry on chat being explicitly excluded from MVP.

## Sky-decision gates beyond default DFS

1. **DFS-1 (re-sequence to post-launch)** — Quinn recommends sliding chat from Phase 3.3 to Phase 5. Sky decides.
2. **Regulatory category change** — Sky personally signs off on changing the app-store classification implication.
3. **PRIVACY.md amendment** — Jordan drafts; Sky approves the amendment text.
4. **CLAUDE.md decisions log amendment** — the MVP-scope row says "No in-app chat — claim reveals contact handle." Re-enabling chat requires updating that row with Sky's intent.
5. **Tier-1 partner-network notification** — Casey notifies the seeded communities (via existing Signal/Telegram channels) that chat is coming + asks for feedback. Sky approves the notification copy.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
