# Mutual Mesh

A privacy-first community-run mutual-aid network for marginalized groups to share food, baby formula, and critical resources — without corporate or state surveillance.

**Status:** **Phase 0a complete (2026-05-23).** Toolchain green, six stub screens, five UI primitives, three tested pure helpers, bottom-tab navigator. Awaiting Sky's approval of `PRIVACY.md` before Phase 0b (Supabase wiring, real auth gate, schema apply).

## What's here today

| File                                                                                 | What it is                                                                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `PRD.md`                                                                             | Sky's original product spec (some fields superseded by privacy redesign)                                                |
| `CLAUDE.md`                                                                          | Team context, gotchas, decisions log, file map, Role → Outputs map                                                      |
| `PRIVACY.md`                                                                         | **🟡 READY-FOR-REVIEW.** Jordan v1 data model + Steve security audit. 18 DECISIONS FOR SKY total (10 Jordan + 8 Steve). |
| `FEATURES.md`                                                                        | Backlog seed                                                                                                            |
| `DESIGN.md`                                                                          | Visual system v1 with WCAG-verified contrast ratios                                                                     |
| `LEARNINGS.md`                                                                       | Durable patterns and gotchas — appended each loop                                                                       |
| `CONTRIBUTING.md` + `SECURITY.md`                                                    | Casey + Steve home for contributor + vuln disclosure docs                                                               |
| `community/` + `research/` + `designs/`                                              | Casey / Riley / Dani role homes                                                                                         |
| `qa-reports/`                                                                        | 4 audit reports landed in Phase 0a (privacy, helpers security, a11y tokens, a11y screens) + final cycle briefing        |
| `src/lib/{theme,errors,verification,contactHandle,resourcesRealtime}.ts`             | Pure helpers (no Supabase imports)                                                                                      |
| `src/components/{Button,TextField,Card,StatusPill,FAB}.tsx`                          | Reusable UI primitives, all WCAG 2.5.5 + label compliant                                                                |
| `src/screens/{SignIn,WaitingRoom,Home,ResourceDetail,Profile,AddResource}Screen.tsx` | Six stubs — UI only, no Supabase                                                                                        |
| `src/navigation/RootNavigator.tsx` + `src/types/navigation.ts`                       | Bottom tabs + Home stack                                                                                                |

## Running it locally

```bash
npm install --legacy-peer-deps   # required because of React 19.1 pin
npm run typecheck                 # tsc --noEmit
npm test                          # 47 tests across 4 suites
npm run lint                      # eslint clean
npm run format                    # prettier auto-format
npm start                         # boots Expo dev server (Home feed shows mock data)
```

The app currently boots straight into a mock feed. Auth and real data wait for Phase 0b.

## Critical-path next actions

1. **Run `/health-check`** to confirm the Claude Corp system is GREEN.
2. **Review Jordan's `PRIVACY.md`** + Steve's `qa-reports/2026-05-23_security-privacy-review.md`. Mark each of the 18 DECISIONS items ✅ approved or ❌ pushback.
3. When all ✅, flip `PRIVACY.md` status header from 🟡 to 🟢.
4. **Run `/orchestrator`** with `~/ClaudeCorp/prompts/per_project/mutualmesh_kickoff.md` — Phase 0b lands schema + auth + real data wiring.
5. **Apply schema** in Supabase dashboard from Dana's `supabase/schema.sql` (Sky only — no agent applies live).

Detailed plan: `/Users/skypie/.claude/plans/i-have-a-new-playful-origami.md`.

## Setup environment variables (for Phase 0b)

`.env` will need:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Not required for the Day-0 build above — mock data is hardcoded.

See `CLAUDE.md` for stack details and gotchas.
