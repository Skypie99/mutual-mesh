# Persona: Mara (composite — Riley v1)

**⚠️ Mara is a COMPOSITE drawn from publicly-available research on food-insecure parents and harm-reduction networks. She is not a real person. No biographical detail in this file maps to anyone alive.**

**Confidence:** Most claims here are reasoned from analogous research (food-bank ethnography, postpartum-depression cohort surveys, harm-reduction outreach literature). Specific quotes are paraphrased composites. Treat as a working hypothesis for Quinn / Dani / Shamus — re-ground with real user research before launch.

---

## Identity

- **Name (composite):** Mara
- **Pronouns:** she/her
- **Age range:** mid-20s
- **City context:** dense urban (Toronto / Vancouver / Montréal scale)
- **Housing status:** lives in a 2-bedroom apartment with her 4-month-old and a roommate. Behind on rent by 1–2 weeks at any given time.
- **Income source:** EI / parental benefits + occasional gig work

## Situation

- **Why she might use Mutual Mesh:** her infant is on a specific hypoallergenic formula that costs ~$45/can and isn't covered by Ontario Works for her case. A food bank gave her one tin last week but didn't have more. She heard about Mutual Mesh in a postpartum support Signal group.
- **What barriers existing aid apps create for her:**
  - **Olio** wants Facebook login. She deleted Facebook in 2023 after a stalking incident with her ex.
  - **Food bank apps** require she walk in during business hours; the closest one is 40 minutes by transit with a stroller.
  - **Buy Nothing** is Facebook-only.
  - **TooGoodToGo** doesn't carry baby formula.
- **What's already working:** the Signal group itself. Members trade extra formula tins, diaper coupons, ride shares to medical appointments. The group is invite-only.

## Tech reality

- **Primary device:** 2-year-old Android (Samsung A-series), 64GB storage, frequently low on space.
- **Connectivity:** prepaid data plan, 5GB/month, frequently throttled by mid-month. Wifi at home when the router works.
- **Comfort with apps:** confident. She runs a Signal group, uses Instagram for friends, does her banking on her phone.

## Privacy posture

- **What she actively wants hidden:** anything that ties her name to "asking for formula." She's terrified of CAS (Child & Family Services) opening a file. Real-name aid records, in her words, "are a trap."
- **What she accepts sharing:** a handle. Her postal prefix (M5V). Her email if it can be an alias.
- **What would cause her to delete the app immediately:**
  - Any sign her real name was collected
  - A "shared with sponsors/partners" disclosure on a privacy screen
  - A push notification with the resource name in the title visible on lock screen
  - Being asked to verify identity by uploading a government ID

## Goals (in her framing)

1. Find unopened cans of her infant's specific formula nearby, fast, without having to explain herself.
2. Pay it forward — when she gets WIC vouchers she doesn't need next month, hand them to someone else without involving an agency.
3. Not have a paper trail that says "Mara accepted food aid for her baby."

## Anti-goals — what she does NOT want

1. A profile photo or any identifying selfie.
2. A "rating" or "reputation score." She doesn't want to be evaluated.
3. Push notifications that show item names on her lock screen (her ex sometimes sees her phone).
4. Anyone — even verification admins — knowing what she's claimed.

## What this means for Mutual Mesh design

- The verification admin MUST NOT see resource history. (Confirms Jordan D6.)
- Notifications should use generic copy: "You have an update" — never the resource name. (New constraint — flag for Quinn + Shamus when notifications land in v2.)
- "Delete my account" must be findable in ≤2 taps from any screen. (Confirms Jordan D8.)
- The signup flow must not ask for: real name, gender, date of birth, profile photo. (Confirms Jordan D1.)
- "Why we need this" microcopy on every input field. (New constraint — Dani + Casey collaborate.)

## Sources

- **Evidenced from:** Feeding America's 2023 caregivers-and-food-insecurity report (general patterns); Maytree's Ontario social-assistance research; harm-reduction outreach literature on technology adoption among precariously-housed people.
- **Reasoned from analogous research:** the postpartum + food-insecure intersection; the stalking-survivor → identity-minimization pattern.
- **Speculation flagged:** the specific formula brand and price point are illustrative, not source-cited. Confirm with real interviews.
