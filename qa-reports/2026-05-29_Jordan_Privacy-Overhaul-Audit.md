---
date: 2026-05-29
author: Jordan (Privacy Advisor)
project: MutualMesh
scope: Privacy deep audit — 8 areas
authority: AUDIT-ONLY (no code changes, no DB applies, no commits)
model: claude-sonnet-4-6
branch-context: test/auto-2026-05-28-gary-unit-coverage
migrations-audited: schema.sql + migrations 001–011 (in main tree); 012–014 in data-auto worktree
---

# MutualMesh Privacy Deep Audit — 2026-05-29

> **NOT A LAWYER DISCLAIMER.** Jordan is the Privacy Advisor role inside Sky's Claude Corp system, not a licensed attorney. Nothing in this document is legal advice. PIPEDA references and trust-boundary claims are reasoned from publicly-available documentation. Before public launch, a qualified Canadian privacy lawyer must independently sign off — see PRIVACY.md D10.

## Executive Summary

**Overall verdict: MEDIUM severity — no critical data-leak in production, but two real-world gaps and four documentation/process gaps that need resolution before launch.**

The foundational PRIVACY.md design (D1–D10, S1–S8) is sound and the DB layer implements it accurately. The areas below identify where implementation has drifted from the design, where the design's promises are documented but not yet automated, and where new surface area (migrations 012–014, Realtime) needs explicit accounting.

---

## Finding 1 — contact_handle: bypass path via select('*') in listMyPosts / listMyClaims

**Severity: HIGH (fixable)**

**File:** `/Users/skypie/MutualMesh/src/lib/resources.ts` lines 61 and 71

`listMyPosts()` and `listMyClaims()` both call `.select('*')` which returns the full row including `contact_handle`. Although the RLS policy (`resources_verified_read`) permits verified users to SELECT any resource row, and although `contact_handle` is the poster's own handle in the case of `listMyPosts`, the `listMyClaims` path is the gap:

- A user who claimed a resource sees the poster's `contact_handle` in the network response from `listMyClaims`. This is *intentionally* allowed (PRIVACY.md row 11: "Claimant only, after claim"). So `listMyClaims` returning `contact_handle` to the claimant is correct.
- However, `listMyPosts` exposes the poster's *own* contact_handle, which is also acceptable.
- **The real gap:** migration 014's `get_resource_detail` RPC was written specifically to gate `contact_handle` at the server — but `ResourceDetailScreen.tsx` line 54 still calls `getResourceById()` which uses `.select('*')`, **not** the new `get_resource_detail` RPC. The 014 migration header explicitly says "What Shamus must do next: replace the getResourceById call." This wiring is pending.

Until `getResourceById` is replaced with `get_resource_detail`, any verified user who views the ResourceDetailScreen gets `contact_handle` in the network response regardless of whether they are the poster or claimant. The UI correctly gates rendering (line 119: `showsContactHandle = resource.status === 'reserved' && resource.contact_handle`) but Jordan's Cycle 9 block was explicitly that a client-side render guard alone is insufficient — the raw column value is in the network payload.

**Fix:** Shamus must update `getResourceById` in `src/lib/resources.ts` to call `supabase.rpc('get_resource_detail', { p_resource_id: id })`. Migration 014 must be applied to Supabase first (pending Sky apply). This is tracked in the migration 014 header.

---

## Finding 2 — contact_handle: get_resource_detail gating is correct (PASS with note)

**Severity: LOW (documentation)**

Migration 014 (`/Users/skypie/MutualMesh/.claude/worktrees/data-auto-2026-05-25-dana-claim-rpc/supabase/migrations/014_get_resource_detail_rpc.sql`) correctly gates `contact_handle` to poster or claimant only via a `CASE WHEN` expression inside a SECURITY DEFINER RPC. The gate is server-side, not client-side. This is the right enforcement shape.

**Note for the record:** The `get_resource_detail` RPC also returns `posted_by` and `claimed_by` (UUIDs) to all callers. These are opaque UUIDs, not handles — they serve as ownership signals without leaking identity. This is acceptable. The poster's handle is not in the response; only their UUID is.

