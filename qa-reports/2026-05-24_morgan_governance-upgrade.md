# Mutual Mesh — Governance Upgrade Proposal

**Author:** Morgan (Governance + Systems Architect)
**Date:** 2026-05-24
**Status:** PROPOSAL — Sky approval required before any implementation

---

## EXECUTIVE SUMMARY

This document designs a real, enforceable governance upgrade for Mutual Mesh that:

- Removes the single-point merge bottleneck by delegating merge authority through GitHub tooling
- Enforces all safety gates (CI, tests, typecheck) as non-bypassable GitHub checks
- Prohibits email at the application behavior and CI level
- Requires zero constitutional language as enforcement — everything maps to real system controls

Estimated implementation time once Sky approves: ~30 minutes.

---

## SECTION A — ARCHITECTURE PROPOSAL

### A1. The Two-Layer Enforcement Model

The current bottleneck has two distinct causes that require different fixes:

**Layer 1 — Claude Code auto-mode classifier**
Blocks `git merge` and `git push` at the Claude Code process level.
Fix: add explicit Bash allow-rules in Claude Code settings.

**Layer 2 — GitHub branch protection (missing)**
Currently there are no branch protection rules on `main`. Direct pushes are
unguarded at the GitHub level. Adding branch protection makes GitHub the
safety backstop — independent of Claude Code, independent of chat governance.

Once both layers are addressed, the model becomes:

- Claude Code agents can execute `git merge` and `git push` (Layer 1 unlocked)
- GitHub rejects any push that bypasses CI or lacks a PR (Layer 2 enforces safety)
- Sky retains full control: GitHub admin can override any protection, add/remove
  reviewers, and is the sole approver on CODEOWNERS-guarded paths

This is "distributed merge execution with centralized safety gates" — not "distributed authority."
Sky's approval is still required for migrations and sensitive paths via CODEOWNERS.

---

### A2. GitHub Branch Protection Rules (main)

Configure the following on `github.com/Skypie99/mutual-mesh/settings/branches`:

| Rule                                   | Setting                                 | Reason                                          |
| -------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Require a pull request before merging  | ON                                      | No direct push to main                          |
| Required approvals                     | 1                                       | At least Sky (or trusted reviewer) must approve |
| Dismiss stale reviews on new pushes    | ON                                      | Re-approve after any new commit                 |
| Require status checks to pass          | ON                                      | CI is the gate                                  |
| Required checks                        | `typecheck`, `lint`, `test`, `gitleaks` | All 4 current CI jobs                           |
| Require branches to be up to date      | ON                                      | No out-of-date merges                           |
| Require linear history                 | ON (optional)                           | Clean git log; prevents merge commits           |
| Do not allow bypassing the above rules | ON                                      | Applies to admins including Sky                 |
| Allow force pushes                     | OFF                                     | Immutable history                               |
| Allow deletions                        | OFF                                     | main cannot be deleted                          |

The "do not allow bypassing" rule is important: it applies to Sky too. This means
CI cannot be skipped even by the repo admin. This is the "CI is a gate, not an
authority" model — CI doesn't override Sky, but Sky also cannot bypass CI.

---

### A3. CODEOWNERS

CODEOWNERS assigns required reviewers per path. GitHub enforces this at merge time.

```
# All code: Sky is the default owner (required reviewer on all PRs)
* @Skypie99

# Supabase migrations: explicit Sky review required — these touch live DB schema
/supabase/migrations/ @Skypie99

# CI and GitHub configuration: Sky must approve changes to safety systems
/.github/ @Skypie99

# Governance files: Sky must approve
/GOVERNANCE.md @Skypie99
/DECISIONS_LOG.md @Skypie99
/LEARNINGS.md @Skypie99
```

Effect: no PR can merge without Sky's approval. For paths listed explicitly, GitHub
will block the merge even if branch protection's "1 approval" is otherwise satisfied
by someone else (if Sky ever adds collaborators).

This is the practical answer to "only Sky can merge migrations" — enforced by
GitHub, not by documentation.

---

### A4. Claude Code Permission Expansion

To allow Claude Code agents to execute `git merge` and `git push` (without the
auto-mode classifier blocking), add explicit allow-rules to settings.json.

