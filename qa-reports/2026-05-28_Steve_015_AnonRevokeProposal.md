# Steve — Migration 015 Proposal: Revoke anon EXECUTE on increment_push_rate_limit

**Date:** 2026-05-28
**Author:** Steve (Security)
**Project:** MutualMesh (cslvjfewxiowdxfoqzre)
**File:** `supabase/migrations/015_revoke_anon_push_ratelimit.sql`
**Status:** PROPOSE-ONLY — awaiting Sky apply in Supabase dashboard

---

## Summary

Migration 012 (`push_rate_limit`, applied 2026-05-28) created
`public.increment_push_rate_limit(uuid)` and granted `EXECUTE` to
`authenticated`. Due to Postgres's default PUBLIC role behaviour, the `anon`
role also inherited `EXECUTE`. The Supabase advisor flagged this immediately
after the migration was applied.

Migration 015 issues a single targeted `REVOKE EXECUTE ... FROM anon` to close
the gap. The `authenticated` grant from migration 012 is untouched.

---

## Risk

**Severity:** MEDIUM (Denial-of-Service, no data exfiltration)

An unauthenticated caller holding only the anon key can invoke the RPC
directly:

```
POST /rest/v1/rpc/increment_push_rate_limit
{ "uuid": "<any-known-user-id>" }
```

Because `increment_push_rate_limit` is `SECURITY DEFINER`, the function runs as
its owner regardless of the caller's privileges — no table-level grant is
required. A malicious caller who knows (or enumerates) a user UUID can
artificially exhaust that user's push quota, silencing their notifications
until the rate-limit window expires.

This is a free, unauthenticated, targeted DoS against any known user.

---

## Fix

```sql
REVOKE EXECUTE ON FUNCTION public.increment_push_rate_limit(uuid) FROM anon;
```

One statement. No schema changes, no data changes, no function body changes.
The intended callers (Edge Functions, authenticated RPC) use `authenticated`
and are unaffected.

---

## What is unchanged

- `increment_push_rate_limit` function body: **unchanged**
- `EXECUTE` grant to `authenticated`: **retained**
- All other tables, functions, triggers, policies: **unchanged**
- Migrations 012, 013, 014: **unchanged**

---

## Idempotency

`REVOKE` in Postgres is a no-op when the grantee does not already hold the
privilege — it does not error. Safe to apply twice.

---

## Rollback

Commented out at the bottom of the migration file. Re-grants `EXECUTE` to
`anon`, restoring the over-grant. Re-apply migration 015 to remove it again.

---

## How to apply

1. Open Supabase dashboard → project `cslvjfewxiowdxfoqzre` → SQL Editor.
2. Paste the contents of `supabase/migrations/015_revoke_anon_push_ratelimit.sql`.
3. Run. Expect zero rows affected, no errors.
4. Confirm via: `SELECT grantee, privilege_type FROM information_schema.role_routine_grants WHERE routine_name = 'increment_push_rate_limit';` — `anon` should not appear.

---

## DECISIONS FOR SKY

No decisions required — this is a pure tightening of an inadvertent
over-grant. Constitution Art. 5 prohibits agent apply; Sky applies via the
dashboard. No urgency beyond closing an open advisor finding; the risk window
is small (rate-limit exhaustion, not data breach).
