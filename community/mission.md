# Mutual Mesh — Mission Narrative

**Owner:** Casey (Community Manager).
**Status:** v1 — 2026-05-23 — written against Riley's three personas in `research/personas/`. Re-grounds when real user research lands.

## Audience for this document

The **primary reader is someone using Mutual Mesh to find baby formula at 11pm**. Not a donor. Not a journalist. Not a grant officer. If a sentence sounds like a pitch deck, it's wrong.

## What Mutual Mesh is

Mutual Mesh is a way for people in the same neighborhood to share food, baby formula, harm-reduction supplies, and other survival resources — without an app collecting your name or selling your data.

You sign up with a handle (not your real name) and your postal-code prefix (not your address). A community admin reviews your account in about 24 hours and lets you in. After that, you can see what your neighbors have to share, and you can share what you have extra.

That's it. There's no chat, no ads, no ratings, no points. When you find what you need, you contact the other person on whatever channel they trust — Signal, an email alias, a tenant-union Telegram — and meet up.

## Who Mutual Mesh is for

The three people Riley wrote up:

- **A young parent** in a Toronto walk-up who needs hypoallergenic formula and has been burned by aid apps that ask for too much.
- **A trans organizer** in Hamilton who shares HRT supplies and clean needles within a network of trusted households, and who can't afford to leave a paper trail.
- **A tenant-union member** in a Vancouver condo who runs a community fridge and has 200kg of food-bank surplus she needs to move across building lines.

They use different devices, live in different cities, and want different things. What they share: an existing trusted network (Signal, Telegram, in-person), a need to coordinate that beyond that network, and a refusal to hand over their identity to a platform to do it.

## Why Mutual Mesh exists

Most "food sharing" or "community" apps require Facebook or Google identity, geolocation, real-name profiles, or some combination. They were built by people who weren't thinking about what happens when:

- An ex sees your phone notifications
- Child & Family Services subpoenas your account
- A landlord doxxes their tenant union
- A far-right group screenshots a "trans HRT sharing" post
- An immigration enforcer hands a warrant to a platform

Mutual Mesh is built on the assumption that **the same person making a mutual-aid app should not be making a database that could be turned against the people using it.** That sounds obvious. It is not how most apps in this space are built.

We make this concrete by:

- Collecting only what we strictly need (a chosen handle, a postal prefix, an email, an `is_verified` flag — that's it).
- Storing photos with their metadata stripped, twice.
- Hashing invite tokens so we never know who invited whom.
- Hard-deleting accounts in one tap (and being honest that Supabase backups linger for 7 days).
- Refusing in-app chat, push notifications, third-party analytics, and behavior tracking in v1.

Read [`PRIVACY.md`](../PRIVACY.md) for the full data inventory. We don't restate it here because that's the place to verify what's actually true.

## What Mutual Mesh is NOT

- **Not a delivery platform.** No drivers. No fees.
- **Not a marketplace with ratings.** No reputation scores. No "verified neighbor" badges visible to other users.
- **Not a charity broker.** No donor dashboards. No sponsors.
- **Not data-monetized.** We will never sell, share, or analyze user data for any purpose other than running the app.
- **Not a messaging app.** Coordination happens on Signal / email / wherever you already trust.
- **Not a social network.** No followers, no likes, no profiles to scroll.

## What this app cannot do

- **It cannot guarantee a recipient gets the resource.** A poster can no-show. A claimant can no-show. We rely on people to be people.
- **It cannot verify the quality or safety of an item.** A poster says it's unopened — we don't inspect it. Use your judgment.
- **It cannot operate in places without smartphones and connectivity.** That's a real exclusion. Casey is talking to partners about in-person handoff bridges for unhoused users; that's a v2+ conversation.
- **It cannot protect you from a determined adversary with subpoena power.** What we can do is minimize what we hold and be honest about the limits. The 7-day Supabase backup window is a real exposure; we don't pretend otherwise.

## How we operate

- **One verification admin per active community.** Recruited from within the community (not strangers from outside). Trained on the minimum data they should see.
- **A small group of contributors** working on the open-source codebase under a privacy-first contributor agreement (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).
- **Direct accountability to Sky** (project owner) for anything irreversible — schema changes, deploys, public statements.
- **No external comms** from automated agents. If you receive an email or DM purporting to be from "Mutual Mesh," verify with Sky directly. Only one human voice speaks for the project externally.

## Where the name comes from

A mesh distributes load across many small nodes; the strength is in the connections, not in any one node. Mutual aid works the same way. Neither word is novel — both are intentional.

The project's working codename was "Anchor" (in the original PRD). The team renamed to "Mutual Mesh" on 2026-05-23 because "anchor" implies a fixed point, and this project is the opposite of that. The redirect from "anchor" → "mutual mesh" was Sky's call and it's a better name.

---

_This document is reviewed quarterly. Last update: 2026-05-23 — Casey v1, grounded in Riley's persona work._
