# Jordan Privacy Re-Review — Migration 014 `get_resource_detail()` SECURITY DEFINER RPC

**Reviewer:** Jordan (Privacy Advisor)
**Date:** 2026-05-28
**Scope:** Re-review requested in migration 014 header; RPC was applied to Supabase (cslvjfewxiowdxfoqzre) today.
**File reviewed:** `supabase/migrations/014_get_resource_detail_rpc.sql` (worktree `data-auto-2026-05-25-dana-claim-rpc`)
**Authority:** PRIVACY.md row 11 + Constitution Art. 7.6 (privacy review mandatory for marginalized-group data)
**Mode:** AUDIT ONLY — no code modified, no external send.

---

## NOT A LAWYER DISCLAIMER

This document is Jordan's structured privacy review — **NOT legal advice.** All PIPEDA references are non-authoritative and require a Canadian privacy lawyer's review before public launch (PRIVACY.md D10).

---

## VERDICT: APPROVE WITH CONDITIONS

The RPC correctly closes the server-side privacy gap Jordan blocked in Cycle 9. The load-bearing `contact_handle` gate is structurally sound. Two conditions — one substantive question about claim semantics, one a documentation wire-up — must be resolved before Shamus wires `ResourceDetailScreen`.

---

## Question 1: Does the `contact_handle` CASE logic correctly enforce PRIVACY.md row 11?

**Finding: YES — with a caveat to examine.**

PRIVACY.md row 11 states `contact_handle` visibility as: "Claimant only, after claim."

The RPC's CASE logic (lines 144–148):

```sql
CASE
  WHEN v_resource.posted_by  = v_caller THEN v_resource.contact_handle
  WHEN v_resource.claimed_by = v_caller THEN v_resource.contact_handle
  ELSE NULL
END AS contact_handle
```

This returns `contact_handle` to exactly two identities: the original poster and the current claimant. The ELSE arm returns NULL to every other verified user — meaning no third party ever receives `contact_handle` in the network response, regardless of what the client renders.

This satisfies the server-side enforcement requirement that Jordan stated in Cycle 9. The client-side render guard alone was insufficient because the raw column value was still in the network response. This RPC eliminates that: the network response carries NULL for everyone except the two parties.

**The poster branch** (`posted_by = v_caller`): The poster originally supplied the contact handle. PRIVACY.md D2 confirms "Claimant sees it on claim" — but the poster also typed it and holds it as their own information. Granting it back to the poster is a correct and non-privacy-expanding choice. The poster cannot learn anything new from seeing their own handle.

**The claimant branch** (`claimed_by = v_caller`): See Question 2 for the substantive analysis.

---

## Question 2: Does `claimed_by = auth.uid()` correctly represent "confirmed claimant" — or does it need `confirmed_at IS NOT NULL` additionally?

**Finding: APPROVED — `claimed_by = auth.uid()` is the correct and sufficient gate. `confirmed_at IS NOT NULL` would be a STRICTER but WRONG interpretation of PRIVACY.md row 11.**

This is the key question. Let me be precise about the semantics.

**What `claimed_by` means in the schema:**

`claimed_by` is set by `claim_resource()` RPC at the moment of the `available → reserved` transition (schema.sql line 420). It represents the user who has atomically reserved the resource. It is:

- Set when: the claimant calls `claim_resource()` — the resource transitions to `status = 'reserved'`.
- Cleared when: the claimant calls `delete_my_account()` — the column is NULLed, status resets to `'available'`.
- Not a "confirmed pickup." `confirmed_at` (migration 005) is set by `confirm_pickup()` at the `reserved → completed` transition, and captures when a party confirms physical pickup occurred.

**What PRIVACY.md row 11 says:**

> "Claimant only, after claim."

The operative phrase is "after claim" — meaning after `claim_resource()` has been called successfully, establishing `claimed_by = claimant_uid` and `status = 'reserved'`. This is the moment the contact handle becomes relevant: the claimant needs to reach the poster (or vice versa) to arrange the handoff. The contact handle is the coordination mechanism.

**Why `confirmed_at IS NOT NULL` would be wrong:**

