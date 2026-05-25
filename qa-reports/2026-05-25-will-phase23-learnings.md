# Will — Phase 2/3 Learnings Documentation

**Date:** 2026-05-25
**Branch:** `docs/auto-2026-05-25-will-phase23-learnings`
**Author:** Will (Technical Writer)
**Role lane:** `README.md`, `LEARNINGS.md` only

---

## What was already on the branch

The branch existed on origin but had zero file changes vs `main` — `LEARNINGS.md` and `README.md` were identical to the main-branch versions. The Phase 0a/0b entries were present (those shipped to main in earlier cycles). No Phase 2 or Phase 3 entries existed.

---

## Additions to LEARNINGS.md

Seven new dated entries appended (append-only per the file's stated convention):

| Entry                                        | Date          | Topic                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CategoryChip + filter pattern                | 2026-05-24    | Pure-helper split: `src/lib/categories.ts` + UI component. `toggleCategoryInFilter` stable-ordering guarantee, HRT privacy note (no special-case branching per Jordan DFS-3).                                                                                   |
| ConfirmationModal shared primitive           | 2026-05-24    | One component serves both claim confirmation (non-destructive) and delete-account (destructive) via `destructive` prop. A11y baked in: `accessibilityViewIsModal`, `accessibilityRole="alert"`, back-gesture dismiss, `busy` prop for double-submit prevention. |
| `complete_onboarding` RPC pattern            | 2026-05-24    | Security-definer, idempotent, realtime-updated profile — no explicit refetch. Contrast with `claim_resource` (FOR UPDATE not needed here; no concurrent writer race on own row).                                                                                |
| Push notification 3-layer consent gate       | 2026-05-24    | Layer 1 (client `hasAnyTriggerEnabled`) → Layer 2 (RPC `is_verified` + `push_preferences` gates, Migration 011) → Layer 3 (Edge Function pre-send re-check). Token storage plaintext rationale. DEFAULT OFF posture.                                            |
| FSA-aggregated map                           | 2026-05-24/25 | `clampRegionZoom` enforces MIN_DELTA (0.02, ~zoom 13). FSA-count aggregation is client-side, no new RPC. Color buckets hide exact counts.                                                                                                                       |
| Web compat layer — Metro platform resolution | 2026-05-24/25 | `PlatformMapView.tsx` (react-native-maps) vs `PlatformMapView.web.tsx` (react-leaflet). Zero shared code. Type import is safe. `--legacy-peer-deps` rationale. Rule: prefer file resolution over `Platform.OS` guards.                                          |
| Jordan web gate — anon key safety            | 2026-05-25    | RLS denies `anon` on every table. `resource-photos` bucket is PRIVATE (contrast with AccessMap's public flag-photo bucket). Web demo is auth-gated with no guest mode.                                                                                          |

---

## Changes to README.md

- **Status line updated:** from "Phase 0a complete (2026-05-23)" to "Phase 3 complete (2026-05-25)" with a brief summary of what shipped.
- **"Web demo" section added** at the end of the file. Covers: live Vercel URL (`https://mutual-mesh.vercel.app`), auth-gated / no guest mode (Jordan advisory), `react-leaflet` + Expo web tech, local `npm run web` command, and `--legacy-peer-deps` note for Vercel.

---

## Format check

`npx prettier --write LEARNINGS.md README.md` — both files reported `(unchanged)`, confirming they passed format:check without modification.

---

## Push status

Branch pushed to origin. No conflicts; branch was ahead of origin by the commits in this session.

---

## DECISIONS FOR SKY

None. All changes are documentation only. No schema, no code, no external side effects.
