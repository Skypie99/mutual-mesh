# Spec: Phase 2 — Onboarding Tour (first-run) — Quinn — 2026-05-24

## Summary

Phase 2 ships a one-time 3-screen onboarding tour for newly-verified users. The tour explains the three load-bearing concepts of Mutual Mesh — (a) the privacy gate ("you're verified, but you can leave any time via Profile"), (b) the handle system ("your handle IS your name here"), (c) the claim model ("claiming reveals the poster's chosen contact handle and notifies them") — in under 60 seconds. After the tour, `users.onboarding_complete = true` and the user lands on HomeScreen. The tour never reappears unless the user explicitly chooses to re-open it from Profile.

This addresses Riley's friction #1 ("empty marketplace in early days") and friction #4 ("first-time-user confusion about how claims work"). Reduces the time from verified-and-confused to verified-and-oriented.

**Scope:** schema change (one boolean on `users`) + one new screen (`OnboardingTourScreen`) + one new RPC (`complete_onboarding()`) + a small Profile-screen entry to re-open the tour + gate routing change in `verification.ts` / `App.tsx`. **No 3rd-party carousel library** — uses React Native's native `ScrollView` with `pagingEnabled` and `useState` for the active index. Dana writes the migration (`supabase/migrations/006_onboarding_complete.sql`); Shamus does the UI; Sky applies.

**Estimated effort:** 1.5 build days + 0.5 day audit/test pass. Two PRs (schema + screen) across Dana, Shamus, Casey (copy), Alex (a11y), Gary (tests).

**READY but Jordan REVIEW REQUIRED** (privacy-light but flagged because the tour describes the privacy model; the COPY itself is a Casey + Jordan + Will artifact, not pure UX).

## User story

> _As a newly-verified Mara, I open the app for the first time after my application is approved. Before HomeScreen loads, I see a 3-screen carousel that tells me in plain language: (a) I'm in, but I can leave any time, (b) my handle is my identity here so no real names, (c) when I claim, the other person sees the contact handle they chose. I tap "Get started" on the third screen and HomeScreen loads. The tour never appears again unless I tap "See intro again" on Profile._

> _As Keo, who is privacy-paranoid, the tour explains the model BEFORE I see anyone else's data. If I disagree with how it works, the tour has a "Skip" link that takes me to HomeScreen and marks the tour done. I never see it again, and I can always go to Profile → Delete my account if I change my mind._

> _As Deb, who is tech-confident and impatient, the tour is short (3 cards), swipeable, and skippable. I read it once in 20 seconds, tap "Get started," and move on. I don't have to read the privacy policy to understand the basics._

> _As a screen-reader user, each card announces its own title when it becomes active. The swipe between cards is also announceable via a focus shift. The "Skip" link is reachable on every card._

> _As Casey, the tour is the place where I can — in future iterations — add a sentence about the seed-drive context ("Your community admin posted these to get us started"). The copy is owned by Casey, reviewed by Will for voice consistency, and audited by Alex for a11y._

## Personas served

- **Mara (recipient) — primary.** Friction #1 (empty marketplace): the tour explains why the feed may have few items in the early days ("Your community is just starting — listings will grow as members post"). Friction #4 (claim confusion): the third card makes the claim-reveals-contact-handle behavior explicit BEFORE the first claim attempt.
- **Keo (organizer) — primary.** Anti-goal "anything that's a verified ✓ badge that becomes a target": the first card reaffirms the privacy story by explicitly saying "you can leave the network any time via Profile." This is a trust-on-arrival moment.
- **Deb (poster) — secondary.** Tech-confident and impatient; the tour is short by design. The 3-card cap is a Deb constraint.
- **Casey (Community Manager) — primary.** Owns the copy. Riley's friction analysis (Casey reads) ranks first-run orientation as a key retention input. The Skip link is intentional: not everyone needs the tour.

## Why now

Expansion plan Tier 2 #8 (`~/.claude/plans/goofy-singing-steele.md` line 61): "Reduces 'empty marketplace' friction (Riley friction #1). Explains gate, handle, claim model in <60s." Sequenced as Phase 2 Stream C because:

