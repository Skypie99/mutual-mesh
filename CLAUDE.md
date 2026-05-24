# Mutual Mesh — project context

A privacy-first community-run mutual-aid network for marginalized groups to share food, baby formula, and critical resources **without corporate or state surveillance**. Same beginner-friendly build style as AccessMap — small diffs, plain explanations, no over-engineering.

**Live local path:** `~/MutualMesh`
**Owner:** skylerhalisky@gmail.com
**Status (2026-05-23):** **Cycle 1 complete (Loops 11–20).** PRIVACY.md 🟢 APPROVED. Build chain green: typecheck + **91 jest tests** in 8 suites + lint + format:check. Cycle 1 wired the real Supabase layer: `supabase/schema.sql` (8 tables + 7 RPCs + 4 triggers + RLS coverage tested in `supabase/__tests__/rls.sql`) + `realtime.sql`; `src/types/database.ts` (using `type`, never `interface`); `src/lib/supabase.ts` (env-var safe init); `src/lib/auth.tsx` (AuthProvider with realtime `is_verified` subscription); `src/lib/handleGenerator.ts` (~150 adj + ~150 noun wordlist, generates `<adj>-<noun>-<4digit>`); `src/lib/handleValidator.ts` (no-real-names soft warn per DFS-C1.1). `App.tsx` Gate uses pure `decideGateRoute` (5 states: splash / sign-in / complete-profile / wait / home). Three-step signup with OTP. **Schema is a FILE — not yet applied to any live Supabase project.** Sky applies via dashboard (numbered steps in `qa-reports/cycle-1-auth-gate-2026-05-23.md`). After Sky applies + sets `config.sky_uuid` + promotes self to `is_admin`, Cycle 2 (Marketplace Feed real data) starts.

---

## Authority order (non-negotiable)

**Sky's intent → `~/.claude/CONSTITUTION.md` (v1.3) → role files (`commands/*.md`) → role skills → this file.**

The three pillars — **safety, privacy, accessibility** — override speed, scope, and everything else. For Mutual Mesh, **privacy is the load-bearing pillar.** This app handles marginalized-group + location data, which Constitution Art. 7.6 makes mandatory for Jordan review and Sky approval before any privacy-sensitive feature merges.

**Morgan is the SOLE external channel** (Constitution v1.3 Art. 9). All other roles surface findings to qa-reports / proposal files; Morgan picks them up. No role emails, Slacks, or notifies Sky except Morgan on direct `/morgan` invocation.

---

## Decisions log (locked at Day 0, 2026-05-23)

| Decision                     | Choice                                                                                                                                                                   | Reason                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Stack                        | **Expo SDK + React Native + Supabase + NativeWind + Jest**                                                                                                               | Matches AccessMap; team trained; full audit control needed because privacy-load-bearing       |
| Project name                 | **Mutual Mesh** (codename "Anchor" in early PRD)                                                                                                                         | Sky's choice, 2026-05-23                                                                      |
| Repo path                    | `~/MutualMesh`                                                                                                                                                           | Standard layout                                                                               |
| Privacy model                | **Jordan-led redesign before any code**                                                                                                                                  | Constitution Art. 7.6; PRD as-written collected too much PII for surveillance-averse audience |
| MVP scope                    | **No in-app chat — claim reveals contact handle**                                                                                                                        | Ships faster; keeps app out of "messaging" regulatory category; chat is v2                    |
| Day-1 level-ups vs AccessMap | NativeWind, ESLint, Prettier, GitHub Actions CI, jest worktree ignore, pure-helper realtime, mounted-ref pattern, pagination cap, EXIF strip on photos, atomic Claim RPC | Each is a lesson AccessMap learned mid-build                                                  |

---

## Role → Outputs map (where each Claude Corp staff writes)

Every role works in its own isolated worktree on a branch prefix and writes to a specific folder. **Roles do not write outside their lane.** If a piece of work would touch another role's lane, escalate to Morgan instead of crossing the line.

