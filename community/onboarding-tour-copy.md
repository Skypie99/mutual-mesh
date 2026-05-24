# Onboarding Tour Copy

**For:** OnboardingTourScreen.tsx (Phase 2)
**Owner:** Casey
**Version:** 2.0 (supersedes v1 — re-spec'd to Casey brief 2026-05-24)
**Status:** READY FOR WILL VOICE POLISH → JORDAN PRIVACY REVIEW → ALEX A11Y REVIEW → SHAMUS SHIPS
**Personas served:** Mara (primary — urgent need, low patience), Keo, Deb
**Source spec:** [`qa-reports/spec-phase-2-onboarding-tour.md`](../qa-reports/spec-phase-2-onboarding-tour.md) (Quinn, 2026-05-24)
**Privacy contract source:** [`PRIVACY.md`](../PRIVACY.md) D1, D2, D6, D8

---

## Spec corrections needed

Quinn's strawman copy in AC-4 of the spec is broadly right but has three honesty gaps Casey is correcting in v2. Quinn — these are not blockers; flagging because the load-bearing concepts are intact, only the precision is sharper.

1. **Card 1 strawman omits the 7-day backup window.** Quinn's strawman says "erases everything you posted" with no mention of the Supabase PITR window. PRIVACY.md D6 explicitly requires "backup honesty" — disclose that deletion is honest at the row level but backups linger 7 days. The earlier v1 of this file deferred that disclosure to the in-app delete confirmation copy, which is defensible, but Sky's brief for v2 says explicitly: "must mention 7-day backup window after delete (per D6 — honesty over comfort)." The v2 copy below now includes it on Card 1, plainly.
2. **Card 2 strawman omits what admins actually see.** Quinn's strawman says nothing about the admin's data view. The brief and persona work both want the user to know up front that admins (who let them in) see handle + postal prefix + city. Saying nothing implies "admins see nothing about you" — that would be a privacy over-promise. v2 names what admins see, briefly.
3. **Card 3 strawman omits the forthcoming "Confirm pickup" step.** Quinn's spec mentions it as a Phase 2 sibling feature (Phase 2 #7) but the strawman copy doesn't preview it. The brief says preview it. v2 includes a one-clause forward reference; if "Confirm pickup" doesn't ship in the same release as the tour, Shamus must hide that clause until it does (see "Tone notes for Shamus").

None of the above changes the load-bearing concepts (you can leave, no real names, claim reveals contact). So per Quinn's spec: copy changes don't require Sky re-approval. Jordan re-confirms accuracy below.

---

## Voice rules in force (from `community/mission.md`)

- Speak to a peer, not a beneficiary. No "we help" language.
- The reader is finding formula / HRT / diapers at 11pm. Be efficient with their attention.
- Mention privacy promises by their concrete behavior, never by claiming we're "privacy-first."
- No marketing-flavored adjectives ("vibrant", "thriving", "trusted community").
- No exclamation marks except where genuinely warm.
- Headlines ≤6 words. Bodies ≤60 words. Primary CTAs ≤3 words.
- Don't promise what the app doesn't yet do (no "we'll notify you" — push isn't in v1).

---

## Card 1 — Privacy gate / why you're here

- **Icon hint:** `door`
- **Headline (≤6 words):** `You're in. You can leave.` (5 words)
- **Body (≤60 words, word count below):**

> A community admin vouched for you, so the marketplace is open. This is an invite-only network — no public signup. If you change your mind, Profile has a Delete button that removes your account and posts. Supabase backups keep a copy for 7 days, then it's gone.

- **Primary CTA label (≤3 words):** `Next`
- **Secondary CTA label:** `Skip`

**Body word count:** 47 words.

**Persona-fit notes:**

- **Mara:** PASS. "Vouched for you" frames her presence as legitimate without invoking institutional language she'd recoil from (CAS-adjacent). "Delete button… 7 days" is the safety net she's looking for — honest, not over-promising.
- **Keo:** PASS. Names the mechanism (invite-only, no public signup) — this is the trust-on-arrival moment they need. The 7-day backup honesty is exactly the disclosure they'd respect; they run encrypted-comms workshops, they know "deleted means deleted" is rarely literal.
- **Deb:** PASS. Short, factual, no fluff. She'll skim and move on.

**Privacy contract:** Cites PRIVACY.md D6 (true cascade hard delete via `delete_my_account()` RPC) AND the backup-honesty principle ("backup honesty" — Design Principle 7). The 7-day window is from D6's backup disclosure. "Invite-only network" reflects D4 (single-use hashed invite token gates signup).

---

## Card 2 — Handles, not names

- **Icon hint:** `tag`
- **Headline (≤6 words):** `Pick a handle, not a name.` (6 words)
- **Body (≤60 words, word count below):**

> No real names — not yours, not your kid's. Tap the dice button for a random one. Other verified users will see your handle. The admin who let you in saw your handle, postal prefix, and city — nothing else. You can change your handle any time from Profile.

- **Primary CTA label (≤3 words):** `Next`
- **Secondary CTA label:** `Skip`

**Body word count:** 49 words.

**Persona-fit notes:**

- **Mara:** PASS. "Not yours, not your kid's" is her literal fear (the infant's name in a database). "Tap the dice button" gives her the concrete next action — Mara doesn't have patience for "we encourage you to consider…" framing. Naming what the admin saw means she's not blindsided later.
- **Keo:** PASS. Tells them admins do know their handle + prefix + city — this honest disclosure matters more to them than a comforting "we don't know who you are" lie. The mutability ("change any time") matches their identity-fluidity context.
- **Deb:** PASS. She's a poster; the handle generator note tells her where to find it. She'll appreciate that the admin's view is named, not hand-waved.

**Privacy contract:** Cites PRIVACY.md D1 (real names never collected, stored, or used as a handle — Sky's edit) and answer #6 in PRIVACY.md ("Admins see only `email`, `chosen handle`, `postal prefix`, and `referrer_token_hash` status"). The copy mentions handle + postal prefix + city; email is omitted from this card because it's how the user already knows we have it (they signed up with it) — naming it again would bloat the card and Sky's brief specifies "handle + postal prefix + city" as the three. If Jordan wants email named explicitly, see flagged sentence #2 below.

---

## Card 3 — How claims work

- **Icon hint:** `handshake`
- **Headline (≤6 words):** `Tap claim. Meet up off-app.` (5 words)
- **Body (≤60 words, word count below):**

> When you tap Claim, the poster sees the contact handle you set up — Signal, an email alias, whatever you trust. You and the poster work out pickup outside this app. After pickup, both of you tap Confirm pickup to close the listing. Mutual Mesh doesn't track the exchange beyond that status.

- **Primary CTA label (≤3 words):** `Get started`
- **Secondary CTA label:** `Get started`

**Body word count:** 52 words.

**Note on Card 3 CTAs:** The brief says secondary CTA on Card 3 is "Get started" (not "Skip"). That makes the primary and secondary functionally identical on this card — both should call `complete_onboarding()` and route to HomeScreen. Shamus may choose to render Card 3 with a single Get-started button (no secondary) for clarity; that's a UI call, not a copy call. Casey's recommendation: single button on Card 3.

**Persona-fit notes:**

- **Mara:** PASS. She came here because she needs the formula. "Tap Claim, meet up off-app" is the literal sequence she'll do. Naming Signal + email alias matches the channels she trusts (her postpartum Signal group is how she found out about Mutual Mesh). "Confirm pickup" is forward-referenced honestly.
- **Keo:** PASS. Mechanics, again. The off-app pickup matches their existing Signal-thread workflow; the app extends, doesn't replace. "Doesn't track the exchange beyond that status" is the privacy-honesty clause they'd verify against PRIVACY.md.
- **Deb:** PASS. She's the poster. "The poster sees the contact handle you set up" tells her she'll see claimants' handles when they claim — which is how she triages multiple claimers (one of her stated goals). The Confirm-pickup mechanic is the closure she needs to keep the marketplace clean.

**Privacy contract:** Cites PRIVACY.md D2 (per-resource contact handle replaces in-app chat AND phone — Sky's edit) and table rows 11 + 14 of the data inventory (`contact_handle` visible to claimant after claim; `claimed_by` shown to poster). The Confirm-pickup forward reference matches Phase 2 spec #7 (pickup confirmation feature). "Doesn't track the exchange beyond that status" is the operational form of D8 (no third-party SDKs / no analytics).

---

## Re-open hook copy (for ProfileScreen)

Per Quinn AC-9, ProfileScreen gets a small `Pressable` to re-open the tour.

- **Link label:** `See intro again`
- **Short description (under or beside the link, ≤80 chars):** `Re-read how the gate, handles, and claims work. About 30 seconds.` (62 chars)

**Why this copy:** Tells the user what they'll get if they tap (the three concepts) and how long it'll cost them (30 seconds, the same promise the tour makes implicitly). No marketing language. The label `See intro again` is plain English and matches Quinn's spec verbatim.

**Position:** Per Quinn AC-9, Dani decides position (above or below "Delete my account"). Casey recommendation: **above** Delete-my-account, so the user sees the re-readable resource before the destructive action — a tiny calmness affordance.

---

## Tone notes for Shamus

Layout / accessibility hints that affect copy length:

- **320pt single-column rule:** Card 1 body fits on a 320pt screen at base font (16pt) without scroll. Card 2 and Card 3 also fit. At 200% dynamic type, all three cards will wrap to more lines but should still fit without horizontal scroll — Quinn AC-8 says Casey trims if they wrap to >5 lines at 200%. Casey verifies on first staging build.
- **Em-dashes are load-bearing.** Preserve the `—` (space + em-dash + space) in Card 1 ("network — no public signup", "for 7 days, then it's gone"), Card 2 ("No real names — not yours, not your kid's"), and Card 3 ("contact handle you set up — Signal, an email alias…"). Don't replace with commas or hyphens — pacing breaks.
- **No bold or italics inside body copy.** Plain text; emphasis comes from headline.
- **Don't add exclamation points.** The reader is tired. Calm cadence.
- **No "we" voice anywhere.** "The app is a tool; the user is the operator."
- **Words to avoid:** "vibrant", "thriving", "trusted", "trusted community", "we care", "we believe", "marginalized", "vulnerable", "underserved", "help", "support", "empower", "journey", "join us", "welcome", "exciting", "amazing", "important to us", "your privacy matters", "we respect", "safe space", "your data is safe", "secure" (as adjective), "private" (as marketing claim).
- **Card 3 Confirm-pickup conditional:** if the pickup-confirmation feature (Phase 2 spec #7) is NOT shipped in the same release as this tour, Shamus must hide the sentence `After pickup, both of you tap Confirm pickup to close the listing.` until it ships. Replacement: drop the sentence; the body still works at 38 words. Add a TODO comment in `OnboardingTourScreen.tsx` pointing to spec #7 so the sentence comes back when the feature lands.
- **Card 3 button rendering:** Casey recommends one button (Get started) on Card 3, not two. The brief lists secondary CTA as "Get started" — same label, same behavior, no need for a second button. Shamus owns the final UI call.
- **Icon hints:** `door` (Card 1), `tag` (Card 2), `handshake` (Card 3). Shamus picks the Unicode glyph or icon. If using Unicode for MVP: 🚪, 🏷️, 🤝 are plausible but Casey defers to Shamus + Dani; SVGs preferred over emoji at this size for screen-reader behavior.
- **Feeling to leave the user with after Card 3:** quietly oriented, not pumped up. They should know how the gate, handle, and claim work, and feel like they can move on with their actual task.
- **Read each card aloud before wiring.** If a sentence sounds like a pitch-deck bullet, it's wrong.

---

## Voice review hook (for Will)

Will: please do a final voice polish pass on the three body paragraphs above. Focus on (a) sentence rhythm — do any feel padded or clipped? — and (b) word-choice — does any single word land in marketing territory? The cards are within the voice rules as written, but a fresh ear may catch a sentence Casey has stared at too long.

---

## Sentences flagged for Jordan review

Per Quinn's spec (privacy-light, light Jordan review on the copy itself), the following sentences are privacy-load-bearing. Jordan: please confirm each accurately reflects the PRIVACY.md decision it cites.

1. **Card 1 body, backup-window clause:** `Supabase backups keep a copy for 7 days, then it's gone.` — [JORDAN REVIEW]: this is the user-facing form of D6's backup honesty ("Supabase keeps point-in-time-recovery snapshots for 7 days on Pro plan"). Casey's read: this is accurate AND on the right level of plainness for the tour. The in-app delete confirmation copy can be more detailed (it should also remind the user that we cannot scrub backups — Supabase platform limit). If Jordan thinks naming Supabase by name on the tour is too much vendor-specifics, alternative phrasing: `Database backups keep a copy for 7 days, then it's gone.` Casey's preference: keep "Supabase" because it's honest about who holds the data.
2. **Card 2 body, admin-view clause:** `The admin who let you in saw your handle, postal prefix, and city — nothing else.` — [JORDAN REVIEW]: PRIVACY.md answer #6 says admins see `email`, `chosen handle`, `postal prefix`, and `referrer_token_hash` status. Casey's copy omits `email` and `referrer_token_hash` status. Reasoning: (a) the user already knows we have their email (they signed up with it), so naming it again on Card 2 is noise; (b) `referrer_token_hash` status is opaque to the user and naming it would prompt "what's a referrer token hash?" which derails the card. Sky's brief says "handle + postal prefix + city" specifically. Jordan: is omitting email + token-status accurate enough, or should one or both be named? If Jordan wants email named: `…saw your handle, email, postal prefix, and city — nothing else.` (one more word, still under 60 word cap).
3. **Card 2 body, no-real-names clause:** `No real names — not yours, not your kid's.` — [JORDAN REVIEW]: operational form of D1's strengthening (real names never collected, stored, or used as a handle/contact value). v1 of this file had the broader "yours, your kid's, your roommate's" framing from Quinn's strawman. v2 keeps it tight at "not yours, not your kid's" because the rest of the body (admin view, mutability) now occupies the word budget. Jordan: the load-bearing emotional case (Mara's infant) is preserved. If Jordan thinks "your roommate's" is essential, Casey can cut "Other verified users will see your handle." to reclaim words.
4. **Card 3 body, reveal-on-claim clause:** `When you tap Claim, the poster sees the contact handle you set up — Signal, an email alias, whatever you trust.` — [JORDAN REVIEW]: this is the operational form of D2. Naming "Signal" and "an email alias" is illustrative; the schema is free-text. v1 had "(Signal, Proton, etc.)"; v2 says "Signal, an email alias, whatever you trust" — the change is intentional, the "whatever you trust" clause makes it non-prescriptive. Jordan: confirm the user-side cue is right.
5. **Card 3 body, no-tracking clause:** `Mutual Mesh doesn't track the exchange beyond that status.` — [JORDAN REVIEW]: this is the operational form of D8 (no third-party SDKs / no analytics). The Confirm-pickup state IS recorded (it's the only state change after claim), but no additional data is collected about the exchange itself. Casey's read: this is accurate. If Jordan wants more precision, alternative: `Mutual Mesh records whether the pickup was confirmed. Nothing else.` (slightly more honest about what we DO store, but ~5 words longer.)
6. **Re-open hook description:** `Re-read how the gate, handles, and claims work. About 30 seconds.` — [JORDAN REVIEW]: not privacy-load-bearing, but Jordan may want to confirm the framing doesn't accidentally over-promise (e.g., implying the tour IS the privacy policy — it's not; the privacy policy is Phase 4 #21).

---

## Persona-fit pass result

3 personas × 3 cards = **9 checks. All 9 PASS.** See per-card "Persona-fit notes" above for individual reasoning.

| Persona | Card 1 | Card 2 | Card 3 |
| ------- | ------ | ------ | ------ |
| Mara    | PASS   | PASS   | PASS   |
| Keo     | PASS   | PASS   | PASS   |
| Deb     | PASS   | PASS   | PASS   |

**Counter-check (does any card pander to a persona at another's expense?):** No. Card 1's "vouched for" + 7-day backup window serves Mara's safety-net AND Keo's honesty-needs AND Deb's plain-mechanics in the same words. Card 2's admin-view clause is Mara's blindside-prevention AND Keo's honest-disclosure AND Deb's poster-side context. Card 3's off-app + Confirm-pickup mechanics serve Mara's claimant fear AND Keo's existing Signal workflow AND Deb's triage need.

**Counter-check (does the copy survive without any one persona?):** Yes. If Mara didn't exist, the copy still holds (Keo + Deb both benefit from the mechanics-first approach). Same for the other two. The copy describes mechanics that serve any user with any threat model — the personas are tests, not audiences.

---

## DECISIONS FOR SKY

> Casey's decisions; defaults ship if Sky says nothing.

### Casey-DFS-1: 3 cards vs 4 (does the tour need a community-values card?)

Quinn DFS-2 already proposes 3 cards now (defer 4th to +30-day metric review). Casey's brief asks the same question one more time: **should the tour include a 4th card on community values / expectations** (e.g., "Be honest about what you have. Don't no-show. If something goes wrong, talk to the other person.")?

**Casey's recommendation:** **No 4th card in v1.** Reasoning:

1. The mission narrative (`community/mission.md`) explicitly says "the same person making a mutual-aid app should not be making a database that could be turned against the people using it" — values are communicated by what we DO (mechanics), not what we SAY (a values card). A values card would slip into "we believe…" territory the voice rules forbid.
2. Mara is finding formula at 11pm. A 4th card on values is friction she hasn't asked for.
3. The values that matter for behavior (be honest, don't no-show) are better surfaced inline at the moment they apply (e.g., a Confirm-pickup screen could include a line like "If the other person no-showed, mark it. It helps the community."), not preached in onboarding.
4. The `community/mission.md` doc is the values manifesto, and Profile or About can link to it for users who want to read it. Phase 3 has a Help/FAQ screen (Phase 2 #14) that's a natural home for values context.

**Default if Sky says nothing:** ships 3 cards.

- [ ] Approve 3 cards (default)
- [ ] Edit — ship a 4th community-values card (Casey writes; new Jordan review trigger since values copy is subjective)

### Casey-DFS-2: Naming Supabase on Card 1 vs neutral phrasing

Card 1 names Supabase as the backup-holder: `Supabase backups keep a copy for 7 days, then it's gone.` Alternative neutral phrasing: `Database backups keep a copy for 7 days, then it's gone.`

**Casey's recommendation:** **Keep "Supabase."** Reasoning: honest about who actually holds the data; matches PRIVACY.md's openness. If Sky thinks vendor-naming is too much for a 60-word card, "Database backups" is a clean fallback.

- [ ] Approve "Supabase backups" (default)
- [ ] Edit — use "Database backups"

### Casey-DFS-3: Card 3 button count — one or two?

Casey recommends one button (Get started) on Card 3 because the brief's specified secondary CTA "Get started" is functionally identical to the primary. Shamus may default to two buttons if their component reuse pattern wants symmetry across all cards.

**Casey's recommendation:** **One button on Card 3.** Two identical buttons confuses screen-reader users (Alex review trigger).

- [ ] Approve one button (default)
- [ ] Edit — two buttons (matches Card 1/2 layout exactly)

---

## Sign-off chain (per Quinn DFS-5 default — Casey-final after Will + Alex + Jordan)

- [x] **Casey** — copy authored. _2026-05-24_ — Casey (this v2 document).
- [ ] **Will** — voice polish review. _Pending Phase 2 build kickoff._
- [ ] **Jordan** — privacy-load-bearing copy review (the 6 flagged sentences above + the 3 cited PRIVACY.md decisions). _Pending; spec says light review required._
- [ ] **Alex** — a11y review (screen-reader announcements + accessibility hints + contrast assumptions + dynamic-type wrap behavior at 200%). _Pending Phase 2 build kickoff._
- [ ] **Shamus** — ships into `OnboardingTourScreen.tsx` after the above three sign off. _Pending Phase 2 build kickoff._

---

_End of file. No code touched. No external message sent. File-only output per Constitution Art. 9 + BACKGROUND mode rules. Casey — 2026-05-24._
