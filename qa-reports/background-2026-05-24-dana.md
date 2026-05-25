---
mode: background
model_tier: opus-4.7
project: mutualmesh
cycle_id: dana-background-2026-05-24
role: Dana (Backend & Database Engineer)
branch: (none — AUDIT-ONLY per Const. 12.5)
base: main
constitution: v1.11 / AGENT_OS v1.11
art_12_compliance: HALT-check passed (no sentinel); AUDIT-ONLY (no commits, no file mutations); no external sends; ≤1 reversible change rule N/A (zero changes); `~/.claude/**`, `~/ClaudeCorp/.claude/**`, governance docs untouched
---

# Dana — MutualMesh background cycle 2026-05-24

## Posture for this cycle

BACKGROUND mode + privacy-sensitive project → **AUDIT-ONLY** (Const. 12.5).
Read + propose only. No `data/` branch created. No files mutated. The
proposed patches in this report are SQL/TS code blocks for Sky to apply
deliberately — never auto-applied.

Cycle preconditions checked:

- `~/.claude/BACKGROUND_HALT` absent (cycle proceeds).
- Recent Dana work scanned: `phase-3-dana-migration-009-2026-05-24.md`
  (push-notifications schema), `phase-2.5-dana-migration-007-2026-05-24.md`
  (prune extension), `phase-2-dana-migrations-2026-05-24.md` (categories +
  pickup confirmation), `phase-1-dana-storage-cascade-2026-05-24.md`
  (mig 003), `phase-1-dana-autosuspend-2026-05-24.md` (mig 002). All
  authored today; this cycle does NOT redo their work — it consolidates a
  downstream consequence none of those reports addressed.

## Headline finding (CRITICAL)

**`src/types/database.ts` is in lockstep ONLY with the original
[`supabase/schema.sql`](supabase/schema.sql) (Cycle 1).** Every one of
migrations 002–009 introduces schema shape that the TypeScript layer has
no knowledge of. Both layers are FILE-ONLY (none applied to a live DB
yet), but Dana's defining rule from the role brief is _"keeping
src/types/database.ts in lockstep with the intended schema using type,
never interface."_ The migration files express the intended schema; the
types are 8 migrations behind.

### Why this matters before apply (not just after)

The intended-schema discipline exists so that when Sky's UI work (Shamus)
or Steve's RLS-test work needs to call `.insert({ category, ... })` or
`.from('push_tokens')`, **typecheck is the canary** (CLAUDE.md Gotcha 1).
With the types stale:

1. Shamus's Phase 2/3 UI code that already references `category`,
   `confirmed_at`, `push_preferences`, `error_reports`, etc. either
   passes typecheck on `Partial<Row>` permissiveness (silent risk) OR
   has been forced to use `as any` casts (loud risk, but the test net
   `npm run typecheck` no longer warns on the column itself).
2. When Sky applies migrations 002–009 in the dashboard and starts
   wiring the matching client code, every new feature ships against
   a stale type — the gotcha CLAUDE.md #1 explicitly warns about
   ("postgrest-js infers `Schema = never`") only fires once you hit
   the bad shape at runtime.

### Drift inventory (table-level)

