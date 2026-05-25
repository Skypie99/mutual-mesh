-- Migration 014 — get_resource_detail RPC
-- Applied: <pending Sky apply>
-- Author: Jordan (privacy), 2026-05-25
-- References:
--   Phase 4 report: qa-reports/morgan-2026-05-25.md
--   Privacy review: contact_handle is per-resource sensitive data (S3).
--                   Must be withheld from non-participants to prevent
--                   contact scraping from the resource listing.
--   AC-6.x blocked on this RPC being live (PR #20 held at STOP 1).
--
-- ============================================================================
-- ROLLBACK (run to undo)
-- ============================================================================
--   DROP FUNCTION IF EXISTS get_resource_detail(uuid);
-- ============================================================================
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
--
-- Creates SECURITY DEFINER RPC get_resource_detail(p_resource_id uuid) that
-- returns the full resource row, with contact_handle visibility gated on
-- caller participation:
--
--   contact_handle is NON-NULL only when:
--     auth.uid() = posted_by   (the poster)
--     OR auth.uid() = claimed_by  (the current claimant)
--
--   For all other callers (browsing authenticated users), contact_handle
--   is returned as NULL — the resource is still visible but the private
--   contact detail is withheld.
--
-- Why SECURITY DEFINER:
--   The resources table's SELECT RLS policy allows any authenticated user
--   to read all columns, including contact_handle. This RPC replaces a
--   direct table SELECT in the client for the detail view, enforcing the
--   privacy gate that the table-level policy intentionally defers to the
--   application layer (S3).
--
-- Return type:
--   A single row matching the resources table shape, with contact_handle
--   replaced by the privacy-gated value.
--
-- Unauthenticated callers:
--   GRANT EXECUTE is to `authenticated` only. Anon callers receive a
--   permissions error from Supabase before the function even runs.
--
-- NULL resource:
--   If p_resource_id does not match any row, the function returns zero rows
--   (SETOF return with no matching record). Client should treat empty result
--   as 404.
--
-- WHAT IT DOES NOT TOUCH
-- ======================
-- - resources table columns or RLS policies: unchanged.
-- - claimed_by, posted_by, status: unchanged.
-- - Any existing RPC with a different signature: the DROP targets uuid only.
-- ============================================================================

-- Drop previous version if it exists (idempotent).
DROP FUNCTION IF EXISTS get_resource_detail(uuid);

CREATE OR REPLACE FUNCTION get_resource_detail(p_resource_id uuid)
RETURNS TABLE (
  id               UUID,
  posted_by        UUID,
  claimed_by       UUID,
  name             TEXT,
  description      TEXT,
  photo_url        TEXT,
  pickup_text      TEXT,
  contact_handle   TEXT,
  status           TEXT,
  postal_prefix    TEXT,
  city             TEXT,
  created_at       TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.posted_by,
    r.claimed_by,
    r.name,
    r.description,
    r.photo_url,
    r.pickup_text,
    -- Reveal contact_handle only to the poster or the active claimant.
    CASE
      WHEN auth.uid() = r.posted_by   THEN r.contact_handle
      WHEN auth.uid() = r.claimed_by  THEN r.contact_handle
      ELSE NULL
    END AS contact_handle,
    r.status,
    r.postal_prefix,
    r.city,
    r.created_at,
    r.status_changed_at
  FROM public.resources r
  WHERE r.id = p_resource_id;
END;
$$;

COMMENT ON FUNCTION get_resource_detail(uuid) IS
  'Privacy-gated resource detail view. Returns the full resource row but masks '
  'contact_handle to NULL for callers who are neither the poster nor the claimant. '
  'SECURITY DEFINER; execute granted to authenticated only (S3).';

GRANT EXECUTE ON FUNCTION get_resource_detail(uuid) TO authenticated;
