# Mutual Mesh

A privacy-first community-run mutual-aid network for marginalized groups to share food, baby formula, and critical resources — without corporate or state surveillance.

## Project status

**Paused prototype — not a running service.** Built May–June 2026; development is paused.

| Question               | Answer (verified 2026-09-25)                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented in source  | Everything under **Features** below, on `main`.                                                                                                                                                                              |
| Deployed today         | The web build at [mutualmesh.skypistudio.com](https://mutualmesh.skypistudio.com). The old `mutual-mesh.vercel.app` address redirects there.                                                                                 |
| Works today            | The read-only guest demo at [`?demo=1`](https://mutualmesh.skypistudio.com/?demo=1): synthetic sample data only, with zero calls to any backend.                                                                             |
| Intentionally inactive | Accounts, the real marketplace, push delivery and error intake. The hosted Supabase project used during development was a staging project with no real users, and it was retired in August 2026, so sign-in cannot complete. |
| Pending / unapplied    | Database migrations and Edge Functions live here as files. None of them are running anywhere today.                                                                                                                          |

## Features

Everything below is implemented in the source on `main`. Implemented is not the same as running today: see **Project status** above.

### Auth gate

Sign in with email + OTP, then a three-step verification flow: enter your invite code → pick a privacy-safe handle (random `adjective-noun-4digit`, with a re-roll button) → wait for admin approval. Until you're approved, the Waiting Room screen holds you. Once approved, the gate automatically routes you to the marketplace. The handle picker soft-warns if your input looks like a real name — that's by design.

### Invite-only onboarding tour

New users see a three-card tour explaining what the app does and doesn't collect, before they dive in. The tour respects reduced-motion settings (no animation when the OS flag is on). You can re-watch it anytime from your Profile.

### Resource marketplace

Browse available resources by category (food, hygiene, baby, HRT, other). Filter chips live at the top of the feed. Your last-used filter is remembered between sessions.

When you see something you need, tap to claim it. Claiming is atomic — two people can't claim the same item at the same time (handled by a server-side transaction, not a client race). After pickup, either the poster or the claimant can mark it complete.

### Add a resource

Fill in title, description, category, your postal prefix, and an optional photo. Photos are stripped of EXIF data on the device before upload, then stripped again server-side by an Edge Function — so no GPS coordinates, device model, or timestamp metadata leaves the app. The Edge Function uses `imagemagick_deno` for a full re-encode (not just a metadata scrub).

### Resource map

A neighborhood-level map showing where available resources are, using OpenStreetMap tiles. The map groups resources by Canadian FSA (the first three characters of a postal code — neighborhood-sized, not building-level). You see color-coded polygons: a few resources, several, or many. You never see an exact count or a pin at a specific address.

Screen readers get an equivalent text list below the map — every FSA that appears on the map also appears in the list with an accessible label.

### Resource categories

Five values: `food`, `hygiene`, `baby`, `HRT`, `other`. The `HRT` category is discrete and intentional — it reflects the Keo persona's real need. It is not a subcategory of anything else.

### Pickup confirmation

After a resource is claimed, either party can mark it collected. The status moves from `reserved` to `completed`. Completed resources are pruned from the database after 30 days (by a nightly cron job).

### Admin verification screen

Admins see a queue of accounts waiting for approval. Approvals and rejections go through server-side RPCs with an append-only audit log — no direct column writes, no way to delete the history.

### Push notifications (infrastructure)

The wiring is in place: opt-in per trigger (marketplace activity, admin approval result), default OFF for every user. Notifications are title-only on the lock screen — the body is always empty, so the resource name never appears where someone else could read it. The push token is not stored in AsyncStorage; it is re-read fresh each session.

This was infrastructure, not a fully deployed feature. The delivery Edge Function (`supabase/functions/deliver_notification/`) and the server-side preference gate (migration `011`) are in the repo; with the backend retired, neither is running.

### Error reporting

Opt-in crash and error reporting, default OFF. Before any error is sent, a PII heuristic strips email addresses, postal codes, handles, JWT-shaped strings, and Expo push token formats from the payload. Only then is the (truncated) error sent to a self-hosted Edge Function — no Sentry, no Bugsnag, no third-party analytics (per the community's privacy posture).

### Privacy Policy and Terms of Service screens

Plain-text policy screens built from typed constants in `src/lib/policyText.ts`. No WebView, no external URL, no risk of content injection.

### Accessibility baseline

Every component bakes in WCAG 2.5.5 (44pt minimum touch targets), `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, and `accessibilityState`. The map has a full-text screen-reader alternative. Animations skip entirely (not slow down — skip) when the OS reduced-motion flag is on.

## What's here

| File / Directory                               | What it is                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PRD.md`                                       | Sky's original product spec (some fields superseded by privacy redesign)                                                                   |
| `CLAUDE.md`                                    | Team context, gotchas, decisions log, file map, Role → Outputs map                                                                         |
| `PRIVACY.md`                                   | **🟢 APPROVED.** Jordan data model + Steve audit. Source of truth for data decisions.                                                      |
| `FEATURES.md`                                  | Backlog ordered by value/cost                                                                                                              |
| `DESIGN.md`                                    | Visual system v1 with WCAG-verified contrast ratios                                                                                        |
| `LEARNINGS.md`                                 | Durable patterns and gotchas — appended each phase                                                                                         |
| `CONTRIBUTING.md` + `SECURITY.md`              | Contributor entry point + vulnerability disclosure policy                                                                                  |
| `community/` + `research/`                     | Casey / Riley role homes                                                                                                                   |
| `qa-reports/`                                  | Audit reports, cycle briefings, privacy reviews for every phase                                                                            |
| `supabase/schema.sql` + `supabase/migrations/` | Full schema + 15 migration files (`002`–`016`). FILES ONLY — never applied automatically.                                                  |
| `supabase/functions/`                          | Edge Functions: `exif-strip` (server-side EXIF re-encode), `log-error` (PII-scrubbed error intake), `deliver_notification` (push delivery) |
| `.github/workflows/` + `.gitleaks.toml`        | CI on every PR to `main`: typecheck, lint + format check, Jest, email-import guard, migration-sequence guard; plus a gitleaks secrets scan |
| `src/lib/`                                     | All pure helpers + Supabase client + auth + push + error reporting + i18n                                                                  |
| `src/lib/demo/`                                | The guest demo: synthetic fixtures and the zero-network demo context                                                                       |
| `src/components/`                              | Reusable UI primitives, all WCAG 2.5.5 + label compliant                                                                                   |
| `src/screens/`                                 | 13 screens wired to Supabase data                                                                                                          |
| `src/navigation/`                              | Bottom tabs + Home stack + Profile stack + deep-link auth gate                                                                             |

## Running it locally

```bash
npm install --legacy-peer-deps   # required because of the React 19.1 pin
npm run typecheck                 # tsc --noEmit
npm test                          # Jest (26 test files)
npm run lint                      # eslint
npm run format                    # prettier auto-format
npm start                         # boots Expo dev server
```

The app requires a Supabase project with the schema applied to show real data. Without it, the auth gate will fail to connect. See **Setup** below.

## Setup

You need a Supabase project before the app does anything useful.

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the SQL editor, then apply the files in `supabase/migrations/` in numeric order (`002`–`016`).
3. Set `config.sky_uuid` to your Supabase user UUID, then run
   `UPDATE public.users SET is_admin = true WHERE id = '<your-uuid>'` via the service role.
4. Generate a first invite token:
   `INSERT INTO public.invite_tokens (token_hash, created_by) VALUES (crypt('<your-token>', gen_salt('bf', 10)), '<your-uuid>')`.
5. Copy your project URL and anon key into `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Numbered apply steps with exact SQL for each migration live in `qa-reports/cycle-1-auth-gate-2026-05-23.md`.

## Backend state

Nothing in this repository is applied to a live backend today. The hosted Supabase project used during development was retired in August 2026. The migrations and Edge Functions stay here as reference files, and a self-hoster applies them by following **Setup** above.

See `CLAUDE.md` for stack details and full gotchas list.

## Web demo

The app ships a web build powered by [Expo web](https://docs.expo.dev/workflow/web/) + [react-leaflet](https://react-leaflet.js.org/) (for the resource map).

**Live URL:** [mutualmesh.skypistudio.com](https://mutualmesh.skypistudio.com) (the older `https://mutual-mesh.vercel.app` redirects there)

**Access:** the real marketplace is auth-gated. A valid Mutual Mesh account (invite token + Sky verification) is required, and Jordan's web-gate advisory (2026-05-25) bars any unauthenticated access to real user data. With the backend retired, sign-in cannot complete, so the live site is effectively demo-only. `?demo=1` opens a read-only **guest demo** that renders only synthetic sample data with zero network calls (Jordan gate 2026-06-05), so a visitor can explore the UI without an account and without ever touching real listings. The demo's "Sign up" button leads into that inactive sign-in flow.

**Map:** the web map uses `react-leaflet` + OpenStreetMap tiles via `src/components/PlatformMapView.web.tsx`. Metro's platform-specific file resolution serves this file instead of `PlatformMapView.tsx` (which imports `react-native-maps`) on web builds. Both files export the same `PlatformMapView` component and props type.

**Running the web build locally:**

```bash
npm run web   # starts the Expo web dev server
```

The Vercel deployment uses `--legacy-peer-deps` in `installCommand` (see `vercel.json`) because react-leaflet has a peer dependency conflict with the React 19.1 pin.

## Project records

This README is the current source of truth for the project's status. `CLAUDE.md`, `PRD.md`, `FEATURES.md`, `LEARNINGS.md`, `DECISIONS_LOG.md`, `GOVERNANCE.md` and `qa-reports/` are dated working records from the May–June 2026 build. Where one of them disagrees with this README, the README wins. The build used AI-assisted roles under [Claude Corp](https://github.com/Skypie99/Claude_Corp) governance. Product intent, privacy and accessibility boundaries, and release decisions stayed with the owner. The phase audit trail starts at `qa-reports/phase-2-closeout-2026-05-24.md` and `qa-reports/phase-3-4-security-sweep-2026-05-24.md`.
