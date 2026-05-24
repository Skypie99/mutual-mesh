# Persona: Deb (composite — Riley v1)

**⚠️ Deb is a COMPOSITE drawn from publicly-available research on community-organizing leaders and food-distribution volunteers.**

**Confidence:** Reasoned from mutual-aid organizing literature (Spade's "Mutual Aid"), community-fridge project documentation, and tenant-union organizing manuals.

---

## Identity

- **Name (composite):** Deb
- **Pronouns:** she/her
- **Age range:** early 40s
- **City context:** dense urban
- **Housing status:** owns a small condo, mortgage paid down to about 60% LTV. Stable.
- **Income source:** part-time as a librarian + occasional grant-funded organizing work for a tenant union.

## Situation

- **Why she might use Mutual Mesh:** Deb runs the "Building 22 Fridge" — a literal community fridge in her condo's bike room that neighbors stock with surplus. She also coordinates a Telegram channel of ~150 building residents who alert each other when there's overstock at the local food bank, a freecycle haul, or a tenant in need of furniture. She's the **poster** archetype.
- **What she'd use Mutual Mesh for:** posting surplus from her own grocery shops + from the community fridge when it gets overstocked + connecting residents from neighboring buildings (her Telegram is locked to her building).
- **What barriers existing tools create:**
  - Telegram is great for her building but doesn't bridge to other buildings.
  - Buy Nothing is Facebook-only.
  - Public-facing community-fridge map apps require her to give the fridge's address, which she's reluctant to do (the fridge has been targeted by both food-bank-skeptical neighbors and the occasional thief).

## Tech reality

- **Primary device:** iPhone 14, work-provided.
- **Connectivity:** excellent — home wifi + work plan.
- **Comfort with apps:** high. She's the tech-confident person in her network; people ask her to set up apps.

## Privacy posture

- **What she wants hidden:** the exact location of the community fridge (it should be a "neighborhood-level" map pin, not a specific address).
- **What she accepts sharing:** her handle (visible — she's organizing publicly anyway). Her postal prefix.
- **What she's flexible on:** notifications are fine.
- **Her threat model includes:** the fridge being targeted; her building's tenant union being doxxed by a hostile landlord.

## Goals

1. Make it easy for her to bulk-post 5-10 items at a time (e.g., after a food-bank haul).
2. See claims as they come in — she wants to be able to triage if multiple people want the same item.
3. Coordinate handoff via something safer than her personal phone number.
4. Bring more building organizers into the system without each having to be vouched-for individually.

## Anti-goals

1. Anything that exposes the community fridge's exact address.
2. A "score" or "leaderboard" of who's most generous — she finds this gross and creates a power dynamic.
3. Required photos for every post (she sometimes posts dry goods in bulk and doesn't have time).

## What this means for Mutual Mesh design

- **Bulk-post UI** is a real need — Quinn should consider this for v2. (Out of MVP scope; flag.)
- **Photo should be OPTIONAL, not required.** Currently AddResourceScreen treats photo as optional; verify when wiring real Supabase. (Confirms.)
- **"Pickup info" field should support a "neighborhood-level" pin without a precise address.** Currently `pickup_text` is free-text — gives Deb flexibility. (Confirms Jordan's choice.)
- **For organizers like Deb, a "Building 22 Fridge"-style group account would be useful.** v2 territory.
- **Resource categories should include large categories: groceries, hygiene, baby supplies, hot food, hot water — these match how a community fridge organizes.** (Currently categories aren't in the schema; flag for Quinn — possibly a tag system.)

## Sources

- **Evidenced from:** Dean Spade's "Mutual Aid" (2020); community-fridge organizing documentation (e.g., A New World in Our Hearts, Friendly Fridge BX); tenant-union organizing manuals.
- **Reasoned from analogous research:** Buy Nothing Project's volunteer-coordinator role surveys.
- **Speculation flagged:** the specific community-fridge address concern is documented in news coverage of incidents at fridges in Brooklyn, Toronto, and Vancouver.
