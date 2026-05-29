# MUTUALMESH — MIGRATION GATE URGENCY

**Date:** 2026-05-28 · **Status:** AWAITING SKY  
**Authority:** Morgan (PM)

---

## SITUATION

50 feature branches (Cycles 1–5) are **gate-approved and ready to merge**. All feature work is complete, tested, and validated. **BLOCKER:** Migrations 012 → 013 → 014 must be applied to Supabase production database before merge wave can execute.

---

## DECISION FOR SKY

**Apply migrations in order on Supabase dashboard:**

1. Migration 012 (details in `supabase/migrations/2026-05-25_mig-012.sql`)
2. Migration 013 (details in `supabase/migrations/2026-05-25_mig-013.sql`)
3. Migration 014 (details in `supabase/migrations/2026-05-25_mig-014.sql`)

**Timeline:** 3 min total (dashboard clicks)  
**Impact:** Unblocks 50-branch consolidation merge + Cycles 6+ (community signup, realtime)

---

## OPEN RISK

**Critical RPC param drift (flagged by Dana 2026-05-25):**
- Client sends: `{ token, platform }`
- Database expects: `(p_expo_token, p_platform)`
- Must resolve before mig 009/010/011 apply (queued for later)

**Action:** Dana to audit Dana/0526 findings + provide resolution plan. Queued for Friday (does not block today's 012–014 apply).

---

## UNBLOCK ACTION

**Sky:** Apply migrations 012 → 013 → 014 now (or ASAP).  
**Result:** Morgan executes 50-branch merge consolidation on Monday (post-migration verification).

---

**Status:** Awaiting Sky decision. Timeline flexible (can happen today or tomorrow, no critical-path dependency on AccessMap/Portfolio work).