| Migration | What it adds to the database                                                                                                                                                                                                   | What's missing from `database.ts`                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 002       | `verification_log.decision` enum gains `'demote'`; new auto-suspend cron job (no client-visible signature)                                                                                                                     | `VerificationDecision` type still 3 values (`'approve'\|'reject'\|'escalate'`); should be 4                                                            |
| 003       | No new tables/columns. Replaces `delete_my_account()` + `prune_expired_resources()` bodies; signatures unchanged                                                                                                               | No type change required ✓                                                                                                                              |
| 004       | `resources.category TEXT NOT NULL DEFAULT 'other' CHECK (food\|hygiene\|baby\|HRT\|other)`; index `resources_category_status_idx`                                                                                              | `ResourceRow` missing `category`; no `ResourceCategory` enum; `Insert` shape doesn't allow `category?`                                                 |
| 005       | `resources.status` CHECK extended to include `'completed'`; new columns `confirmed_at TIMESTAMPTZ`, `confirmed_by UUID`; new RPC `confirm_pickup(p_resource_id UUID) RETURNS BOOLEAN`; partial index `resources_confirmed_idx` | `ResourceStatus` still 2 values; `ResourceRow` missing both new columns; `Functions` map missing `confirm_pickup`                                      |
| 006       | `users.onboarding_complete BOOLEAN NOT NULL DEFAULT false`; new RPC `complete_onboarding() RETURNS BOOLEAN`                                                                                                                    | `UserRow` missing `onboarding_complete`; `Functions` map missing `complete_onboarding` (and the deferred `reset_onboarding` flagged in mig 006 header) |
| 007       | No type-visible change (cron-body extension only)                                                                                                                                                                              | No type change required ✓                                                                                                                              |
| 008       | New table `public.error_reports` (hash-only); new RPC `log_error(...)`                                                                                                                                                         | Entire `error_reports` table absent from `Tables`; `log_error` absent from `Functions`                                                                 |
| 009       | New table `public.push_tokens`; new column `users.push_preferences JSONB NOT NULL DEFAULT '{"enabled": false}'`; new RPCs `register_push_token`, `revoke_push_token`, `update_push_preferences`                                | Entire `push_tokens` table absent; `UserRow` missing `push_preferences`; 3 RPCs absent from `Functions` map                                            |

Drift count: **5 tables/columns**, **5 RPC signatures**, **2 enum
extensions** — all undocumented in the canonical TS type.

## Proposed type sync patch — PROPOSAL ONLY, do not apply automatically

The patch below is what `src/types/database.ts` should look like once
Sky has applied (or has decided to apply) migrations 002–009. It uses
`type` everywhere per CLAUDE.md Gotcha 1, preserves the existing
`EmptyRelationships` pattern, and follows the existing convention of
extending `Row` types one column at a time at the bottom of the
`UserRow`/`ResourceRow` blocks. Each addition cross-references the
migration that introduced it so a future Dana can audit drift again at
a glance.

> **How to apply (safely, deliberately):**
>
> 1. Read the proposal end-to-end.
> 2. On a `data/sync-types-mig-002-009-2026-05-XX` branch, replace the
>    indicated sections of `src/types/database.ts` with the blocks
>    below.
> 3. Run `npm run typecheck` — the canary. If it surfaces breakage
>    in Shamus's Phase 2/3 UI code that was relying on the silent
>    `Partial<Row>` flexibility, that's a real correctness signal
>    worth Morgan-routing before merge.
> 4. Optional: defer the changes corresponding to migrations Sky has
>    not yet applied. Recommended pattern: ship the type extensions
>    as **optional fields** (`category?: ResourceCategory`,
>    `push_preferences?: ...`) until the matching migration is live,
>    then tighten to required. Same approach `database.ts` already
>    uses for `FlagRow.updated_at` in AccessMap (lines 25-28).

### Section A — extend enums

```ts
// Mig 002 — verification_log.decision adds 'demote' for the auto-suspend cron.
export type VerificationDecision = 'approve' | 'reject' | 'escalate' | 'demote';

// Mig 005 — resources.status CHECK extended to include 'completed'.
export type ResourceStatus = 'available' | 'reserved' | 'completed';

// Mig 004 — resources.category 5-value CHECK constraint.
// NOTE: 'HRT' is uppercase per migration 004 DECISIONS #1 (reconciled to spec).
export type ResourceCategory = 'food' | 'hygiene' | 'baby' | 'HRT' | 'other';
```

### Section B — extend `UserRow`