---

## Finding 3 — Postal prefix: granularity is appropriate (PASS with documented rationale)

**Severity: INFO**

`public.users.postal_prefix` and `public.resources.postal_prefix` both use the 3-character FSA format (e.g., `M5V`), enforced by a `CHECK (... ~ '^[A-Z][0-9][A-Z]$')` constraint. Per PRIVACY.md D3:

- The FSA covers approximately 5,000–10,000 households in urban Canada.
- Cannot be used to identify a specific address or building.
- Is coarser than a ZIP code's first-3-digit equivalent for US readers.
- The constraint is idempotent and vetted.

The current `users_verified_read_others` RLS policy (schema.sql lines 479–487) makes `postal_prefix` visible to all other verified users. This is by design (neighborhood matching, D3) and is disclosed in the privacy policy text ("The first three characters of your postal code... used to match you with people in your neighborhood"). The policy text explicitly does NOT commit to hiding it from other verified users.

**No change required. Documented here for the record.**

---

## Finding 4 — Verification log: Sky-only SELECT correct; 90-day retention cron missing

**Severity: MEDIUM (gap)**

**Schema correctness (PASS):**
- `verification_log` has RLS enabled with only one SELECT policy (`verification_log_sky_select`) that requires `auth.uid()::text = (SELECT value FROM public.config WHERE key = 'sky_uuid')`. Only Sky can SELECT.
- No INSERT/UPDATE/DELETE client policies. Only SECURITY DEFINER RPCs (`approve_user`, `reject_user`, `auto_suspend_inactive_admins`) write rows.
- Migration 013 corrected `applicant_id` from `ON DELETE CASCADE` to `ON DELETE SET NULL`, which was the right fix: when a rejected user is hard-deleted, the audit row now survives with `applicant_id = NULL` instead of cascading away.

**Gap — 90-day retention cron is not implemented:**
PRIVACY.md D7 section states: "Verification logs: Kept for 90 days post-approval... then hard-deleted." No migration in `supabase/migrations/` nor the base `schema.sql` creates a pg_cron job to enforce this. The resources prune job (03:00 UTC), push-token prune job (03:30 UTC), and admin auto-suspend (03:15 UTC) all exist, but there is no `prune_old_verification_log_nightly` job.

This means the verification audit log accumulates indefinitely. For pre-launch low-volume development this is not urgent, but it is a privacy commitment we have made in writing to users (via policyText.ts: "Verification audit log (admin decisions): 90 days after the decision, then hard-deleted.") that is not yet enforced technically.

**Fix (proposed):** Add migration `015_verification_log_prune.sql` — a pg_cron job that deletes `verification_log` rows where `decided_at < now() - INTERVAL '90 days'`, logs to `cron_log`, runs at 03:45 UTC. This is a straightforward file-only migration following the pattern of migrations 003 and 009. Jordan approves the design; Dana can draft it.

---

## Finding 5 — Push tokens: service-role can read all rows; documented but not disclosed to users

**Severity: LOW (documentation gap)**

`public.push_tokens` has RLS enabled with self-only SELECT, INSERT, UPDATE, DELETE policies (migration 009, lines 333–354). An authenticated user sees only their own rows. The SECURITY DEFINER RPCs correctly bypass RLS and use `auth.uid()` checks.

**Service-role gap:** Supabase's `service_role` key bypasses all RLS unconditionally. Any code running with `service_role` — the Supabase dashboard, Edge Functions deployed with the service key, `pg_cron` — can SELECT all `push_tokens` rows including tokens from other users. This is a Supabase platform behavior, not a schema bug.

**Assessment:** This is expected and acceptable because:
1. Push tokens are not PII by themselves — they identify a device, not an individual (migration 009 privacy note: "Token storage is plaintext per spec DFS-1 default — not a credential, see spec §'Privacy considerations' item 3").
2. The `deliver_notification` Edge Function necessarily needs to read tokens for the recipient before delivery. Using `service_role` for this is the standard Supabase pattern for Edge Functions.
3. The admin auto-suspend function (SECURITY DEFINER, runs under pg_cron service-role) does NOT access push_tokens — correct.

