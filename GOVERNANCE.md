# Mutual Mesh — Governance Reference

_Last updated: 2026-05-24. Update this file when governance rules change._

## Merge authority

All merges to `main` require a pull request with:
- All CI checks passing: `typecheck`, `lint`, `test`, `gitleaks`, `email-guard`, `migration-guard`
- At least 1 approval from @Skypie99 (enforced by CODEOWNERS and branch protection)
- Branch up to date with `main`
- All PR conversations resolved

There is no bypass. Admins are subject to the same rules.

## Sensitive paths (CODEOWNERS)

| Path | Required reviewer | Reason |
|------|------------------|--------|
| `*` (all files) | @Skypie99 | Default |
| `/supabase/migrations/` | @Skypie99 | Live DB schema changes |
| `/.github/` | @Skypie99 | Changes to CI or protection rules |

## CI enforcement

| Job | Blocks merge on | Notes |
|-----|----------------|-------|
| `typecheck` | TypeScript errors | Must be 0 errors |
| `lint` | ESLint errors or format violations | Warnings allowed |
| `test` | Test failures | Must be 100% pass |
| `gitleaks` | Committed secrets | Applied to full history |
| `email-guard` | Email library imports in `src/` | See `.github/workflows/ci.yml` for pattern list |
| `migration-guard` | Sequence gaps or duplicates | Validates `supabase/migrations/` |

CI is a validation gate. It does not override human approval.

## Governance changes

Changes to `.github/`, `GOVERNANCE.md`, `DECISIONS_LOG.md`, or `CODEOWNERS`
must go through a pull request and require Sky's explicit review (enforced by CODEOWNERS).
Chat messages do not modify governance.

## Communication

- Agent-to-Sky: iMessage at +1 778-581-3605 (Morgan only, via direct `/morgan` invocation)
- Email: not used in this project
- Cross-role findings: write to `qa-reports/` and `DECISIONS_LOG.md`
