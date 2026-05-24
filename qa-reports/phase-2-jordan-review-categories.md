# Jordan privacy review — Phase 2 Resource Categories — 2026-05-24

**Reviewer:** Jordan (Privacy Advisor)
**Scope:** LIGHT review (Quinn flagged this spec as abbreviated)
**Spec under review:** [`qa-reports/spec-phase-2-resource-categories.md`](spec-phase-2-resource-categories.md) — Quinn, 2026-05-24
**Source of truth:** [`PRIVACY.md`](../PRIVACY.md) (status 🟢 APPROVED — locked 2026-05-23)
**Constitution authority:** Art. 7.6 (privacy review mandatory for marginalized-group + location data) + Art. 9 (file-only; no external send)
**Prior threat model:** [`qa-reports/2026-05-23_threat-model-stride.md`](2026-05-23_threat-model-stride.md) — Steve, 2026-05-23

---

## ⚠️ NOT A LAWYER DISCLAIMER

This document is Jordan's structured privacy review of a feature spec — **NOT legal advice.** Jordan is an AI role following the Constitution Art. 4 mandate to label all findings as "draft for legal review." Any PIPEDA / GDPR / state-actor-threat-model references below are non-authoritative and require sign-off from a Canadian privacy lawyer (and an EU privacy lawyer if Mutual Mesh ever scales beyond Canada) before public launch. Sky must budget this consultation per PRIVACY.md D10.

---

## Verdict: **APPROVED_WITH_CONDITIONS**

The spec is privacy-safe to merge **with two conditions** (both small):

1. **C1 — Realtime channel naming must be category-agnostic.** Verify Shamus uses a generic channel name (e.g., `resources-feed`, the existing channel per `src/hooks/useResources.ts` line 75-86) and does NOT introduce a category-scoped channel (e.g., `resources-feed-hrt`). State-actor traffic analysis on the WebSocket connection should not be able to infer which category a verified user is browsing.
2. **C2 — DFS-3 sign-off must be recorded by Sky before merge.** Quinn correctly flagged the HRT-as-discrete-enum threat-model nuance as DFS-3; Jordan concurs the risk is small but it is Sky's call to accept. See "Sign-off requirement" below for the exact one-line confirmation Jordan needs to see in Sky's response.

