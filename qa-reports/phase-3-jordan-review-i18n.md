# Privacy review — Phase 3.4 Multi-language (i18n) — Jordan — 2026-05-24

> **NOT A LAWYER DISCLAIMER.** Jordan is the Privacy Advisor role inside Sky's Claude Corp system, not a licensed attorney. Nothing in this document is legal advice. PIPEDA references and claims about how translation accuracy interacts with informed-consent doctrine are reasoned from publicly-available privacy literature as of the review date. Before public launch, a qualified Canadian privacy lawyer must independently sign off on the multilingual privacy policy — see PRIVACY.md D10 and Cycle 7 ship-readiness.

> **Status: APPROVED WITH CONDITIONS.** 2 BLOCKING conditions, 2 PRIVACY.md amendments proposed, 1 DECISION FOR SKY. This is a LIGHT review per spec (translations are copy), but the load-bearing risk is concentrated in a narrow band of strings that warrant tighter sign-off.

---

## Scope of this review

This is the LIGHT privacy review of `qa-reports/spec-phase-3-i18n.md` against:

- `PRIVACY.md` (🟢 APPROVED 2026-05-23, locked) — unchanged by i18n in content; affected in translation
- Constitution Art. 7.6 — privacy review mandatory for marginalized-group + location data; sign-off required even when the change is "just copy"
- `research/personas/persona-mara-2026-05-23.md` — implicit: privacy-critical microcopy must be accurate in her language
- `research/personas/persona-keo-2026-05-23.md` — implicit: terminology around "verification" / "identity" carries different weight in non-English contexts
- `research/personas/persona-deb-2026-05-23.md` — implicit: bilingual / multilingual community fridges need accurate translations for trust

The spec is sound. The architectural anchor — "NEVER AI-translate, even as a draft for sanity-checking" (AC-9) — directly maps to the privacy contract: a mistranslation in a privacy-critical string breaks the informed-consent foundation of PRIVACY.md.

---

## Verdict

**APPROVED WITH CONDITIONS.**

i18n is a LIGHT privacy review per spec because translations are copy, not data. PRIVACY.md does not gain new tables, columns, or third-party recipients (with one minor caveat below).

However, translation accuracy is the privacy risk vector. The contract Mutual Mesh signs with each user is the privacy policy + the inline microcopy + the delete-confirmation copy. If any of those mistranslates in a way that misrepresents what data is collected, what's retained, or what the user is agreeing to, the privacy contract is broken for that user — even though the English original was correct.

The two BLOCKING conditions below isolate the narrow band of privacy-critical strings and require two-person native-speaker review for that subset, not just for the general translation. The remaining 3 concerns are recommendations.

---

## Concerns and recommendations

### Concern 1 — Privacy-critical strings need native-speaker sign-off before any language ships (BLOCKING)

The spec's AC-9 already requires native-speaker review for each language. That covers the general translation. This concern is tighter: a specific subset of strings carry the privacy contract, and a mistranslation in any of them is a privacy incident, not a quality bug.

The privacy-critical string subset (Jordan-defined):

