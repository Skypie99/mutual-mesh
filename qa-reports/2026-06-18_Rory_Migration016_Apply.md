# Rory — Migration 016 Staging Apply
**Date:** 2026-06-18
**Role:** Rory (DevOps)
**Authorization:** Sky grant 2026-06-18 — STAGING only (cslvjfewxiowdxfoqzre)
**Branch:** `data/mm-migration-016-fix-2026-06-18`
**PR:** https://github.com/Skypie99/mutual-mesh/pull/38

---

## 1. What Was Fixed

### Bug: Postgres 42P13 — cannot change name of input parameter

`CREATE OR REPLACE FUNCTION` in Postgres refuses to rename parameters on an existing function. The original migration 016 file used `CREATE OR REPLACE` directly, which would raise:

```
ERROR 42P13: cannot change name of input parameter "p_expo_token"
```

**Fix applied:** Added `DROP FUNCTION IF EXISTS` immediately before each `CREATE OR REPLACE`, using `IF EXISTS` (not `CASCADE`) so the statement is also safe on a fresh database where neither function exists yet.

### Stale header comments: "Migration 015" → "Migration 016"

All in-file references to "Migration 015" and "PATCHED by migration 015" were updated to "016". Affected lines:
- Title comment (line 2)
- NOTE ON GRANTS section (line 42)
- `COMMENT ON FUNCTION public.register_push_token(...)` (line 168)
- `COMMENT ON FUNCTION public.update_push_preferences(...)` (line 229)

### Exact diff summary

```
supabase/migrations/016_rpc_param_rename_drop_p_prefix.sql | 12 ++++++++----
1 file changed, 8 insertions(+), 4 deletions(-)
```

Lines added:
```sql
DROP FUNCTION IF EXISTS public.register_push_token(text, text);   -- before line 62
DROP FUNCTION IF EXISTS public.update_push_preferences(jsonb);    -- before line 187
```

Four comment lines updated from "015" to "016".

---

## 2. Apply Result

**Tool used:** `apply_migration` (Supabase MCP)
**Project:** cslvjfewxiowdxfoqzre (mutualmesh-staging, ca-central-1)
**Migration name:** `migration_016_rpc_param_rename`
**Result:** `{"success":true}`

No errors. No dependency conflicts on DROP (both functions existed with the p_-prefixed signatures from migrations 009/011).

---

## 3. Verification

**Query run:**
```sql
SELECT p.proname AS fn, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('register_push_token','update_push_preferences')
ORDER BY 1;
```

**Result:**

| fn | args (BEFORE) | args (AFTER) |
|----|--------------|-------------|
| `register_push_token` | `p_expo_token text, p_platform text` | `token text, platform text` |
| `update_push_preferences` | `p_prefs jsonb` | `prefs jsonb` |

PASS — both functions now use bare parameter names with no `p_` prefix. PostgREST will now correctly route:
- `supabase.rpc('register_push_token', { token, platform })` ✓
- `supabase.rpc('update_push_preferences', { prefs: merged })` ✓

---

## 4. Branch & PR

- **Branch:** `data/mm-migration-016-fix-2026-06-18` (pushed to origin)
- **PR #38:** https://github.com/Skypie99/mutual-mesh/pull/38
- **Commit:** `cb4e510` — `fix(migration-016): DROP before param-rename (Postgres 42P13) + correct 015->016 header`
- **Status:** Open, NOT merged. Sky merges per Constitution Art. 1.

---

## 5. Rollback Instructions

No data is touched — both functions are pure redefinitions. To roll back:

1. Re-run the SQL from **migration 011** (`register_push_token` body with `p_expo_token TEXT, p_platform TEXT` signatures + all six Steve guards).
2. Re-run the SQL from **migration 009** (`update_push_preferences` with `p_prefs JSONB` signature).

Both are pure `CREATE OR REPLACE` redefinitions. No table data, no column types, no indexes touched.

---

## 6. Scope Constraints Observed

- STAGING only: production project untouched.
- No merge to main: PR #38 is open, awaiting Sky.
- No secrets committed or logged.
- Working tree switched back to `main` after this report is committed.
- Concurrent read-only review of repo was possible without interference (branch was clean, no main disturbance).

---

## DECISIONS FOR SKY

None — this was a scoped, pre-authorized apply. No anomalies encountered.

Sky's next action: review PR #38, then merge to main when ready to include 016 in the migration chain.