The file to edit is `~/.claude/settings.json` (user-level) or
`/Users/skypie/MutualMesh/.claude/settings.json` (project-level).

**Recommended: project-level** (scoped to MutualMesh only).

Add to the `permissions.allow` array:

```json
"Bash(git merge:*)",
"Bash(git push:*)",
"Bash(git push origin *:*)"
```

With GitHub branch protection active, these are safe to allow: GitHub will reject
any push that fails CI or lacks approval. The classifier block is then redundant
safety — the real safety is at GitHub.

---

### A5. Email Prohibition — CI Enforcement

Add a CI job that fails the build if any email-sending library is imported.
This is application-level enforcement, not documentation.

Detects: nodemailer, @sendgrid/mail, mailgun-js, aws-ses, @aws-sdk/client-ses,
postmark, sparkpost, resend, or any `mailto:` href in policyText.ts (display strings
are allowed; functional send integrations are not).

See Section B for the full workflow file.

---

### A6. Optional: Auto-Merge Workflow

If Sky wants agents to merge without a manual GitHub web click, a GitHub Actions
workflow can auto-merge when:

- All required CI checks pass
- PR has been approved by Sky (via `gh pr review --approve`)
- PR has the `automerge` label

This means the agent workflow becomes:

1. Agent pushes branch, opens PR (`gh pr create`)
2. Sky reviews and approves (`gh pr review <num> --approve`)
3. Agent adds label (`gh pr edit <num> --add-label automerge`)
4. CI completes → auto-merge fires

Sky retains the approval gate. The merge execution is automated.
See Section B for the full workflow file.

---

## SECTION B — FILES TO CREATE OR MODIFY

### B1. `.github/CODEOWNERS` (CREATE)

```
* @Skypie99
/supabase/migrations/ @Skypie99
/.github/ @Skypie99
/GOVERNANCE.md @Skypie99
/DECISIONS_LOG.md @Skypie99
/LEARNINGS.md @Skypie99
```

---

### B2. `.github/workflows/ci.yml` (MODIFY — add email-guard and migration-guard jobs)

Add two new jobs to the existing three:

```yaml
# Job 4: Email library prohibition
email-guard:
  name: email-guard
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Reject email-sending library imports
      run: |
        PATTERNS="nodemailer|@sendgrid/mail|mailgun-js|aws-sdk.*ses|client-ses|postmark|sparkpost|resend"
        if grep -rE "$PATTERNS" src/ --include="*.ts" --include="*.tsx" -l; then
          echo "ERROR: Email-sending library import detected. Email is prohibited."
          exit 1
        fi
        echo "OK: No email-sending imports found."

# Job 5: Migration sequence guard
migration-guard:
  name: migration-guard
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Validate migration numbering is sequential
      run: |
        files=$(ls supabase/migrations/*.sql 2>/dev/null | sort)
        prev=0
        for f in $files; do
          num=$(basename "$f" | grep -o '^[0-9]\+')
          expected=$((prev + 1))
          if [ "$num" != "$(printf '%03d' $expected)" ]; then
            echo "ERROR: Migration gap or duplicate detected near $f (expected $(printf '%03d' $expected))"
            exit 1
          fi
          prev=$expected
        done
        echo "OK: Migrations are sequential (001 through $(printf '%03d' $prev))."
```

---

### B3. `.github/workflows/auto-merge.yml` (CREATE — optional)

```yaml
name: Auto-merge approved PRs

on:
  pull_request_review:
    types: [submitted]
  check_suite:
    types: [completed]

jobs:
  automerge:
    name: automerge
    runs-on: ubuntu-latest
    if: |
      github.event.review.state == 'approved' ||
      github.event.check_suite.conclusion == 'success'
    steps:
      - uses: pascalgn/automerge-action@v0.16.3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MERGE_LABELS: automerge
          MERGE_METHOD: squash
          MERGE_COMMIT_MESSAGE: '{pullRequest.title}'
          MERGE_REQUIRED_APPROVALS: 1
          UPDATE_LABELS: ''
```

This only fires when both conditions are met: approved + CI passed + `automerge` label present.