**What is missing:** There is no documentation in PRIVACY.md, policyText.ts, or the push_tokens migration header that says: "The Edge Function uses the service key to read all push_tokens at delivery time. Push token exposure is bounded to Sky and Supabase-deployed Edge Functions; no third-party service ever receives the raw token." This should be stated explicitly.

**Fix (documentation-only):** Add a paragraph to PRIVACY.md under the push_tokens row in the data inventory. No code change. Jordan drafts it; Sky approves before migration 012–014 apply.

---

## Finding 6 — User deletion: ON DELETE CASCADE is correctly set; resources posted_by cascade is correct

**Severity: INFO (verified PASS)**

Audit of the full deletion cascade chain when `delete_my_account()` runs:

1. `auth.users` → `public.users` (ON DELETE CASCADE — schema.sql line 47). Correct.
2. `public.users` → `public.push_tokens` via `user_id` FK (ON DELETE CASCADE — migration 009). Correct.
3. `public.users` → `public.push_rate_limit` via `user_id` FK (ON DELETE CASCADE — migration 012, confirmed by Steve's sweep). Correct.
4. `public.resources.posted_by` → `public.users` (ON DELETE CASCADE — schema.sql line 128). When the user deletes their account, `delete_my_account()` explicitly DELETEs their resources first, then deletes from `auth.users`. This is correct and intentional (S5: single transaction with FOR UPDATE lock).
5. `public.resources.claimed_by` → `public.users` (ON DELETE SET NULL — schema.sql line 129). When the poster deletes, `claimed_by` on their posts is nulled when those resource rows are deleted. When a *claimant* deletes, `delete_my_account()` explicitly sets `claimed_by = NULL, status = 'available'` on claimed-but-not-picked-up resources. Correct.
6. `public.verification_log.applicant_id` → `public.users` (ON DELETE SET NULL, restored by migration 013). Correct post-013.
7. `public.verification_log.admin_id` → `public.users` (ON DELETE SET NULL — schema.sql line 95). Correct.
8. Storage objects in `resource-photos`: The `prune_expired_resources_v2` function in migration 003 deletes Storage objects before row deletion. The `delete_my_account()` RPC deletes resource rows (which triggers the cascade). The migration 003 function is the per-resource photo cleaner; there may be an edge case where `delete_my_account()` deletes the resource row without ensuring the Storage object is cleaned if the migration 003 trigger is not wired. See Finding 7.

**Assessment:** The core cascade is correct. The Storage photo cleanup edge case is worth confirming (Finding 7).

---

## Finding 7 — Storage photo cleanup on account deletion: gap between delete_my_account and Storage trigger

**Severity: MEDIUM (gap)**

`delete_my_account()` in schema.sql line 381: "Delete my posted resources (Storage objects cleaned up by separate trigger or batch)." This comment acknowledges that Storage cleanup is NOT done inside the RPC itself.

Migration 003 (`003_storage_cascade_on_delete_and_prune.sql`) creates a trigger/function that removes Storage objects when resource rows are deleted via the nightly prune cron job. However, `delete_my_account()` DELETEs resource rows directly and relies on "a separate trigger or batch" to remove the Storage objects.

The schema.sql comment and migration 003 leave this path ambiguous. If there is no `AFTER DELETE` trigger on `public.resources` that calls into Supabase Storage API to delete the photo, then a deleted user's photos would remain in the `resource-photos` Storage bucket until the next nightly prune cycle (which sweeps by `status_changed_at` or `confirmed_at < 30 days`), or potentially indefinitely if the prune conditions do not match deleted rows.

This is a gap between the PRIVACY.md D6 promise ("Photos in Storage cascade-delete via the row's ON DELETE trigger") and the actual implementation.

**Fix:** Confirm that migration 003's Storage cleanup function is triggered by row DELETE from `public.resources` (not only by the prune cron). If it is only called by the nightly cron with a `WHERE status/status_changed_at` condition, orphaned Storage objects from immediate account deletion are not cleaned until the next cron cycle. The correct fix is an `AFTER DELETE` trigger on `public.resources` that enqueues Storage deletion. This requires Jordan + Steve review before implementation.

---

## Finding 8 — Consent flow: poster is informed at posting time (PASS with note on mutual disclosure)

**Severity: INFO (documented PASS)**

When a user posts a resource:
1. The `AddResourceScreen` label reads: `"Contact handle (revealed only on claim)"` — correct disclosure to the poster.
2. The ConfirmationModal body in `ResourceDetailScreen` reads: `"Once you claim, the poster's contact handle is revealed to you. They'll see your handle too."` — mutual disclosure is explicitly stated at the point of claim.
3. The onboarding tour card (id: `'claim'`) reads: `"Tap Claim and the poster sees your handle. You see the contact they chose (Signal, Proton, etc.). Pickup happens off-app."` — mutual disclosure is in the first-run flow.
4. The privacy policy text reads: `"Other verified users in the app see: your handle and the resources you've posted (name, description, pickup text, photo, your chosen per-resource contact handle once they claim it)."` — disclosed in written policy.

**Assessment:** The consent flow is adequately implemented at posting time, claiming time, and in the onboarding tour. The mutual-handle-reveal is explicitly communicated at the moment of claim (ConfirmationModal body). This satisfies the spirit of PRIVACY.md D2.

**One note:** The privacy policy text (policyText.ts line 69) says other verified users see the poster's contact handle "once they claim it." However it also says: "They do NOT see your email, your postal prefix, or your city directly — only the resources matched to their neighborhood." This is slightly inaccurate: `postal_prefix` and `city` ARE visible on resource listings (they appear in `listResources()` output and on ResourceDetailScreen). The policy should say the *profile's* postal_prefix and city are not visible to others (which is true — only the resource's postal_prefix/city is shown). This is a documentation gap, not a technical gap.

---

## Finding 9 — Admin access: scope documented and three-layer enforced (PASS)

**Severity: INFO (verified PASS)**

Admin access to the verification queue is governed by:
1. **UI layer:** `RootNavigator` hides the admin tab from non-admins.
2. **RLS layer:** `users_admin_read_unverified` policy requires `is_admin = true` in the caller's own `public.users` row.
3. **RPC layer:** `approve_user` and `reject_user` raise `'Forbidden: caller is not an admin'` on non-admin callers regardless of how they reached the RPC.

The `ADMIN_VIEWABLE_USER_FIELDS` constant in `src/lib/verificationQueue.ts` (lines 39–46) is load-bearing and limited to: `id, handle, postal_prefix, city, referrer_token_hash, created_at`. Critically, **email is excluded** — this matches Quinn's DFS-1 and the original PRIVACY.md D6 annotation that email was dropped from the admin-visible list.

Admins do NOT see: is_admin, is_verified, last_active_at, push_preferences, resource data, photo data, or any claimed resource.

The `referrer_token_hash` is shown only as a presence/absence label ("Valid · single-use" or "(none — bypassed)") via `formatApplicantRow()` — the raw bcrypt hash never reaches the UI.

**Assessment:** The admin data-access scope is correctly implemented and documented. The three-layer enforcement is present and correct.

---

## Finding 10 — Realtime: resources stream does not leak contact_handle via realtime events (PASS with note)

**Severity: INFO (PASS)**

`realtime.sql` creates a publication for `public.users` and `public.resources`. Supabase Realtime delivers change events to connected authenticated clients, subject to RLS.

- The `useResources` hook subscribes to `public.resources` realtime events (INSERT/UPDATE/DELETE). The initial `listResources()` call uses an explicit column list that intentionally excludes `contact_handle`. However, **realtime UPDATE events deliver the full new row** from the CDC log, which includes `contact_handle`.

This means: when a resource is claimed (status flips to `reserved`, `claimed_by` is set), the realtime UPDATE event delivered to all connected verified users includes `contact_handle` in the event payload — even though they are not the claimant.

The `useResources` hook correctly filters the feed to `status === 'available'` resources after each delta, so a claimed (reserved) resource disappears from the UI. The contact_handle that arrives in the realtime payload is never rendered. But it *is* in the network stream to every subscriber.

**Assessment:** This is a real network-layer exposure (contact_handle arrives in realtime events for non-participants) but:
1. The event only fires on claim (status UPDATE), and by the time it fires, the resource leaves the feed.
2. The contact_handle is not rendered to non-participants.
3. The RLS `resources_verified_read` policy still applies to Realtime — Supabase Realtime respects RLS and only delivers events for rows the subscriber can SELECT. This means all verified users can SELECT all available resources, so they receive UPDATE events for all resources including the contact_handle column.

The correct long-term fix is to add a `column` filter to the Realtime subscription so UPDATE events only include specific non-sensitive columns. However this is a Supabase platform configuration, not an RLS policy — it requires updating the Realtime publication in `realtime.sql` to use column-level filtering if Supabase supports it, or migrating to Realtime's "filtered" subscription pattern.

**Status: known gap, medium risk, documented for roadmap.**

---

## Summary Table

| # | Area | Severity | Status | Action |
|---|------|----------|--------|--------|
| 1 | contact_handle via getResourceById select('*') | HIGH | GAP — pending Shamus wire | Shamus wires 014 RPC; migration 014 must be applied first |
| 2 | get_resource_detail gate logic | LOW | PASS | Note only |
| 3 | Postal prefix granularity | INFO | PASS | Note only |
| 4 | Verification log 90-day retention cron missing | MEDIUM | GAP | Add migration 015 |
| 5 | Push tokens service-role access | LOW | PASS (undocumented) | Add PRIVACY.md row |
| 6 | User deletion cascade chain | INFO | PASS | See Finding 7 for Storage caveat |
| 7 | Storage photo cleanup on account delete | MEDIUM | GAP | Add AFTER DELETE trigger |
| 8 | Consent flow for contact_handle sharing | INFO | PASS | Minor policyText.ts wording fix |
| 9 | Admin access scope | INFO | PASS | No change |
| 10 | Realtime contact_handle in event payload | MEDIUM | KNOWN GAP | Roadmap item |

---

## DECISIONS FOR SKY

1. **Finding 1 (HIGH):** Shamus must wire `ResourceDetailScreen` to call `get_resource_detail` RPC instead of `getResourceById`. Migration 014 must be applied to Supabase first. This is the most urgent privacy gap.

2. **Finding 4 (MEDIUM):** Authorize Dana to draft migration `015_verification_log_prune.sql` to enforce the 90-day retention promise. Jordan will review the migration before Sky applies.

3. **Finding 7 (MEDIUM):** Clarify whether migration 003's Storage cleanup is triggered by any `DELETE` on `public.resources` or only by the nightly cron. If cron-only, authorize Steve + Dana to add an `AFTER DELETE` trigger (or Edge Function hook) to delete the Storage object immediately when a resource row is hard-deleted via `delete_my_account()`. This is needed for D6 ("Delete means delete") to be technically accurate.

4. **Finding 10 (MEDIUM):** Acknowledge the Realtime contact_handle-in-payload gap and decide: (a) accept the risk and add it to the public roadmap, or (b) restrict the Realtime publication column list for `public.resources` to exclude `contact_handle`. Option (b) may require a Supabase platform configuration change.

5. **Finding 5 (LOW):** Authorize Jordan to draft a PRIVACY.md amendment describing push token service-role access and Edge Function delivery trust boundary. No code change.

---

## Proposed Branch

`jordan/privacy-overhaul-2026-05-29`

Scope of proposed branch: documentation amendments only (PRIVACY.md rows for push tokens + trust boundary + policyText.ts wording fix). Code fixes (items 1, 4, 7, 10) are separate branches per role: Shamus (item 1), Dana (items 4, 7), Dana/Steve (item 7).

---

*Jordan — Privacy Advisor — 2026-05-29*
