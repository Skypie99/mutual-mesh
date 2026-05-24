# Journey: Mara claims a formula listing

**Persona traced:** [Mara](../personas/persona-mara-2026-05-23.md)
**Flow:** Discovery → Signup → Wait → Approved → Browse → Claim → Pickup
**Channel:** Mobile (Android, throttled prepaid LTE)
**Time of day:** 11pm, infant asleep, Mara checking after a long day.

---

## Step 1: Discovery

| What she does                                                                                                              | What she feels                                             | Friction                                                                       | Where Mutual Mesh helps / fails                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Sees a message in her postpartum Signal group: "if you need formula, try Mutual Mesh, invite codes available, here's mine" | Cautious — checks the sender (a trusted member); reassured | Trust gap: is this legit? Or a scam from a screenshot of the original message? | Mutual Mesh's mission narrative must be readable in <30s. Casey's `mission.md` copy is critical here. |

## Step 2: Signup

| Step                                                                 | Time                                              | Friction                                                                                                     | Notes                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Tap App Store / Play Store install                                   | 30s                                               | Fine                                                                                                         | Standard                                                                         |
| Open app                                                             | 5s                                                | Splash takes 2s on her low-end Android                                                                       | OK                                                                               |
| Read landing copy                                                    | 30s                                               | None                                                                                                         | Casey's mission narrative must pass the 30s-skim test                            |
| Tap "I have an invite code"                                          | 2s                                                | None                                                                                                         |                                                                                  |
| Enter email (her Proton alias)                                       | 20s                                               | She's wary — wants confirmation this won't sync to contacts                                                  | Microcopy: "We never sync to your contacts."                                     |
| Enter password                                                       | 15s                                               | None — autofill works                                                                                        |                                                                                  |
| Enter invite code                                                    | 30s                                               | She has to switch to Signal, copy the code, switch back. Android's split-screen is awkward on a small phone. | Allow paste from clipboard. Long-press to paste works (verify in Phase 0b).      |
| Submit                                                               | 3s                                                | OTP arrives in 10s — slow but OK                                                                             |                                                                                  |
| **MOMENT OF TRUTH:** "Your account is being reviewed. Usually ~24h." | Disappointed but unsurprised. She closes the app. | She wonders if she'll forget about it / if the formula will still be there.                                  | The Waiting Room copy must NOT promise a specific time. "Usually 24h" is honest. |

## Step 3: Verification wait (overnight)

Mara goes to sleep. Verification admin reviews in the morning. She gets… **no notification** (v1 has no push). She re-opens the app the next evening on a whim.

| What she does               | Friction                                              |
| --------------------------- | ----------------------------------------------------- |
| Opens the app, signs in     | She remembered — but a less-engaged user might forget |
| Sees "You're verified" copy | Relief                                                |

**Riley flag**: in v2, an opt-in email notification on verification would meaningfully improve conversion-to-active. For v1, the 24h wait is tolerable for high-intent users like Mara; risky for low-intent users.

## Step 4: Browse the feed

| What she does                  | Friction                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Scrolls the feed               | Mostly empty in early Mutual Mesh — she sees ~6 listings, none formula             | Mock data in the stub doesn't reflect reality; Casey's seed-drive plan is load-bearing for retention   |
| Pulls to refresh               | She doesn't know if she should refresh                                             | Standard FlatList affordance                                                                           |
| Scrolls again 10 minutes later | One new listing — "Baby formula (unopened, expires Sept 2026)" — but not her brand | Real-time updates would help — Phase 0b realtime is the relevant feature                               |
| Taps the listing               | Detail screen loads                                                                | ResourceDetailScreen handles "no matching brand" — Mara reads description, sees it's a different brand |

## Step 5: A matching listing arrives

Two days later, Mara's postpartum group pings: someone posted her brand. She opens Mutual Mesh.

| Step                                                         | Friction                                               | Notes                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sees "Sensitive hypoallergenic formula — 2 cans" in feed     | Relief + urgency — she taps fast                       | A small grace window (the poster doesn't accept first-come-first-served instantly) would feel kinder; but atomic claim is the safe primitive. Riley defers to Steve. |
| Reads description                                            | "M5V neighborhood. Unopened. Expires Sept 2026." Hers. | Perfect                                                                                                                                                              |
| Taps **Claim this item**                                     | Loading spinner, then "You claimed this item."         | Atomic RPC — already designed per PRD §3.                                                                                                                            |
| Sees poster's contact handle: "@parentsupport_tor on Signal" | A handle she trusts — postpartum Signal channel        | The handle is the load-bearing trust object. Steve S3 + Jordan D2 already cover sanitization.                                                                        |

## Step 6: Coordinate pickup

| Step                                                                                                | Friction                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switches to Signal, sends "@parentsupport_tor — hi, just claimed your formula, when can I pick up?" | Standard out-of-band coordination                                                                                                                                                                                   |
| Poster replies in 20 min — "tonight 7-9pm, I'll meet you at [coffee shop]"                          | This is the failure mode if poster doesn't reply. v1 has no recourse — Mara would have to unclaim and re-list. **Currently the app doesn't support unclaiming** (claim is one-way to 'reserved'). Riley flags this. |
| She picks up                                                                                        | —                                                                                                                                                                                                                   |

## Step 7: Status update / cleanup

Currently no in-app step for "I picked it up, mark complete." The resource stays `reserved` until pruned in 30 days (per Jordan D7). For Mara that's fine; it'll silently disappear. But the **poster** never gets a confirmation that pickup happened.

**Riley flag:** in v2, an optional "confirm pickup" button (visible only to claimant, mutates a `picked_up_at` timestamp) would improve poster trust. Not MVP-blocking.

---

## Top frictions identified for this journey

| Rank | Friction                                                                   | Severity × Breadth          | Fix direction                                                                             |
| ---- | -------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| 1    | No way to unclaim if poster doesn't respond                                | High × High                 | Add "unclaim" RPC (v2). Reservation auto-expires after 48h with no contact.               |
| 2    | Postpartum + low-bandwidth users may miss the verification approval window | Medium × Medium             | Email notification on verification (v2). Plain "we'll email you" copy in v1 Waiting Room. |
| 3    | Empty feed in early Mutual Mesh days                                       | High × High                 | Casey's seed-drive plan (already in `community/seed-drives.md`).                          |
| 4    | Invite-code paste on Android cross-app is awkward                          | Low × Medium                | Validate clipboard-paste UX on Android in Phase 0b.                                       |
| 5    | No "confirm pickup" closes the loop                                        | Medium × High (for posters) | v2 — add `picked_up_at` field.                                                            |

## Recommendations

- **For Quinn:** add "unclaim" and "confirm pickup" to the v2 backlog. Note they require schema changes; defer to Cycle 7+.
- **For Casey:** the seed-drive plan needs to deliver ≥3 listings/day in each target neighborhood for Mara-archetype users to retain. This is the load-bearing growth-strategy assumption.
- **For Shamus:** the Waiting Room screen should NOT promise a specific time. "Usually 24h" is current copy; keep it.
- **For Dani:** the Detail screen should make the claim button feel safe (large, primary, but with a brief moment of "this is real" — maybe a subtle confirmation dialog). Currently it's a direct claim. Re-evaluate.

## Confidence

- **Evidenced:** the persona's general pattern of behavior is grounded in cited research.
- **Reasoned:** the specific sequence of taps & timings is reasoned, not measured.
- **Speculative:** the 24h-windowverification miss is a hypothesis; real cohorts may behave differently.
