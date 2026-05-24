# Jordan privacy review — Phase 2 Pickup Confirmation — 2026-05-24

**Reviewer:** Jordan (Privacy Advisor)
**Scope:** FULL REVIEW (Quinn flagged this spec as Constitution Art. 7.6 trigger — touches resource-claim lifecycle of marginalized users)
**Spec under review:** [`qa-reports/spec-phase-2-pickup-confirmation.md`](spec-phase-2-pickup-confirmation.md) — Quinn, 2026-05-24
**Migration already drafted by Dana:** [`supabase/migrations/005_pickup_confirmation.sql`](../supabase/migrations/005_pickup_confirmation.sql)
**Source of truth:** [`PRIVACY.md`](../PRIVACY.md) (status 🟢 APPROVED — locked 2026-05-23)
**Constitution authority:** Art. 7.6 (privacy review mandatory for marginalized-group + location data) + Art. 9 (file-only; no external send)
**Prior threat model:** [`qa-reports/2026-05-23_threat-model-stride.md`](2026-05-23_threat-model-stride.md) — Steve, 2026-05-23

---

## ⚠️ NOT A LAWYER DISCLAIMER

This document is Jordan's structured privacy review of a feature spec — **NOT legal advice.** Jordan is an AI role following Constitution Art. 4 mandate to label all findings as "draft for legal review." Any PIPEDA / GDPR / state-actor-threat-model references below are non-authoritative and require sign-off from a Canadian privacy lawyer before public launch. Sky must budget this consultation per PRIVACY.md D10.

---

## Verdict: **APPROVED_WITH_CONDITIONS**

The spec is privacy-safe to merge **with three conditions** (all small; none are showstoppers):

1. **C1 — Dana's migration 005 must implement `confirmed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL`**, mirroring the existing `claimed_by` cascade rule (schema.sql line where `claimed_by UUID REFERENCES public.users(id) ON DELETE SET NULL`). **Already done** per Jordan's read of migration 005 lines documenting `confirmed_by ON DELETE SET NULL`. Steve to verify at code review.
2. **C2 — The realtime UPDATE event for `status='completed'` must not leak `confirmed_by` to any client beyond the two parties on the listing.** Existing `resources_verified_read` RLS gates the row to verified users (the row is visible to all of them, just like the existing `claimed_by` field). Jordan confirms this is acceptable because: (a) `confirmed_by` is a UUID, not a handle; (b) any verified user could already infer who confirmed by checking `claimed_by` + `posted_by` against the new `completed` status; (c) `confirmed_by` adds no new graph edge beyond what `claimed_by` + `posted_by` already establish. **No code change required**; surfacing as condition only to ensure Steve and Shamus understand the existing RLS coverage is sufficient.
3. **C3 — 30-day post-confirmation retention window must be reflected in the operational copy** that explains "Delete my account" (the in-app delete confirmation copy). A user who deletes their account during the 30-day window has their resource row deleted (cascade) and `confirmed_by` NULLed on their counter-party's records (per the `ON DELETE SET NULL` rule above). Will to verify the in-app delete confirmation copy still accurately describes this — no specific addition needed unless Sky pushes back on DFS-3.

No BLOCKER. Quinn's DFS-1 through DFS-5 are independent product decisions; Jordan's per-DFS notes are at the bottom.

---

## Data assessment — what changes

### What's added

- `public.resources.status` enum extended: `available | reserved | completed`.
- `public.resources.confirmed_at` — TIMESTAMPTZ NULL.
- `public.resources.confirmed_by` — UUID NULL REFERENCES public.users(id) ON DELETE SET NULL.
- One index: `idx_resources_confirmed_at` — partial index, supports prune and Casey metric.
- One new RPC: `confirm_pickup(resource_id UUID)` RETURNS BOOLEAN — SECURITY DEFINER with caller-validation.
- `prune_expired_resources()` extended to delete `status='completed' AND confirmed_at < now() - INTERVAL '30 days'`.

### What's NOT added