| Role                          | Slash           | Branch prefix                                 | Writes to                                                                                                             | Reads (read-only)                                 |
| ----------------------------- | --------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Quinn** — Product           | `/quinn`        | `product/auto-DATE-quinn`                     | `FEATURES.md`, `qa-reports/spec-*.md`                                                                                 | `research/`, `PRIVACY.md`, `LEARNINGS.md`         |
| **Riley** — User Research     | `/riley`        | `research/auto-DATE-riley`                    | `research/` (personas, journeys, friction, summary)                                                                   | All product docs                                  |
| **Dani** — Design             | `/dani`         | `design/auto-DATE-dani`                       | `DESIGN.md`, `designs/` (mockups, Figma exports), `src/lib/theme.ts` proposals via `qa-reports/design-*.md`           | `FEATURES.md`, `research/`                        |
| **Dana** — Backend            | `/dana`         | `data/auto-DATE-dana`                         | `supabase/schema.sql`, `supabase/migrations/*.sql`, `qa-reports/data-*.md`                                            | `PRIVACY.md` (source of truth), `FEATURES.md`     |
| **Shamus** — Feature Engineer | `/shamus`       | `feat/mutualmesh-DATE-shamus`                 | `src/screens/`, `src/components/`, `src/lib/` (non-data), `src/navigation/`, `qa-reports/feature-*.md`                | `DESIGN.md`, `FEATURES.md`, `supabase/schema.sql` |
| **Steve** — Security          | `/steve`        | `qa/auto-DATE-steve`                          | `SECURITY.md`, `.github/workflows/secrets-scan.yml`, `qa-reports/security-*.md`                                       | Everything                                        |
| **Peter** — Performance       | `/peter`        | `perf/auto-DATE-peter`                        | `qa-reports/perf-*.md`, small targeted patches to `src/` with proposal notes                                          | Everything                                        |
| **Alex** — Accessibility      | `/alex`         | `a11y/auto-DATE-alex`                         | `qa-reports/a11y-*.md`, contrast-fix patches to `src/lib/theme.ts` via proposal                                       | `DESIGN.md`, `src/`                               |
| **Gary** — QA                 | `/gary`         | `qa/auto-DATE-gary`                           | `src/__tests__/`, `jest.config.js`, `.eslintrc.json`, `.prettierrc`, `.github/workflows/ci.yml`, `qa-reports/qa-*.md` | All code                                          |
| **Rory** — DevOps             | `/rory`         | `release/auto-DATE-rory`                      | `.github/workflows/*.yml`, `eas.json`, `app.json` (version), `CHANGELOG.md`, `qa-reports/release-*.md`                | All build config                                  |
| **Will** — Technical Writer   | `/will`         | `docs/auto-DATE-will`                         | `README.md`, `CLAUDE.md`, `LEARNINGS.md`, `CONTRIBUTING.md` (text only), inline comments                              | Everything                                        |
| **Casey** — Community         | `/casey`        | `community/auto-DATE-casey`                   | `community/`, `CONTRIBUTING.md` (community-facing sections)                                                           | `PRIVACY.md`, `FEATURES.md`                       |
| **Jordan** — Privacy          | `/jordan`       | `privacy/auto-DATE-jordan`                    | `PRIVACY.md`, `qa-reports/privacy-*.md`                                                                               | All code that touches user data                   |
| **Morgan** — PM (read-only)   | `/morgan`       | `cycle/mutualmesh-DATE` (integration only)    | `qa-reports/cycle-*-NAME-*.md` (briefings)                                                                            | Everything; never writes code                     |
| **Orchestrator**              | `/orchestrator` | `cycle/mutualmesh-DATE-cycle-N` (integration) | Coordinates roles into the integration branch; safety sweep at end                                                    | Everything                                        |
| **Health-Check**              | `/health-check` | (none — read-only audit)                      | Reports to stdout; never writes                                                                                       | `~/.claude/`, `~/ClaudeCorp/`                     |

**Branch hygiene:**

- Every role creates its own worktree: `git worktree add ../mutualmesh-worktrees/<branch> <branch>`.
- All role branches merge to the cycle integration branch (`cycle/mutualmesh-DATE-cycle-N`), never directly to `main`.
- Sky merges the integration branch to `main` manually after reading Morgan's briefing in `qa-reports/`.
- Worktree directory is gitignored (`.claude/worktrees/`) — see `.gitignore`.

**Inter-role handoff rule:**
Typecheck must be GREEN at every handoff between roles. Red typecheck = FAIL_FAST → revert to last green checkpoint → escalate to Morgan.

---

