# Casey — Web Demo Community Copy

**Date:** 2026-05-25
**Role:** Casey (Community Manager)
**Branch:** `community/auto-2026-05-25-casey-web-demo`
**Status:** COMPLETE

---

## Summary

MutualMesh shipped its web demo at `https://mutual-mesh.vercel.app`. Community members invited to preview need clear guidance on what they're entering and why it requires a login. This cycle created the copy for that onboarding gap.

---

## Files created / modified

| File | Action | Notes |
|---|---|---|
| `community/web-demo.md` | Created | "How to access the web demo" — 4 short paragraphs, honest about invite-gate, links to privacy doc |
| `community/privacy-plain-language.md` | Created | Plain-language privacy explainer for Mara + Keo audiences |
| `community/onboarding.md` | Updated | Added "Try the web demo" section pointing to `web-demo.md` |

---

## Privacy claims audit

Every claim in `privacy-plain-language.md` was checked against `PRIVACY.md` (Jordan's approved data model, locked 2026-05-23) before writing. Mapping:

| Claim in copy | PRIVACY.md source |
|---|---|
| "A handle. A name you make up. Not your real name." | D1 EDITED — real names never collected or stored |
| "Your email. Used only to log you in." | Data inventory #1 — auth email; no marketing noted |
| "Postal prefix — first 3 characters" | D3 — FSA-level only |
| "What you post" (resource name, description, photo, contact handle) | Data inventory #7–#11 |
| "No phone number — ever" | D3 / D2 — phone explicitly not collected |
| "No GPS coordinates — ever" | "Fields NOT collected" explicit list in PRIVACY.md |
| "Location data hidden in photos — stripped twice" | D5 — two-layer EXIF strip (client + server) |
| "No real name, no gender, no age, no device fingerprint" | PRIVACY.md "Fields NOT collected" list |
| "Only verified community members can see posts" | RLS posture — every SELECT requires is_verified = true |
| "Contact handle revealed only to the claimant" | Data inventory #11 — "Claimant only, after claim" |
| "One button — hard delete, immediate" | D6 — true cascade hard delete |
| "Supabase keeps backups up to 7 days" | D6 backup honesty disclosure |

No claims were made that aren't backed by the approved PRIVACY.md. No legal language was used.

---

## Tone review against personas

**Mara** (survival mode, avoidance of paper trail):
- `web-demo.md` leads with the invite requirement and frames it as protection, not bureaucracy
- `privacy-plain-language.md` opens with "only what you choose to share" — addresses her core fear (involuntary disclosure)
- No corporate language. No "we take your privacy seriously" boilerplate.

**Keo** (technical threat model, state-actor concern):
- `privacy-plain-language.md` calls out EXIF stripping, no third-party analytics, no GPS — the specific things Keo's persona flags
- Honest about the Supabase 7-day backup window — Keo would notice if we didn't mention it
- Language is direct and specific, not reassurance-flavored

**Both personas:**
- Short docs (4 paragraphs / 6 sections). Neither Mara nor Keo will read a wall of text.
- Warm but grounded. No corporate warmth-theater.

---

## Constraints satisfied

- [x] Const. Art. 1: branch is `community/auto-2026-05-25-casey-web-demo` — not main
- [x] Only URLs used: `https://mutual-mesh.vercel.app` (documented in README.md)
- [x] No privacy claims without PRIVACY.md backing (audit table above)
- [x] Tone: warm, direct, grounded — not corporate, not legal
- [x] No external sends (Morgan is the sole channel)

---

## DECISIONS FOR SKY

None — this is copy-only work with no privacy-sensitive code changes and no architectural decisions. The web demo URL is already established in README.md.

---

## Recommended next step

Morgan can route to Will if a README update is needed to surface the new community docs. No action required from Sky.