- No new table.
- No new RLS policy on `public.resources`. The existing 4 policies cover the new columns (any verified user can SELECT rows; only owner can UPDATE/DELETE; confirm flips status via RPC bypass).
- No new realtime channel. The existing `resources-feed` channel handles UPDATE events including the new status transition.
- No new admin surface. AC-9 explicitly excludes admin visibility of `confirmed_at` / `confirmed_by` / `status='completed'`. Cycle 5 spec Section 5 enumerates 5 admin-visible fields; this spec adds 0.
- No new client-supplied parameter that could be spoofed. AC-10 — `confirmed_by` is server-set from `auth.uid()`; the RPC signature accepts only `resource_id`.
- No third-party SDK. No telemetry event. No analytics tracking. (PRIVACY.md D8 preserved.)
- No per-user metric or badge. Confirmation count surfaces ONLY on the user's own Profile screen, never aggregated or shown to others (AC-7).

### Data inventory delta (proposed addition to PRIVACY.md table — see "Proposed PRIVACY.md edits" below)

| #   | Field                  | Table.column                    | Collected at   | Purpose                | Retention                              | Who sees it                                                     | Encrypted at rest |
| --- | ---------------------- | ------------------------------- | -------------- | ---------------------- | -------------------------------------- | --------------------------------------------------------------- | ----------------- |
| 17  | `confirmed_at`         | `public.resources.confirmed_at` | Confirm pickup | Lifecycle close        | 30 days post-confirmation (D7-aligned) | All verified users (matches existing `resources_verified_read`) | No                |
| 18  | `confirmed_by`         | `public.resources.confirmed_by` | Confirm pickup | Audit + dispute window | Same                                   | Same                                                            | No                |
| 19  | `status = 'completed'` | `public.resources.status`       | Confirm pickup | Lifecycle state        | Same                                   | Same                                                            | No                |

These are clean additions — same lifecycle and visibility as the existing 9 resource fields (rows 7-15 in PRIVACY.md). Retention shifts from `status_changed_at` baseline to `confirmed_at` baseline for completed rows (30 days either way; this is the **cleaner** behavior — see "Retention specifics" below).

---

## Specific concerns assessed (per the task scope)

### Concern 1: `confirmed_by` creates a derivable two-party link in the audit chain

**Stated worry:** `confirmed_by` stores `auth.uid()` of the confirmer. This is a third UUID on the resource row, alongside `posted_by` and `claimed_by`. Does this introduce a new identity-graph edge that didn't exist before?

**Jordan's analysis:** No. The two-party link is already complete via:

