-- ============================================================================
-- Mutual Mesh — Realtime publication setup (Cycle 1)
-- Status: FILE ONLY. Apply via Supabase dashboard SQL editor after schema.sql.
-- Author: Dana, 2026-05-23
--
-- STRIDE I3 mitigation: Supabase Realtime respects RLS, so clients only
-- receive deltas of rows they're allowed to SELECT. We ALSO instruct the
-- client to filter the subscription by id=eq.{auth.uid()} for the user's
-- own row — defense in depth.
-- ============================================================================

BEGIN;

-- Drop and re-create to ensure idempotency
DROP PUBLICATION IF EXISTS supabase_realtime;

-- Include both tables that drive UI state:
--   - public.users: for is_verified flip (auth gate transition)
--   - public.resources: for Cycle 2 marketplace feed live updates
CREATE PUBLICATION supabase_realtime FOR TABLE public.users, public.resources;

COMMIT;

-- ============================================================================
-- Client-side subscription pattern (enforced in src/lib/auth.tsx)
-- ============================================================================
--
-- supabase
--   .channel(`user-row-${authUid}`)
--   .on('postgres_changes', {
--     event: 'UPDATE',
--     schema: 'public',
--     table: 'users',
--     filter: `id=eq.${authUid}`,
--   }, (payload) => {
--     // Handle is_verified true → auto-route to RootNavigator
--     if (payload.new.is_verified === true) reloadProfile();
--   })
--   .subscribe();
--
-- The filter is REQUIRED to mitigate STRIDE I3 defense-in-depth.
-- RLS will prevent cross-user leakage even without the filter, but the
-- filter avoids sending the client useless payload (and reduces realtime
-- bandwidth).
-- ============================================================================