If the gate required `confirmed_at IS NOT NULL` additionally, the contact handle would only be revealed AFTER the pickup was already confirmed complete. That is logically backwards: the contact handle exists precisely so the parties can ARRANGE the pickup. By the time `confirmed_at` is set, the handoff has already occurred — the contact handle is no longer needed. Requiring `confirmed_at IS NOT NULL` would make `contact_handle` permanently inaccessible during the entire coordination window (the `reserved` period), which would break the feature entirely.

**The correct semantics are:**

| State | `claimed_by` | `confirmed_at` | Should claimant see `contact_handle`? | Why |
|---|---|---|---|---|
| `available` | NULL | NULL | NO | No one has claimed yet; no coordination needed |
| `reserved` | claimant_uid | NULL | **YES** | Claimant is actively coordinating pickup; this is the entire purpose of the field |
| `completed` | claimant_uid | timestamp | YES | Pickup done; revealing it is harmless and consistent |
| `reserved` but claimant deleted account | NULL | NULL | NO (correctly NULL for them) | `claimed_by` is NULL; CASE ELSE returns NULL |

The current CASE logic (`claimed_by = v_caller`) is precisely correct for all four states. PRIVACY.md row 11 "after claim" maps to `claimed_by IS NOT NULL AND claimed_by = caller`, which is what the CASE implements.

**One edge case to confirm — poster access during `completed` state:**

After `confirm_pickup()`, both `claimed_by` and `posted_by` remain set on the row (they are only NULLed on account deletion). The CASE continues to return `contact_handle` to both parties for the 30-day post-completion retention window (per migration 007's prune). This is acceptable: the parties on the closed dyad already exchanged contact information; revealing it back to them after the fact is not a new exposure.

**Conclusion on Question 2: The gate is correct. No `confirmed_at IS NOT NULL` check is needed or appropriate.**

---

## Question 3: Is the verification gate (`is_verified = true`) an appropriate additional requirement for accessing resource detail?

**Finding: YES — this is load-bearing and correct.**

The RPC's verification check (lines 104–112):

```sql
SELECT u.is_verified INTO v_is_verified FROM public.users u WHERE u.id = v_caller;
IF NOT COALESCE(v_is_verified, false) THEN
  RAISE EXCEPTION 'permission denied' USING HINT = 'Caller is not a verified Mutual Mesh user.';
END IF;
```

This is consistent with the existing `resources_verified_read` RLS policy (schema.sql lines 529–534), which gates all resource SELECT access to verified users. The RPC runs SECURITY DEFINER, which bypasses RLS — so without this explicit check, an unverified (or pending-approval) user who obtained a valid JWT could call the RPC and receive resource data including `contact_handle`.

The explicit `is_verified` check inside the function body is the correct defensive pattern. It mirrors the verification gate in `claim_resource()` (which does not check `is_verified` explicitly — an oversight that `get_resource_detail()` correctly improves upon).

**One observation (non-blocking):** The `COALESCE(v_is_verified, false)` handles the case where `v_caller` has a valid JWT but no row in `public.users` — treating a missing user row as unverified. This is correct defensive behavior.

---

## Question 4: Other privacy risks (data minimization, retention, right-to-erasure impact)

### 4a. Data minimization — what the RPC returns

The RPC's RETURNS TABLE (lines 67–84) includes:

| Column | Sensitivity | All verified users see this? | Appropriate? |
|---|---|---|---|
| `id` | Low (UUID) | Yes | Yes — needed to identify the resource |
| `name` | Low | Yes | Yes — public listing field (PRIVACY.md row 7) |
| `description` | Low | Yes | Yes — public listing field (row 8) |
| `pickup_text` | Low-medium | Yes | Yes — per user's granularity choice (row 10) |
| `photo_url` | Low | Yes | Yes — public listing field (row 9), signed URL per S4 |
| `contact_handle` | **HIGH** | **NO — gated** | Yes — gated per row 11, see Question 1 |
| `status` | Low | Yes | Yes — public marketplace state (row 12) |
| `posted_by` | Medium (UUID) | Yes | Acceptable — UUID, not handle; server-side only per row 13 |
| `claimed_by` | Medium (UUID) | Yes | Acceptable — UUID, not handle; server-side only per row 14 |
| `confirmed_at` | Low | Yes | Yes — lifecycle timestamp, same visibility as existing row fields |
| `confirmed_by` | Medium (UUID) | Yes | Acceptable — UUID only; matches `claimed_by` visibility (Jordan Phase 2 review) |
| `created_at` | Low | Yes | Yes — standard timestamp |
| `status_changed_at` | Low | Yes | Yes — standard timestamp |
| `category` | Low | Yes | Yes — public filter field (migration 004) |
| `postal_prefix` | Low | Yes | Yes — neighborhood-level only (PRIVACY.md D3) |
| `city` | Low | Yes | Yes — explicit dropdown value (PRIVACY.md Q2) |

**No extraneous fields detected.** The return set is consistent with what any verified user would receive from a `select('*')` on `public.resources` — except that `contact_handle` is now server-gated to NULL for non-parties.

**Observation:** The RPC returns `posted_by`, `claimed_by`, and `confirmed_by` as raw UUIDs. Per PRIVACY.md rows 13–14, these are described as "server-side only" — meaning the UI should show the poster/claimant's _handle_, not their UUID. If Shamus's `ResourceDetailScreen` receives these UUIDs and renders them as handles, the screen will need a separate query to resolve handles. The RPC does not return handles for these parties, which is consistent with minimum disclosure. Jordan notes this as a design observation for Shamus, not a privacy risk.

### 4b. Retention alignment

The RPC is a read function — it does not write data. Retention is governed by the existing schema (30-day prune via migration 007) and is unaffected. No new data is collected or stored.

### 4c. Right-to-erasure (delete_my_account) impact

The `delete_my_account()` RPC (schema.sql lines 366–393) cascades:
- DELETE where `posted_by = me` — resources the deleted user posted are hard-deleted.
- SET NULL where `claimed_by = me` and `status = 'reserved'` — the resource becomes available again.

`get_resource_detail()` is a read function. There is no write path that needs a cascade update. A caller whose account was deleted has no `auth.uid()` and will fail the authentication check at line 99 (`v_caller IS NULL`). No erasure risk introduced.

One item to confirm (non-blocking): After the 014 RPC is live, calling `getResourceById()` with `select('*')` becomes a dead path — if Shamus leaves the old call in place alongside the new RPC call, the old path would continue to return `contact_handle` directly (bypassing the gate). **This is a conditional flag — see Condition C-1 below.**

### 4d. SECURITY DEFINER + search_path posture

The function is declared `SECURITY DEFINER SET search_path = public` (lines 86–87). This is the correct defensive pattern for all MutualMesh RPCs. `SET search_path = public` prevents schema-injection attacks where a hostile schema object could shadow a `public.*` table. Consistent with `claim_resource`, `confirm_pickup`, and all other RPCs in the schema.

### 4e. Unauthenticated caller behavior

Lines 99–102 raise `EXCEPTION 'permission denied'` for `v_caller IS NULL`. This correctly short-circuits before any data access occurs. The error hint (`'Caller is not authenticated.'`) is internal — it does not flow to a user-visible UI string via PostgREST's structured error (the `HINT` field is logged, not rendered, per Supabase's error format). No PII leakage risk in the error path.