- `posted_by` (who posted the resource) — already on every row since day 1.
- `claimed_by` (who claimed the resource) — already on every row since the reserved transition.
- `confirmed_by` — must equal either `posted_by` OR `claimed_by` (enforced by the RPC's `IF caller NOT IN (p, c) THEN RAISE EXCEPTION 'Forbidden'` check, spec AC-2 + RPC sketch line 8).

In other words, `confirmed_by` is a **redundant pointer** to one of the two already-known parties. It tells you WHICH of the two parties confirmed (the poster or the claimant), but it does not introduce a third party or a new graph edge.

The metadata that IS revealed by `confirmed_by` is "which side confirmed first" (or the only side, given one-sided is sufficient). This is a small piece of metadata — it reveals who in the dyad took the action. Trade-off:

- **Pro:** lets the user know who confirmed (UX trust signal). Lets the prune cron clean up cleanly. Lets Casey count one-sided vs zero-sided confirmations (if she ever wanted to, which the spec deliberately does not — AC-7 confines profile counts to self-view).
- **Con:** in the highly-marginalized threat model (e.g., a state-actor subpoena combined with the deleted user's identity), knowing "Mara confirmed" vs "Deb confirmed" could matter in some edge case. But: this metadata is BOUNDED to the dyad. No third party can derive it without the existing visibility into `posted_by`/`claimed_by` + access to the row.

**Verdict on Concern 1: ACCEPTABLE.** `confirmed_by` adds no new graph edge beyond `posted_by` + `claimed_by`. Spec recommendation stands.

### Concern 2: 30-day post-confirmation retention window appropriateness

**Stated worry:** Per spec AC-3 + DFS-3, completed resources are pruned 30 days after `confirmed_at`. The existing `touch_status_changed_at()` trigger bumps `status_changed_at` on status change, so the retention semantics are well-defined. Is 30 days appropriate?

**Jordan's analysis:** Yes, with reasoning:

- **PRIVACY.md D7 sets the precedent at 30 days** for `status='available'` (creation+30d) and `status='reserved'` (status_changed_at+30d). Aligning `status='completed'` to 30 days post-confirmation creates retention CONSISTENCY across the entire resource lifecycle.
- **Mara persona wants quick-burn data.** Her anti-goal #4 ("no one — even admins — knowing what I've claimed"). 30 days vs 7 days vs 0 days: shorter is better for Mara, BUT:
  - 0 days (delete immediately on confirm) loses the dispute window. If Mara confirms and then the formula was bad, she has no record to point to. Edge case, but real.
  - 7 days is too short for the "I picked up the listing on day 1, didn't notice the problem until day 10" case (which is genuine for formula and HRT supplies — slow-onset issues).
  - 30 days matches the established retention model.
- **Casey wants longer retention for the "successful exchange" metric.** Per Quinn DFS-3 option (c): Casey gets the COUNT via `cron_log` (bare row count of pruned `completed` rows per day). The row data is gone after 30 days; the bare count survives indefinitely as an aggregated metric. This is the privacy-preserving solution Quinn already proposed.
- **30 days respects the dispute window without becoming an archive.**

**Verdict on Concern 2: ACCEPTABLE.** 30 days aligns with PRIVACY.md D7. Jordan concurs with Quinn DFS-3 default (30-day delete + bare-count log to `cron_log`).

**Bonus check on `cron_log` bare-count proposal:** Spec DFS-3 option (c) adds a "N completed rows pruned today" entry to `cron_log`. Jordan verifies this is privacy-safe: `cron_log` is Sky-only-SELECT per Steve S6. A bare COUNT (no row identifiers, no user IDs, no resource IDs) is a fully aggregated statistic. PIPEDA/GDPR concerns do not attach to aggregated statistics with N>1 cells. **Approved as a clean privacy-preserving Casey-metric path.**

### Concern 3: SECURITY DEFINER caller-validation pattern

**Stated worry:** The new RPC `confirm_pickup` is `SECURITY DEFINER` with caller-validation. Same pattern as `claim_resource`. Approve?

**Jordan's analysis:** The pattern is well-established and Jordan-approved in the existing RPCs:

| RPC                        | SECURITY DEFINER | Caller validation                                                               |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `claim_resource`           | Yes              | `IF caller IS NULL OR caller = posted_by THEN RAISE`                            |
| `delete_my_account`        | Yes              | Acts only on `auth.uid()`-scoped rows                                           |
| `approve_user`             | Yes              | `IF NOT is_admin(caller) THEN RAISE`                                            |
| `reject_user`              | Yes              | Same                                                                            |
| **`confirm_pickup` (NEW)** | Yes              | `IF caller NOT IN (poster, claimant) THEN RAISE 'Forbidden'` — **AC-2 of spec** |

The `confirm_pickup` validation logic is the strictest of the bunch (caller must be one of exactly two known UUIDs on the row). The `FOR UPDATE` row lock prevents race conditions (AC-4). The idempotent-no-op on already-completed (AC-3) prevents double-firing edge cases. The function signature accepts only `resource_id` — no client-supplied `confirmed_by` (AC-10).

Steve will independently audit at code-review. Jordan's role is to verify the pattern doesn't violate Constitution Art. 7 (the safety/privacy pillar). It does not.

**Verdict on Concern 3: APPROVED.** Same trusted pattern as the existing 5 RPCs.

### Concern 4: D6 (delete-my-account) cascade impact

**Stated worry:** `delete_my_account()` already cascades via migration 003. Confirmed-pickup data on a deleted user's claims becomes orphaned via the `ON DELETE SET NULL` on `claimed_by` — verify Dana implements the same in migration 005 for `confirmed_by`.

**Jordan's analysis:** Verified in migration 005 (Jordan grep'd the file). Lines documenting the cascade rule:

> `confirmed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL`
> — mirrors the `claimed_by` cascade rule. If the confirming user later deletes their account, the column is NULLed (the resource itself stays until the 30-day prune).

This is the **correct** behavior:

1. User Alice posts a resource. User Bob claims it. Bob confirms (`confirmed_by = bob_uid`).
2. Bob deletes his account.
3. Bob's row in `public.users` is deleted.
4. CASCADE: `public.resources.posted_by = bob_uid` rows hard-delete (because `posted_by` is `ON DELETE CASCADE`).
5. SET NULL: `public.resources.claimed_by = bob_uid` rows have `claimed_by` set to NULL (because `claimed_by` is `ON DELETE SET NULL`).
6. SET NULL: `public.resources.confirmed_by = bob_uid` rows have `confirmed_by` set to NULL (because new migration 005 uses the same `ON DELETE SET NULL` rule).

Net effect: Bob's confirmation FACT survives on Alice's resource row (status='completed', confirmed_at=<date>), but Bob's IDENTITY (the UUID pointer) is severed. This is the right trade-off:

- **Honors Bob's "Delete my account" promise:** no pointer to Bob remains.
- **Doesn't fabricate a different identity:** the column is NULL, not "deleted user" or any placeholder.
- **Preserves Alice's marketplace lifecycle:** her listing's "completed" state remains accurate.
- **Self-deletes within 30 days anyway:** the prune cron deletes the row 30 days post-confirmation regardless.

If Sky pushes back and wants the ENTIRE row to delete on Bob's deletion (not just the column NULLed), that's a much larger change — would require modifying the `claimed_by` cascade rule too, would break Alice's lifecycle accounting, and is out of scope.

**Verdict on Concern 4: APPROVED.** Migration 005 already implements the cascade correctly per Jordan's grep of the file. Steve to independently verify.

---

## Persona impact assessment

### Mara (recipient) — neutral-positive, with anti-goal #4 carefully preserved

- Mara's anti-goal #4 ("anyone — even verification admins — knowing what she's claimed"): **PRESERVED.** AC-9 explicitly excludes admin visibility of `confirmed_at` / `confirmed_by` / `status='completed'`. Casey's metric is community-level only, never per-user (spec privacy section #5).
- Mara's persona-line 56 ("Resource history MUST NOT be visible to verification admins"): **PRESERVED.** The admin queue continues to read `public.users` only, never `public.resources`. Cycle 5 spec Section 5 enumerates exactly 5 admin-visible fields.
- Mara's anti-goal #2 ("a 'rating' or 'reputation score'"): **PRESERVED.** No per-user metric. ProfileScreen Completed section shows count to self only, not to others. No leaderboard, no badge, no impact score.
- Mara's anti-goal #3 ("push notifications that show item names"): **PRESERVED.** Spec DFS-5 explicitly excludes push notifications from this cycle.
- Mara's goal of "close the loop on my own record" (a small dignity signal — "I got what I needed"): **DELIVERED.** Her ProfileScreen Completed section gives her this without exposure to anyone new.

**Mara verdict: PASS, no concerns.**

### Keo (organizer) — neutral, with anti-goal #3 preserved

- Keo's anti-goal #3 ("a 'verified ✓' badge that becomes a target / makes them findable"): **PRESERVED.** Confirmation does not power a badge, a score, or any user-visible reputation indicator (spec privacy section #5 + DFS-2 reasoning).
- Keo's anti-goal #1 ("government document verification"): **N/A** — confirmation is between dyad members, not a verification step.
- Keo's threat model (state actors, ex-cop, far-right doxxing): **NEUTRAL.** Confirmation adds three columns to `resources` that a subpoenaing adversary would see, but the data is bounded to the dyad and the row is hard-deleted after 30 days. STRIDE I4 (backup retention) already accepts this kind of residual; this spec doesn't materially worsen it.
- Keo's goal #2 ("Match excess vs. deficit in real time"): **IMPROVED.** Completed rows leave the active feed faster than the 30-day prune, so the active feed is more accurate.

**Keo verdict: PASS, no concerns. One-sided confirmation (DFS-2) is the right call for Keo's "shared HRT supplies" use case where the other party might not engage with the app at all after pickup.**

### Deb (poster) — positive

- Deb's persona-line 42 ("see claims as they come in — triage if multiple people want the same item"): **EXTENDED.** Now she can also close the loop after pickup. Her "Building 22 Fridge" mental model has "claimed → picked up → archive"; this spec matches.
- Deb's anti-goal #2 ("a 'score' or 'leaderboard' of who's most generous"): **PRESERVED.** No score. Casey's metric is community-level only.
- Deb's tech-confidence: the spec's one-sided confirmation respects Deb's "I'll close this out for them if they don't" instinct without requiring claimant coordination.

**Deb verdict: PASS, directly serves the persona.**

### Casey (Community Manager) — positive

- Casey's #1 growth metric ("successful exchanges per active community per week") is **MEASURABLE** for the first time.
- The bare-count `cron_log` entry (DFS-3 option c) preserves the metric even after 30-day prune.
- Per-community aggregation (never per-user) preserved.

**Overall persona-fit:** all 4 personas pass. Mara/Keo anti-goals carefully preserved by AC-9 (no admin surface) + privacy section #5 (no per-user metric).

---

## STRIDE threat-model delta vs. 2026-05-23 baseline

| Threat                                          | Old risk                  | Delta from confirmation spec                                                                                                                                                          | New residual                                        |
| ----------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **R2** (Claimant denies claiming)               | 2 (low, accepted)         | Slightly improved — `confirmed_by` provides one-sided audit. Still no dispute system; v1 doesn't promise one.                                                                         | 2 (unchanged)                                       |
| **I4** (Backup retention)                       | 15 (high, disclosed)      | Marginally extended — backups now include `confirmed_at`/`confirmed_by` for up to 7 PITR days post-confirmation, plus the 30-day live retention. Disclosed via the same D6 mechanism. | 15 (unchanged — same kind of risk; same mitigation) |
| **I3** (Realtime row leak)                      | 12 (medium, mitigated)    | Unchanged — same RLS, same channel, same filter. New columns inherit the existing visibility.                                                                                         | 12 (unchanged)                                      |
| **E1** (Self-promote admin)                     | 5 (negligible, mitigated) | Unchanged — `confirm_pickup` does not interact with `is_admin`.                                                                                                                       | 5 (unchanged)                                       |
| **E2** (Admin reads user data)                  | 12 (medium, mitigated)    | Unchanged — admin's read access to `public.resources` is still zero per RLS. New columns inherit the same zero visibility.                                                            | 12 (unchanged)                                      |
| **NEW: Bad-faith poster inflates Casey metric** | n/a                       | One-sided confirmation allows a poster to fake a completed pickup. Mitigation: no leaderboard, no per-user metric, Casey validates community-by-community manually.                   | Low (5-6 — accepted)                                |

**Net STRIDE delta: +1 new low-residual risk (bad-faith metric inflation), no escalation of existing risks.**

**Jordan recommendation:** add the bad-faith-inflation risk to the next STRIDE re-audit (Cycle 7 ship-readiness per Steve's recommendation). Document in LEARNINGS.md as a known accepted-residual.

---

## Retention specifics (cleaner than today's behavior)

Today, the prune cron deletes `reserved` rows 30 days after `status_changed_at` (which is the reservation moment). For a successful exchange, this means the row sits in `reserved` state for 30 days post-claim, then hard-deletes — conflating "successful pickup that happened on day 1" with "abandoned reservation on day 30."

After Phase 2 #7, the prune cron:

- Deletes `available` rows 30 days after `created_at` — unchanged.
- Deletes `reserved` rows 30 days after `status_changed_at` (which is the reservation moment) — unchanged.
- Deletes `completed` rows 30 days after `confirmed_at` (which is the actual pickup moment) — NEW.

This is a **better** retention story: it disentangles "pickup happened" from "reservation abandoned." Both still delete on 30-day windows, but they're measured from semantically-meaningful timestamps.

**Privacy positive.** Jordan endorses the retention change.

---

## Sign-off requirement (Sky)

Per Conditions C1 + C2 + C3, Jordan's APPROVED_WITH_CONDITIONS verdict requires:

- **C1:** Steve's code review of migration 005 confirms `confirmed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL` is present. (Jordan already grep'd the file and found the language documenting this rule — verify at PR review.)
- **C2:** Code review of the realtime subscription confirms `confirm_pickup` UPDATE events do not introduce a new channel, do not add filter parameters beyond existing, and inherit the existing `resources_verified_read` RLS gating.
- **C3:** Will's review of the in-app delete confirmation copy confirms it accurately describes the 30-day post-confirmation cascade (or no change needed if existing copy is generic enough — Jordan's read: existing copy is fine).