No BLOCKER. No DECISION FOR SKY beyond what Quinn already surfaced (DFS-1 through DFS-5; Jordan's recommendations on each are listed in "Per-DFS notes" below).

---

## Data assessment — what changes

### What's added

- `public.resources.category` — TEXT column, fixed enum `food|hygiene|baby|HRT|other`, defaults `'other'`, NOT NULL. Public-to-verified-peers (same RLS as every other resource field).
- One index: `idx_resources_category_status` — supports filter-feed queries.
- AsyncStorage key `mm:home:categoryFilters` on each device — per-user filter preference, JSON-serialized 5-boolean shape. Non-PII per PRIVACY.md S7 (unencrypted AsyncStorage is intentional for non-PII state).

### What's NOT added

- No new PII. Category is user-input enum at post time; does not identify the user.
- No new RLS policy. The 4 existing policies on `public.resources` (resources_verified_read / resources_verified_insert / resources_owner_update / resources_owner_delete — schema.sql lines 563-588) are unmodified.
- No new RPC. `createResource()` is extended with a new parameter; no new function definition.
- No new table.
- No new realtime channel (provided C1 is honored — see below).
- No new admin surface. The admin verification queue is unaffected (AC-9 of the spec confirms this).
- No new join. `resources.category` does not expose anything that wasn't already exposed through `posted_by` → handle indirection.

### Data inventory delta (proposed addition to PRIVACY.md table — see "Proposed PRIVACY.md edits" below)

| #   | Field                       | Table.column                | Collected at | Purpose            | Retention      | Who sees it        | Encrypted at rest |
| --- | --------------------------- | --------------------------- | ------------ | ------------------ | -------------- | ------------------ | ----------------- |
| 16  | `public.resources.category` | `public.resources.category` | When posting | Marketplace filter | Same as parent | All verified users | No                |

This is a clean addition — same lifecycle as the existing 9 resource fields (rows 7-15 in PRIVACY.md). No new retention rule, no new visibility rule.

---

## HRT-category specific concern (load-bearing analysis)

This is the one section that earns the "LIGHT review" designation. Everything else is mechanical.

### The change in queryability

**Today (before Phase 2 #6):** HRT supplies are surfaced via free-text in `resources.description`. Finding all HRT listings requires:

```sql
SELECT * FROM resources
WHERE description ILIKE '%hrt%'
   OR description ILIKE '%hormone%'
   OR description ILIKE '%estradiol%'
   OR description ILIKE '%testosterone%'
   -- ... etc
```

Cost: O(N) full-text scan, fuzzy, prone to false positives and false negatives, and the searcher has to know the vocabulary.

**After Phase 2 #6:** Finding all HRT listings requires:

```sql
SELECT * FROM resources WHERE category = 'HRT'
```

Cost: O(1) index lookup via `idx_resources_category_status`, exact, complete.

This is a **real change in query-shape legibility**, exactly as Quinn called out in DFS-3.

### Who can run that query?

In Mutual Mesh's threat model, the relevant queriers are:

1. **A verified peer** browsing the marketplace. ALREADY can see all HRT listings via the existing free-text path. The new category just makes it faster and more reliable — which is **the entire point of the feature for Keo** (persona-keo line 66: "Resource categories must include HRT / medical supplies as a first-class category"). **Net impact: positive for Keo, neutral for adversaries.**

2. **An unverified user.** Cannot SELECT from `public.resources` at all per the existing RLS policy `resources_verified_read`. The category column doesn't change this. **Net impact: zero.**

3. **An admin** (`is_admin = true` user via the verification UI). Per Jordan D9 + Steve S8 + the Cycle 5 spec Section 5 enumeration, admins do NOT have read access to `public.resources` via their admin flag. They read `public.users` (verification queue) only. The category column doesn't change this. **Net impact: zero.**

4. **Sky (via Supabase dashboard, service-role).** Has direct DB access today. Could already run a free-text scan; now can run an O(1) lookup. **Net impact: marginally easier metric collection (which Casey wants for growth-strategy.md); no new visibility.**

5. **A state actor with a Supabase subpoena (the "I" in STRIDE I4 — backup retention).** A subpoena that reaches Supabase already accesses the full `resources` table. The state actor would see HRT category labels instead of free-text descriptions containing HRT vocabulary. The data is **already there** today (in the free-text); the change is that it becomes more **machine-readable to a subpoenaing adversary**. STRIDE I4 already accepts this risk; the new spec marginally amplifies it.

6. **A state actor sniffing realtime WebSocket traffic.** This is the threat model that drives Condition C1 below. If the realtime channel name encodes the category (`resources-feed-hrt`), an attacker doing traffic analysis on the WebSocket connection (without needing to decrypt) could infer that the user is querying HRT-flagged supplies — which leaks the user's interest in HRT to the network observer. **This is the one place the new feature could introduce a NEW attack surface, and it's avoidable.**

### Mitigation (Condition C1)

The existing realtime subscription in `src/hooks/useResources.ts` lines 75-86 uses a single channel for all resource updates (per CLAUDE.md / Cycle 1 description). The spec AC-7 explicitly says: "The `useResources` hook's realtime subscription is unmodified" and "filter logic lives in HomeScreen ... NOT inside `useResources`."

Jordan's read: this is already the correct posture. The channel is generic; filtering is client-side; no network observer can distinguish which category a given user has toggled. **Condition C1 just asks Steve to verify this assumption holds at code-review time.** If a future commit ever introduces a category-scoped channel (e.g., for performance reasons), it must trigger a fresh Jordan review.

### Mitigation (DFS-3 — Sky's call)

Quinn proposes (and Jordan concurs): ship HRT as a discrete enum. Splitting HRT into a separate table with stricter RLS would:

- Double the schema cost (new table + FK + realtime channel + RLS policies).
- Confuse UX (why is HRT a different list?).
- Not materially change the subpoena threat model (the data is in Supabase either way).
- Require a Jordan re-review of the new RLS posture.

The risk-vs-value math favors single-table. **Sky's call required (DFS-3 sign-off below).**

### Alternative substitution (Sky may choose)

Quinn lists this implicitly in DFS-2 ("user-defined tags") but not as a substitution. Jordan flags it explicitly: if Sky wants extra caution, the enum value `HRT` could become `health` — a softer generic that covers HRT, harm-reduction supplies, prescriptions, etc. Trade-offs:

- **Pro:** Less directly subpoena-legible. State actor would have to fall back to free-text scan on description to filter HRT specifically.
- **Pro:** More inclusive (HRT, naloxone, insulin, ADHD meds, etc. all fit under `health`).
- **Con:** Loses Keo's "first-class HRT visibility" — Keo would have to free-text scan within `health` to find HRT supplies, defeating the purpose.
- **Con:** Casey's per-category seeding metrics get noisier (health = HRT + naloxone + insulin + everything else).
- **Con:** Feels demeaning to Keo's lived experience by hiding HRT behind a euphemism (Quinn's reasoning in DFS-1 against lowercase `hrt`).

**Jordan's recommendation: ship as `HRT` (Quinn's default), accept the marginal threat-model cost, document in LEARNINGS.md, revisit only if a documented incident occurs.**

---

## Persona impact assessment

### Mara (recipient) — low-positive

- Mara's anti-goal #4 ("anyone — even verification admins — knowing what she's claimed"): unaffected. Categories appear on POSTS, not on claims. The admin queue still cannot see resource posts at all. **PASS.**
- Mara's anti-goal #3 ("push notifications that show item names on her lock screen"): unaffected. No push notification is added by this spec. **PASS.**
- Mara's goal #1 ("Find unopened cans of her infant's specific formula nearby, fast"): improved by the `baby` filter chip. **PASS — positive impact.**

### Keo (organizer) — high-positive

