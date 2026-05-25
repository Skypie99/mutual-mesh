# Quinn — FEATURES.md Update: Cycle 6 Prioritization + Web Demo Items

**Role:** Quinn (Product Manager)
**Date:** 2026-05-25
**Branch:** `product/auto-2026-05-25-quinn-features-update`
**File changed:** `FEATURES.md`

---

## Summary of changes

### 1. Cycle 6 AC items — explicit priority labels added

The five Cycle 6 acceptance criteria already existed in FEATURES.md but lacked actionable priority signals. This update adds priority tags and clarifies the dependency structure:

| Item | Priority | Notes |
|------|----------|-------|
| AC-6.1 — ProfileScreen handle edit | **HIGH** | Shamus building tonight (2026-05-25) |
| AC-6.2 — deleteAccount() with real Storage cascade | **HIGH** | Gated on AC-6.4 Jordan review before merge |
| AC-6.3 — Profile stats accuracy post-claim | **MEDIUM** | No urgency blocker; ships with cycle if time allows |
| AC-6.4 — Jordan privacy review for Cycle 6 scope | **BLOCKER** | Gates AC-6.2 merge; Jordan must sign off in qa-report |
| AC-6.5 — Session + AsyncStorage clear on account delete | **HIGH** | Critical for security hygiene post-deletion |

**Key change vs. previous version:** AC-6.4 was previously a note embedded in the "Privacy: HIGH" line at the end of the block. It is now a standalone numbered criterion with explicit BLOCKER status so it can't be overlooked during code review or cycle planning.

### 2. Web Demo section added (WEB-1–3)

New section "Web Demo (Vercel) — shipped 2026-05-25" inserted after Cycle 7, before Phase 2–3 extensions:

- **WEB-1:** Live web demo at `https://mutual-mesh.vercel.app` — auth-gated, no guest mode. Marked SHIPPED.
- **WEB-2:** Jordan Condition 4 advisory — `expo-location` CI check. Gary implementing tonight. Marked IN PROGRESS.
- **WEB-3:** Web a11y audit by Alex against the Vercel demo. Alex running tonight. Marked IN PROGRESS. Noted as blocker for external demo sharing.

### 3. Status line updated

Header status line reflects the Cycle 6 update and web demo additions.

---

## Backlog ordering assessment

Current order (Cycles 0 → 5 → 6 → 7 → Web Demo → Phase 2–3 Extensions) is correct. No promotions or demotions needed:

- Phase 2–3 items shipped ahead of Cycle 5–7 completion; their placement after the MVP cycles accurately reflects they were velocity-loop additions, not originally planned.
- Cycle 7 (safety sweep) correctly stays after Cycle 6 — it must gate on Cycle 6 completion.
- Web Demo items correctly sit outside the numbered cycle track since they're a parallel surface (web) rather than sequenced MVP work.

---

## DECISIONS FOR SKY

None new from this update. Existing open items (DFS-P1-A, DFS-Phase4, Phase 3.4 i18n) unchanged.

---

## Constitution compliance

- No changes to `main`, `app.json`, `eas.json`, or `~/.claude/**`
- No external side effects
- FEATURES.md is Quinn's lane per CLAUDE.md role map
- Privacy-sensitive items (AC-6.4) correctly gate on Jordan review, not bypassed
