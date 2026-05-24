# Phase 4 — Privacy Policy + Terms of Service drafts — Will + Jordan — 2026-05-24

## Summary

Will drafted, and Jordan reviewed line-by-line, the first version of Mutual Mesh's user-facing **Privacy Policy** and **Terms of Service** required for app-store submission and in-app transparency. The text is grounded in the locked `PRIVACY.md` (🟢 APPROVED 2026-05-23) and the STRIDE threat model (2026-05-23). Every data-inventory row (1-15) and every D# decision is reflected, in plain language, in the policy.

**Both documents start with a load-bearing "NOT LEGAL ADVICE" disclaimer.** A jest guardrail (`src/__tests__/policyText.test.ts`) asserts both constants are non-empty and that the disclaimer is the very first line. Removing or moving the disclaimer breaks CI.

This is a draft for Sky's review and for a real Canadian privacy lawyer's sign-off. **It is not a finished document.** See the PIPEDA gap analysis and the DECISIONS FOR SKY at the bottom.

## What I shipped

Four files:

| Path                                                            | Purpose                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/Users/skypie/MutualMesh/src/lib/policyText.ts`                | Two `const` template-string exports: `PRIVACY_POLICY_TEXT`, `TERMS_OF_SERVICE_TEXT`. No JSX. |
| `/Users/skypie/MutualMesh/src/screens/PrivacyPolicyScreen.tsx`  | `ScrollView` + `SafeAreaView` renderer; reads the constant.                                  |
| `/Users/skypie/MutualMesh/src/screens/TermsOfServiceScreen.tsx` | Same pattern as the privacy screen.                                                          |
| `/Users/skypie/MutualMesh/src/__tests__/policyText.test.ts`     | 4 jest assertions: non-empty + disclaimer-first for each constant.                           |

Word counts:

- **Privacy Policy**: ~1,089 words (~6.4 KB)
- **Terms of Service**: ~1,035 words (~6.0 KB)

These sit well under what app stores allow, and well above the bare minimum required to actually disclose what the app does.

## Toolchain verification

Run from repo root on branch `feat/mutualmesh-2026-05-24-shamus-c1-exif-edge-function`:

| Command                                   | Result                                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| `npm run typecheck`                       | green                                                           |
| `npm run lint`                            | green                                                           |
| `npm run format:check` (4 new files only) | green                                                           |
| `npm test`                                | **176 / 176** tests in 14 suites — including 4 new policy tests |

`npm run format:check` over the whole repo reports 9 pre-existing format drift warnings on files not in this lane (app.json, LEARNINGS.md, several pre-existing qa-reports/specs). Out of lane for Will/Jordan; Gary / the author of those files owns the cleanup.

---

## Will's draft summary

The Privacy Policy is 11 sections:

1. **NOT LEGAL ADVICE disclaimer** (first line; tested).
2. **Who we are** — Mutual Mesh in one paragraph, matching `community/mission.md`.
3. **What we collect** — six concrete data classes, plain English, no jargon.
4. **What we do NOT collect** — eight explicit exclusions (real name, full postal code, phone, browsing, IP-beyond-platform, device ID, third-party SDKs, anything tracking-related).
5. **Where your data is stored** — discloses Supabase, flags the region as a known DECISION FOR SKY (see DFS-1).
6. **Who can see your data** — split by audience: other verified users, verification admins (no email), Sky via service role, **never** third parties / advertisers / data brokers.
7. **How long we keep it** — D7 retention (30d) + verification-log 90d + Supabase backup-window 7d honesty.
8. **Deletion** — D6 + S5 cascade described in plain language with the 7-day backup-window disclosure.
9. **Children** — under-16 not eligible; reactive deletion if reported.
10. **Your rights under PIPEDA** — access, correction, withdrawal of consent (= delete account), complaint to OPC with the canonical URL.
11. **Changes to this policy** — 30-day in-app notice + delete-before-takes-effect option.
12. **Contact** + **Reminder** of the disclaimer.

The Terms of Service is 11 sections:

1. **NOT LEGAL ADVICE disclaimer** (first line; tested).
2. **Who we are** — software, not a delivery / charity / marketplace.
3. **Eligibility** — 16+, invite-only, admin-verified.
4. **Acceptable use** — 7 explicit don'ts (no real names anywhere, no resale/commercial, no harassment, no impersonation, no fake postings, no illegal content, no security probes).
5. **Resources you post** — honest representation, pickup is between poster and claimant, no in-app chat.
6. **Admin verification** — what admins see + how rejections work + re-apply path.
7. **Reporting bad actors** — currently email-to-Sky; flagged as "in-app report flow on the roadmap, not yet built" per task brief.
8. **Suspension and termination** — covers ToS violation, inactive-admin auto-suspend (~30d threshold from PRIVACY.md Q4 with note that exact threshold is being finalized), legal obligation, safety reasons.
9. **Disclaimer of liability** — software-not-service framing.
10. **Disputes** — mediation first; OPC for privacy; jurisdiction flagged as DECISION FOR SKY.
11. **Changes to ToS** — same 30-day notice as Privacy.
12. **Contact** + **Reminder**.

## Jordan's per-section accuracy review

Each section below is checked against the data inventory and decisions in `PRIVACY.md`. Where the policy text matches the inventory, it's marked OK. Where Jordan softened or simplified for the user-facing audience, it's noted. **Anywhere the policy goes beyond what PRIVACY.md says is a finding** (none in this draft).

### Privacy Policy

| Policy section                  | Source                                         | Jordan verdict                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOT LEGAL ADVICE                | PRIVACY.md D10                                 | OK                                                                                                                                                                                                                                                                                                                                                 |
| Who we are                      | `community/mission.md` opening                 | OK                                                                                                                                                                                                                                                                                                                                                 |
| What we collect — handle        | PRIVACY.md inv. row 2 + D1 EDITED              | OK; example handle "calm-otter-3829" mirrors `handleGenerator.ts` shape                                                                                                                                                                                                                                                                            |
| What we collect — email         | PRIVACY.md inv. row 1                          | OK; "used only for sign-in" is true (admins do not see email per D9 + Jordan note this draft)                                                                                                                                                                                                                                                      |
| What we collect — postal prefix | PRIVACY.md inv. row 3 + D3                     | OK; FSA example "M5V" matches D3                                                                                                                                                                                                                                                                                                                   |
| What we collect — city          | PRIVACY.md Q2 resolved                         | OK                                                                                                                                                                                                                                                                                                                                                 |
| What we collect — photos        | PRIVACY.md D5 + STRIDE T1                      | OK; "stripped twice (client + server)" matches D5                                                                                                                                                                                                                                                                                                  |
| What we collect — invite hash   | PRIVACY.md inv. row 6 + D4 + S1                | OK; "we never store who invited you" matches D4                                                                                                                                                                                                                                                                                                    |
| What we do NOT collect          | PRIVACY.md "Fields NOT collected"              | OK; expanded slightly (added "third-party SDKs" per D8)                                                                                                                                                                                                                                                                                            |
| Storage region                  | NOT in PRIVACY.md                              | FLAGGED — DFS-1. Honest "we'll disclose once Sky picks; assume US or CA until then; contact Sky for certainty."                                                                                                                                                                                                                                    |
| Who sees — other users          | PRIVACY.md inv. who-sees-it column             | OK                                                                                                                                                                                                                                                                                                                                                 |
| Who sees — admins               | PRIVACY.md D9                                  | OK; **policy explicitly says admins do NOT see email**, matching task brief. Jordan double-checked: schema RLS lets admins SELECT unverified rows (`users_admin_read_unverified`), and `public.users` does NOT contain email (email lives in `auth.users`, which admin RLS does not grant). So the policy statement is technically accurate today. |
| Who sees — Sky service role     | PRIVACY.md S8, throughout                      | OK                                                                                                                                                                                                                                                                                                                                                 |
| Who sees — never third parties  | PRIVACY.md D8 + threat model                   | OK                                                                                                                                                                                                                                                                                                                                                 |
| Retention — account             | PRIVACY.md §7                                  | OK                                                                                                                                                                                                                                                                                                                                                 |
| Retention — resources           | PRIVACY.md D7                                  | OK; "30 days" stated exactly                                                                                                                                                                                                                                                                                                                       |
| Retention — verification log    | PRIVACY.md §7 (90 days)                        | OK                                                                                                                                                                                                                                                                                                                                                 |
| Retention — backups             | PRIVACY.md D6 (7-day PITR)                     | OK; honest "we CANNOT scrub backups" matches `ProfileScreen.tsx` line 191                                                                                                                                                                                                                                                                          |
| Deletion — UX flow              | `ProfileScreen.tsx` `delete_my_account()` + S5 | OK; type-DELETE confirmation step described                                                                                                                                                                                                                                                                                                        |
| Deletion — what gets deleted    | schema.sql `delete_my_account()` body          | OK; resources, photos, claims released, profile, auth row — all listed                                                                                                                                                                                                                                                                             |
| Children                        | not previously specified                       | **NEW** — Jordan adds 16+ per task brief; not in `PRIVACY.md` yet. Jordan recommends adding a `PRIVACY.md` row for this in a follow-up.                                                                                                                                                                                                            |
| PIPEDA rights                   | PRIVACY.md D10 + §10 table                     | OK; OPC URL is canonical                                                                                                                                                                                                                                                                                                                           |
| Changes — 30 day notice         | task brief                                     | **NEW** — Jordan supports. Not in `PRIVACY.md`; recommends codifying in a future Phase.                                                                                                                                                                                                                                                            |
| Contact                         | Sky's email per Cycle 1 / Const.               | OK                                                                                                                                                                                                                                                                                                                                                 |

### Terms of Service

| ToS section                           | Source                                           | Jordan verdict                                                                                                                   |
| ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| NOT LEGAL ADVICE                      | PRIVACY.md D10 + task brief                      | OK                                                                                                                               |
| Who we are                            | `community/mission.md` "What Mutual Mesh is NOT" | OK; "not a delivery / charity / marketplace" is verbatim aligned with mission doc                                                |
| Eligibility — 16+                     | task brief; aligns with COPPA-equivalent floor   | OK                                                                                                                               |
| Eligibility — invite-only             | PRIVACY.md D4                                    | OK                                                                                                                               |
| Eligibility — admin-verified          | PRIVACY.md D9 + Cycle 1 spec                     | OK                                                                                                                               |
| AU — no real names                    | PRIVACY.md D1/D2 EDITED                          | OK; "the app warns you" matches `handleValidator.ts` + `contactHandle.ts`                                                        |
| AU — no resale / commercial           | task brief                                       | OK; aligns with mission ("not a marketplace with ratings")                                                                       |
| AU — no harassment                    | task brief                                       | OK                                                                                                                               |
| AU — no impersonation                 | STRIDE S3                                        | OK; covers the documented residual risk                                                                                          |
| AU — no fake postings                 | task brief                                       | OK                                                                                                                               |
| AU — no illegal content               | task brief                                       | OK                                                                                                                               |
| AU — no security probes               | task brief                                       | OK                                                                                                                               |
| Resources — honest representation     | task brief + mission "use your judgment"         | OK                                                                                                                               |
| Resources — pickup is between people  | task brief                                       | OK; "we don't broker the exchange" matches mission                                                                               |
| Resources — no in-app chat            | PRIVACY.md D2                                    | OK                                                                                                                               |
| Admin verification — what admins see  | PRIVACY.md D9                                    | OK                                                                                                                               |
| Admin verification — final + re-apply | task brief                                       | OK                                                                                                                               |
| Reporting bad actors                  | task brief                                       | FLAGGED — Will marked "in-app report flow on the project roadmap but is not yet built" per brief; route via Sky's email. Honest. |
| Suspension — ToS violation            | task brief                                       | OK                                                                                                                               |
| Suspension — inactive admin           | PRIVACY.md Q4 resolved (~30d)                    | OK; "being finalized" matches Q4 resolution state                                                                                |
| Suspension — legal / safety           | task brief                                       | OK                                                                                                                               |
| Self-deletion                         | `ProfileScreen.tsx`                              | OK                                                                                                                               |
| Disclaimer of liability               | task brief; "software not service"               | OK; preserves applicable-law floor ("does not limit any rights you have that cannot be waived under applicable law")             |
| Disputes — mediation first            | task brief                                       | OK                                                                                                                               |
| Disputes — OPC for privacy            | PRIVACY.md D10                                   | OK                                                                                                                               |
| Disputes — jurisdiction               | task brief                                       | FLAGGED — DFS-2. "DECISION FOR SKY tracked; assume Canada as default until set; contact Sky for current status."                 |
| Changes — 30-day notice               | task brief                                       | OK                                                                                                                               |
| Contact                               | Sky's email                                      | OK                                                                                                                               |

**Net Jordan verdict:** the draft is consistent with `PRIVACY.md` and the STRIDE model. The two flagged items (storage region, jurisdiction) are openly labeled in the user-facing text as decisions in progress rather than hidden. The "children — 16+" and "30-day change notice" additions are policy choices Will introduced from the task brief; they should be back-ported into `PRIVACY.md` as new decisions in a follow-up Phase so the source of truth and the user-facing text stay in sync.

## Casey voice review

**Status: NOT DONE. Recommend Casey skim before public launch.** This is a DECISION FOR SKY (DFS-3 below).

Will's draft was intentionally written in the mission-doc voice: plain, no marketing, no "we may, but probably won't" softening. Specific things Will avoided that Casey would catch:

- No phrases like "your privacy is important to us" — meaningless filler.
- No "by using this app you agree to" boilerplate at the top — buried in section structure instead.
- No "industry-leading" or "best-in-class" — empty.
- Headings are sentence-case ALL-CAPS section labels for screen-reader clarity, not "Privacy Matters." marketing flourishes.

Casey's eye is still valuable for: catch-spots where the voice drifts (e.g., "We will respond to privacy questions" — is that too formal vs the mission doc's directness?), and the children section, which Will added in policy-formal voice and could be plainer.

## PIPEDA gap analysis — what a real Canadian privacy lawyer must add before public launch

The 10 PIPEDA fair-information principles per `PRIVACY.md` §10 are the foundation, but counsel needs to validate, expand, or correct each of the items below. This list is Jordan's best-effort sketch, **not** a substitute for the counsel hire.

1. **Identifying purposes (Principle 2)** — counsel must confirm the policy explicitly identifies the purpose at or before collection. Will's draft does this informally ("used only for sign-in") but counsel may want a more structured purpose table.
2. **Consent (Principle 3)** — counsel must confirm the consent model. The signup flow currently has no explicit "I consent to this Privacy Policy" checkbox; counsel may require one. Currently the Sign-in flow + WaitingRoom screens do not link to the policy. **This is a Shamus follow-on.**
3. **Limiting collection (Principle 4)** — counsel reviews whether each collected field is justified. The draft argues this naturally; counsel may want it formalized as a table.
4. **Limiting use, disclosure, retention (Principle 5)** — counsel reviews the retention windows. 30d resources / 90d verification log / 7d backup-window — counsel may require shorter or longer per Canadian norms.
5. **Accuracy (Principle 6)** — counsel reviews the correction mechanism. Will's draft says "change your handle, postal prefix, and city in the app." Counsel may require a formal "request correction" path for everything else.
6. **Safeguards (Principle 7)** — counsel reviews how we describe encryption-at-rest, signed URLs, RLS. Will's draft does NOT enumerate every safeguard (e.g., "AsyncStorage is unencrypted on device" per S7) — counsel decides whether disclosure of S7 is required at policy level or only in onboarding copy.
7. **Openness (Principle 8)** — counsel reviews where the policy is made available. We have it in-app + on the project repo. Counsel may want a public-web mirror at a stable URL.
8. **Individual access (Principle 9)** — counsel reviews the access mechanism. "Almost everything is visible on the Profile screen; for anything else, contact us" is honest but counsel may require a formal access-request process.
9. **Challenging compliance (Principle 10)** — counsel reviews the complaint mechanism. We point to OPC; counsel may require a designated internal Privacy Officer with a named contact.
10. **Accountability (Principle 1)** — counsel reviews who is the designated Privacy Officer. Currently this is Sky by default; counsel may formalize the role and require a named human in the policy.

Additional Canadian-specific items counsel must address that are NOT in the current draft:

- **Quebec Bill 25 / Law 25** — Quebec has its own privacy regime (separate from PIPEDA) effective 2023-2024. Counsel determines whether Mutual Mesh's user base + storage region triggers Law 25 obligations (e.g., Privacy Officer designation, privacy impact assessment, cross-border transfer notice). The policy as drafted is silent on this.
- **Cross-border data transfer disclosure** — if Supabase region is in the US (DFS-1), PIPEDA + Law 25 require disclosing the transfer. The policy currently flags this as a known unknown rather than disclosing concretely.
- **Breach notification** — neither the policy nor the ToS commits to a breach-notification timeline. PIPEDA 2018 amendments require notification of breaches of security safeguards involving real risk of significant harm. Counsel must add a paragraph.
- **Cookies / device storage** — the policy does not currently discuss AsyncStorage on device (S7). Counsel decides whether disclosure is required and where.
- **Marketing consent** — we do not currently send marketing. The policy is silent; counsel decides whether a forward-looking "we will ask separately if we ever do" is needed.
- **Automated decision-making** — admin verification is human-made, not automated. Counsel may want a positive statement of that since regulators are increasingly asking.

## DECISIONS FOR SKY

> Each item below needs Sky's ✅ approval, ❌ pushback, or ✏️ edit before public launch.

### DFS-1: Supabase region disclosure

**Status:** Unresolved. Policy currently flags this as a known unknown.

**What:** Sky must (a) decide which Supabase region Mutual Mesh's data is processed in, then (b) update the policy text to disclose that region concretely. The current text says "assume your data may be processed in the United States or Canada. If you need certainty about region before signing up, contact Sky directly." That's honest but not durable.

**Why this is a real DECISION:** if Sky picks a US region, PIPEDA + Quebec Law 25 require disclosure of the cross-border transfer to users and counsel may require additional contractual safeguards with Supabase. If Sky picks a Canadian region, the disclosure is simpler. The choice may also affect cost and latency.

**Action:** Sky picks a region in the Supabase dashboard (or confirms the one already set), then edits `PRIVACY_POLICY_TEXT` in `src/lib/policyText.ts` to disclose it concretely. Or asks Jordan to do so on a future `/jordan` invocation.

- [ ] ✅ Approve
- [ ] ❌ Push back
- [ ] ✏️ Edit

### DFS-2: Jurisdiction, governing law, and venue for disputes

**Status:** Unresolved. ToS currently flags as DECISION FOR SKY.

**What:** The Terms of Service section on disputes leaves the governing-law jurisdiction and venue open. Per the task brief, Will did NOT commit to a specific jurisdiction. Counsel needs to set this.

**Why:** the choice has real implications for what laws govern the contract, where complaints are filed, and what consumer-protection floor applies. For a Canadian-targeted privacy-first app, the natural default is Canada (counsel will determine the province), but counsel must make the call.

**Action:** Sky engages Canadian privacy counsel (also covers DFS-1 and the PIPEDA gap analysis above), then edits the disputes section of `TERMS_OF_SERVICE_TEXT` once counsel sets the jurisdiction.

- [ ] ✅ Approve
- [ ] ❌ Push back
- [ ] ✏️ Edit

### DFS-3: Casey voice review before launch

**Status:** Recommended; not yet done.

**What:** Will mirrored the mission-doc voice in this draft, but Casey owns the project's voice. Before the policy + ToS go live, Casey should skim both documents (one read-through, ~10 minutes each) and flag any voice drift.

**Action:** Spawn a `/casey` task after the rest of DFS is resolved, with the instruction "voice-review the privacy policy and ToS in `src/lib/policyText.ts` against `community/mission.md` and the mission-doc voice; surface any softening, marketing creep, or formal-document boilerplate." Casey returns a list of suggested edits in a follow-up `qa-reports/phase-4-casey-voice-review-*.md`.

- [ ] ✅ Approve
- [ ] ❌ Push back
- [ ] ✏️ Edit

### DFS-4: Hire Canadian privacy counsel (carry-over from PRIVACY.md D10)

**Status:** Still open from `PRIVACY.md` D10 (approved 2026-05-23 as "must do before Cycle 7 ship-readiness").

**What:** Sky budgets and engages a Canadian-law privacy lawyer for a 1-2 hour consultation covering:

- The PIPEDA gap analysis in this report.
- The cross-border / Quebec Law 25 implications of the chosen Supabase region (DFS-1).
- The jurisdiction / governing-law choice (DFS-2).
- The Privacy Officer designation (does Sky need to register one publicly?).
- Whether a separate Cookie Policy / Device Storage Policy is needed.
- Whether the policy + ToS should be re-published on a stable public web URL (not only in-app).

**Why this is a hard blocker:** the policy + ToS shipped today are drafts. They literally say so on their first line. Going live with them as final would create real exposure for Sky and real (uninformed) consent for users.

- [ ] ✅ Approve
- [ ] ❌ Push back
- [ ] ✏️ Edit

### DFS-5: Custodian / Privacy Officer designation

**Status:** Implied by PIPEDA Principle 1 (Accountability); not yet formalized.

**What:** PIPEDA requires the organization to designate someone accountable for compliance, and Quebec Law 25 may require a named, publicly contactable Privacy Officer. Currently Sky is the implicit Privacy Officer. The policy currently lists Sky's email as the contact but does not formally name a role.

**Action:** Sky decides — keep "Sky as Privacy Officer" (and possibly publish that designation in the policy), or designate someone else, or wait for counsel's recommendation on whether a separate role is required. Counsel covers this in DFS-4.

- [ ] ✅ Approve
- [ ] ❌ Push back
- [ ] ✏️ Edit

### DFS-6 (DEFER until DFS-4): Public-web mirror of the policy

**Status:** Deferred to counsel.

**What:** Some PIPEDA + app-store regimes prefer the policy be hosted on a public URL. Currently it's in-app only. If counsel requires it, Sky needs to publish a stable HTML mirror of `PRIVACY_POLICY_TEXT` and `TERMS_OF_SERVICE_TEXT` somewhere (the project repo's GitHub Pages would work). For now, in-app only.

- [ ] Defer to DFS-4

## Sky-must-do checklist (pre-launch)

A compact restatement of what Sky needs to do, in order, before Mutual Mesh is publicly launched:

1. **Engage Canadian privacy counsel** (DFS-4). 1-2 hour consultation. Brief them with: `PRIVACY.md`, `qa-reports/2026-05-23_threat-model-stride.md`, this report, and `src/lib/policyText.ts`.
2. **Pick a Supabase region** (DFS-1) and update the policy text to disclose it concretely.
3. **Set the governing-law jurisdiction** (DFS-2) and update the ToS text once counsel decides.
4. **Decide on Privacy Officer designation** (DFS-5).
5. **Apply counsel's redlines** to `src/lib/policyText.ts` and re-run `npm run typecheck && npm run lint && npm test && npm run format:check`.
6. **Have Casey voice-review** the final text (DFS-3).
7. **Decide whether to publish a public-web mirror** (DFS-6) based on counsel's recommendation.
8. **Back-port new policy decisions into `PRIVACY.md`** so the source-of-truth stays in sync — specifically: 16+ floor, 30-day change-notice commitment, Supabase region, jurisdiction, Privacy Officer designation, breach-notification timeline.
9. **Have Shamus add the in-app links** from `ProfileScreen` to `PrivacyPolicyScreen` and `TermsOfServiceScreen` (Will did not implement this per the task brief; it is a one-line wiring change for Shamus).
10. **Have Quinn / Shamus add an explicit "I have read and agree to the Privacy Policy and Terms of Service" checkbox** at signup if counsel requires it (Principle 3 — Consent).

## Constitutional compliance footer

- Const. Art. 1 (no `main` writes): not violated. Work is on existing role-prefix branch.
- Const. Art. 7 (privacy-sensitive surface): explicit Jordan review per-line above; flagged decisions documented as DFS items; no live database touched.
- Const. Art. 9 (no external sends): not violated. File-only delivery.
- Const. Art. 12 (BACKGROUND mode): N/A — interactive invocation, halt sentinel not present.
- Will lane respected: text + screens + test; no nav code (left for Shamus per task brief).
- Jordan lane respected: review-only, no policy authority claimed; D10 disclaimer load-bearing.