- Keo's persona-line 66: "Resource categories must include HRT / medical supplies as a first-class category." **DIRECT MATCH.** This spec is the operational answer to that stated need.
- Keo's anti-goal #3 ("a 'verified ✓' badge that becomes a target / makes them findable"): unaffected. The category tag is on the RESOURCE, not on the user. No badge introduced. **PASS.**
- Keo's threat model (state actors, ex-cop, far-right doxxing): addressed by Condition C1 (no category-scoped channel name) + DFS-3 acceptance. Subpoena threat is unchanged from today's free-text baseline. **PASS with conditions.**

### Deb (poster) — neutral-positive

- Deb's persona-line 59 ("Resource categories should include large categories: groceries, hygiene, baby supplies, hot food, hot water"): close match. The spec's 5 enums (food, hygiene, baby, HRT, other) cover Deb's first three (groceries → food; hygiene → hygiene; baby supplies → baby). "Hot food" and "hot water" fold into `food` and `other`. Not a perfect map but workable; Deb can address bulk-organizing concerns in the free-text name/description. **PASS — acceptable mapping.**
- Deb's anti-goal #2 ("a 'score' or 'leaderboard' of who's most generous"): unaffected. No per-user metric introduced. **PASS.**

**Overall persona-fit:** all 3 personas pass; Keo materially benefits. No persona is harmed.

---

## Sign-off requirement (Sky)

Per Condition C2, Jordan's APPROVED_WITH_CONDITIONS verdict is contingent on Sky resolving DFS-3 explicitly. The exact one-line confirmation Jordan needs to see in Sky's response to Morgan's briefing:

> **"OK to ship HRT as a discrete category"** — ships as Quinn proposes; default.

OR

> **"Substitute 'health' as a softer generic"** — replaces `HRT` enum value with `health` throughout the spec, migration, RPC, UI, copy. Triggers a small Quinn re-spec and Casey copy-update for the category label.

Either choice is privacy-acceptable. Jordan's recommendation: ship as `HRT`.

If Sky says nothing, Quinn's spec defaults apply (ships uppercase `HRT`).

---

## Per-DFS notes (Jordan's read on Quinn's 5 DECISIONS FOR SKY)

- **DFS-1 (HRT uppercase vs lowercase):** Privacy-neutral. Jordan defers to Quinn's call (uppercase HRT is canonical and respects Keo's lived experience). **No Jordan input.**

- **DFS-2 (fixed enum vs user-defined tags):** **Jordan supports fixed enum.** User-defined tags would create a moderation surface (slur risk, doxxing-via-category-name) and require new RLS for a `categories` table. Privacy-preferable to keep fixed enum until v2.

- **DFS-3 (HRT state-actor threat model):** Jordan's load-bearing analysis above. **Concur with Quinn's "ship single-table" recommendation; surface the one-line Sky confirmation as Condition C2.**

- **DFS-4 (default filter all-ON):** Privacy-positive. A "smart default" would require collecting identity at signup, violating Mara/Keo anti-goals. **Strongly concur with Quinn's "all 5 chips ON" default.**

- **DFS-5 (show category on card):** Privacy-neutral. The category is already visible by tapping into the detail screen; showing it on the card adds zero new exposure. **Concur with Quinn's "show on card."**

---

## Proposed PRIVACY.md edits

Jordan PROPOSES the following PRIVACY.md additions but does NOT modify the file (Constitution Art. 4: Jordan owns PRIVACY.md but Sky approves edits at merge time).

### Edit 1: Add row 16 to the data inventory table (after row 15, `verification_log`)

```markdown
| 16 | `category` | `public.resources.category` | When posting | Marketplace filter | Same as parent row (D7) | All verified users | No |
```

### Edit 2: Add a brief paragraph under "Decisions log" referencing the HRT threat-model acceptance

After D10 PIPEDA entry, insert:

```markdown
### D11: HRT category — accept marginal subpoena-legibility increase (Phase 2 #6)

**Proposal:** Ship `HRT` as a discrete enum value alongside `food|hygiene|baby|other`. Accept that this makes the category O(1) queryable by a subpoenaing adversary (vs O(N) free-text scan today).

**Why:** Keo persona explicitly asks for first-class HRT visibility; the data is already in Supabase via free-text; single-table is simpler than splitting HRT into a separate-table-with-stricter-RLS.

**Mitigation:** Realtime channel name remains category-agnostic (`resources-feed`); state-actor WebSocket traffic analysis cannot infer category from channel name.

**Alternative considered:** Replace `HRT` with `health` as a softer generic — rejected because it loses Keo's first-class visibility and feels demeaning.

**Sky's decision recorded:** [pending; one-line in Morgan briefing per Jordan review C2]
```

### Edit 3: No edit to "Fields NOT collected" section (categories are user-provided, not auto-collected)

No change needed.

---

## What I shipped

This Jordan privacy review document. No code touched. No PRIVACY.md edited (PROPOSED edits above are for Sky to apply if approved at merge). No external message sent (Morgan owns that channel; Jordan operates file-only per Constitution Art. 9).

---

**Jordan — 2026-05-24** — file-only output. Verdict: **APPROVED_WITH_CONDITIONS (C1 + C2)**. No BLOCKER. 1 DECISION FOR SKY (DFS-3 explicit sign-off).
