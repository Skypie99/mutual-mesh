# Persona: Keo (composite — Riley v1)

**⚠️ Keo is a COMPOSITE drawn from publicly-available research on trans/queer survival networks and harm reduction. They are not a real person.**

**Confidence:** Reasoned from publicly-available zine literature, trans-health outreach research (Trans PULSE Canada), and harm-reduction practice notes. Treat as working hypothesis.

---

## Identity

- **Name (composite):** Keo
- **Pronouns:** they/them
- **Age range:** late 20s
- **City context:** mid-sized urban (Hamilton / Ottawa scale)
- **Housing status:** couch-surfing across a network of three trusted households. No fixed address; all mail goes to a friend's apartment.
- **Income source:** occasional sex work + a part-time gig at a community organization. Cash and e-transfer.

## Situation

- **Why they might use Mutual Mesh:** they share extra HRT (hormone replacement therapy) supplies and clean needles with peers in their network. They've also received groceries when a roommate's hours got cut. Trades happen via Signal threads now; it's working but doesn't scale — they don't know everyone in their broader community.
- **What barriers existing aid apps create for them:**
  - All existing apps require some "real-name + verifiable address" combination. Keo doesn't have that.
  - Any system that creates a record of "trans person traded HRT" is — under the wrong political climate — a future criminal-charge target.
- **What's already working:** the Signal threads + word of mouth at the community space they volunteer at.

## Tech reality

- **Primary device:** iPhone SE (older), purchased second-hand. iCloud account is in their chosen name; Apple ID is in their dead name (they haven't updated it because the process is a nightmare).
- **Connectivity:** prepaid plan, often topped up irregularly. Heavy Signal user.
- **Comfort with apps:** very high. They run encrypted comms training workshops at the community space.

## Privacy posture

- **What they actively want hidden:** that they're trans. That they share HRT supplies. Their location at any granularity finer than "city". Their network of friends.
- **What they accept sharing:** a chosen handle. A postal prefix only if they can pick which trusted-household's prefix to use.
- **What would cause them to delete immediately:**
  - Any field asking for legal name or gender
  - A signup flow that requires SMS verification (their phone number is shared with a friend's plan; they can't always answer it)
  - A "match with people nearby" feature that uses GPS
  - A required photo
  - Any sign Mutual Mesh uses third-party analytics
- **Their threat model includes:** state actors (immigration, vice), an ex who is a former cop, doxxing campaigns from far-right groups.

## Goals (in their framing)

1. Find a way to coordinate HRT sharing that scales beyond their Signal threads without leaking who they are or what they share.
2. Match excess vs. deficit in real time within their community.
3. Have the option to disappear from the system completely, in a single tap, with no recovery.

## Anti-goals

1. Any verification step that requires a government document.
2. Email verification by SMS (their phone is shared).
3. A "verified ✓" badge that becomes a target / makes them findable.
4. A profile photo or any biometric.
5. Push notifications. They prefer pull-only.

## What this means for Mutual Mesh design

- **Multiple postal prefixes per user** would be ideal — but adds complexity. v2 maybe; flag for Quinn.
- **Email-OTP verification** is fine (Jordan's open Q1) — they have a Proton alias they can use.
- **NO SMS verification.** (New constraint — confirm with Sky.)
- **NO push notifications in v1** (already deferred — Riley confirms this is right).
- **"Verified" badge should be visible to ADMINS ONLY** — never shown next to a user's handle in the marketplace. (Already implied in Jordan's model — Riley confirms.)
- **The "Delete my account" flow should advertise itself.** Putting it in a "settings" submenu is too buried — the trust signal is making it visible.
- **Resource categories must include HRT / medical supplies as a first-class category.** (New — flag for Quinn.)
- **Casey's growth strategy MUST NOT publicize Mutual Mesh in mainstream press.** A TikTok virality moment for "the trans HRT sharing app" would be a doxxing campaign waiting to happen.

## Sources

- **Evidenced from:** Trans PULSE Canada 2019/2024 cohort data; harm-reduction practice notes from VANDU and similar; community-organized HRT-sharing zines (publicly available).
- **Reasoned from analogous research:** mobile-tech-adoption surveys among precariously-housed LGBTQ+ youth.
- **Speculation flagged:** Keo's exact tech setup (iPhone SE, Proton alias, shared phone plan) is illustrative.
