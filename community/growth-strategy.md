# Growth Strategy

**Owner:** Casey (Community Manager).
**Status:** v1 — 2026-05-23 — grounded in Riley's personas + friction analysis. Re-evaluate at launch + every 90 days.

## Principle (load-bearing)

Mutual Mesh grows by serving small, dense networks first — **not by going broad.** A single mutual-aid collective with 30 active members beats a national rollout with 30,000 strangers, every time.

Riley's friction analysis (`research/friction-2026-05-23.md`) identifies "empty marketplace in early days" as the **single highest-severity, highest-breadth friction**. A Mutual Mesh with 3 listings is worse than no Mutual Mesh — it sets users up for disappointment, and they don't come back.

**Therefore:** we do not invite anyone in until the marketplace has enough listings for them to find what they came for. Riley's threshold: ≥3 useful items in a new user's first session.

## What we measure

Three metrics. In order of importance:

1. **Successful exchanges per active community per week.** A "successful exchange" = poster created a listing, someone claimed it, both confirmed pickup (when v2 lands the confirmation field) OR it didn't appear back in the feed within 30 days as unclaimed. This is the only metric that proves the product works.
2. **Verification-to-active-user ratio.** How many people sign up, get verified, and post or claim at least once within 30 days. <30% means the friction analysis (Riley) needs revisiting.
3. **Verification queue health.** Median time-to-verification; admin burnout indicators.

Notice what we do NOT measure: downloads, daily active users, session length, push notification CTR, "engagement." None of those are the product.

## Target seed communities (in priority order)

Based on Riley's three personas, the seed strategy is:

### Tier 1 — Trusted partner networks (Months 1-3)

Start with networks already coordinating via Signal/Telegram. These are organized; their members trust each other; they have a coordination gap Mutual Mesh fills.

| Network type                                      | Why it's a good fit                                                           | What we don't say to them                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| Mutual-aid collectives running a community fridge | Existing posters; need cross-building reach (Deb)                             | "We're a startup" — we're a tool.                     |
| Postpartum support groups                         | High-trust internal vouching; concrete urgent need for formula/diapers (Mara) | "We're disrupting food aid."                          |
| Harm-reduction networks                           | Existing trust + critical supplies + extreme privacy needs (Keo)              | "We're the future of mutual aid." Anything saviorist. |
| Tenant unions                                     | Organizers with surplus + cross-building reach (Deb)                          | "We help marginalized people."                        |
| Refugee/newcomer support orgs                     | High need, low willingness to use real-name systems                           | Anything that implies they need our help.             |

**What we DO NOT start with**: city-run food banks (different threat model + legal exposure), open-call charity orgs (saviorism trap), university student groups (low-stakes, low-need, would dilute the audience).

### Tier 2 — Adjacent referrals (Months 4-9)

Once Tier 1 communities are running healthy seed networks, members invite their adjacent contacts. Growth is exclusively via the invite-code mechanism. We do NOT advertise.

### Tier 3 — Expansion to new cities (Months 9+)

Replicate the Tier-1 pattern in a new city before expanding. Each city gets its own admin pool. Mutual Mesh is not a single global community — it's many small communities sharing the same software.

## How we approach a seed community

1. **Talk first. No pitch.** A 30-min listening session with the network's existing coordinators. Take notes on how they coordinate today, what's working, what's not.
2. **Never lead with the app.** If they don't have a coordination gap Mutual Mesh would fill, walk away. We don't manufacture demand.
3. **Offer a verification-admin role to someone in their network.** Not an outsider. Not Casey. Their member, vetted by them.
4. **Seed the marketplace BEFORE inviting users.** The first admin posts ~10-20 items from existing surplus channels. Members then invite their networks.
5. **Three-week pilot.** Measure exchanges per week. If <5/week, the community isn't getting value. We pause, talk, and either retune or wind down gracefully.
6. **Walk away gracefully if they don't want this.** No follow-up sequences. No nurture campaigns. No "this is a great fit" emails. We respect "no."

## What we don't do

- **No social-media virality plays.** Riley friction #9 — mainstream press / TikTok would attract bad actors faster than aid-seekers. Especially for trans/queer survival networks, virality = doxxing risk.
- **No paid acquisition.** Anyone we pay to acquire is the wrong user.
- **No referral rewards.** Creates a Ponzi-shaped vouching graph. The invite-code mechanism is opaque-by-design; rewarding referrers would re-create the identity graph Jordan deliberately broke.
- **No press unless an in-network journalist asks AND Sky+Jordan approve.** Even then, we don't name users, don't name specific communities, don't show app screenshots that include user data.
- **No "impact" metrics shared publicly.** "Successful exchanges this month" is internal-only. Public impact metrics invite vanity reporting and gamification pressure.
- **No partnerships with for-profit retailers** ("get TooGoodToGo and Mutual Mesh together"). Different threat model + their data practices would contaminate ours.
- **No grant funding from sources with conflicting privacy practices.** A grant that requires "anonymized user data reports" is a soft request for our data and we decline.

## What "successful seeding" looks like in 90 days

| Metric                        | Target         |
| ----------------------------- | -------------- |
| Communities seeded            | 2-3 (one city) |
| Total verified users          | 100-300        |
| Successful exchanges / week   | 30-60          |
| Verification queue median     | <24h           |
| Privacy incidents             | 0              |
| Reports of user data exposure | 0              |
| Admin burnout reports         | <2             |

If we miss any of those, **especially the privacy/exposure metrics**, we pause growth and address before expanding.

## What "failed seeding" looks like

| Signal                                   | What we do                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Communities ghost after the 3-week pilot | Talk to them. Did we promise something we didn't deliver? Pause growth; fix.      |
| Exchanges drop after week 4              | Probably stale listings. Casey + Quinn investigate retention pattern.             |
| Admin burnout                            | Rotate; recruit from within the community. Never burn out the trust workers.      |
| First privacy report                     | Stop everything. Steve + Jordan + Sky review. Resume only after root cause + fix. |

## Partnerships we'd actually pursue (Tier 1 candidates to talk to)

Casey will draft a per-city target list in `community/partners.md` once Sky approves the strategy. For now, candidate categories (NOT specific orgs — Casey researches and Sky approves before any outreach):

- Community fridge networks (where they exist)
- Tenant unions with active distribution work
- Trans/queer survival networks with existing peer-distribution practice
- Maternal/infant health peer-support orgs
- Indigenous mutual-aid networks (only if invited; Casey does not cold-approach these)

## Decision points for Sky

| Question                                         | Recommendation                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Is the "no broad press" rule absolute?           | Yes for v1. Re-evaluate at 12 months.                                                              |
| Is the "no third-party SDKs ever" rule absolute? | Yes in v1. Anything added in v2 requires Jordan + Sky approval per SDK.                            |
| What city do we seed first?                      | Casey's hypothesis: Toronto or Hamilton, where existing partner networks are densest. Sky chooses. |
| Should we incorporate as a nonprofit?            | Out of Casey's scope. Sky + Jordan + legal counsel.                                                |

## Sources

- Riley's persona work (`research/personas/`) — load-bearing input.
- Riley's friction analysis (`research/friction-2026-05-23.md`) — top frictions ranked.
- Dean Spade, _Mutual Aid_ (2020) — operating philosophy.
- Community-fridge organizing documentation (multiple cities) — seed mechanics.
- Casey's own (forthcoming) conversations with mutual-aid coordinators — fills in as launches happen.
