# Journey: Deb posts a bulk-haul of community-fridge surplus

**Persona traced:** [Deb](../personas/persona-deb-2026-05-23.md)
**Flow:** Surplus arrives → Post → Multiple claims → Coordinate → Handoff
**Channel:** Mobile (iPhone 14, home wifi)
**Time of day:** Saturday morning, after a food-bank pickup.

---

## Step 1: The trigger

Deb's tenant union just received a 200kg food-bank surplus haul. Building 22 fridge can hold maybe 40kg. The remaining 160kg needs to land in neighboring buildings.

| What she does                          | Notes                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photographs the haul (one bulk photo)  | Already a habit from her Telegram channel                                                                                                                |
| Calculates: ~12 distinct items to list | Tomatoes, rice, dry pasta, canned beans, baby food jars, peanut butter, granola, oat milk, eggs (refrigerated short-window), bread, dry lentils, oatmeal |

## Step 2: Posting

Currently Mutual Mesh does **NOT** support bulk-post. Deb has to list each item one at a time. Her experience:

| Item #       | Time     | Friction                                                                                                        |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| 1 (tomatoes) | 90s      | Tap FAB → fill name, description, pickup info, contact handle. Optional photo (she uses one bulk shot for all). |
| 2 (rice)     | 60s      | Faster — autofills her contact handle from last post? **Currently no — flag.**                                  |
| 3-12         | 60s each | Cumulative ~12 minutes. Annoying.                                                                               |

**Total time: ~12-13 minutes for one haul.** Deb does this enough that she might give up after item 5 and just bulk-message her Telegram channel instead.

**Riley flag for Quinn:** bulk-post and "save contact handle to profile" are both v2 must-haves for poster-archetype users like Deb. Cycle 1's AddResource flow should at least remember the contact handle within a session (a quick win).

## Step 3: Claims arrive

Within 2 hours, Deb has 8 claims. She gets… **no notification** (v1 is pull-only). She refreshes the app on a whim, sees claims, and starts coordinating.

| What she does                                | Friction                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sees "Claimed by @neighbor_m5v" on each item | Currently Deb does NOT see the claimant's handle — only the claimant sees Deb's. This is the privacy default. |

**Wait — is this right?** Re-reading Jordan's PRIVACY.md and the data inventory: `claimed_by` is shown to the poster as the claimant's handle (item #14 in data inventory: "Server-side; claimant's handle shown to poster on detail screen"). So Deb DOES see who claimed.

OK — Deb sees `@neighbor_m5v` claimed the rice. She doesn't know who that is. She has to wait for them to message her on Signal.

| What she does                                                                                          | Friction                          |
| ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Opens Signal, sees a message from `@neighbor_m5v`: "Hey, just claimed your rice — when can I pick up?" | Standard out-of-band coordination |
| Replies                                                                                                | Standard                          |
| Handoff at the fridge                                                                                  | Done                              |

## Step 4: The hard case — a no-show

One claimant never messages on Signal. Deb's rice is `reserved` and not picked up. She has no recourse.

| What she'd want                                      | What v1 has                               |
| ---------------------------------------------------- | ----------------------------------------- |
| "Has the claimant contacted me in N hours?" reminder | Nothing                                   |
| Ability to un-reserve                                | Nothing                                   |
| 48h auto-expire on unclaimed-pickup                  | Nothing — relies on the 30-day cron prune |

**Riley flag:** the 48h auto-expire on a `reserved` resource (if no `picked_up_at` confirmation) is the right v2 default. For v1, Deb has to accept that 1 in N items goes stale.

## Step 5: Repeat next week

If Deb does this every week, the pattern is: 12 minutes to list 12 items, ~2 hour follow-up time for coordination, 1 in 10 items going stale. Total: ~3 hours/week.

The Telegram alternative: post a single message in her building's channel, members react with claimed-emoji. Total: ~5 minutes/week.

**Mutual Mesh has to be MEANINGFULLY better than Telegram for poster-archetype users to use it.** That means:

1. **Bulk-post is v2 must-have.**
2. **Better scope** — Mutual Mesh's value is cross-building. Telegram caps at her building. So the gain is reaching ~5x more people. If Deb can post in 12 min and reach 5x audience, she'll do it. If it takes 30 min, she won't.
3. **Reserved-but-not-picked-up needs an auto-expire.**

---

## Top frictions identified for this journey

| Rank | Friction                                                          | Severity × Breadth        | Fix direction                                                         |
| ---- | ----------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| 1    | No bulk-post; 12 items = 12 minutes                               | High × High (for posters) | v2: bulk-post UI. v1 quick-win: in-session caching of contact handle. |
| 2    | Reserved-but-not-picked-up has no recourse                        | High × Medium             | v2: 48h auto-expire + `picked_up_at` confirmation.                    |
| 3    | No notification when claims arrive                                | Medium × High             | v2: opt-in email when your post is claimed.                           |
| 4    | Photo is mandatory in some users' minds even though it's optional | Low × Medium              | Dani microcopy: "Photo optional" prominently in AddResource form.     |

## Recommendations

- **For Quinn:** bulk-post + 48h-auto-expire are the two highest-impact v2 features for retention. Put them at the top of the v2 backlog.
- **For Shamus (Phase 0b v1 quick wins):**
  1. Cache the contact handle in the user's session so consecutive posts auto-fill.
  2. Show "(Optional)" prominently next to the photo upload.
- **For Casey:** for organizer-archetype users, Mutual Mesh's value prop is **cross-building reach**. Lead with that in onboarding copy.
- **For Steve:** consider rate-limiting AddResource at ~20 posts/hour/user to prevent spam — but with high enough ceiling that Deb's 12-item haul doesn't trip it.

## Confidence

- **Evidenced:** the pattern of community-organizer behavior matches multiple documented case studies.
- **Reasoned:** the 12-minute estimate is reasoned from typical mobile form-fill times.
- **Speculative:** the exact retention threshold (3hrs/week → drops out) is a hypothesis.