---

### B4. `GOVERNANCE.md` (CREATE — lightweight real doc, not constitutional language)

```markdown
# Mutual Mesh — Governance Reference

Last updated: 2026-05-24

## Merge authority

All merges to `main` require:

- A pull request (direct push blocked by branch protection)
- 1 approval from @Skypie99 (enforced by CODEOWNERS)
- All CI checks passing: typecheck, lint, test, gitleaks, email-guard, migration-guard

There is no override. Admins are subject to the same rules.

## Communication channels

Email is not used in this project.
All agent communication: iMessage to Sky at +1 778-581-3605 (Morgan only).
All other roles: write to qa-reports/ and DECISIONS_LOG.md.

## Migration authority

Migrations in /supabase/migrations/ require Sky review (CODEOWNERS).
Migrations are applied manually by Sky via the Supabase dashboard.
Migrations are never applied by agents — only authored and reviewed.

## Sensitive paths

/.github/ — changes to CI or branch protection require Sky review
/DECISIONS_LOG.md — append-only audit record, Sky review required
```

---

### B5. `~/.claude/settings.json` — Permission additions (Sky edits)

Add to the `permissions.allow` array in project or user settings:

```json
"Bash(git merge:*)",
"Bash(git push origin *)"
```

Sky can do this via the `/permissions` command in Claude Code or by editing
`/Users/skypie/MutualMesh/.claude/settings.json` directly.

---

### B6. `~/ClaudeCorp/.claude/commands/morgan.md` — Email prohibition (Sky edits manually)

On line 10 (the communication channel line), replace the existing email reference with:

```markdown
- **Direct `/morgan` invocation (ACTIVE mode)** → iMessage Sky at **+1 778-581-3605**
  using `mcp__Read_and_Send_iMessages__send_imessage`. **EMAIL IS PERMANENTLY DISABLED
  (Sky directive 2026-05-24).** iMessage is the sole external channel.
```

Then deploy: `cp -R ~/ClaudeCorp/.claude/* ~/.claude/`

---

## SECTION C — MIGRATION PLAN

### Step 1 — Enable GitHub branch protection (5 min, Sky action)

Go to: `github.com/Skypie99/mutual-mesh/settings/branches`

Click "Add branch protection rule" for `main`:

- [x] Require a pull request before merging
- [x] Require approvals: 1
- [x] Dismiss stale pull request approvals when new commits are pushed
- [x] Require status checks to pass before merging
  - Required checks: typecheck, lint, test, gitleaks
  - (email-guard and migration-guard added in step 2)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings
- [x] Block force pushes
- [x] Block branch deletion

**Do this first**, before creating the PR for the governance files, so that PR itself
is governed by the new rules.

---

### Step 2 — Create PR with governance files (15 min, agent-assisted)

On `feat/resource-map-screen-2026-05-24` or a new `governance/2026-05-24` branch:

1. Create `.github/CODEOWNERS` (content from B1)
2. Modify `.github/workflows/ci.yml` — add email-guard + migration-guard jobs (B2)
3. Create `.github/workflows/auto-merge.yml` (B3, optional)
4. Create `GOVERNANCE.md` (B4)

Open PR → CI runs → Sky approves → merge.

This PR is itself governed by step 1's branch protection. It proves the system works.

---

### Step 3 — Update Claude Code permissions (5 min, Sky action)

Run in Claude Code: add git merge/push to allow-list via project settings.json.
Or use `/permissions` command to add the Bash rules.

---

### Step 4 — Update morgan.md (5 min, Sky action)

Edit `~/ClaudeCorp/.claude/commands/morgan.md` line 10 (see B6 above).
Run `cp -R ~/ClaudeCorp/.claude/* ~/.claude/`

---

### Step 5 — Verify

Open a test PR from any branch:

- [ ] CI runs automatically
- [ ] Merge is blocked until CI passes
- [ ] Merge is blocked until Sky approves
- [ ] After approval + CI pass, merge proceeds (via web click or auto-merge workflow)
- [ ] Force push to main is blocked

---

## SECTION D — RISK ANALYSIS

