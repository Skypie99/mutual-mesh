# Casey Audit — SAFETY.md

**Date:** 2026-05-25
**Role:** Casey (Community Manager)
**Branch:** `community/auto-2026-05-25-casey-safety-md`
**File written:** `community/SAFETY.md`

---

## What was done

Written `community/SAFETY.md` — the community safety norms document flagged as a recommended deliverable before Phase 3 / wider web demo distribution.

The document covers five areas:

1. **Community safety norms** — explains invite-only as protection (not exclusion), no-real-names policy, human verification, and a precise accounting of what admins can and cannot see (grounded in Jordan's PRIVACY.md data model and the admin data-view decision from `onboarding.md`).

2. **Posting guidelines** — four plain-language rules: real items only, no commercial listings, no cash/gift-card requests, remove listings when done.

3. **Receiving resources safely** — explains the contact-handle model (no public address), first-pickup safety tips (public place, bring a friend, trust your instincts), and explicit no-shame policy on no-shows.

4. **If something goes wrong** — long-press → Report UI flow, email fallback (privacy@mutualmesh.ca), human-review promise, and honest description of possible outcomes without committing to a mechanical strike system.

5. **For admins** — brief admin section: verification is a responsibility not a power, minimum-necessary data view, technical enforcement note (RLS), and escalation norm.

---

## Tone decisions

- Written for Mara (skeptical, privacy-burned, needs warmth) and Keo (trans organizer, needs to trust the safety model explicitly).
- Plain language throughout — no legalese, no "pursuant to," no em-dashes used to sound corporate.
- No-show policy and instinct-trusting language is explicit, because both personas have been shamed or failed by systems that treated non-completion as a moral failure.
- Admin section is short on purpose — this doc is primarily for end users. Full admin onboarding lives in `community/onboarding.md`.

---

## Source references

- `community/mission.md` — tone, persona grounding, app capabilities / limitations
- `community/onboarding.md` — exact admin data-view fields (handle, email, postal prefix, invite status only)
- `PRIVACY.md` (Jordan, 2026-05-23, APPROVED) — data model, EXIF stripping, handle-only identity, postal prefix granularity
- Riley's personas (Mara, Keo, Sasha) — audience grounding

---

## No decisions required from Sky

This document makes no architecture, schema, or data-handling changes. It describes existing behaviour (as defined by PRIVACY.md and the Supabase schema). No Jordan review triggered — this is community documentation, not a privacy-sensitive code change.

---

## DECISIONS FOR SKY

None at this time. If Sky wants to adjust the reporting email address, tone of any section, or add a platform-specific abuse-reporting flow before Phase 3 ships, flag to Casey via Morgan.