### 4f. Resource-not-found behavior

Lines 122–125: `IF NOT FOUND THEN RETURN;` — returns an empty result set rather than raising an exception. This is consistent with "let the client show not found." It does not reveal whether a resource existed and was deleted versus never existed (i.e., it does not create an oracle for probing deleted resource IDs). Acceptable.

### 4g. Persona impact (Mara's anti-goals)

Mara's anti-goal #4 ("no one knowing what she's claimed"): Under the old `select('*')` path, every verified user who viewed a resource detail could see `claimed_by` (a UUID) regardless — that has always been the case. The RPC changes nothing about `claimed_by` visibility. What it fixes is `contact_handle`: Mara's contact handle is no longer exposed to the browsing public via a network response. This is a direct privacy improvement for Mara's persona.

---

## Conditions Before Shamus Wires ResourceDetailScreen

### C-1 (REQUIRED): Remove or replace `getResourceById()` with `select('*')` in `src/lib/resources.ts`

The migration header (lines 33–38) instructs Shamus to replace `getResourceById(id)` with `supabase.rpc('get_resource_detail', { p_resource_id: id })`. This replacement is load-bearing: if the old `select('*')` call remains active alongside (or instead of) the new RPC, `contact_handle` is still returned to all callers via the direct PostgREST query path — bypassing the entire privacy gate.

