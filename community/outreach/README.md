# Outreach Templates — Index & Usage Guide

**Owner:** Casey. **Status:** DRAFT v1 — 2026-05-24. Sky reviews and approves every individual send.

**Read first:** `community/growth-strategy.md` (esp. "How we approach a seed community" and "What we don't do") and `community/mission.md` (voice).

---

## What's in this folder

| File | Purpose | When Sky uses it |
| --- | --- | --- |
| `intro-listening-session.md` | Universal first contact template — listening session ask, no pitch | Cold first contact with any Tier-1 partner |
| `what-this-is-1pager.md` | Community-facing 1-page explainer | AFTER listening session, only if partner asks "what is this?" |
| `what-we-dont-do.md` | Honest disclaimer of things we deliberately don't do | BEFORE a pilot begins, to disqualify mismatches early |
| `per-category-tweaks.md` | Per-category tone notes (5 categories) | Read before customizing the intro for any specific partner |
| `README.md` | This file | When in doubt |

---

## The flow

1. **Sky picks a candidate partner** (from a list Casey researches; Sky approves the list before any outreach starts).
2. **Sky reads `per-category-tweaks.md`** for that partner's category.
3. **Sky drafts the intro using `intro-listening-session.md`**, swapping the subject line and (optionally) adding one genuine sentence of context.
4. **Sky sends.** Personally. From `skylerhalisky@gmail.com`. Not from any automated system. (Per Constitution Art. 9: only Sky's human voice goes out.)
5. **Sky logs the outreach** in the private spreadsheet (see "Tracking" below). Updates `community/partners.md` with status only — no real contact info in the repo.
6. **If listening session happens:** Sky listens, takes notes. Does NOT pitch. Does NOT demo. If they ask "what is this?", THEN sends `what-this-is-1pager.md` as a follow-up.
7. **If partner is interested:** Sky sends `what-we-dont-do.md`. This is the disqualification step. If they're still interested after reading the don'ts, move to pilot planning.
8. **If partner agrees to pilot:** spin up an admin role for someone in their network — see "Yes path" below.
9. **If partner declines or ghosts:** walk away — see "No path" below.

---

## Sky-only approval requirement (non-negotiable)

Per Constitution v1.3 Art. 9 + Mutual Mesh CLAUDE.md: **Casey writes drafts only. Sky reviews and personally sends every outreach email.** Casey does not have email access. Casey does not have access to partner contact info. Casey does not send. Ever.

This isn't a policy quibble — it's the trust mechanism that makes "one human voice" real. If a partner ever receives a templated email that wasn't human-reviewed-and-sent by Sky, that breaks the project's contract with the people using it.

---

## Tracking — off-platform, never in the app

Per `growth-strategy.md`: we don't track partner relationships or user activity inside Mutual Mesh itself. Keep a **private spreadsheet** (Sky's tool of choice — Airtable, Notion, Google Sheets, a local CSV — doesn't matter as long as it isn't in the Mutual Mesh database).

Columns Casey suggests:

| Column | Notes |
| --- | --- |
| Partner name | Real name; private to Sky |
| Category | One of the 5 in per-category-tweaks |
| First contact date | When Sky sent the intro |
| Status | Mirror partners.md statuses (Talking / Interested / Piloting / Live / Paused / Closed) |
| Last touch date | Most recent contact |
| Notes | Plain English. What they said. What was hard. What we'd do differently. |

`community/partners.md` in the repo only tracks status + learnings — no real contact info, no email addresses, no phone numbers. The repo is git-committed and could be seen by future contributors; the spreadsheet is private to Sky.

---

## Yes path — what to do if a partner says yes

Per `growth-strategy.md` step 3: **Offer a verification-admin role to someone in their network. Not an outsider. Not Casey. Their member, vetted by them.**

Steps:

1. Send `what-we-dont-do.md` as a final compatibility check. If they're still in after reading the don'ts, proceed.
2. Ask the partner to nominate one (initially) person from their network to be the verification admin. NOT Sky's pick — theirs.
3. Send the nominee `community/onboarding.md` ("Becoming a verification admin" section). Walk through it on a call.
4. Help the nominee through their own signup + verify them as `is_admin = true` (Sky does this via the Supabase dashboard — not Casey).
5. **Seed the marketplace first.** Per growth-strategy step 4: the admin posts ~10-20 items from existing surplus channels BEFORE any new users are invited. Riley's friction analysis flagged "empty marketplace" as the #1 risk; an empty Mutual Mesh is worse than no Mutual Mesh.
6. Once the marketplace has ≥10 listings, distribute invite codes through the partner's existing trusted channels (their Signal, their Telegram, in-person at events).
7. Three-week pilot. Measure successful exchanges per week. Casey checks in with the admin weekly during the pilot — not via push, just an email or a Signal message.
8. End of week 3: if <5 exchanges/week, pause and talk. Either retune or wind down gracefully.

---

## No path — what to do if a partner says no or ghosts

Per `growth-strategy.md` step 6: **Walk away gracefully if they don't want this. No follow-up sequences. No nurture campaigns.**

- **Explicit "no" from partner:** reply once, single sentence ("Understood — appreciate the time, and good luck with the work."). Mark in spreadsheet + `partners.md` as `Closed`. Note WHY in the spreadsheet (was it a mismatch on goals? on privacy posture? on capacity?) so the lesson lands.
- **Ghosted (no reply in 14 days):** mark as `Closed — no response`. **No second email. No "just checking in." No "wanted to make sure this didn't get buried."** All of those are sales-pattern follow-ups and we don't do them. The footer in the intro promises no reply chain — keep that promise.
- **Partner says "maybe later":** mark as `Paused`. Note when they suggested re-checking, if they did. Do NOT auto-follow-up at that date — wait for them to reach back out unless they explicitly asked Sky to follow up on a specific date.

---

## Voice anti-patterns (don't do these)

- Urgency ("limited spots", "we're launching soon")
- Scarcity ("only 3 communities in your city")
- FOMO ("other tenant unions in your area have already joined")
- Impact metrics ("we've facilitated X exchanges this month")
- Marketing voice ("join the revolution", "be part of the movement")
- Faux personalization with bracketed placeholders ("{COMPLIMENT_ABOUT_THEIR_WORK}")
- "We" implying a team that doesn't exist (Mutual Mesh is one human + an open-source codebase)
- Press-bait subject lines or copy

If a draft Sky is about to send has any of these, that's a STOP — pull it back to the template.

---

## Open questions Casey is tracking

- **Which BC city does Sky want to start with?** Per Sky's residence in Kelowna + Nelson + Other = BC focus, the geography is BC-first. Casey's recommendation in the report to Sky: start in Nelson (smaller, denser activist network, existing food-not-bombs / community-fridge culture) before Kelowna (bigger but more dispersed). Sky decides.
- **What's the verification-admin recruitment process when Sky doesn't personally know anyone in a new partner network?** Currently the process assumes Sky vouches for the admin nominee. For a partner network where Sky has no prior relationship, this needs a step. Flag for a future spec.
- **Translation budget for refugee/newcomer org outreach** — does Sky want to commission paid translation of `intro-listening-session.md` into the top 3 languages spoken in the target city's newcomer communities? Out of Casey's scope; Sky decides.
