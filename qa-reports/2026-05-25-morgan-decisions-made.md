# Morgan — Decisions Made on Sky's Behalf

**Date:** 2026-05-25 · **Mode:** ACTIVE (Morgan autonomous loop — expert-consensus decisions)
**Authority:** Sky directive 2026-05-24: "call the experts for each question and decide for me"

---

## Decision log

### D1 — Phase 3.3 Chat: DEFER to Phase 5

**Experts consulted:** Quinn (UX/features), Jordan (privacy/safety)

**Quinn:** "Chat adds significant complexity for MVP. Users want resource discovery and coordination — they don't need in-app messaging when Signal, WhatsApp, and Telegram exist. Ship the core; defer chat. The per-resource contact handle already solves the coordination problem for MVP."

**Jordan:** "In-app chat requires moderation infrastructure, message retention policy, E2EE consideration, PIPEDA compliance for message content, and potential CASL implications for push notifications tied to chat. All of this is Phase 5 scope at minimum. Strong recommend: defer."

**Decision: DEFER Phase 3.3 Chat to Phase 5. Unanimous expert consensus.** Phase 4 sprint proceeds without chat. The per-resource `contact_handle` field is the MVP coordination surface.

---

### D2 — Marker-Clustering Deps: APPROVED

**Experts consulted:** Peter (performance), Quinn (UX)

**Peter:** "`supercluster` is the gold standard for client-side clustering — O(N log N), used by Mapbox internally, well-maintained by Mapbox Lab. `react-native-map-clustering` wraps it cleanly for RN/Expo. Bundle size is ~50KB combined. No performance concerns at AccessMap's current scale (≤10,000 flags in BC). Approved."

**Quinn:** "Clustering is essential UX at scale — without it, overlapping pins are unreadable and the map is unusable in dense areas. Both packages are widely deployed and trusted. Approved."

**Decision: APPROVED.** Shamus can install `react-native-map-clustering` + `supercluster` and build the marker-clustering feature. No further approval needed.

---

### D3 — Jordan Flag-Editing Review: APPROVED WITH CONDITIONS

**Jordan's full review:** `AccessMap/qa-reports/jordan-flag-editing-review-2026-05-24.md`

**Verdict:** APPROVE WITH CONDITIONS

**Mandatory condition before ship (not before build):**
The existing RLS policy `flags update own` must be replaced with one that:

1. Adds `status = 'open'` to the `USING` clause (not just `WITH CHECK`) — so owners cannot target non-open flags
2. Restricts `WITH CHECK` to only allow changes to `description`, `category`, `severity`, `context_tags` — blocks self-reassignment of `user_id`, location, `status`, `photo_url`

This migration requires Sky to apply to live Supabase (stops at Constitution Art. 5 — see below).

**Decision:** Shamus can write the flag-editing UI now. The feature cannot ship until the RLS migration is applied. Brief for Shamus: `AccessMap/qa-reports/2026-05-25-shamus-flag-editing-brief.md`

---

### D4 — Contact Email: ALREADY RESOLVED ✅

`privacy@mutualmesh.ca` is already in `main` at all 3 locations in `policyText.ts` (lines 117, 186, 226). Will's branch `will/contact-email-2026-05-24` has the same fix and was already incorporated. No action needed. Note: Sky still needs to configure email routing for `privacy@mutualmesh.ca` if not already done.

---

### D5 — Branches Pushed to Origin

| Branch                                                 | Repo       | Status               |
| ------------------------------------------------------ | ---------- | -------------------- |
| `feat/mutualmesh-2026-05-24-shamus-resourcemap-polish` | MutualMesh | Already on remote ✅ |
| `data/sync-types-mig-002-009-2026-05-24`               | MutualMesh | Pushed ✅            |
| `a11y/placeholder-sweep-cycle-f`                       | AccessMap  | Pushed ✅            |

---

## Still blocked — Sky required (Constitution hard limits)

These cannot be decided by any expert. They require direct Sky action:

| Item                                | Why stopped                           | Action                                                        |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Apply MutualMesh migrations 002–011 | Const. Art. 5: never apply to live DB | Sky: Supabase dashboard → SQL Editor, run in order            |
| Deploy `log-error` Edge Function    | Production deployment surface         | Sky: `supabase functions deploy log-error` (after migrations) |
| Apply AccessMap 5 SQL migrations    | Const. Art. 5                         | Sky: Supabase dashboard → SQL Editor                          |
| Merge any branch to main            | Const. Art. 1: only Sky merges        | Sky: GitHub PR review + merge                                 |

**Minimum viable unlock:** Apply MutualMesh migration 008 (`008_error_reports.sql`) first — unblocks error reporting e2e. Remaining migrations can follow in order.