## Stack (locked decisions; concrete versions set in Cycle 0 by Rory + Shamus)

- **Expo SDK 54** + **React Native 0.81** + **React 19.1** (mirror AccessMap)
- **TypeScript strict** (with `noUncheckedIndexedAccess`)
- **Supabase** — auth + Postgres + RLS + Storage
- **NativeWind** — design tokens, no hardcoded hex (LEVEL-UP vs AccessMap)
- **@react-navigation/bottom-tabs**
- **expo-location** + **expo-image-picker** + **expo-image-manipulator** (for EXIF strip)
- **Jest + jest-expo**
- **ESLint + Prettier** (LEVEL-UP vs AccessMap)
- **GitHub Actions** for CI (LEVEL-UP vs AccessMap)

Path alias: `@/*` → `src/*`

---

## File map (planned — Cycle 0 lands the foundation files)

```
PRD.md                                  Source PRD (Sky's original; superseded fields noted)
CLAUDE.md                               This file — context + gotchas + decisions
README.md                               Setup + how to run (Will writes)
FEATURES.md                             Backlog ordered by value/cost (Quinn writes)
PRIVACY.md                              Jordan's data inventory + minimum-collection model (BLOCKER GATE)
DESIGN.md                               Visual system + WCAG 2.2 AA tokens (Dani writes)
LEARNINGS.md                            Durable patterns and gotchas (filled as cycles complete)
CONTRIBUTING.md                         Contributor entry point (Casey owns)
SECURITY.md                             Vulnerability disclosure policy (Steve owns)
community/                              Casey — mission narrative, growth strategy, partners (community/README.md)
research/                               Riley — personas, journeys, friction analyses (research/README.md)
designs/                                Dani — mockups, Figma exports (specs only; never wired into app)
App.tsx                                 auth gate → SignInScreen / WaitingRoom / RootNavigator
src/lib/
  supabase.ts                           typed client + sign in/up/out helpers
  auth.tsx                              AuthProvider with is_verified check
  resources.ts                          listResources, createResource, claimResource
  resourcesRealtime.ts                  PURE merge helper (testable; LEVEL-UP)
  photos.ts                             upload + EXIF strip (LEVEL-UP)
  contactHandle.ts                      reveal contact handle on claim (MVP, no chat)
  verification.ts                       is_verified gate logic
  errors.ts                             errorMessage() consolidation
  theme.ts                              NativeWind config + design tokens
src/navigation/
  RootNavigator.tsx                     bottom tabs (Feed / Profile) — verified-only
src/screens/
  SignInScreen.tsx                      email/password
  WaitingRoomScreen.tsx                 unverified holding screen
  HomeScreen.tsx                        Feed of Available resources + FAB
  AddResourceScreen.tsx                 Create resource form
  ResourceDetailScreen.tsx              View + Claim button (atomic RPC)
  ProfileScreen.tsx                     My posts + my claims + delete-my-account
src/components/
  ResourceCard.tsx                      Feed list-item template
  FAB.tsx                               + button
  FlashBanner.tsx                       success/error toast (a11y-announced once)
src/types/
  database.ts                           Supabase typed schema — USE `type` NOT `interface`
src/__tests__/                          Jest tests for pure helpers
supabase/
  schema.sql                            tables, RLS, Storage bucket, atomic claim RPC
                                           (FILES ONLY — Sky applies via dashboard)
  realtime.sql                          enable realtime on public.resources
  migrations/                           future schema changes as files with rollback
qa-reports/                             orchestrator cycle reports
.github/workflows/
  ci.yml                                typecheck + lint + jest on every PR
  secrets-scan.yml                      gitleaks (LEVEL-UP)
.claude/
  settings.local.json                   per-machine allowlist (gitignored)
  launch.json                           Claude Preview dev-server config
```

---

## Database (Supabase) — Cycle 1 (Dana 2026-05-23)

Source-of-truth: [`supabase/schema.sql`](supabase/schema.sql) + [`supabase/realtime.sql`](supabase/realtime.sql). Dana writes files only; **Sky applies via dashboard.** See `qa-reports/cycle-1-auth-gate-2026-05-23.md` for numbered apply steps.

### Tables