1. **Drops the empty-marketplace friction immediately.** Without orientation, a new user lands on HomeScreen with possibly <3 items, no context, and quietly bounces. Riley flagged this as the single highest-severity, highest-breadth friction (`community/growth-strategy.md`).
2. **Sets correct expectations about the claim model.** The "claim reveals contact handle" mechanic is non-obvious; without a tour, users will tap Claim and be surprised when they see the poster's handle for the first time.
3. **Is a near-zero-risk schema change.** One boolean column on `users`. No RLS impact. No new data flows.
4. **Pairs well with the rest of Phase 2.** As resource categories (Phase 2 #6) and pickup confirmation (#7) land, the third card can grow to mention them in v1.1 without a new schema change.

Risk-of-deferral: every week without the tour, the seed Tier-1 communities Casey is approaching see lower verified-to-active conversion (Casey's metric #2). Each "I don't get what this is for" bounce is a missed network-effect node.

## Acceptance criteria

### AC-1: Schema migration adds `onboarding_complete`

- A new migration file `supabase/migrations/006_onboarding_complete.sql` (Dana writes):
  1. `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;`
  2. The new `complete_onboarding()` RPC (Section 6).
  3. **NO** automatic backfill of `true` for existing users — see DFS-1. Existing users will see the tour exactly once on their next login (acceptable since the existing user pool is staging-only at this point).
- Idempotent. Rollback file documented: `DROP FUNCTION public.complete_onboarding; ALTER TABLE public.users DROP COLUMN onboarding_complete;`.
- Sky applies.

### AC-2: Tour shows ONLY when verified AND `onboarding_complete = false`

- The auth gate routing in `src/lib/verification.ts` (function `decideGateRoute`) gains one new state. Today it returns one of `'splash' | 'sign-in' | 'complete-profile' | 'wait' | 'home'`. The new return value is `'tour'` and it's returned when:
  - `auth.uid()` is set, AND
  - `users.is_verified === true`, AND
  - `users.onboarding_complete === false`.
- `App.tsx` Gate renders `<OnboardingTourScreen>` on this state.
- The transition `tour → home` happens exclusively via the `complete_onboarding()` RPC succeeding. UI-only flag toggles (with no DB write) are forbidden — the source of truth is `public.users.onboarding_complete`.

### AC-3: 3 cards rendered with swipe + Next button + Skip link

- The screen renders a horizontal `ScrollView` with `pagingEnabled` (or `FlatList` with `horizontal` + `pagingEnabled` — Shamus picks). One card per page.
- Each card has:
  - Title (h1; Casey writes — see Section 8)
  - Body copy (1-2 paragraphs; Casey writes)
  - Optional icon (Dani picks; defaults to no icon if Dani is OOO)
  - "Next" button (cards 1 & 2) or "Get started" button (card 3)
  - "Skip" link in the top-right corner of every card
- Tap Next → animate to the next card.
- Swipe left/right → move between cards (when allowed by `pagingEnabled`).
- Tap Skip → calls `complete_onboarding()`, then routes to HomeScreen.
- Tap "Get started" on card 3 → calls `complete_onboarding()`, then routes to HomeScreen.

### AC-4: Card content (3 cards; Casey owns final copy)

**Card 1 — privacy gate, you can leave**

- Title: `"You're in."`
- Body: `"You've been verified by a community admin. You can leave the network any time — there's a 'Delete my account' button in Profile that erases everything you posted."`
- CTA: `"Next"`

**Card 2 — handle is your identity**

- Title: `"Your handle is your name here."`
- Body: `"You can change it any time. Don't use a real name — yours, your kid's, your roommate's. If you see anyone using a real name, it's probably a mistake; you can ignore those listings."`
- CTA: `"Next"`

**Card 3 — claim model**

- Title: `"When you claim, the poster knows."`
- Body: `"Tap Claim on a listing and the poster sees that you've claimed it. You'll see the contact handle they chose for that listing (Signal, Proton, etc.). You and the poster work out pickup outside the app."`
- CTA: `"Get started"`

The above is Quinn's strawman. **Casey owns the final copy. Will reviews for voice. Alex audits for a11y (especially screen-reader phrasing).** Copy changes after Casey/Will pass do NOT require Sky re-approval as long as the load-bearing concepts (you can leave, no real names, claim reveals contact) remain.

### AC-5: Onboarding shows only once per user

- After tapping "Get started" or "Skip" on any card, the `complete_onboarding()` RPC runs.
- On RPC success, `users.onboarding_complete` flips to `true` and the AuthProvider's realtime subscription refreshes the profile (per the existing pattern in `src/lib/auth.tsx`).
- The gate router immediately re-routes from `'tour'` to `'home'`.
- Subsequent app opens skip the tour because `onboarding_complete === true`.
- The tour cannot be re-shown via routing tricks; the gate router is the single arbiter.

### AC-6: Swipe + Next + Skip are all accessible

- Each card is in a `View` with `accessibilityRole="group"` and `accessibilityLabel={card.title}`.
- When the active card changes, the card's title fires `AccessibilityInfo.announceForAccessibility(card.title)` exactly once (mounted-ref guarded). This shifts screen-reader focus to the new card's title.
- The "Next" button has `accessibilityHint="Go to the next card."`.
- "Get started" has `accessibilityHint="Finish the tour. The marketplace opens next."`.
- "Skip" is rendered as a `Pressable` with `accessibilityRole="link"`, `accessibilityHint="Skip the tour. The marketplace opens next."`.
- Card progress dots (small visual indicator at the bottom showing "1 of 3", "2 of 3") have `accessibilityLabel="Card X of 3"`.

### AC-7: Reduced motion respected

- When `useReducedMotion()` (from `src/lib/useReducedMotion.ts`) returns `true`:
  - The swipe-animation does NOT animate. Cards snap between positions.
  - The "Next" tap also snaps (no slide).
- When `false` (default), the standard `pagingEnabled` smooth animation runs.
- No additional reduce-motion handling is needed for the icons (static).

### AC-8: Works at the smallest target width (320pt)

- The cards are tested at the smallest device width Mutual Mesh supports (320pt — iPhone SE 1st gen / Android small).
- All text fits within the viewport without horizontal scroll.
- The Skip link is reachable in the top-right.
- Dynamic-type tested at 200%; if text wraps to >5 lines, body copy is trimmed by Casey (an iteration loop, not a blocker).

### AC-9: Profile has a "See intro again" link

- A small `Pressable` link at the bottom of ProfileScreen reads `"See intro again"`.
- Tapping it calls a parallel RPC `reset_onboarding()` (security definer; flips `onboarding_complete = false` for `auth.uid()`).
- On RPC success, the realtime subscription fires; the gate router re-routes to `'tour'`; the user sees the tour as if it were their first time.
- After completing the tour again, `onboarding_complete` flips back to `true`.
- Position: at the bottom of Profile, above or below "Delete my account" (Dani decides).

### AC-10: No skipping the gate via local state

- The `'tour'` gate state is determined exclusively by `users.onboarding_complete`. No AsyncStorage flag. No in-memory bypass.
- If `users.onboarding_complete === false` on every session, the tour shows on every login until the user completes it OR skips. This is intentional — closing the app mid-tour without tapping "Skip" or "Get started" means the user has not yet completed/skipped, so the tour shows again.
- This is a small UX trade-off (a user who force-closes mid-tour sees it again) in favor of correctness (the source of truth is the DB, not local state).

## Screens / layout

One new screen (`OnboardingTourScreen`) + a small addition to ProfileScreen.

### State 1: OnboardingTourScreen — Card 1

```
┌──────────────────────────────────────────┐
│                                    Skip  │  <- top-right; reachable
│                                          │
│         [ optional icon ]                │
│                                          │
│          You're in.                      │  <- title
│                                          │
│  You've been verified by a community     │  <- body
│  admin. You can leave the network any    │
│  time — there's a 'Delete my account'    │
│  button in Profile that erases           │
│  everything you posted.                  │
│                                          │
│                                          │
│                                          │
│           ● ○ ○                          │  <- progress dots
│                                          │
│         ┌──────────┐                     │
│         │   Next   │                     │
│         └──────────┘                     │
│                                          │
└──────────────────────────────────────────┘
```

### State 2: OnboardingTourScreen — Card 2

```
┌──────────────────────────────────────────┐
│                                    Skip  │
│                                          │
│         [ icon ]                         │
│                                          │
│   Your handle is your name here.         │
│                                          │
│  You can change it any time. Don't use   │
│  a real name — yours, your kid's, your   │
│  roommate's. If you see anyone using a   │
│  real name, it's probably a mistake;     │
│  you can ignore those listings.          │
│                                          │
│           ○ ● ○                          │
│                                          │
│         ┌──────────┐                     │
│         │   Next   │                     │
│         └──────────┘                     │
└──────────────────────────────────────────┘
```

### State 3: OnboardingTourScreen — Card 3 (last)

```
┌──────────────────────────────────────────┐
│                                    Skip  │
│                                          │
│         [ icon ]                         │
│                                          │
│  When you claim, the poster knows.       │
│                                          │
│  Tap Claim on a listing and the poster   │
│  sees that you've claimed it. You'll     │
│  see the contact handle they chose for   │
│  that listing (Signal, Proton, etc.).    │
│  You and the poster work out pickup      │
│  outside the app.                        │
│                                          │
│           ○ ○ ●                          │
│                                          │
│       ┌──────────────┐                   │
│       │ Get started  │                   │  <- last card: changes label
│       └──────────────┘                   │
└──────────────────────────────────────────┘
```

### State 4: ProfileScreen — "See intro again" link added

```
┌──────────────────────────────────────────┐
│  Profile                                 │
│  ...                                     │
│  brave-otter-1234                        │
│                                          │
│  My posts                                │
│  My claims                               │
│                                          │
│  ─────────────────────────               │
│                                          │
│  See intro again                         │  <- NEW LINK
│  Delete my account                       │  <- existing
└──────────────────────────────────────────┘
```

### Component reuse map (one new screen; no new shared components)

| Used component                           | Where                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| `ScrollView` (RN native) `pagingEnabled` | Card carousel                                            |
| `Button` (primary)                       | "Next" / "Get started" CTA                               |
| `Pressable`                              | "Skip" link + "See intro again" link                     |
| `FlashBanner`                            | Optional error toast if `complete_onboarding()` fails    |
| `LoadingSkeleton`                        | If the RPC takes >500ms; briefly shown during transition |

**No carousel library**. The native `ScrollView pagingEnabled` is enough for a 3-card horizontal pager. If we hit a real edge case (e.g., RTL languages in Phase 3 #19), revisit; for English MVP the native pattern is right.

## Data view (Jordan privacy gate — LIGHT REVIEW REQUIRED)

This section is privacy-light, but flagging Jordan because the COPY of the cards describes the privacy model. The copy is privacy-load-bearing; the underlying data is not.

### What the new column stores

| Column                             | Source                           | Visibility                                                                          |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `public.users.onboarding_complete` | Set by RPC after tour completion | Self-read only (matches existing `users_self_select` policy — no new policy needed) |

### What it does NOT introduce

- No new PII.
- No analytics event.
- No tracking of "did the user swipe forward, swipe back, tap skip on card 2 specifically." We do NOT measure tour engagement.
- No A/B test infrastructure.

### Privacy-load-bearing copy review

The 3 cards describe how data flows in Mutual Mesh. **Casey, Will, and Jordan together must sign off on the copy** before merge:

- Card 1 explicitly mentions the right to leave + Delete-my-account. This must remain present in any future copy iteration.
- Card 2 explicitly discourages real names. This is the operational form of PRIVACY.md D1's strengthening ("real names are never collected, stored, OR used as a handle or contact value anywhere in the app").
- Card 3 explicitly tells the user that claiming reveals identity (the poster's chosen contact handle). This is the operational form of PRIVACY.md D2.

Removing or weakening any of these three pillars from the copy is a Jordan re-review trigger.

### Concrete RPC shapes (Dana writes; sketches)

```sql
-- complete_onboarding(): user flips their own onboarding flag.
CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.users SET onboarding_complete = true WHERE id = caller;
  RETURN TRUE;
END;
$$;

-- reset_onboarding(): user re-opens the tour from Profile.
CREATE OR REPLACE FUNCTION public.reset_onboarding()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.users SET onboarding_complete = false WHERE id = caller;
  RETURN TRUE;
END;
$$;
```

Dana finalizes; the above is illustrative.

## RPC contracts

### `complete_onboarding() RETURNS BOOLEAN` (NEW)

**Source:** `supabase/migrations/006_onboarding_complete.sql`.
**Authorization:** Any authenticated user. Raises `'Not authenticated'` if `auth.uid()` is NULL.

**Client call:**

```ts
const { data, error } = await supabase.rpc('complete_onboarding');
```

**Response:**

- `data: true` on success.
- `error: PostgrestError` on failure (rare — only auth or DB outage).

**Side effects:** `public.users.onboarding_complete = true` for `auth.uid()`. AuthProvider's realtime subscription picks up the change and the Gate re-routes.

### `reset_onboarding() RETURNS BOOLEAN` (NEW)

Identical signature; flips `onboarding_complete = false`. Used by the "See intro again" link.

### Error mapping

| `error.message`       | User-facing message                           | Recovery                                |
| --------------------- | --------------------------------------------- | --------------------------------------- |
| `"Not authenticated"` | `"Your session ended. Please sign in again."` | Sign out + route to SignIn              |
| Network / 5xx         | `"Couldn't finish the tour. Try again."`      | Retry button on FlashBanner; tour stays |
| Anything else         | `"Something went wrong. Please try again."`   | Generic                                 |

## Tests (Gary writes)

### Unit tests (pure helpers)

- `src/lib/verification.test.ts` — extend existing tests:
  - `decideGateRoute` returns `'tour'` when verified AND `onboarding_complete === false`.
  - `decideGateRoute` returns `'home'` when verified AND `onboarding_complete === true`.
  - Other states (sign-in, splash, complete-profile, wait) are unchanged.
- `src/lib/onboardingCopy.test.ts` (new, if Shamus extracts copy into a constant) — verifies the three card titles match a stable shape; future copy iterations must update this test. This is intentional: copy changes are reviewed.

### Component tests

- `OnboardingTourScreen` renders 3 cards.
- Tapping "Next" on card 1 advances to card 2 (test the page index state).
- Swiping is tested via `ScrollView`'s `onScroll` (or test the equivalent state change).
- Card 3's CTA reads "Get started" not "Next".
- Tapping "Get started" calls `complete_onboarding()` (mock) and routes to HomeScreen.
- Tapping "Skip" on any card calls `complete_onboarding()` and routes to HomeScreen.
- ProfileScreen renders the "See intro again" link.
- Tapping "See intro again" calls `reset_onboarding()`.

### Integration tests (Steve writes; Gary runs in CI; extends `supabase/__tests__/rls.sql`)

- A verified user calling `complete_onboarding` flips their own flag; cannot affect another user's row.
- An unauthenticated client raises `'Not authenticated'`.
- After `complete_onboarding`, the `users_self_select` RLS policy returns `onboarding_complete: true`.
- Same for `reset_onboarding`.

### Manual smoke test (Sky walks through on staging — Phase 2 sync point)

1. Apply migration 006 via Supabase dashboard; verify column exists.
2. Sign in as a test user; `onboarding_complete` should be `false`; verify tour appears.
3. Tap Next twice → tap "Get started" → verify HomeScreen loads.
4. Kill and re-open the app; verify HomeScreen loads directly (no tour).
5. Open Profile; tap "See intro again"; verify the tour reappears.
6. This time, tap "Skip" on the first card; verify HomeScreen loads.
7. Repeat with reduced motion enabled in iOS Settings; verify cards snap without animation.
8. Repeat at 200% dynamic-type; verify text wraps cleanly and Skip is still reachable.
9. Repeat with VoiceOver / TalkBack; verify each card's title is announced on swipe.

## A11y (Alex pre-audit notes — Phase 2 build)

- **Card title announcement** is the load-bearing accessibility behavior. On card change, the screen reader must shift focus to the new card's title. Use `AccessibilityInfo.announceForAccessibility(card.title)` AND set `accessibilityLabel` on the card container to the title.
- **Focus order on each card**: title → body → Next/Get-started button → Skip link (top-right). On RTL, mirror.
- **Progress dots** are decorative AND informational. Use `accessibilityLabel="Card 2 of 3"` on the dot container; individual dots are decorative (`accessibilityElementsHidden={true}` on each child).
- **Skip link** is always in the same screen position (top-right) so SR users learn to find it. `accessibilityRole="link"`.
- **Touch targets** ≥44×44 on the Skip link AND each button per WCAG 2.5.5.
- **Reduced motion** (AC-7) is non-negotiable; vestibular-disorder users must not experience the page slide.
- **Dynamic type** at 200% must wrap cleanly. If body copy can't fit on card 3 (the longest), Casey trims.
- **Color contrast** on body text vs background: ≥4.5:1 AA. The Skip link must hit 3:1 (large text) — Alex confirms.
- **No autoplay or autoscroll** — the user controls progression. Anything else violates WCAG 2.2.2 (Pause, Stop, Hide).
- **Screen-reader-only "Card 1 of 3" announcement** at mount (e.g., `accessibilityLiveRegion="polite"` on a hidden `Text`); helps users orient.

## Performance considerations (Peter pre-notes)

- The screen is mounted once per onboarding session. Mount cost is trivial (3 static cards, no network calls beyond the final RPC).
- `complete_onboarding()` and `reset_onboarding()` are simple UPDATEs (sub-10ms expected on Supabase Pro).
- Realtime AuthProvider subscription picks up the flip; no additional channel.
- No images larger than icon-sized; if Dani adds illustrations, they should be SVG / vector (no large PNGs).
- The `pagingEnabled` ScrollView is a single native component; no JS-driven animation cost.

## Privacy considerations (Jordan pre-audit + sign-off REQUIRED)

This is light privacy work but Jordan must sign off because the copy is privacy-load-bearing.

1. **Copy is the privacy model in plain language.** Cards 1, 2, 3 each describe a load-bearing PRIVACY.md decision (D1, D2, D6, D8 implicitly). Jordan signs off on the copy as accurate.
2. **No tracking of tour interaction.** We don't know which card the user lingered on, swiped back from, etc. No engagement data.
3. **The "See intro again" link** exists explicitly so the tour is a re-readable resource, not a one-time gate. Mara/Keo might want to re-read it 3 months in.
4. **The `onboarding_complete` flag is self-only readable.** No admin sees who has and hasn't completed the tour. (Even Sky via SQL can — but no admin UI surfaces it.)
5. **The tour does NOT mention third-party services by name** (no "we don't use Sentry"). It mentions what we DO (handle system, claim model, delete-account button). Negative claims about other tools are out of scope.
6. **The tour does NOT replace the privacy policy.** Phase 4 #21 lands the in-app privacy policy + ToS. The tour is a tasting menu; the policy is the full meal.

## DECISIONS FOR SKY

> Each item below needs Sky's call before this cycle lands. Default behavior in parentheses is what ships if Sky doesn't override.

### DFS-1: Existing-user backfill — show or skip the tour on next login

Today's staging has ~5-10 test users with `onboarding_complete` NULL → default `false` (per AC-1). On next login, they'll see the tour.

**Quinn's proposal:** **Show the tour to existing users.** Reasoning:

1. Staging users are Sky + a few testers; seeing the tour once is fine.
2. After v1 launches, existing real users will be very rare (Mutual Mesh is pre-launch); the case essentially won't arise.
3. Backfilling `true` for existing users requires a separate one-off UPDATE which adds risk.

**Default if Sky says nothing:** ships without backfill; staging users see the tour once.

- [ ] Approve no-backfill (default)
- [ ] Edit — backfill existing users to `true` via the migration (one-off UPDATE)

### DFS-2: Card count — 3 vs 4

The spec ships 3 cards (gate, handle, claim). A 4th card could mention the seed-drive context ("Your community admin posted these to get us started — listings will grow as more members join").

**Quinn's proposal:** **3 cards now; revisit at +30-day metric review.** Reasoning:

1. Riley friction analysis ranks "empty marketplace" #1 — a 4th card mentioning seed-drive is genuinely useful, but it's also more text to read.
2. Casey wants to test 3-card flow first; if metric #2 (verification-to-active ratio) is below 30%, adding a 4th card is a small follow-up cycle.
3. The 4th card would be Casey's territory; Quinn defers to Casey's call on copy at that future cycle.

**Default if Sky says nothing:** ships 3 cards.

- [ ] Approve 3 cards (default)
- [ ] Edit — ship 4 cards now (Casey writes the 4th card)

### DFS-3: Allow re-opening the tour from Profile?

AC-9 ships a "See intro again" link.

**Quinn's proposal:** **Yes, ship the link.** Reasoning:

1. It costs almost nothing (one extra Pressable + one extra RPC).
2. It is a discoverable trust signal: "this app's privacy story is so important, it's a re-readable resource."
3. Mara/Keo personas value the option to re-read the model after weeks of use.

**Default:** ships the link.

- [ ] Approve "See intro again" link (default)
- [ ] Edit — omit the link; tour is one-time only

### DFS-4: Track tour completion vs skip in `cron_log` or anywhere?

The spec does NOT track whether the user completed or skipped. We only know `onboarding_complete = true`.

**Quinn's proposal:** **Don't track.** Reasoning:

1. PRIVACY.md D8 ("No third-party SDKs") and the broader posture against analytics.
2. The metric isn't load-bearing — if Casey wants to know skip-rate, she can run a small SQL count on `onboarding_complete=false` over time, but the friction-analysis already accepts that some users will skip.
3. Tracking would mean adding a `skipped_at` column or a `skip_log` table; pure analytics overhead.

**Default:** ships without tracking.

- [ ] Approve no-tracking (default)
- [ ] Edit — track skip vs complete (requires a fresh Jordan privacy review)

### DFS-5: Copy ownership — Casey final-call OR Sky final-call

AC-4 strawmans copy; Casey owns the final draft; Will reviews voice; Alex audits a11y. The CHAIN is Casey → Will → Alex → Jordan → merge.

**Quinn's proposal:** **Casey is final-call for copy after Will + Alex + Jordan sign off.** Reasoning:

1. Constitution Art. 5 — role lanes. Copy is Casey's lane.
2. Sky reviews everything at merge time; effectively Sky is the merge gate but not in the day-to-day copy iteration loop.
3. Sky CAN push back at merge; the chain is Casey draft → Will/Alex/Jordan review → Sky approves at merge.

**Default:** ships with Casey owning copy.

- [ ] Approve Casey-final (default)
- [ ] Edit — Sky reviews and final-approves every copy iteration before Casey continues

## Out of scope for this cycle

- **A/B testing the copy**: out of scope; no A/B infra in MVP per PRIVACY.md D8.
- **Multi-language tour**: the tour ships in English. i18n is Phase 3 #19.
- **Video / animation cards**: out of scope; static text cards only. Vector icons OK if Dani provides; otherwise no images.
- **Tour for unverified users in the WaitingRoom**: out of scope; the WaitingRoom is its own state. If Casey decides we need a "what's happening behind the scenes" card while waiting for verification, that's a separate cycle.
- **Tour for posters specifically** ("here's how to make a great listing"): out of scope. The tour is universal; poster-specific tips go in a future Help/FAQ screen (Phase 2 #14).
- **Tour analytics / completion-rate dashboard**: out of scope (see DFS-4).
- **Interactive tour** (tap-targets to "try claiming this fake listing"): out of scope; significantly larger scope; defer indefinitely.
- **A "what's new" tour on each app update**: out of scope; the `onboarding_complete` flag is binary — was-shown vs not. A future "see what's new" surface would be a separate cycle.
- **Inline guidance OUT of the tour** (tooltips when first tapping Claim, etc.): out of scope; defer to a v1.1 friction-analysis pass.
- **Tour customization per community** ("here's your community's intro from Casey"): out of scope; would require per-community copy, an entire admin tool to author it. Defer indefinitely.

## Definition of done

- All 10 AC pass manually on staging.
- Migration 006 file lands; Sky applies; column + 2 RPCs verified.
- `OnboardingTourScreen` + Profile addition + `verification.ts` gate update + `App.tsx` Gate render path complete; unit tests + component tests + integration tests pass green.
- **Casey signs off on final copy.**
- **Will signs off on voice consistency.**
- **Alex signs off on screen-reader behavior + reduced motion + dynamic type + contrast.**
- **Jordan signs off on the privacy-load-bearing copy** (cards 1/2/3 still accurately describe PRIVACY.md decisions).
- Steve signs off on the two new RPCs (`SECURITY DEFINER` + auth check).
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 5 DECISIONS FOR SKY items before merge.
- Will updates `CLAUDE.md` with the new column + RPCs.
- Morgan briefing in `qa-reports/phase-2-onboarding-tour-YYYY-MM-DD.md` with screenshots from staging.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
