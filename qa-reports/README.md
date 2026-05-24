# qa-reports/

Every Claude Corp role drops their findings here as a Markdown file. Morgan reads everything in this folder when assembling cycle briefings.

## Naming convention

```
<role-or-cycle>-<topic-or-date>-<YYYY-MM-DD>.md
```

| Pattern                      | Author                                 | Example                            |
| ---------------------------- | -------------------------------------- | ---------------------------------- |
| `cycle-N-NAME-YYYY-MM-DD.md` | Morgan (orchestrator-mode briefings)   | `cycle-0-foundation-2026-05-23.md` |
| `qa-YYYY-MM-DD.md`           | Gary (full QA pass)                    | `qa-2026-05-23.md`                 |
| `a11y-YYYY-MM-DD.md`         | Alex (accessibility audit)             | `a11y-2026-06-01.md`               |
| `security-YYYY-MM-DD.md`     | Steve (hardening pass)                 | `security-2026-06-01.md`           |
| `perf-YYYY-MM-DD.md`         | Peter (performance pass)               | `perf-2026-06-15.md`               |
| `design-YYYY-MM-DD.md`       | Dani (design proposal review)          | `design-2026-05-23.md`             |
| `data-YYYY-MM-DD.md`         | Dana (migration/RLS proposal write-up) | `data-2026-05-23.md`               |
| `privacy-YYYY-MM-DD.md`      | Jordan (privacy audit)                 | `privacy-2026-05-23.md`            |
| `research-YYYY-MM-DD.md`     | Riley (research summary)               | `research-2026-06-01.md`           |
| `community-YYYY-MM-DD.md`    | Casey (community/growth assessment)    | `community-2026-06-01.md`          |
| `feature-NAME-YYYY-MM-DD.md` | Shamus (feature build write-up)        | `feature-auth-gate-2026-05-30.md`  |
| `release-YYYY-MM-DD.md`      | Rory (release readiness)               | `release-2026-07-01.md`            |
| `spec-NAME-YYYY-MM-DD.md`    | Quinn (formal feature spec)            | `spec-claim-flow-2026-05-25.md`    |
| `docs-YYYY-MM-DD.md`         | Will (documentation pass)              | `docs-2026-05-23.md`               |

## Required sections in every report

```markdown
# <Title> — <Author> — <YYYY-MM-DD>

## Summary

One paragraph: what I looked at, what I found, what I changed (if anything).

## DECISIONS FOR SKY

Items that need Sky's approval before they ship. Each with:

- What's being asked
- Why
- Exact steps to apply
- Rollback steps if it goes wrong

## FAIL_FAST / BLOCKER states

Anything that halted my work, or where I refused to act because it would
violate the Constitution. Empty section is fine.

## What I shipped (if anything)

List of file paths changed, with one-line per change. If proposal-only,
write "Proposal only — no files changed in main."

## What's next

Recommended follow-ups. Whose desk it lands on.
```

## Anti-patterns

- **No verbal report-only.** If it's not in a file in this folder, it didn't happen.
- **No external sends from this folder.** Constitution v1.3 Art. 9 — Morgan is the only role that messages Sky externally, and only on direct `/morgan` invocation, never inside an orchestrator run.
- **No silently passing FAIL_FAST.** If your work halted, say so loudly in the report — Morgan's briefing surfaces it to Sky.