| Table                     | Purpose                                                                                                                  | RLS posture                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `public.users`            | Profile mirror of `auth.users` (handle, postal_prefix, city, is_verified, is_admin, referrer_token_hash, last_active_at) | Self-read; verified users see verified peers; admins see unverified queue; protect_admin_flags trigger blocks self-promotion |
| `public.invite_tokens`    | Single-use, bcrypt-hashed invite codes (S1)                                                                              | No client policies — RPC-only access via `consume_invite_token`                                                              |
| `public.verification_log` | Append-only audit (S8)                                                                                                   | Admins INSERT via RPC only; Sky-only SELECT (via config.sky_uuid)                                                            |
| `public.cron_log`         | pg_cron observability (S6)                                                                                               | Service-role writes; Sky-only SELECT                                                                                         |
| `public.resources`        | Marketplace listings (Cycle 2+)                                                                                          | Verified users see all; posters own UPDATE/DELETE; claim via atomic RPC                                                      |
| `public.config`           | Key/value (currently just sky_uuid)                                                                                      | Sky-only                                                                                                                     |

### Triggers

- `handle_new_user()` — fires on `auth.users` INSERT; creates `public.users` row with `pending-XXX` placeholder handle. Signup step 3 overrides with the real handle.
- `touch_status_changed_at()` — bumps `resources.status_changed_at` whenever `status` changes (drives 30-day retention).
- `protect_admin_flags()` — rejects direct UPDATE of `is_verified` or `is_admin` from the `authenticated` role. Service role bypasses (so Sky can promote via dashboard).

### RPCs (security definer — bypass RLS for trusted operations)

| RPC                           | Purpose                                       | Notes                                               |
| ----------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `consume_invite_token(plain)` | Bcrypt-verify + atomic mark-used              | Locks the row; returns false on invalid/used        |
| `approve_user(applicant_id)`  | Admin-only verification approval              | Logs to verification_log                            |
| `reject_user(id, reason?)`    | Admin-only rejection (deletes auth.users row) | Logs first, then cascade-deletes                    |
| `delete_my_account()`         | True cascade hard-delete (D6 + S5)            | Single txn + FOR UPDATE; nulls others' claims-by-me |
| `claim_resource(resource_id)` | Atomic available→reserved transition          | FOR UPDATE; rejects self-claim + double-claim       |
| `touch_my_last_active()`      | App calls on foreground                       | Drives Q4 inactive-admin auto-suspend signal        |
| `prune_expired_resources()`   | Nightly cron per D7                           | Logs to cron_log; raises on failure                 |

### Critical guardrails

1. **`is_verified` gate at three layers** — UI (`decideGateRoute` in `verification.ts`), DB (RLS on every SELECT requires `is_verified = true` for marketplace tables), Storage RLS (signed URLs gated on `is_verified = true` per S4). If any layer fails, the other two hold.
2. **Atomic Claim via Postgres RPC** — `claim_resource(resource_id)` uses `SELECT … FOR UPDATE` inside a transaction. PRD §3 "State Mutation Security" + S5.
3. **PRIVATE Storage bucket with signed URLs** — `resource-photos` bucket has `public = false`. Clients fetch via `createSignedUrl(path, 3600)`. Path scheme `<userId>/<ts>.<ext>` enforced by RLS. STRIDE I1 mitigation; load-bearing.
4. **Append-only `verification_log`** — no UPDATE/DELETE policies (S8). Sky-only SELECT via `public.config.sky_uuid` pointer.
5. **No real names anywhere** (D1/D2 EDITED) — `handle_new_user` defaults to `pending-XXX` (NOT email-local-part). `handleGenerator.ts` produces random adjective-noun-4digit defaults. `handleValidator.ts` soft-warns when input looks like a common first name.
6. **30-day resource retention** — `prune_expired_resources()` runs nightly via `pg_cron`. Logs success/failure to `cron_log`. Most-recent run must be <36h old.

All DDL is idempotent. RLS coverage verified by `supabase/__tests__/rls.sql` (Steve, Loop 15).

---

## Setup (to be filled by Will in Cycle 0)

`.env` will need:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Then (after Cycle 0 lands `package.json`):

```
npm install
# (apply supabase/schema.sql in the Supabase SQL editor — Sky only)
npm start          # iOS sim / Expo Go
npm run web        # browser
npm run typecheck  # tsc --noEmit, must pass before shipping
npm test           # jest
npm run lint       # eslint
```

