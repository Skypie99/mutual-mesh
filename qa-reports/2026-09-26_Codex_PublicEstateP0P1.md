> **Record note (added 2026-09-28 by the public-estate closure).** Preserved verbatim from the draft branch `codex/public-estate-p0p1-mutualmesh-20260926` (PR #40) as a dated working record. Superseded since it was written: the personal-contact tokens it mentions were removed from the current tree **and** from git history by the 2026-09-27 history rewrite (see `DECISIONS_LOG.md`), the one-line formatting issue is fixed, and the About metadata wording is applied. Still open and owner-gated: the guest-demo isolation review (`MM-01`) it links to.

# Mutual Mesh public-estate P0/P1 remediation — 2026-09-26

## DECISIONS FOR SKY

- [ ] **Review and merge the documentation branch.** Recommend reviewing the isolated redactions and qualified demo wording, then adopting them through the normal owner workflow. The alternative is to defer adoption; the four known phone references remain on public main until adoption. No merge, default-branch push, or deploy is authorized to this session.
- [ ] **Decide the historical privacy response.** Recommend a separately scoped inventory and history-remediation decision because old public commits and other refs retain personal-contact material. The alternative is current-tree-only containment with acknowledged residual copies. History rewriting affects clones, branches, and PR identities and requires separate explicit approval.
- [ ] **Adjudicate guest-demo isolation and metadata.** See [the exact-candidate review request](2026-09-26_Codex_DemoSessionPrivacyReviewRequest.md). Documentation qualification does not establish privacy-sensitive runtime behavior. Sky controls any auth repair, live test, and GitHub description/visibility change.

## Branch and changes

Base: `93f5928c3a5d8607f75d5889f502499033249aae` (verified public main).
Branch: `codex/public-estate-p0p1-mutualmesh-20260926`.
Implementation commit: `0812d00a4d67fa5c5fe5214951dffeb43c6f2bd2`.

A clean existing Codex checkout was reused on a new branch from the exact public base. Its previous branch and commits remain intact. Local primary main contained an unpushed race-test change, so it was not used as the base. No observed overlapping writer was found in bounded thread/worktree/process samples; unseen writers remain unverified. Primary untracked work was preserved. Primary AGENTS.md was absent; CLAUDE.md was read.

| File | Change and reason |
| --- | --- |
| DECISIONS_LOG.md | Redact one personal-phone token and restore one blank line required by the pinned formatter. |
| GOVERNANCE.md | Redact one personal-phone token. |
| qa-reports/2026-05-24_morgan_governance-upgrade.md | Redact two personal-phone tokens; preserve the historical report text and dates. |
| README.md | Distinguish public source from service access; withdraw unsupported zero-network and saved-session guarantees. |
| qa-reports/2026-09-26_Codex_DemoSessionPrivacyReviewRequest.md | Record separate owner-gated auth review and metadata decisions. |
| qa-reports/2026-09-26_Codex_PublicEstateP0P1.md | This implementation receipt. |

Redacted before state: internal owner-directed contact token, value withheld. Safe after state: `[redacted: personal phone contact]`. No credentials, tokens, or private identifiers are reproduced here.

## Gates and actual outcomes

The lockfile and reused installed Prettier both identify version 3.8.3. It was invoked by its absolute executable path outside the checkout; the local machine path is withheld here. The portable equivalent of its actual arguments is:

```bash
node node_modules/prettier/bin/prettier.cjs --check '**/*.{ts,tsx,js,jsx,json,md}'
```

Baseline exit 1: `Checking formatting...`; `[warn] DECISIONS_LOG.md`; `[warn] Code style issues found in the above file. Run Prettier with --write to fix.` After targeted formatting of DECISIONS_LOG.md, GOVERNANCE.md, and README.md, the same check exited 0: `Checking formatting...`; `All matched files use Prettier code style!`. No formatting checks were disabled. The historical CI log GET returned HTTP 410, so its original detailed file list is unavailable; the fresh baseline independently reproduced the document-only failure.

```bash
npm run typecheck -- --pretty false --incremental false
```

Exit 0: `mutual-mesh@0.1.0 typecheck`; `tsc --noEmit --pretty false --incremental false`. Dependencies were reused through a temporary untracked local symlink, removed after verification; no packages were installed or changed.

```bash
git diff --cached --check
```

Exit 0, no output before the implementation commit.

A sanitized Python scan of all 281 tracked UTF-8 text files found exactly four normalized copies of the confirmed personal-contact token on the base and zero on the candidate. All replacement content was checked without printing the token. README local Markdown link check: one link, zero missing targets. Exact byte comparison confirms App.tsx and src/lib/auth.tsx remain identical to the base; changed-file allowlist contains only the documents above. Reports are ignored by the existing formatter configuration and were reviewed separately for Markdown structure and sensitive content.

No product tests, hosted tests, migrations, builds, credential operations, or deployment actions were run; product source/configuration did not change. Existing public-main CI failure is historical and remains on main until adoption; this branch has a local formatting/typecheck pass. Remote branch/PR identity and any independent review are recorded in the separate final owner handoff.

## Remaining work and limits

P0-03 is fixed on this branch only. Current public default still retains the confirmed disclosure. History, other refs, binary/media content, private-contact consent, and comprehensive secret absence are not certified. No live credential was established by this bounded work; credential rotation was neither attempted nor inferred. MM-01 saved-session review and MM-02 metadata remain owner actions. Other P2/P3 claims, runtime fixes, and the unrelated race-test PR are outside this patch.

Rollback: before merge, leave or close the draft PR; after owner adoption, use a new inverse documentation commit rather than rewriting history. Reintroducing the contact token is not recommended.

## Process self-check

Efficiency: reconciled the controlling audit and current public main before edits. Overlap: preserved existing primary changes, old Codex branch, and PR39; no overlapping writer observed. Simplification: corrected only the confirmed tokens, two README paragraphs, and the reproduced one-line formatting issue. The sensitive auth repair was written up for Sky.

Main direct writes, merges, deploys, history rewrites, and credential rotations: NONE.