```ts
export type UserRow = {
  id: string;
  handle: string;
  postal_prefix: string | null;
  city: string | null;
  is_verified: boolean;
  is_admin: boolean;
  referrer_token_hash: string | null;
  last_active_at: string;
  created_at: string;
  // Mig 006 — onboarding tour completion flag. DEFAULT false at column level.
  onboarding_complete: boolean;
  // Mig 009 — push opt-in state + per-trigger toggles. DEFAULT {"enabled": false}.
  // Default-OFF per Quinn AC-1; flipped via update_push_preferences RPC.
  push_preferences: PushPreferences;
};

// Mig 009 — shape of public.users.push_preferences JSONB column.
// Per spec AC-7, supports per-trigger granularity (toggle individual events
// independently). The exact key set will evolve with spec; keep keys optional
// so older rows / future additions don't break typecheck.
export type PushPreferences = {
  enabled: boolean;
  triggers?: {
    claim?: boolean;
    confirmation?: boolean;
    chat?: boolean; // Phase 3 Sub-3.3 (chat) — gated by feature flag
  };
};
```

### Section C — extend `ResourceRow`

```ts
export type ResourceRow = {
  id: string;
  posted_by: string;
  claimed_by: string | null;
  name: string;
  description: string | null;
  photo_url: string | null;
  pickup_text: string;
  contact_handle: string;
  status: ResourceStatus; // Mig 005 added 'completed'
  postal_prefix: string | null;
  city: string | null;
  created_at: string;
  status_changed_at: string;
  // Mig 004 — fixed enum, NOT NULL DEFAULT 'other'. Backfilled to 'other'
  // on apply; new rows must pick.
  category: ResourceCategory;
  // Mig 005 — set by confirm_pickup() on reserved→completed; NULL otherwise.
  confirmed_at: string | null;
  confirmed_by: string | null;
};
```

### Section D — new table `error_reports`

```ts
// Mig 008 — hash-only anonymous error reporting (PRIVACY.md D8).
// No user_id / session_id / IP / UA. message_hash and stack_hash are
// SHA-256 produced server-side inside the log-error Edge Function;
// raw text never lands here.
export type ErrorReportRow = {
  id: string;
  message_hash: string; // SHA-256 hex of (PII-scrubbed) error message
  stack_hash: string; // SHA-256 hex of (PII-scrubbed) stack trace
  app_version: string;
  platform: 'ios' | 'android' | 'web';
  severity: 'fatal' | 'error' | 'warn';
  occurrences: number; // upsert counter — incremented on duplicate (msg, stack)
  first_seen_at: string;
  last_seen_at: string;
};
```

### Section E — new table `push_tokens`

```ts
// Mig 009 — per-device push tokens. RLS: self-only for SELECT/INSERT/UPDATE/DELETE.
// All client writes go through the RPCs (register_push_token, revoke_push_token);
// the RLS policies are defense-in-depth.
export type PushTokenRow = {
  id: string;
  user_id: string;
  expo_token: string;
  platform: 'ios' | 'android' | 'web';
  created_at: string;
  last_used_at: string;
};
```

### Section F — register new tables + RPCs on `Database`