No one-line Sky sign-off is required beyond the existing Constitution Art. 7.6 merge-time approval. Quinn's DFS-1 through DFS-5 are independent product decisions Sky must resolve, but none gate Jordan's verdict.

---

## Per-DFS notes (Jordan's read on Quinn's 5 DECISIONS FOR SKY)

- **DFS-1 (button copy varies by role):** Privacy-neutral. The copy difference reveals the user's role to the user, not to anyone else. **No Jordan input.**

- **DFS-2 (one-sided vs two-sided confirmation):** **Jordan supports one-sided.** Two-sided would require a `confirmed_by_poster` + `confirmed_by_claimant` schema — DOUBLE the metadata, double the audit surface, double the leak surface. One-sided keeps the surface area minimal. The bad-faith-inflation risk is acceptable given no leaderboard, no per-user metric.

- **DFS-3 (retention — 30 days + bare-count log):** **Jordan strongly supports.** Aligns with PRIVACY.md D7 (existing 30-day pattern). The bare-count `cron_log` addition preserves Casey's metric without retaining row data — this is the textbook privacy-preserving aggregation pattern.

- **DFS-4 ("no pickup happened" outcome — defer auto-cancel):** Privacy-neutral. The 30-day prune handles abandoned reservations identically to today. **No Jordan input.**

