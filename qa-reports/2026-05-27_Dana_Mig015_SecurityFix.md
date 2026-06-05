# Migration 015 Security Fix — Dana Report
**Date:** 2026-05-27
**Author:** Dana (backend/database)
**Status:** FILE EDIT COMPLETE. Sky applies via Supabase dashboard. Never applied by any agent.
**Constitution:** Art. 5 (schema changes are files, never live applies)

---

## Problem

Migration 015 (`supabase/migrations/015_rpc_param_rename_drop_p_prefix.sql`) was written to fix the RPC parameter drift (renaming `p_expo_token -> token`, `p_platform -> platform`). However, its `register_push_token` function body was copied from migration 010's version, which **predates** migration 011's security guards. Applying 015 after 011 would silently overwrite 011's security gates via `CREATE OR REPLACE FUNCTION`.

## What was missing

Migration 011 added the following to `register_push_token`, all of which were absent from 015:

| Guard | Finding | Description |
|-------|---------|-------------|
| Guard 4 [F4b] | Steve sweep F4 | Token length check: `length(token) > 4096` raises 'Token too long' |
| Guard 5 [F1a] | Steve sweep F1 | `is_verified = true` check on caller's user row |
| Guard 6 [F1b] | Steve sweep F1 | `push_preferences.enabled = true` gate |
| FOR SHARE lock | Race protection | Locks user row between read and UPSERT to prevent concurrent admin demotion |
| NOT FOUND check | Defensive | Raises 'User record not found' if user row missing |

Additionally, migration 015 used a simpler token-empty check (`length(token) = 0`) vs migration 011's trimmed version (`length(trim(token)) = 0`), and used the error message 'Token required' instead of 011's 'Expo token is required'.

## What was changed

Replaced the entire `register_push_token` function body in migration 015 with migration 011's security-gated version, substituting bare parameter names (`token`, `platform`) for the `p_`-prefixed names (`p_expo_token`, `p_platform`). Specifically:

1. Added `caller_row RECORD` declaration for the user row read
2. Added Guard 4 [F4b]: token length check (> 4096 chars)
3. Added `SELECT is_verified, push_preferences INTO caller_row ... FOR SHARE` with NOT FOUND handling
4. Added Guard 5 [F1a]: `is_verified` check
5. Added Guard 6 [F1b]: `push_preferences.enabled` check
6. Updated token-empty check to use `length(trim(token))` and error message to 'Expo token is required'
7. Updated COMMENT to reflect all six guards
8. Updated ROLLBACK note to reference migration 011 (not 010)

The `update_push_preferences` function was NOT affected by this issue (migration 011 did not modify it).

## Files modified

| File | Change |
|------|--------|
| `supabase/migrations/015_rpc_param_rename_drop_p_prefix.sql` | Replaced `register_push_token` body with migration 011's security-gated version using bare param names |

## Verification

The corrected function body was compared line-by-line against migration 011 (lines 135-241). All six guards, the FOR SHARE lock, the NOT FOUND check, and the UPSERT body are present. Parameter names use bare form (`token`, `platform`) throughout.

## DECISIONS FOR SKY

No new decisions needed. The safe apply order remains: 009 -> 010 -> 011 -> 015 (in sequence). Migration 015 now preserves all security gates from 011.