```ts
export type Database = {
  public: {
    Tables: {
      // ... existing entries (users / invite_tokens / verification_log / cron_log / resources / config) ...

      // Mig 008
      error_reports: {
        Row: ErrorReportRow;
        Insert: Omit<ErrorReportRow, 'id' | 'first_seen_at' | 'last_seen_at' | 'occurrences'> & {
          id?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          occurrences?: number;
        };
        Update: Partial<ErrorReportRow>;
        Relationships: EmptyRelationships;
      };

      // Mig 009
      push_tokens: {
        Row: PushTokenRow;
        Insert: Omit<PushTokenRow, 'id' | 'created_at' | 'last_used_at'> & {
          id?: string;
          created_at?: string;
          last_used_at?: string;
        };
        Update: Partial<PushTokenRow>;
        Relationships: EmptyRelationships;
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // ... existing entries (consume_invite_token / approve_user / reject_user /
      //                       delete_my_account / claim_resource / touch_my_last_active) ...

      // Mig 005
      confirm_pickup: {
        Args: { p_resource_id: string };
        Returns: boolean;
      };
      // Mig 006
      complete_onboarding: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // Mig 008
      log_error: {
        // Exact arg shape lives in the Edge Function; the RPC signature accepts
        // the post-hash fields. Keep aligned with supabase/functions/log-error/
        // once that lands. Sky may want to defer this entry until the Edge
        // Function ships and the RPC contract is final.
        Args: {
          p_message_hash: string;
          p_stack_hash: string;
          p_app_version: string;
          p_platform: 'ios' | 'android' | 'web';
          p_severity: 'fatal' | 'error' | 'warn';
        };
        Returns: boolean;
      };
      // Mig 009
      register_push_token: {
        Args: { p_expo_token: string; p_platform: 'ios' | 'android' | 'web' };
        Returns: boolean;
      };
      revoke_push_token: {
        Args: { p_expo_token: string };
        Returns: boolean;
      };
      update_push_preferences: {
        Args: { p_prefs: PushPreferences };
        Returns: PushPreferences;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
```

### Section G — staging strategy (optional fields until applied)

If Sky wants the types to compile against the **current live database**
(i.e. before any of 002–009 have been applied) while still documenting
the intended shape, mirror the existing AccessMap pattern at
`src/types/database.ts` lines 25-28:

```ts
// Optional until supabase/migrations/006_onboarding_complete.sql is applied.
// After Sky runs migration 006, tighten this to a required field.
onboarding_complete?: boolean;
```

Apply this `?` softening to every field introduced by an unapplied
migration. Once Sky runs the migration, drop the `?` in a follow-up
type-tightening PR. This keeps the typecheck canary informative AND
prevents code that legitimately doesn't reference the new column yet
from breaking.

## Secondary findings (lower severity)

### 2. `protect_admin_flags` trigger — auth.role() check has a subtle ambiguity

[supabase/schema.sql:218-239](supabase/schema.sql:218). The trigger
blocks direct UPDATE of `is_verified` and `is_admin` when
`auth.role() = 'authenticated'`. `service_role` and `anon` are
intentionally not blocked. Two thoughts:

- `anon` is not blocked by this trigger because the RLS layer above
  it already denies the UPDATE (no INSERT/UPDATE policy for anon on
  `public.users`). Belt-and-braces — the trigger could match
  `auth.role() <> 'service_role'` instead for explicit safety. Not a
  bug today; would harden against future RLS policy edits that
  accidentally permit anon access.
- The trigger does NOT block `pg_cron`-invoked SECURITY DEFINER
  functions because they run as service_role. This is correct for
  `auto_suspend_inactive_admins` (mig 002) but worth documenting
  alongside the migration so a future reader doesn't ask "why does
  this even work?". Proposal: add a one-line `COMMENT ON FUNCTION
protect_admin_flags() IS '...'` covering the matrix.

**Proposal (no commit):**

```sql
-- One-line documentation patch for protect_admin_flags(); paste into a
-- followup migration file or append to schema.sql.
COMMENT ON FUNCTION public.protect_admin_flags() IS
  'BEFORE UPDATE guard on public.users. Blocks authenticated-role writes to
   is_verified or is_admin. service_role (Sky via dashboard, pg_cron security
   definer functions) bypasses by virtue of auth.role() <> ''authenticated''.
   anon role is already denied at the RLS layer. See migration 002 for the
   service_role bypass dependency (auto_suspend_inactive_admins).';
