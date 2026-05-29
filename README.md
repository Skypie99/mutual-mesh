# Mutual Mesh

A privacy-first community-run mutual-aid network for marginalized groups to share food, baby formula, and critical resources — without corporate or state surveillance.

**Status:** **Phases 1–4 complete; Cycle 7 audits underway (2026-05-28).** 172+ tests, real Supabase wiring, full resource marketplace, photo uploads with EXIF stripping, resource map (OSM + FSA aggregation), push notification infrastructure, error reporting, and Policy/ToS screens. Cycle 6 branches gate-approved, pending migrations 012–014 apply by Sky. See `qa-reports/phase-2-closeout-2026-05-24.md`, `qa-reports/phase-3-4-security-sweep-2026-05-24.md`, and `qa-reports/2026-05-28_Morgan_MigrationGate.md` for the full audit trail.

## Stack

**Expo SDK 54** · **React Native 0.81** · **React 19.1** · **TypeScript strict** · **Supabase** (auth + Postgres + RLS + Storage) · **NativeWind** (design tokens) · **Jest + jest-expo** · **ESLint + Prettier** · **GitHub Actions CI**

Path alias: `@/*` → `src/*`

## Features

Everything below is shipped and in the codebase. Nothing here is "coming soon."

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

This is infrastructure, not a fully deployed feature. The Edge Function for delivery (`deliver_notification`) and the server-side preference gate (migration 011) are queued for deployment — Sky applies them via the Supabase dashboard.

### Error reporting

Opt-in crash and error reporting, default OFF. Before any error is sent, a PII heuristic strips email addresses, postal codes, handles, JWT-shaped strings, and Expo push token formats from the payload. Only then is the (truncated) error sent to a self-hosted Edge Function — no Sentry, no Bugsnag, no third-party analytics (per the community's privacy posture).

### Privacy Policy and Terms of Service screens

Plain-text policy screens built from typed constants in `src/lib/policyText.ts`. No WebView, no external URL, no risk of content injection.

### Accessibility baseline

Every component bakes in WCAG 2.5.5 (44pt minimum touch targets), `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, and `accessibilityState`. The map has a full-text screen-reader alternative. Animations skip entirely (not slow down — skip) when the OS reduced-motion flag is on.

## What's here

| File / Directory                               | What it is                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `PRD.md`                                       | Sky's original product spec (some fields superseded by privacy redesign)              |
| `CLAUDE.md`                                    | Team context, gotchas, decisions log, file map, Role → Outputs map                    |
| `PRIVACY.md`                                   | **🟢 APPROVED.** Jordan data model + Steve audit. Source of truth for data decisions. |
| `FEATURES.md`                                  | Backlog ordered by value/cost                                                         |
| `DESIGN.md`                                    | Visual system v1 with WCAG-verified contrast ratios                                   |
| `LEARNINGS.md`                                 | Durable patterns and gotchas — appended each phase                                    |
| `CONTRIBUTING.md` + `SECURITY.md`              | Contributor entry point + vulnerability disclosure policy                             |
| `community/` + `research/` + `designs/`        | Casey / Riley / Dani role homes                                                       |
| `qa-reports/`                                  | Audit reports, cycle briefings, privacy reviews for every phase                       |
| `supabase/schema.sql` + `supabase/migrations/` | Full schema + 14 migration files (001–014). FILES ONLY — Sky applies via dashboard.   |
| `supabase/functions/exif-strip/`               | Edge Function for server-side EXIF strip. Deploy via `supabase functions deploy`.     |
| `src/lib/`                                     | All pure helpers + Supabase client + auth + push + error reporting + i18n             |
| `src/components/`                              | 13 reusable UI primitives, all WCAG 2.5.5 + label compliant                           |
| `src/screens/`                                 | 13 screens wired to real Supabase data                                                |
| `src/navigation/`                              | Bottom tabs + Home stack + Profile stack + deep-link auth gate                        |

## Running it locally

```bash
npm install --legacy-peer-deps   # required because of the React 19.1 pin
npm run typecheck                 # tsc --noEmit
npm test                          # 172+ tests across 13+ suites
npm run lint                      # eslint clean
npm run format                    # prettier auto-format
npm start                         # boots Expo dev server
```

The app requires a Supabase project with the schema applied to show real data. Without it, the auth gate will fail to connect. See **Setup** below.

## Setup

You need a Supabase project before the app does anything useful.

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the SQL editor, then apply migrations `001` through `011` in order. Migrations `012`–`014` are pending Sky apply (see "What Sky still needs to apply" below).
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

## What Sky still needs to apply

A few pieces are files in the repo but not yet live on any Supabase project. Sky applies these via the dashboard:

- Migration `012` (`push_rate_limit`) — `supabase/migrations/012_push_rate_limit.sql`
- Migration `013` (`verification_log_fix`) — `supabase/migrations/013_verification_log_fix.sql`
- Migration `014` (`get_resource_detail` RPC privacy gate) — `supabase/migrations/014_get_resource_detail_rpc.sql`
- EXIF strip Edge Function — `supabase functions deploy exif-strip` + wire the Storage webhook (steps in `supabase/functions/exif-strip/README.md`).
- `deliver_notification` Edge Function — in `rory/deliver-notification-edge-fn-2026-05-25` branch.

Apply order matters: 012 → 013 → 014. Steve's Cycle 7 audit confirms all three are security-sound and production-ready.

See `CLAUDE.md` for stack details and full gotchas list.

## Web demo

The app ships a web build powered by [Expo web](https://docs.expo.dev/workflow/web/) + [react-leaflet](https://react-leaflet.js.org/) (for the resource map).

**Live URL:** `https://mutual-mesh.vercel.app`

**Access:** auth-gated — a valid Mutual Mesh account (invite token + Sky verification) is required. There is no guest mode. Jordan's web-gate advisory (2026-05-25) prohibits unauthenticated marketplace browsing.

**Map:** the web map uses `react-leaflet` + OpenStreetMap tiles via `src/components/PlatformMapView.web.tsx`. Metro's platform-specific file resolution serves this file instead of `PlatformMapView.tsx` (which imports `react-native-maps`) on web builds. Both files export the same `PlatformMapView` component and props type.

**Running the web build locally:**

```bash
npm run web   # starts the Expo web dev server
```

The Vercel deployment uses `--legacy-peer-deps` in `installCommand` (see `vercel.json`) because react-leaflet has a peer dependency conflict with the React 19.1 pin.