| Risk                                                | Likelihood | Impact | Mitigation                                                                                                                                                                    |
| --------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent pushes broken code that passes CI             | LOW        | MEDIUM | CI covers typecheck+lint+test+secrets+email-guard+migration-guard. CI gap is the residual risk — inherent in any automated system. Sky approval is the human backstop.        |
| Branch protection bypassed by GitHub admin override | LOW        | HIGH   | The "Do not allow bypassing" rule applies to admins. Only GitHub staff or repository destruction can bypass it.                                                               |
| Auto-merge fires before Sky intends                 | LOW        | MEDIUM | Auto-merge requires: approval + all CI pass + `automerge` label. Three independent conditions. Sky controls the label.                                                        |
| CODEOWNERS misconfigured (wrong GitHub username)    | LOW        | HIGH   | Username is `@Skypie99` (verified from remote URL). Test by creating a draft PR without Sky approval and confirming it's blocked.                                             |
| email-guard false positive on display strings       | LOW        | LOW    | The grep targets import statements and library names, not string literals. `privacy@mutualmesh.ca` in policyText.ts won't match. Review the pattern if it fires unexpectedly. |
| Migration-guard fails on 3-digit vs 2-digit naming  | LOW        | LOW    | All current migrations use `00N_` prefix. Guard script uses `printf '%03d'` for consistent comparison. Will correctly detect gaps at 012, 013, etc.                           |
| Sky forgets to deploy morgan.md after editing       | MEDIUM     | LOW    | DECISIONS_LOG.md records the deploy command. Morgan can iMessage reminder if Sky re-invokes.                                                                                  |
| Concurrent PRs create merge conflicts on main       | MEDIUM     | LOW    | "Require branches to be up to date" rule forces rebasing. GitHub merge queue feature (repo settings → General → Merge queue) can serialize merges if this becomes frequent.   |

---

## DECISIONS FOR SKY

1. **Do you want branch protection to apply to Sky too?**
   Recommended YES: "Do not allow bypassing" makes the safety system unconditional.
   If NO, you can still push directly to main — but then the protection is a courtesy
   rule that you can accidentally bypass.

2. **Do you want the auto-merge workflow?**
   If YES: Sky's approval + CI pass = merge without manual web click. Fastest path.
   If NO: Sky clicks "Merge" on GitHub after approving. More manual, equally safe.

3. **Project-level or user-level for Claude Code permissions?**
   Project-level (MutualMesh/.claude/settings.json): only MutualMesh agents get
   git merge/push. User-level: all projects get it. Recommend project-level.

4. **Should `email-guard` also block `mailto:` hrefs in src/?**
   Currently the guard only blocks library imports. policyText.ts and privacy policy
   display `privacy@mutualmesh.ca` as a string — that's fine and won't be caught.
   Functional `mailto:` links in UI (e.g. `<TouchableOpacity onPress={Linking.openURL('mailto:...')}`)
   are a separate concern. Recommend: add `Linking.openURL.*mailto` to the pattern if you
   want to prohibit that UI pattern too.

---

## SUMMARY TABLE

| Item                        | File / System                             | Sky Action Required        | Complexity |
| --------------------------- | ----------------------------------------- | -------------------------- | ---------- |
| Branch protection rules     | GitHub Settings UI                        | YES — 5 min                | Low        |
| CODEOWNERS                  | `.github/CODEOWNERS`                      | Approve PR                 | Trivial    |
| CI email-guard              | `.github/workflows/ci.yml`                | Approve PR                 | Low        |
| CI migration-guard          | `.github/workflows/ci.yml`                | Approve PR                 | Low        |
| Auto-merge workflow         | `.github/workflows/auto-merge.yml`        | Approve PR (optional)      | Low        |
| GOVERNANCE.md               | `GOVERNANCE.md`                           | Approve PR                 | Trivial    |
| Claude Code permissions     | `settings.json`                           | YES — direct edit          | Trivial    |
| morgan.md email prohibition | `~/ClaudeCorp/.claude/commands/morgan.md` | YES — manual edit + deploy | Trivial    |

**Total Sky manual actions: 3** (branch protection, Claude Code settings, morgan.md)
**Everything else: agent-executable PR once permissions are unlocked**