```

### 3. `users_verified_read_others` policy efficiency

[supabase/schema.sql:478-487](supabase/schema.sql:478). The policy uses
`EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND
me.is_verified = true)` per row. Postgres should plan this as a single
nestloop with the policy evaluated once per outer-SELECT row, but the
`(select auth.uid())` initPlan optimization (already used in AccessMap
RLS — see `flags update own` policy) is not applied here. Same idea
as AccessMap's
`2026-05-23_rls_initplan_and_non_owner_status_update.sql` migration —
wrap `auth.uid()` in `(select auth.uid())` to let the planner evaluate
once per statement rather than per row.

**Proposal (no commit):**

```sql
-- Apply (select auth.uid()) initPlan optimization to every MutualMesh
-- RLS policy that calls auth.uid() inline. Mirrors AccessMap migration
-- 2026-05-23_rls_initplan_and_non_owner_status_update.sql. Drop & recreate
-- each affected policy. Idempotent (DROP IF EXISTS / CREATE POLICY).
-- Touch list (12 policies across users, resources, verification_log,
-- cron_log, config, storage.objects):
--   users_self_read, users_verified_read_others, users_admin_read_unverified,
--   users_self_update, verification_log_sky_select, resources_verified_read,
--   resources_verified_insert, resources_owner_update, resources_owner_delete,
--   cron_log_sky_select, config_sky_only, photos_verified_read,
--   photos_verified_insert, photos_owner_delete.
-- Performance impact: linear-row-count savings at SELECT scale. Steve's
-- launch-blocker watch would tag this once row count >5,000.
```

Defer to a small dedicated migration `010_rls_initplan_optimization.sql`
when Peter or Steve next has cycle budget. Not urgent at staging row
counts but cheap to ship preemptively.

### 4. `confirm_pickup` (mig 005) — `Args` parameter prefix mismatch

`claim_resource` uses `resource_id`. `confirm_pickup` uses
`p_resource_id`. Both are legal; the spec (mig 005 DECISIONS #5) calls
this out explicitly. Type drift impact: the proposed `Functions` entry
above uses the literal `p_resource_id` to match the RPC signature
postgrest-js will dispatch. Renaming `confirm_pickup` to use
`resource_id` for consistency would be a small follow-up migration
(`CREATE OR REPLACE FUNCTION` with the renamed parameter) and would
not break any caller because there are no callers yet.

**Proposal (no commit):** defer the rename to whoever next touches that
migration; not worth a dedicated cycle. If you decide to rename, update
Section F above to drop the `p_` prefix.

### 5. RPC return type for `update_push_preferences`

Section F above declares `Returns: PushPreferences`. The migration body
should match — confirm in `009_push_notifications.sql` that the RPC
returns the merged JSONB cast back to the same shape. If it returns
`JSONB` raw, postgrest-js will surface it as `unknown` in the client;
the type proposal is the _intent_ the migration should match.

## DECISIONS FOR SKY

1. **Approve the type sync patch.** It's the largest single hygiene
   improvement to MutualMesh's data layer right now. Three apply
   options:
   - (a) Ship the full patch in one PR, all-required fields. Best if
     Sky plans to apply migrations 002–009 imminently.
   - (b) Ship the patch with the staging strategy (Section G) — every
     post-Cycle-1 field optional. Safer if migrations will land
     staggered.
   - (c) Defer until Sky has applied at least 1 migration to a live
     DB, then sync types in batches matching the apply order. Most
     conservative.
2. **Decide on the `confirm_pickup` parameter rename** (`p_resource_id`
   → `resource_id`). Tiny cosmetic followup if yes; nothing to do if no.
3. **Schedule `010_rls_initplan_optimization.sql`** as a Steve+Dana
   pair task next cycle. Not urgent; cheap to ship.

## What I did NOT touch (Const. Art. 12 compliance ledger)

- Wrote nothing to `~/.claude/**` or `~/ClaudeCorp/.claude/**`.
- Created no `data/...` branch (AUDIT-ONLY per 12.5).
- Made no commits.
- Sent no external messages (Morgan, email, Slack, push — none).
- Modified no migration files, schema.sql, realtime.sql, or
  database.ts. Every change above is a proposal in a code block.
- Did not invoke any privileged tool (no Supabase MCP, no execute_sql).

## End of cycle

Morgan to pick this up. No follow-up scheduling — the patches are
ready when Sky / Morgan are.
