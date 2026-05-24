# Contributing to Mutual Mesh

**Owner:** Casey (Community Manager). Detailed contributor onboarding lives in [`community/onboarding.md`](community/) (filled during Cycle 0).

## Before you contribute anything

Mutual Mesh is a privacy-first mutual-aid network for marginalized groups. Read these in order:

1. [`README.md`](README.md) — what the project is
2. [`PRIVACY.md`](PRIVACY.md) — what data we collect and why (Jordan-authored, Sky-approved)
3. [`CLAUDE.md`](CLAUDE.md) — tech context, gotchas, decisions log
4. [`FEATURES.md`](FEATURES.md) — what's planned

## How to contribute

### As a Claude Corp role

Each role works on its own branch prefix and writes to its designated folder. See [`CLAUDE.md` → Role → Outputs map](CLAUDE.md) for the full table. Always:

- Work in an isolated worktree (`git worktree add ../mutualmesh-worktrees/<branch> <branch>`).
- Never merge to `main` — only Sky merges.
- Never apply migrations to a live database — schemas are files; Sky applies via the Supabase dashboard.
- Surface external decisions through Morgan only (Constitution v1.3 Art. 9).

### As a human OSS contributor

Mutual Mesh isn't yet open to external contributions. When it is, Casey will publish the full guide here.

## Code of Conduct

Treat marginalized users — the people this app is for — as the primary audience for everything you write, design, or ship. No saviorist or "inspirational" framing. No ableist or carceral language. If unsure, ask Casey or Jordan.

## Security disclosures

See [`SECURITY.md`](SECURITY.md) for how to responsibly report a vulnerability.

## Privacy concerns

If you believe a feature or change creates a privacy risk for users, file it as a `BLOCKER` in the relevant `qa-reports/` document and tag Jordan. Privacy-sensitive findings go to Sky via Morgan only.
