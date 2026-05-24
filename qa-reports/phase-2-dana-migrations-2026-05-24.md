# Phase 2 — Dana migrations briefing — 2026-05-24

**Author:** Dana the Backend Engineer
**Branch:** `data/auto-2026-05-24-dana` (file-only; not yet committed by Sky)
**Source specs:** Quinn's three Phase 2 specs in `qa-reports/spec-phase-2-*.md`
**Apply:** Sky via Supabase dashboard SQL editor (Dana never applies).

---

## Summary

Three independent migration files for the three Phase 2 streams. Each is idempotent, has a rollback block, mirrors the format of migrations 001–003, and does NOT modify `supabase/schema.sql`. All three can be applied in any order; there are no cross-migration dependencies.

| File                                              | What it adds                                                                                                                                                                                                                                                                                          | Spec stream                                                                   | Spec file                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `supabase/migrations/004_resource_categories.sql` | `category` column (TEXT NOT NULL DEFAULT 'other'), CHECK enum (food/hygiene/baby/**hrt**/other — lowercase per brief), composite index `resources_category_status_idx` on `(status, category, created_at DESC)`, column comment                                                                       | Stream A — Resource categories (Phase 2 #6)                                   | `qa-reports/spec-phase-2-resource-categories.md` |
| `supabase/migrations/005_pickup_confirmation.sql` | `confirmed_at TIMESTAMPTZ NULL`, `confirmed_by UUID NULL` (FK ON DELETE SET NULL), status CHECK extended to include `'completed'`, partial index `resources_confirmed_idx` on `(confirmed_at DESC)` WHERE confirmed_at IS NOT NULL, `confirm_pickup(p_resource_id UUID)` SECURITY DEFINER RPC + grant | Stream B — Pickup confirmation (Phase 2 #7) — **Jordan FULL review required** | `qa-reports/spec-phase-2-pickup-confirmation.md` |
| `supabase/migrations/006_onboarding_complete.sql` | `onboarding_complete BOOLEAN NOT NULL DEFAULT false` on public.users, `complete_onboarding()` SECURITY DEFINER RPC + grant                                                                                                                                                                            | Stream C — Onboarding tour (Phase 2 #8) — Jordan light review on UI copy      | `qa-reports/spec-phase-2-onboarding-tour.md`     |

---

## Sky-apply order

**Order does not matter** — the three migrations are independent. None reads or writes any column added by another.

Recommended order is numeric (004 → 005 → 006) only because lower numbers ship first in `ls -1` and the per-stream UI work is sequenced that way in Quinn's plan (Stream A first, then B, then C). Sky can apply just one and pause if a stream's UI isn't ready.

If anything in 005's CHECK extension feels heavy to apply on a Monday morning, ship 004 + 006 first and circle back to 005 when Jordan signs off on the full privacy review.

---

## Numbered Sky-apply steps

### Migration 004 — Resource categories

1. Open Supabase dashboard → SQL Editor → New query.
2. Paste the contents of `supabase/migrations/004_resource_categories.sql`.
3. Run.
4. Verify backfill: `SELECT category, COUNT(*) FROM public.resources GROUP BY category;` — expect 100% in `'other'` until users re-edit (Quinn AC-2).
5. Verify the CHECK rejects unknown values: `INSERT INTO public.resources (...) VALUES (..., 'banana');` — expect `check_violation` on `resources_category_check`.
6. Verify the index exists: `SELECT indexname FROM pg_indexes WHERE tablename = 'resources' AND indexname = 'resources_category_status_idx';` — expect one row.
7. Done. Tell Shamus to ship the AddResourceScreen picker + HomeScreen filter chips against this column.

### Migration 005 — Pickup confirmation

1. Open Supabase dashboard → SQL Editor → New query.
2. Paste the contents of `supabase/migrations/005_pickup_confirmation.sql`.
3. Run.
4. Verify the CHECK accepts the new value: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'resources_status_check';` — expect a definition listing `'available'`, `'reserved'`, `'completed'`.
5. Verify columns exist: `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='resources' AND column_name IN ('confirmed_at', 'confirmed_by');` — expect two rows, both nullable.
6. Verify the RPC exists: `SELECT proname FROM pg_proc WHERE proname = 'confirm_pickup';` — expect one row.
7. Verify the partial index: `SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'resources_confirmed_idx';` — expect the WHERE clause `confirmed_at IS NOT NULL`.
8. Smoke-test the RPC manually (optional, but Jordan likely wants this): create a reserved resource between two test users and call `SELECT public.confirm_pickup('<resource-id>');` from each side. Confirm idempotency.
9. Done. Tell Shamus to ship the "I picked this up" / "They picked it up" UI on ResourceDetailScreen and the Active/Completed split on ProfileScreen.

### Migration 006 — Onboarding complete

1. Open Supabase dashboard → SQL Editor → New query.
2. Paste the contents of `supabase/migrations/006_onboarding_complete.sql`.
3. Run.
4. Verify the column exists with DEFAULT false: `SELECT column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='onboarding_complete';` — expect `false`, `NO`.
5. Verify all existing rows backfilled to false: `SELECT onboarding_complete, COUNT(*) FROM public.users GROUP BY onboarding_complete;` — expect 100% in `false`.
6. Verify the RPC exists: `SELECT proname FROM pg_proc WHERE proname = 'complete_onboarding';` — expect one row.
7. Done. Tell Shamus to ship the `'tour'` gate state, OnboardingTourScreen, and the Profile entry.

---

## Cross-migration dependencies

**None.** Each migration touches a different concern:

- 004 — new column + CHECK + index on `public.resources`.
- 005 — new columns + CHECK extension + partial index + RPC on `public.resources`.
- 006 — new column + RPC on `public.users`.

Even where 004 and 005 both touch `public.resources`, they touch different columns and different CHECK constraints. No order dependency exists; applying 005 before 004 (or skipping 005) does not break 004.

---

## DECISIONS FOR SKY

### DFS-MIG-1 — Completed-row prune retention (DEFERRED in 005)

Quinn's spec AC-8 calls for `prune_expired_resources()` to also delete `status='completed' AND confirmed_at < now() - INTERVAL '30 days'`. The brief instructed: "Update the prune_expired_resources() docs comment if pruning behavior changes — but per Quinn's spec, prune still operates on status_changed_at, so no logic change needed."

That instruction is internally inconsistent with Quinn's spec, which DOES want completed-row pruning logic added. Reading carefully:

- The existing prune branches are `(status='reserved' AND status_changed_at < now() - INTERVAL '30 days')` and `(status='available' AND created_at < now() - INTERVAL '30 days')`. Neither matches `status='completed'`.
- The `touch_status_changed_at()` trigger bumps `status_changed_at` on the reserved→completed flip — but the existing prune's reserved branch only matches rows with `status='reserved'`, so completed rows are NOT swept by the existing logic regardless of when `status_changed_at` was set.
- As-shipped in this migration, completed rows persist indefinitely. That contradicts both Quinn AC-8 and PRIVACY.md D7's 30-day retention promise.

**My take:** ship a small follow-up migration `007_complete_prune_extension.sql` that extends `prune_expired_resources()` with a third DELETE branch + storage sweep for completed rows. Splitting it from 005 lets Steve audit the prune extension independently (he wrote 003's storage-cascade logic) and keeps each migration's blast radius small. 005 still works correctly today — completed rows just don't auto-delete yet.

- [ ] Approve: ship 005 as-is, follow up with 007 for the prune extension (default)
- [ ] Fold the prune extension into 005 before apply (Dana re-edits)
- [ ] Push back — keep completed rows forever (no auto-delete; conflicts with PRIVACY.md D7)

### DFS-MIG-2 — `reset_onboarding()` RPC (deferred from 006)

Quinn's spec AC-9 ships a "See intro again" link on ProfileScreen that calls a companion `reset_onboarding()` RPC (flips `onboarding_complete = false`). The brief asked for only `complete_onboarding()` in 006. Without `reset_onboarding()`, Shamus' Profile entry has nothing to call.

**My take:** ship `reset_onboarding()` as a small follow-up `008_reset_onboarding.sql` (or fold into 006 before apply). It's a near-mirror of `complete_onboarding` — same shape, opposite value. If Sky wants both in one migration, I can re-edit 006 in seconds.

- [ ] Approve follow-up 008_reset_onboarding.sql (default)
- [ ] Fold reset_onboarding() into 006 before apply (Dana re-edits)
- [ ] Drop the "See intro again" feature from Phase 2 (Shamus removes the link too)

### DFS-MIG-3 — Backfill existing staging users to `onboarding_complete = true`?

Per Quinn AC-1 and DFS-1 default, 006 ships with no backfill — existing users see the tour on their next login. Staging has ~5–10 test accounts; "one-time pain for existing test accounts, acceptable."

**My take:** ship the default. The cost is trivial (a tester sees a 3-card swipeable). If Sky wants to spare staging users entirely, add this one-liner before applying 006 (or as a 008-prepend):

```sql
UPDATE public.users SET onboarding_complete = true WHERE created_at < now();
```

- [ ] Approve no-backfill (default) — existing users see the tour once
- [ ] Edit — backfill existing users to true (one-liner above)

### DFS-MIG-4 — Index column order on 004's composite index

The spec sketch uses `(category, status, created_at DESC)`; the brief asks for `(status, category, created_at DESC)`. Both support the HomeScreen filtered marketplace query.

**My take:** shipped the brief's order (`status` first). HomeScreen always filters to `status='available'` first, then narrows by category — leading with the most-selective predicate is a small efficiency win. If Sky or Peter prefers the spec's order, drop and recreate the index in 30 seconds.

- [ ] Approve `(status, category, created_at DESC)` (default; what's shipped)
- [ ] Edit — `(category, status, created_at DESC)` per spec sketch

### DFS-MIG-5 — HRT casing: lowercase `'hrt'` vs uppercase `'HRT'`

The brief explicitly listed `('food', 'hygiene', 'baby', 'hrt', 'other')` — lowercase `'hrt'`. Quinn's spec DFS-1 default is UPPERCASE `'HRT'` ("it's an acronym, not a noun; uppercase is the canonical form"). The brief and the spec contradict.

**My take:** shipped LOWERCASE `'hrt'` per the brief. Both are defensible:

- Brief's lowercase: consistent with other enum values; CHECK constraint is case-sensitive so storage is normalized.
- Spec's uppercase: dignifies the acronym; matches how Keo would write it. Requires a display helper to format the other 4 values for the UI but `'HRT'` is already capitalized.

If Sky prefers UPPERCASE, change the literal `'hrt'` to `'HRT'` in the CHECK clause and update the `Category` TypeScript union type in `src/types/database.ts`. Five-second edit; Shamus' UI work is unaffected (the picker label can format either way).

- [ ] Approve lowercase `'hrt'` (default; what's shipped, matches brief)
- [ ] Edit — UPPERCASE `'HRT'` (matches spec DFS-1 default)

### DFS-MIG-6 — `confirm_pickup` parameter name: `p_resource_id` vs `resource_id`

Migration 005 uses `confirm_pickup(p_resource_id UUID)` with the `p_` prefix to avoid potential shadowing with the column name `id` inside the function body. The existing `claim_resource(resource_id UUID)` RPC (schema.sql L397) uses `resource_id` without prefix.

**My take:** shipped `p_resource_id`. The shadowing risk is real (`WHERE id = resource_id` parses fine but is harder to read). Rename to `resource_id` for consistency with `claim_resource` if Sky prefers — easy because no callers exist yet.

Client-side call shape (Shamus' code) is unchanged either way — Supabase JS passes parameters by name in the JSON body: `supabase.rpc('confirm_pickup', { resource_id: '...' })` works against the `resource_id` form; `supabase.rpc('confirm_pickup', { p_resource_id: '...' })` works against the `p_` form. Same UI surface, different keyname.

- [ ] Approve `p_resource_id` (default; what's shipped)
- [ ] Edit — `resource_id` for consistency with `claim_resource`

### DFS-MIG-7 — Jordan FULL review on 005 still pending

005 is privacy-load-bearing per Constitution Art. 7.6: it touches the lifecycle of marginalized users' resource claims. Quinn's spec marks it as **Jordan REVIEW REQUIRED** before merge. The migration file is ready; the apply gate is Jordan's sign-off. Sky should not apply 005 until Jordan has signed off in a fresh `qa-reports/privacy-phase-2-pickup-confirmation-*.md`.

- [ ] Hold 005 until Jordan signs off (default; Constitution Art. 7.6)
- [ ] Apply 005 anyway and queue Jordan review post-apply (NOT recommended)

---

## What this work does NOT touch

- `supabase/schema.sql` — unchanged. New columns + RPCs live in migrations only.
- Migrations 001–003 — unchanged.
- Realtime config (`supabase/realtime.sql`) — unchanged. The existing channel publishes UPDATE events on `public.resources`, which covers status flips through `'completed'` and the new columns. No Replication change needed.
- RLS policies — unchanged on all three. 004 adds a column (Quinn AC-6: existing four resources policies stand). 005 adds columns + RPC (the RPC is SECURITY DEFINER; reads of the new columns flow through the existing `resources_verified_read` policy). 006 adds a column readable via the existing `users_self_read` policy.

---

## Test stubs included

Each migration file has a TEST STUB block listing the scenarios Steve / Gary should add to `supabase/__tests__/rls.sql`:

- 004: T13 — CHECK constraint accept/reject + backfill assertion + EXPLAIN-plan verification.
- 005: T14a–T14g — poster confirms, claimant confirms, idempotent re-confirm, third-party rejected, unauthenticated rejected, wrong-state rejected, missing row.
- 006: T15a–T15d — success, idempotent, unauthenticated rejected, cross-user isolation.

Steve owns the SQL tests; Gary runs them in CI per the existing `supabase/__tests__/rls.sql` pattern.

---

## Spec ambiguities encountered

Four material brief-vs-spec mismatches (all surfaced above as DFS-MIG-\* items):

1. **005 prune logic.** Brief said "no logic change needed"; spec AC-8 asks for completed-row pruning. As-is, completed rows persist indefinitely. See DFS-MIG-1.
2. **006 reset RPC.** Brief asked for only `complete_onboarding`; spec AC-9 needs `reset_onboarding()` for the "See intro again" link. See DFS-MIG-2.
3. **004 index column order.** Brief asked for `(status, category, created_at DESC)`; spec sketch used `(category, status, created_at DESC)`. Shipped brief's order. See DFS-MIG-4.
4. **004 HRT casing.** Brief listed lowercase `'hrt'`; spec DFS-1 default is uppercase `'HRT'`. Shipped brief's lowercase. See DFS-MIG-5.

One self-imposed style call:

5. **005 parameter naming.** `p_resource_id` (prefix) vs `resource_id` (matches `claim_resource`). See DFS-MIG-6.

All are flagged in the migration headers as well (under "DECISIONS / ASSUMPTIONS") so Sky catches them at apply time even if this briefing is skipped.

---

**Dana — 2026-05-24** — file-only deliverable. No external side effects. No code beyond the three migration files + this briefing. Morgan owns the channel to Sky.