---

## Gotchas (the load-bearing ones — inherited from AccessMap + new)

### 1. Database type must use `type`, not `interface`

In `src/types/database.ts`, the `Row` / `Insert` / `Update` shapes for each table **must** be declared with `type` (not `interface`). Same for `Relationships` — use an `EmptyRelationships` alias, not a plain `[]`. If you ignore this, postgrest-js infers `Schema = never` and every `.insert()` / `.update()` call breaks. `npm run typecheck` is the canary.

### 2. NativeWind tokens — no raw hex

Day-1 styling rule. Don't write `color: "#FF6600"` anywhere. Add a token to `src/lib/theme.ts` and reference it. Dani owns the token set; Alex audits contrast for WCAG 2.2 AA.

### 3. Jest `testPathIgnorePatterns: ['/.claude/']` from day one

AccessMap learned this the hard way: when worktrees are active, `npm test` traverses `.claude/worktrees/` and breaks on stale native-module paths. The ignore pattern is baked into `jest.config.js` from PR #1.

### 4. Pure helpers for realtime + filters

Split channel-adapter from merge logic. `resourcesRealtime.ts` exports a pure `applyResourceDelta(state, event)` function that Gary can unit-test without mocking Supabase. The Supabase subscription wrapper is a thin adapter on top.

### 5. Mounted-ref pattern in every async screen

Every `await → setState` chain must guard with a mounted ref so navigation mid-fetch doesn't setState on an unmounted component. AccessMap pattern from commit `c7ba5e4` (2026-05-22). Shamus's screen template uses it from PR #1.

### 6. Pagination cap from day one

Every `list*` query has `.limit(500)` and a JSDoc TODO pointing to cursor-pagination as P1. AccessMap shipped without this and had to retrofit.

### 7. EXIF strip on every photo upload

Use `expo-image-manipulator` to re-encode → strip metadata → upload. Privacy-critical: a photo with GPS EXIF is a location leak. Jordan owns the spec; Steve verifies in code review.

### 8. `is_verified` gate enforced in THREE places

- `App.tsx` — UI routing
- Supabase RLS — every SELECT on `public.resources` and `public.users` checks `auth.uid()` belongs to an `is_verified = true` row
- Supabase Storage RLS — same check on the `resource-photos` bucket

If only one of the three is in place, the other two are the next line of defense. Never single-point this.

### 9. Atomic Claim is an RPC, not a client UPDATE

Two clients racing on the same resource must end in exactly one winner. The Claim button calls `supabase.rpc('claim_resource', { resource_id })` which runs `SELECT … FOR UPDATE` inside a transaction. Never let the client do `UPDATE resources SET status='reserved' WHERE id = ?` — that's racy.

### 10. Photo uploads need authenticated user + path scheme

`uploadResourcePhoto(userId, localUri)` puts files at `<userId>/<timestamp>.<ext>`. The Storage RLS policy enforces that the first path segment matches `auth.uid()`. Don't change the path scheme without updating the policy.

---

## Conventions

- TypeScript strict — no `any` if you can help it. `catch (e: any)` is fine.
- **No raw hex colors.** Use NativeWind tokens from `src/lib/theme.ts`.
- Forms use plain `useState` + `Pressable` — no form library (mirror AccessMap).
- Tests live in `src/__tests__/` and use Jest. Aim for pure-helper coverage first; component coverage is bonus.
- Don't add features that weren't asked for. Beginner-friendly = small, understandable diffs.
- **Schema changes are FILES, never live applies.** Dana writes; Sky applies.
- **External side effects (email, deploy, app-store submit) are FORBIDDEN** to all roles except Morgan on direct `/morgan` invocation (Constitution v1.3 Art. 9).

---

## When the user asks for changes

- Sky is learning. Explain what you're doing at key moments — terse, plain language, no jargon-soup.
- Prefer editing existing files over adding new ones.
- Always run `npm run typecheck && npm run lint && npm test` before declaring done.
- If a change requires Sky to do something on the Supabase dashboard, spell out the exact steps as a numbered list and add it to `DECISIONS FOR SKY` in the qa-report.
- If a change is privacy-sensitive (location, identity, vetting), surface to Morgan and pause; do not proceed until Sky approves via Morgan briefing.