**Required action:** Shamus must completely replace (not supplement) the `getResourceById` call. Jordan requires confirmation that the old path is removed from `src/lib/resources.ts` before the branch merges. A diff showing the replacement is sufficient — no further Jordan review needed for that single-line change.

### C-2 (REQUIRED): GRANT EXECUTE on `get_resource_detail` to `authenticated` role

The migration does not include an explicit `GRANT EXECUTE ON FUNCTION public.get_resource_detail(UUID) TO authenticated;` statement. Migrations 003, 005, and 011 each include explicit GRANTs following the schema.sql pattern. Without this GRANT, PostgREST clients calling `supabase.rpc('get_resource_detail', ...)` may receive a `permission denied for function` error at runtime — the function is callable by service_role (Sky / pg_cron / Edge Functions) but not by authenticated app users.

**Required action:** Dana should add the GRANT as a follow-up migration or as an idempotent statement. The GRANT is not a privacy change — it is an access-enablement fix. If Dana confirms the function was already callable by authenticated callers in Supabase's post-apply state (some configurations inherit grants from the schema owner), C-2 can be resolved with that confirmation instead.

> Note: C-2 is a correctness/availability concern, not a privacy concern. Jordan flags it here because a missing GRANT would silently fail to enforce the gate (the old `select('*')` path would be the fallback), which would reinstate the privacy gap.

---

## Summary Table

| Review Question | Finding | Verdict |
|---|---|---|
| Q1: CASE logic correctness for PRIVACY.md row 11 | Gate is structurally sound; returns `contact_handle` only to poster or claimant; NULL to all others | PASS |
| Q2: `claimed_by = auth.uid()` vs. `confirmed_at IS NOT NULL` | `claimed_by = auth.uid()` is correct; `confirmed_at` test would break coordination window | PASS — no change needed |
| Q3: `is_verified = true` gate appropriateness | Correct and load-bearing; mirrors existing RLS; defends against JWT-holder who bypasses RLS | PASS |
| Q4a: Data minimization — return columns | All 16 columns appropriate; `contact_handle` is the only HIGH-sensitivity field and is gated | PASS |
| Q4b: Retention | Read-only RPC; no new data stored; existing prune unaffected | PASS |
| Q4c: Right-to-erasure impact | No write path; deleted-user callers fail auth check; no cascade update needed | PASS |
| Q4d: SECURITY DEFINER + search_path | Correct defensive pattern; consistent with all existing RPCs | PASS |
| Q4e: Error path PII | `HINT` field is internal; no user-visible PII in error strings | PASS |
| Q4f: Resource-not-found behavior | Empty result set; no oracle for deleted resource probing | PASS |
| Q4g: Persona impact (Mara) | Direct improvement; `contact_handle` no longer leaks to browsing verified users | PASS |
| C-1: Old `getResourceById select('*')` removed | Cannot verify from migration alone — requires Shamus diff | CONDITIONAL |
| C-2: GRANT EXECUTE to authenticated | Missing from migration; needs follow-up migration or confirmation | CONDITIONAL |

---

## Jordan Sign-Off

**Jordan approves this RPC as the correct server-side gate for PRIVACY.md row 11.**

The two conditions are procedural, not substantive privacy findings. The privacy gate itself is correctly designed, correctly placed (SECURITY DEFINER), and correctly enforced.

**Shamus may wire `ResourceDetailScreen` to call `supabase.rpc('get_resource_detail', ...)` immediately — conditional on C-1 (old call removed) being demonstrated in the PR diff. C-2 should be resolved in the same PR or a follow-up migration before the branch merges to main.**

Once Shamus's PR shows the old `getResourceById select('*')` path replaced, Jordan signs off unconditionally. No further Jordan review is required for this migration.

---

## DECISIONS FOR SKY

None — both conditions (C-1 and C-2) are agent-resolvable without Sky's input. C-1 is Shamus's code change; C-2 is Dana's migration addition. Neither involves a privacy tradeoff requiring Sky's judgment.

---

**Jordan — 2026-05-28** — audit only, no code modified, no external side effects.
**Output filed:** `qa-reports/2026-05-28_Jordan_014_ReReview.md`