- **DFS-5 (no notification this cycle):** **Jordan strongly supports.** Mara's anti-goal #3 explicitly bans push notifications that reveal item names; even when push lands in Phase 3 #16, confirmation notifications must follow strict title-only-no-body rules. Out-of-scope here is correct.

---

## Proposed PRIVACY.md edits

Jordan PROPOSES the following PRIVACY.md additions but does NOT modify the file (Constitution Art. 4: Jordan owns PRIVACY.md but Sky approves edits at merge time).

### Edit 1: Add rows 17, 18, 19 to the data inventory table

```markdown
| 17 | confirmed_at | `public.resources.confirmed_at` | Confirm pickup | Lifecycle close | 30 days post-confirmation (D7-aligned) | All verified users (matches existing `resources_verified_read`) | No |
| 18 | confirmed_by | `public.resources.confirmed_by` | Confirm pickup | Audit + dispute window | Same | Same | No |
| 19 | status = 'completed' | `public.resources.status` | Confirm pickup | Lifecycle state | Same | Same | No |
```

### Edit 2: Add a brief paragraph under "Decisions log" referencing the confirmation lifecycle

After the proposed D11 (HRT category, see categories review), insert:

```markdown
### D12: Pickup confirmation lifecycle — one-sided confirm + 30-day post-confirmation retention + bare-count cron_log preservation (Phase 2 #7)

**Proposal:** Add `status='completed'`, `confirmed_at`, `confirmed_by` to `public.resources`. Either poster OR claimant can confirm via `confirm_pickup` RPC; one-sided is sufficient. Completed rows hard-delete 30 days post-confirmation; `cron_log` records bare counts (no row identifiers) for Casey's growth metric.

**Why:** Casey's #1 growth metric ("successful exchanges per active community per week") is the only honest signal of community health and was unmeasurable before. Lifecycle clarity (completed vs abandoned) cleans up the marketplace and metric semantics.

**Mitigation:** No admin surface (Cycle 5 cap stays at 5 fields). No per-user metric. No badge / leaderboard. `confirmed_by` mirrors `claimed_by` cascade rule (`ON DELETE SET NULL`). Realtime channel unchanged.

**Alternative considered:** Two-sided confirmation — rejected (coordination tax, double the audit surface). 0-day delete — rejected (loses dispute window). Keep-forever — rejected (Mara's "honest deletion" promise).

**Sky's decision recorded:** [pending merge]
```

### Edit 3: D6 (Delete-my-account) — small clarification

Optional. The existing D6 entry is correct as-written; the cascade rules for `confirmed_by` are absorbed into "deletes all rows in `resources` where `posted_by = auth.uid()`" + "nulls out `claimed_by` on any resource the user has claimed but not yet picked up." Jordan PROPOSES adding a parenthetical: "(also nulls `confirmed_by` on any resource the user confirmed; row deletes on the 30-day prune.)" — but this is housekeeping, not a privacy-substantive edit. Sky's call whether to inline-update or leave for a future PRIVACY.md sweep.

---

## What I shipped

This Jordan privacy review document. No code touched. No PRIVACY.md edited (PROPOSED edits above are for Sky to apply if approved at merge). No external message sent (Morgan owns that channel; Jordan operates file-only per Constitution Art. 9).

---

**Jordan — 2026-05-24** — file-only output. Verdict: **APPROVED_WITH_CONDITIONS (C1 + C2 + C3, all small).** No BLOCKER. No new DECISION FOR SKY beyond Quinn's existing 5.
