# Jordan privacy review — Phase 2 Onboarding Tour — 2026-05-24

**Reviewer:** Jordan (Privacy Advisor)
**Scope:** LIGHT review (copy review — the cards' COPY is the operational privacy story; underlying data is one boolean column)
**Spec under review:** [`qa-reports/spec-phase-2-onboarding-tour.md`](spec-phase-2-onboarding-tour.md) — Quinn, 2026-05-24
**Casey's copy (READY for Jordan review):** [`community/onboarding-tour-copy.md`](../community/onboarding-tour-copy.md) — Casey, 2026-05-24
**Source of truth:** [`PRIVACY.md`](../PRIVACY.md) (status 🟢 APPROVED — locked 2026-05-23) — specifically D1, D2, D6, D8
**Constitution authority:** Art. 7.6 (privacy review mandatory) + Art. 9 (file-only; no external send)

---

## ⚠️ NOT A LAWYER DISCLAIMER

This document is Jordan's structured privacy review of a feature spec — **NOT legal advice.** Jordan is an AI role following Constitution Art. 4 mandate to label all findings as "draft for legal review." The copy in this review describes the privacy MODEL of Mutual Mesh in plain language. A lawyer's review of the privacy POLICY (Phase 4 #21) is a separate, mandatory step before public launch. The tour is the "tasting menu"; the policy is the "full meal" (per spec privacy section #6). Sky must budget the Canadian privacy lawyer consultation per PRIVACY.md D10.

---

## Verdict: **APPROVED_WITH_CONDITIONS**

The spec's underlying schema + RPCs are privacy-safe. Casey's copy is privacy-accurate and Jordan-approved for all 3 cards **with two small conditions** (none are showstoppers; both are clarifying):

1. **C1 — Casey's copy is the binding deliverable.** Quinn's strawman copy in the spec (AC-4) was a placeholder. Casey has now written the real copy (`community/onboarding-tour-copy.md`) and Jordan reviews THAT. Shamus must wire Casey's copy verbatim, not the spec's strawman. Sub-condition: if any future copy iteration weakens or removes the load-bearing privacy claims (the three pillars below), Jordan must re-review.

2. **C2 — Card 1 backup-window honesty per PRIVACY.md D6.** Casey's copy reads: "Profile has a Delete button that wipes everything you posted." Jordan reviewed and the phrasing is accurate (per D6 cascade behavior). **Casey deliberately did NOT add Supabase's 7-day PITR window disclosure in this card** — that disclosure lives in the in-app delete CONFIRMATION copy (per D6 + Casey's `[JORDAN REVIEW]` flag #1). Jordan concurs with Casey's reasoning that the tour is a tasting menu and the full backup-window disclosure belongs on the delete-confirmation screen. **Condition:** Shamus must confirm the in-app delete confirmation copy already discloses the 7-day PITR window OR add that disclosure before merging this spec. Will to verify.

No BLOCKER on either the spec's mechanics or Casey's copy. Jordan's per-card sign-off checklist is below.

---

## Data assessment — what changes

### Schema delta

- One column: `public.users.onboarding_complete BOOLEAN NOT NULL DEFAULT false`. Self-read only (covered by existing `users_self_select` policy; no new policy needed per AC-1).
- Two new RPCs: `complete_onboarding()` and `reset_onboarding()`, both `SECURITY DEFINER`, both scoped to `auth.uid()`-self only.

### What's NOT added

- No new PII.
- No analytics event. No tour-interaction tracking ("did the user swipe forward, skip on card 2 specifically"). Quinn's AC + Casey's notes both confirm zero tracking.
- No A/B test infrastructure.
- No third-party SDK (PRIVACY.md D8 preserved).
- No new admin surface — admins cannot see who has and hasn't completed the tour (even Sky via direct SQL CAN, but no UI surfaces it).

### Data inventory delta (proposed addition to PRIVACY.md table — see "Proposed PRIVACY.md edits" below)

| #   | Field                 | Table.column                       | Collected at    | Purpose                  | Retention                         | Who sees it                                 | Encrypted at rest |
| --- | --------------------- | ---------------------------------- | --------------- | ------------------------ | --------------------------------- | ------------------------------------------- | ----------------- |
| 20  | `onboarding_complete` | `public.users.onboarding_complete` | Tour completion | UX gate (show tour once) | Until account delete (D6 cascade) | Self only (matches `users_self_select` RLS) | No                |

Trivial schema delta. No new visibility, no new join.

---

## Privacy-load-bearing copy review (the gating concern)

The spec correctly identifies that the **copy** is the privacy review target, not the schema. The tour describes Mutual Mesh's privacy promises in plain language. If the copy lies or misleads, that's a privacy failure regardless of code correctness.

Jordan reviewed Casey's `community/onboarding-tour-copy.md` against Quinn's spec AC-4 and the source-of-truth PRIVACY.md. Per-card sign-off below.

### Card 1: The Privacy Gate

**Casey's headline:** `You're in.`
**Casey's body:** `A community admin let you in. Leave any time — Profile has a Delete button that wipes everything you posted.`

**Required claims per spec AC-4 + Quinn pre-audit + task scope:**

| Required claim                                              | Present in Casey's copy?                                                       | Accuracy                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Users can leave the network any time                        | Yes — "Leave any time"                                                         | ACCURATE (matches D6 cascade)                                                                                                       |
| Leave mechanism is in Profile (delete-my-account)           | Yes — "Profile has a Delete button"                                            | ACCURATE (matches PRIVACY.md D6 + `delete_my_account` RPC)                                                                          |
| Delete is NOT promised as "instant" (D6: 7-day PITR window) | Yes — body says "wipes everything you posted" not "instantly" or "immediately" | ACCURATE (intentionally generic; backup-window honesty lives on the delete-confirmation screen per Casey's [JORDAN REVIEW] flag #1) |

**Jordan's verdict for Card 1:** **APPROVED.**

Reasoning: Casey's copy is accurate per PRIVACY.md D6. The "wipes everything you posted" phrasing is operationally honest — the `delete_my_account` RPC cascades through `resources` + Storage + auth.users. The deliberate omission of "instant" or "immediately" leaves room for the backup-window disclosure to live on the delete-confirmation screen, which is the right architecture per PRIVACY.md D6 ("Disclose Supabase 7-day PITR window in the in-app deletion confirmation copy"). The tour is a tasting menu (spec privacy section #6); the policy is the full meal.

**Sub-condition C2:** Will to verify that the in-app delete confirmation copy already discloses the 7-day PITR window. If not, that's a separate small piece of work that should land before this spec ships (so the tour's "Delete button" promise doesn't ship before the supporting disclosure). Jordan does NOT block the tour spec on this — but flags it as a dependency that should be checked at merge time.

### Card 2: Your Handle

**Casey's headline:** `Pick a handle, not a name.`
**Casey's body:** `No real names — not yours, not your kid's. Change your handle any time. See someone using a real name? Skip that listing.`

**Required claims per spec AC-4 + Quinn pre-audit + task scope:**

| Required claim                                                                      | Present in Casey's copy?                                                                                                                                                                                                     | Accuracy                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handles are public to other verified users                                          | **Partial — implied, not stated.** Casey's copy describes what TO DO ("pick a handle, change anytime, no real names, skip real-name listings") but does not explicitly say "your handle is visible to other verified users." | **ACCURATE BY OMISSION** — the user-facing copy is operationally correct (no real names = handle is public), but a strict reading would flag the omission. See "Per-card sign-off" below. |
| Real names should not be used (anywhere — your kid's, your roommate's, etc.)        | Yes — "Not yours, not your kid's" + "See someone using a real name? Skip that listing."                                                                                                                                      | ACCURATE (matches D1 EDITED — Sky's strengthening that real names are never collected, stored, OR used as a handle/contact value anywhere)                                                |
| Must NOT promise anonymity to admins (admins can see handle + postal + city per D9) | **PASS by omission** — the copy makes no claim about admin visibility either way. The spec correctly defers full admin-visibility disclosure to Phase 4 #21 privacy policy.                                                  | ACCURATE (no promise made = no promise broken)                                                                                                                                            |

**Jordan's verdict for Card 2:** **APPROVED.**

Reasoning: The narrower phrasing "not yours, not your kid's" (per Casey's [JORDAN REVIEW] flag #2, trimmed from Quinn's strawman "yours, your kid's, your roommate's" for the 140-char limit) is acceptable. Both phrasings convey the same load-bearing message: do not use real names. Mara's CAS-fear case is the strongest emotional case ("not your kid's") and Casey deliberately optimizes for it. Jordan does not push back on the trim; the 140-char limit is real and the narrower phrasing still communicates the rule.

The omission of "handles are public to verified users" is not a privacy failure. The user can infer it (the marketplace shows handles). The omission of "admins also see your handle and postal prefix" is also not a privacy failure (it's not a promise broken; it's a fact deferred to the privacy policy). The TASTING-MENU principle (spec privacy section #6) applies: the tour describes the load-bearing user behaviors, not the full data inventory.

**Jordan suggestion (NOT a blocking condition):** in a future v1.1 iteration when the privacy policy lands (Phase 4 #21), consider adding a fourth tour card (Quinn's DFS-2 alternative) that's explicit about the "what admins see" model. This would deepen the trust signal and move from tasting-menu to a richer disclosure path. Out of scope for this cycle.

### Card 3: The Claim Model

**Casey's headline:** `You see each other on claim.`
**Casey's body:** `Tap Claim and the poster sees your handle. You see the contact they chose (Signal, Proton, etc.). Pickup happens off-app.`

**Required claims per spec AC-4 + Quinn pre-audit + task scope:**

| Required claim                                                                                                      | Present in Casey's copy?                                                                                                                                                                                                                        | Accuracy                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Claiming reveals contact handle to the poster                                                                       | **Partial — bidirectional.** Casey's copy says "the poster sees your handle" (claimant → poster reveal) AND "You see the contact they chose" (poster → claimant contact-handle reveal). The bidirectional reveal is accurate per PRIVACY.md D2. | **ACCURATE.** Casey strengthens Quinn's strawman ("the poster sees that you've claimed it") to be explicit about both sides of the reveal. |
| Must NOT over-promise privacy ("you can talk privately on Signal/etc — that's outside Mutual Mesh's promise scope") | Yes — "Pickup happens off-app" + the parenthetical "(Signal, Proton, etc.)" is illustrative not directive                                                                                                                                       | ACCURATE (does not promise the off-app channel is private; Mutual Mesh's promise scope ends at the contact-handle reveal)                  |
| Naming Signal/Proton — is it too directive?                                                                         | Casey flagged in [JORDAN REVIEW] flag #3 — should we name them or say "(whatever channel they trust)"?                                                                                                                                          | **JORDAN'S CALL: keep Signal/Proton as named examples.** See reasoning below.                                                              |

**Jordan's verdict for Card 3:** **APPROVED.**

Reasoning on the naming of Signal/Proton (Casey's flag #3):

- **Pro keep:** Concrete examples ground the abstract "contact handle" concept. Both personas already use Signal (Mara: postpartum support Signal group; Keo: heavy Signal user). The names anchor the user in tools they already trust.
- **Con keep:** Could imply endorsement (Mutual Mesh recommends these specific tools). Could become stale if Signal/Proton fall out of favor. Could exclude users who use other channels (WhatsApp, Telegram, SMS, etc.).
- **Net:** the parenthetical "(Signal, Proton, etc.)" mitigates the "endorsement" reading — the "etc." signals these are examples, not requirements. The schema is free-text (per D2 + Steve S3) so users can type whatever they want. Jordan supports Casey's keep-the-names default.

Final clause "Pickup happens off-app" (Casey's flag #4): **STRONGLY ENDORSED.** This is the sentence that prevents users from waiting for an in-app chat that doesn't exist. It is also the operational form of `mission.md`'s "Mutual Mesh is not a messaging app" position. Critical to keep.

The bidirectional reveal explicitness ("the poster sees your handle ... You see the contact they chose") is BETTER than Quinn's strawman because it makes the symmetry visible. A claimant who reads this card before tapping Claim understands they are NOT anonymous to the poster. This is honest disclosure that respects Mara's anti-goal #4 (no surprise reveals). **PASS.**

---

## Per-card sign-off checklist

| Card                       | Required Claims                                                                                                       | Casey's Copy Accurate?                                                                                                                                | Privacy Verdict |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Card 1** (Privacy Gate)  | Users can leave; mechanism is in Profile; do NOT over-promise "instant" delete (7-day PITR per D6)                    | YES — accurate, omits "instant" deliberately, defers backup-window disclosure to delete-confirmation screen                                           | APPROVED        |
| **Card 2** (Handle System) | Handles are public to verified users; do NOT promise anonymity to admins (D9: admins see handle + postal + city)      | YES by omission — copy describes what the user should DO (no real names, change anytime, skip real-name listings); does not claim anonymity to admins | APPROVED        |
| **Card 3** (Claim Model)   | Claiming reveals contact handle to the poster; do NOT over-promise privacy ("Signal/etc — outside our promise scope") | YES — bidirectional reveal made explicit; "Pickup happens off-app" anchors the no-in-app-chat boundary                                                | APPROVED        |

**All 3 cards: APPROVED.**

---

## Casey's [JORDAN REVIEW] flags — responses

Casey flagged 4 sentences in her copy file. Jordan's responses:

1. **Card 1 body — backup window disclosure here or on delete-confirmation screen?**
   - **Casey's position:** keep on delete-confirmation screen (tasting menu vs full meal).
   - **Jordan's response:** **AGREE.** The tour describes user behaviors; the operational disclosure (7-day PITR) lives where the user is about to take the irreversible action. See Condition C2 above — Will verifies the delete-confirmation copy still discloses the PITR window.

2. **Card 2 body — narrower phrasing ("not yours, not your kid's") vs Quinn's strawman ("yours, your kid's, your roommate's").**
   - **Casey's position:** keep the trim; 140-char limit; "your kid's" covers Mara's strongest case.
   - **Jordan's response:** **AGREE.** Both phrasings communicate the no-real-names rule. The trim is acceptable given the character limit. Mara's case is the load-bearing emotional anchor.

3. **Card 3 body — naming "Signal, Proton" vs neutral "(whatever channel they trust)".**
   - **Casey's position:** keep named examples (grounding for personas who already use them).
   - **Jordan's response:** **AGREE.** Concrete examples reduce confusion. The "etc." parenthetical mitigates the endorsement-reading concern. Schema is free-text so users can type whatever.

4. **Card 3 body, final clause — "Pickup happens off-app."**
   - **Casey's position:** strongly keep; this is the sentence that prevents users from waiting for an in-app chat.
   - **Jordan's response:** **STRONGLY AGREE.** Load-bearing for setting expectations. Must remain in any future copy iteration. Removing it would be a Jordan re-review trigger.

---

## Persona impact assessment

### Mara (recipient)

- Card 1 reinforces her safety net (delete-my-account is reachable; "wipes everything you posted" is accurate).
- Card 2 directly speaks to her CAS-fear ("not your kid's" — her 4-month-old's name).
- Card 3 makes the claim-side reveal explicit BEFORE first claim — she's not surprised when the poster sees her handle.
- **PASS.** Casey's persona-fit notes (lines 36-38, 56-58, 75-78) are accurate and Jordan concurs.

### Keo (organizer)

- Card 1 frames the exit as a trust signal, not a threat ("Leave any time" — no "your account will be deleted in 30 days" framing).
- Card 2 respects identity fluidity ("Change your handle any time" matches their deadname-on-Apple-ID-vs-chosen-name-elsewhere context).
- Card 3 names Signal — the tool Keo already runs encrypted-comms training on. The off-app pickup pattern matches their existing Signal-thread workflow.
- **PASS.** Casey's persona-fit notes are accurate.

### Deb (poster)

- Short and factual; respects her tech-confidence and impatience.
- Card 2 gives her the moderation cue (skip real-name listings) without requiring a separate "how to spot bad listings" tutorial.
- Card 3 is poster-side ("you see the claimant's handle" → her triage workflow per persona-line 42).
- **PASS.** Casey's persona-fit notes are accurate.

**Counter-check (Casey's notes lines 147-149):** No persona is centred at another's cost. Each card serves all 3 personas via different readings of the same sentence. Jordan independently verifies this and concurs.

---

## Casey-DFS notes (3 additional Casey-introduced DECISIONS FOR SKY)

Casey added 3 minor decisions beyond Quinn's 5. Jordan's privacy-perspective notes:

- **Casey-DFS-1 (microcopy under buttons):** Privacy-neutral. The "2 more — about 30 seconds" hint and "Profile has 'See intro again.'" hint don't make any privacy claims. **No Jordan input.**

- **Casey-DFS-2 ("Skip" link wording):** Privacy-neutral. **No Jordan input.**

- **Casey-DFS-3 (headlines as statements vs questions):** Privacy-neutral. **No Jordan input** — but Jordan endorses Casey's reasoning (questions imply the reader is confused, which is condescending; statements respect the reader). This is a UX/voice call, not a privacy call.

---

## Spec mechanics — independent verdict

Setting the copy aside, the spec's underlying mechanics:

| Mechanic                                                                              | Privacy verdict                                                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `onboarding_complete BOOLEAN` self-read only                                          | APPROVED (matches existing RLS pattern)                                                |
| `complete_onboarding()` RPC — `auth.uid()`-scoped, `SECURITY DEFINER`                 | APPROVED (same pattern as `delete_my_account`, `claim_resource`)                       |
| `reset_onboarding()` RPC — same pattern                                               | APPROVED                                                                               |
| No tracking of "did the user complete or skip" — DFS-4 default                        | STRONGLY APPROVED (preserves D8 no-analytics posture)                                  |
| Re-openable tour via Profile "See intro again" — DFS-3 default                        | APPROVED (trust signal: the privacy story is so important it's re-readable)            |
| 3-card cap — DFS-2 default                                                            | APPROVED (respects Deb's tech-confidence + Mara's "I want to get to the formula" goal) |
| No backfill of existing users — DFS-1 default                                         | APPROVED (~5-10 staging testers seeing the tour once is acceptable)                    |
| Gate routing source-of-truth is `users.onboarding_complete`, not AsyncStorage — AC-10 | APPROVED (matches PRIVACY.md S7 — AsyncStorage is non-PII state only)                  |

**Mechanics verdict: APPROVED.** No BLOCKER, no DECISION FOR SKY beyond Quinn's existing 5 + Casey's existing 3.

---

## Per-DFS notes (Jordan's read on Quinn's 5 + Casey's 3)

Quinn's DFS-1 through DFS-5 + Casey's Casey-DFS-1 through Casey-DFS-3 are all privacy-neutral or privacy-positive. Jordan endorses all defaults:

- **Quinn DFS-1 (no backfill existing users):** Endorse default.
- **Quinn DFS-2 (3 cards):** Endorse default. (Reserve right to suggest a 4th card in v1.1 if Phase 4 #21 privacy policy lands and we want to deepen the disclosure path.)
- **Quinn DFS-3 (re-openable tour):** Strongly endorse default.
- **Quinn DFS-4 (no tracking):** Strongly endorse default.
- **Quinn DFS-5 (Casey-final after Will + Alex + Jordan):** Endorse default. **Jordan's sign-off is this document.**
- **Casey-DFS-1, -2, -3:** Privacy-neutral; endorse Casey's defaults.

---

## Proposed PRIVACY.md edits

Jordan PROPOSES the following PRIVACY.md additions but does NOT modify the file.

### Edit 1: Add row 20 to the data inventory table

```markdown
| 20 | onboarding_complete | `public.users.onboarding_complete` | Tour completion | UX gate (show tour once) | Until account delete (D6 cascade) | Self only (`users_self_select`) | No |
```

### Edit 2: Optional small note under "Decisions log" referencing the tour

After the proposed D11 + D12, an optional D13 — though this is housekeeping, not a privacy-substantive decision:

```markdown
### D13: Onboarding tour — 3-card first-run flow + re-openable from Profile + no tracking (Phase 2 #8)

**Proposal:** Add `users.onboarding_complete` BOOLEAN; gate route shows tour to verified users with `onboarding_complete=false`; tour ships 3 cards (privacy gate, handle system, claim model); user can re-open from Profile via "See intro again" link; we do NOT track whether they completed or skipped.

**Why:** Riley's friction #1 (empty-marketplace) + #4 (claim-model confusion). Sets correct expectations before first claim. Trust-on-arrival moment for Keo. Casey's verification-to-active conversion improves.

**Mitigation:** Copy is Casey's deliverable, reviewed by Will (voice) + Alex (a11y) + Jordan (privacy). Removing or weakening the three privacy pillars (D1, D2, D6) from the copy is a Jordan re-review trigger.

**Sky's decision recorded:** [pending merge]
```

This is optional; Jordan does not insist.

---

## Casey's copy file — sign-off update

Casey's `community/onboarding-tour-copy.md` has a sign-off chain at lines 186-192:

> - [ ] **Casey** — copy authored. _2026-05-24_ — Casey (this document).
> - [ ] **Will** — voice consistency review. _Pending Phase 2 build kickoff._
> - [ ] **Alex** — a11y phrasing review. _Pending Phase 2 build kickoff._
> - [ ] **Jordan** — privacy-load-bearing copy review. _Pending; spec says light review required._
> - [ ] **Sky** — final merge approval.

**Jordan can now check the Jordan line.** Casey may update her file (Casey's call; Jordan does not modify Casey's file directly per role-lane discipline). Jordan's sign-off is recorded in THIS document with verdict APPROVED_WITH_CONDITIONS (C1 + C2 above).

Will and Alex still need to sign off; their reviews are out of scope for Jordan.

---

## What I shipped

This Jordan privacy review document. No code touched. No Casey file modified. No PRIVACY.md edited (PROPOSED edits above are for Sky to apply if approved at merge). No external message sent (Morgan owns that channel; Jordan operates file-only per Constitution Art. 9).

---

**Jordan — 2026-05-24** — file-only output. Verdict: **APPROVED_WITH_CONDITIONS (C1 + C2 — both small clarifications, not blockers).** No BLOCKER. No new DECISION FOR SKY beyond Quinn's 5 + Casey's 3.