1. **Privacy policy text** (the in-app surface that ships in Phase 4 #21). Every assertion about what data we collect, what we retain, who sees it, and how to delete. A mistranslation that says "we share your email with partners" when the English says "we never share your email" is a contract break.
2. **Onboarding tour cards (Phase 2 — already shipped).** The cards introduce the user to the trust model: handle vs real name, FSA-not-postal-code, EXIF-stripping, etc. If a card's translation misrepresents what's collected, the user gives consent on a false premise.
3. **Delete-confirmation copy** (PRIVACY.md D6 — "Honest backup-window disclosure"). The user must understand that account delete is a hard delete in the live database but data is recoverable from Supabase backups for up to 7 days. A mistranslation that says "deletion is instant" or omits the backup-window disclosure breaks the trust contract.
4. **"Why we need this" microcopy under every privacy-sensitive input** (signup handle, postal prefix, photo upload, contact handle, push notification toggle, language picker). These microcopy strings explain WHY a field is collected; mistranslation can change the meaning of consent.
5. **Push notification opt-in disclosure** (Phase 3.1 microcopy disclosing Apple/Google/Expo per the push review). Must accurately convey that those parties see delivery metadata.
6. **Map view tile-provider disclosure** (Phase 3.2 microcopy disclosing the chosen tile provider per the map review). Must accurately convey that the provider sees viewport metadata.
7. **OS-level permission rationale strings** (the system prompts: "Mutual Mesh wants to send notifications" / "Mutual Mesh wants to access your photos for resource posting"). iOS shows these in modal dialogs; mistranslation can change what the user thinks they're agreeing to.
8. **Error messages that disclose data behavior** (e.g., the rate-limit error "Too many requests — try again in 5 minutes" implicitly discloses we count requests).

For every language that ships, the privacy-critical subset above must pass a SECOND native-speaker review specifically for privacy-meaning preservation, AFTER the general AC-9 two-person review. This is three eyes minimum on the privacy-critical subset, not just two.

**BLOCKING CONDITION 1.1:** Casey + Riley engage a third native-speaker reviewer per language whose specific brief is "verify that every string in the privacy-critical subset (Jordan provides the list of message IDs) preserves the privacy meaning of the English original." Jordan provides the list of message IDs to Casey before each language's review cycle starts. Sky personally approves each language before it ships, per AC-9.

**BLOCKING CONDITION 1.2:** The privacy policy text (Phase 4 #21) must NOT ship in any non-English language until Sky AND a qualified Canadian privacy lawyer (per PRIVACY.md D10) have reviewed both the English original AND each translation. This is a Cycle 7 ship-readiness gate, not a Phase 3.4 i18n gate — but Jordan surfaces it now so Will + Casey + Sky plan for it.

### Concern 2 — AI-translation hard ban (APPROVED, but DFS-7 carve-out needs tightening)

AC-9 says "NEVER use AI-translation, including Google Translate, DeepL, or LLM-translation, even as a draft or sanity check." This is right.

Quinn's DFS-7 proposes a carve-out: AI as first-draft + human post-edit is acceptable IF (a) the translator discloses it, (b) the post-edit is substantive, (c) the second reviewer is NOT given the AI source.

Jordan's privacy-driven take on DFS-7: the carve-out is risky for two reasons.

First, sending source content (especially privacy-critical strings) to a third-party AI translation API is itself a data egress. The English source strings are not user data, but they ARE pre-launch product context that competitors and adversaries would value. Sending them to Google Translate / DeepL means those companies see and may retain the content.

Second, "substantive post-edit" is not auditable. We can't verify how much the translator post-edited; we trust their disclosure. The two-person review (AC-9) provides some defense, but if both reviewers are blind to the AI involvement (per (c)), they can't catch AI artifacts that aren't substantive errors but ARE subtly wrong (e.g., a slightly mis-positioned negation).

**RECOMMENDATION (non-blocking, but recommend tightening DFS-7):** Sky's resolution of DFS-7 should pick "absolute ban on AI in any role, including first draft." This is more restrictive than Quinn's default. The cost is a slightly longer translator timeline. The benefit is no data-egress risk + auditable provenance. Translators who insist on AI tooling can decline the engagement.

If Sky goes with Quinn's default (AI as first-draft acceptable), Jordan requires: (1) translators sign a disclosure-of-tooling addendum to their NDA, (2) the privacy-critical subset (Concern 1.1) is REQUIRED to be human-from-scratch with no AI involvement at any stage. The carve-out applies only to non-privacy-critical strings.

### Concern 3 — Per-user language preference column (DFS-4) introduces minor metadata (APPROVED with note)

Quinn's DFS-4 proposes adding a `locale TEXT` column to `public.users` to support push notification delivery in the user's language. Jordan agrees with the recommendation: the column is non-sensitive (a 2-3 char locale code), the migration is small, and the alternative (passing locale through `push_tokens`) couples push and i18n in unhelpful ways.

That said, the locale column is metadata that wasn't in PRIVACY.md's original inventory. It needs a new row in the data inventory table.

**RECOMMENDATION (non-blocking):** Add a PRIVACY.md edit for the new column (see "PRIVACY.md edits proposed" below). The column is non-sensitive but should be enumerated for completeness.

### Concern 4 — No language detection from user-generated content (APPROVED)

The spec's Section 5 (Data view) explicitly forbids "Language detection from user-generated content" and "Reverse-translation to verify accuracy" and "Language as a marketing-segmentation field." This is right.

Approved. No further action.

### Concern 5 — Translator engagement: NDA and what translators see (APPROVED with tightening)

DFS-5 proposes Casey drafts an NDA covering confidentiality, AI prohibition, marginalized-group context, and credit. This is the right starting point.

Jordan's tightening:

- Translators MUST NOT receive screenshots from staging that contain real user data (the spec already says this in Section 5). Mocked screenshots with placeholder content only.
- Translators MUST NOT receive access to the staging environment, the Supabase project, or any internal system. They work from the JSON source files only.
- Translators MUST agree that any drafts, intermediate files, and feedback comments are returned or destroyed at engagement end. Standard NDA language but worth being explicit given the marginalized-group context.
- Translator credit (per AC-9) must be optional and support pseudonymous credit. A translator working on Spanish for refugee-newcomer networks may not want their real name in the app credits (because they may be a community member of that network themselves).

**RECOMMENDATION (non-blocking):** Casey incorporates the four tightening points above into the NDA draft; Jordan re-reviews when the draft is ready. Surface to Casey via this review.

### Concern 6 — Server-side strings stay English; client-side localized (APPROVED)

AC-14: server-side RPC error messages stay English (technical identifiers); the client-side `userFacingErrorMessage()` helper localizes them. This is the right architecture.

Approved. No further action.

### Concern 7 — Translation file format includes `description` field (APPROVED)

Section 5 shows the translation file format with a `description` field per message ID. This is critical for translators (they need context). Approved.

One observation: the `description` field itself is not translated; it's metadata for the translator. This is correct. Confirm in code review that `description` is stripped from the production bundle (it's not needed at runtime) to save bundle size.

**RECOMMENDATION (non-blocking, perf-adjacent):** Surface to Peter that translation `description` fields should be stripped from production bundle. Likely via `react-intl`'s extract / compile step.

### Concern 8 — Brand name "Mutual Mesh" stays English (APPROVED, with cultural note)

DFS-2 default: brand name never translates. Jordan agrees with the recommendation.

One observation: in some communities, "Mesh" carries connotations (e.g., medical mesh in tort-litigation contexts) that may not translate well. If a Spanish-speaking community member finds the brand jarring, that's a Casey question to flag to Sky during the Spanish review cycle. Not a translation issue; a brand-name issue.

**RECOMMENDATION (non-blocking):** Casey surfaces any community-specific brand-name concerns to Sky during the Spanish review cycle (and future language cycles). This is a Casey-owned signal, not a Jordan-blocked decision.

---

## DECISIONS FOR SKY

> One DECISION FOR SKY in this review. Jordan's recommendation in parentheses.

### DFS-I18N-1: AI-translation carve-out — Quinn's DFS-7 default vs Jordan's tightening?

Quinn's DFS-7 proposes AI-as-first-draft-with-human-post-edit is acceptable IF disclosed + substantively post-edited + second-reviewer-blind-to-AI. Jordan recommends tightening.

- **(a) Quinn's default** — AI as first-draft acceptable per (a)(b)(c).
- **(b) Jordan's tightening** — absolute ban on AI in any role, including first draft. Translators sign no-AI-tooling agreement.
- **(c) Hybrid** — privacy-critical subset (Concern 1.1) is human-from-scratch no AI; other strings can use AI-first-draft per Quinn's (a)(b)(c).

**Jordan's recommendation:** **(b) absolute ban.** Cleanest privacy posture; eliminates third-party data-egress risk on source strings. The cost is a slightly longer translator timeline; acceptable for v1 cadence. (c) hybrid is the next-best option if (b) is too restrictive for Casey's translator pool.

- [ ] Approve (b) absolute AI ban (Jordan's recommendation)
- [ ] Edit — (c) hybrid: privacy-critical subset is no-AI; other strings allow AI-first-draft
- [ ] Edit — (a) Quinn's default (AI as first-draft acceptable)

---

## PRIVACY.md edits proposed (DO NOT APPLY — Sky approves; Jordan writes via separate PR)

The following are proposed edits to PRIVACY.md. Jordan does NOT apply them in this review (file-only, no PRIVACY.md modification per constraint). Sky reviews these edits and, if approved, Jordan writes them in a follow-up privacy branch.

### Edit 1 — Add row to "Data inventory (final)" table for `users.locale` (if DFS-4 (b) lands)

Add as row 18 (assuming push review's edits land first as rows 16 + 17):

| 18 | Language preference (locale code) | `public.users.locale` (TEXT, 2-3 chars) | Set from device locale on signup; overridable by user in Profile | Push notification + UI localization | Until account delete | Self-read; Edge Function reads on push delivery | No (non-sensitive locale code) |

### Edit 2 — Add new "Multilingual privacy policy maintenance" subsection

Insert after the "Map view tile provider" subsection (and after the push-notification recipients subsection, ordered by Phase):

```
## Multilingual privacy policy — maintenance commitment (Phase 3.4)

The English version of this PRIVACY.md document is the source of truth. As the app ships in additional languages (initially English, French, Spanish per Phase 3.4), each translated privacy policy is a derived artifact that MUST:

1. Be translated by a professional or community native speaker (NEVER AI-translated, per i18n spec AC-9).
2. Pass the AC-9 two-person review + a third Jordan-specified privacy-meaning review for the privacy-critical string subset (Phase 3.4 jordan-review-i18n.md Concern 1.1).
3. Be reviewed by a qualified Canadian privacy lawyer (PRIVACY.md D10) before public launch in that language.
4. Be re-translated whenever the English source changes in a privacy-meaningful way (any edit to data-inventory rows, decisions D1-D12, retention windows, or third-party recipients). NOT every English edit triggers re-translation — only privacy-meaningful changes.
5. Carry a footer noting the source version of the English document it was translated from (e.g., "Translated from PRIVACY.md as of 2026-05-24"), so a user can identify drift.

Sky personally approves each language's privacy policy before it ships. Casey coordinates the translator engagement; Will writes the translation-maintenance runbook.

**Maintenance burden:** maintaining N languages multiplies the cost of every privacy-meaningful change by N. Sky evaluates this trade-off at each DECISION FOR SKY that affects privacy meaning (D1-D12 and any future addition). This is the price of serving non-English-speaking communities under a real informed-consent standard.
```

### Edit 3 — Add new decision D13 to "DECISIONS FOR SKY" section

```
### D13: Multi-language privacy policy commitment (Phase 3.4 — added 2026-05-24)

**Proposal:** As the app ships in additional languages, the privacy policy + all privacy-critical microcopy is translated by professional / native-speaker translators (NEVER AI). Each translation passes a three-eyes review: AC-9 two-person + Jordan-specified privacy-meaning review for the privacy-critical subset. Sky personally approves each language. A qualified Canadian privacy lawyer reviews before public launch in each language. Re-translation is triggered by privacy-meaningful English source changes.

**Why:** A privacy contract that exists only in English is no contract for non-English-speaking users. Mara, Keo, and Deb's personas all include audiences whose first language is not English. Casey's Tier-1 partner networks (refugee/newcomer orgs, Quebec tenant unions) require a working multilingual privacy contract for adoption.

**Maintenance burden:** N-language multiplication on every privacy-meaningful change. Accepted as the price of inclusion.

**Alternative considered:** Ship the app in N languages but keep the privacy policy English-only. Rejected — informed-consent failure for non-English-speaking users.
**Rollback:** A language can be removed if maintenance proves unsustainable (Casey + Sky decide). The English contract remains the source of truth.

- [ ] (Sky reviews after Phase 3.4 amendment lands)
```

---

## What this review does NOT cover

- The library choice (Quinn's DFS-1: react-intl vs i18next vs lingui). Privacy posture is equivalent across all three; Quinn's (a) react-intl is fine.
- The bundle-size impact of adding three locales' CLDR data (Peter's perf review covers).
- The translator budget (Quinn's DFS-3; Casey + Sky decide).
- The exact wording of any translated string (translators + native-speaker reviewers + Casey + Sky's final approval per AC-9).
- RTL plumbing (Alex's accessibility review covers).
- Snapshot test coverage per locale (Gary's QA review covers).
- A real Canadian privacy lawyer's PIPEDA analysis of each translation (Cycle 7 ship-readiness per PRIVACY.md D10 + Concern 1.2 above).

---

## Summary table

| Concern # | Topic                                                            | Verdict                                                                       | Blocking?                   |
| --------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| 1         | Privacy-critical strings need three-eyes native-speaker sign-off | APPROVED with BLOCKING (third reviewer per language + lawyer for policy text) | BLOCKING (2 sub-conditions) |
| 2         | AI-translation hard ban + DFS-7 carve-out                        | APPROVED, recommend tightening DFS-7 to absolute ban                          | NO (DECISION)               |
| 3         | Per-user `locale` column metadata                                | APPROVED with PRIVACY.md edit                                                 | NO                          |
| 4         | No language detection from user-generated content                | APPROVED                                                                      | NO                          |
| 5         | Translator engagement / NDA scope                                | APPROVED with four tightening points for Casey's NDA draft                    | NO                          |
| 6         | Server-side strings stay English                                 | APPROVED                                                                      | NO                          |
| 7         | Translation file `description` metadata                          | APPROVED, perf-adjacent (strip from prod bundle)                              | NO                          |
| 8         | Brand name stays English                                         | APPROVED, Casey surfaces any cultural concerns                                | NO                          |

**BLOCKER count: 2 (Concern 1.1, 1.2; the latter is a Cycle 7 gate, not a Phase 3.4 gate, but flagged now).**
**PRIVACY.md edits proposed: 3 (1 inventory row for locale + 1 new multilingual-maintenance subsection + 1 new D13 decision).**
**DECISIONS FOR SKY: 1 (DFS-I18N-1 AI-translation carve-out).**

---

**Jordan — 2026-05-24** — file-only privacy review, no PRIVACY.md modification, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
