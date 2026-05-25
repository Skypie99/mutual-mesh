# Community Contributor Onboarding

**Owner:** Casey (Community Manager).
**Status:** v1 — 2026-05-23. Update on first real verification-admin recruitment.

## Who this is for

People who want to help run Mutual Mesh. Two roles to start:

1. **Verification admin** — the human who reviews new account applications and decides whether to approve them.
2. **Code contributor** — engineers, designers, technical writers contributing to the open-source codebase.

End-user onboarding (recipients, posters) lives in-app and is Quinn/Dani territory, not here.

---

## Becoming a verification admin

### What you'll do

About **20 minutes per day** during your first month, scaling down as the community grows. You'll log in to a small admin interface, see a queue of unverified accounts, and for each one make one decision: approve, reject, or escalate.

For each applicant, you see:

- Their chosen handle
- Their email
- Their postal prefix (3 chars)
- The invite-code status — was it valid, who invited them (only valid/invalid/used — you don't see WHO invited)

That's it. You do not see: any prior claims or posts (they don't exist yet for unverified users), phone, real name, age, gender, location finer than postal prefix, IP address.

Your decision is binary plus an "escalate" path. **You never see the applicant's data after you decide.** A second admin reviewing the same applicant doesn't see your decision or notes — only the current state.

### How long approvals take

Per Mutual Mesh's promise to applicants: roughly 24 hours. **If you can't keep up, escalate to the regional admin coordinator** rather than rubber-stamping. Slow, careful verification is the load-bearing trust mechanism.

### What you'll never be asked to do

- Hand over your real identity to other admins.
- Make a decision on a contested account alone — escalations exist for a reason.
- Share an applicant's data with anyone outside the verification flow.
- Approve someone who isn't from the community you're embedded in.
- Use admin powers to view other users' data. RLS at the database layer prevents this; if you ever discover a way around it, that's a security report (see [`SECURITY.md`](../SECURITY.md)).

### What disqualifies an applicant

- **Invalid invite code.** No exceptions. The invite-code mechanism is the anti-abuse layer.
- **Already-used invite code.** Tokens are single-use.
- **Email that's a known disposable (e.g., mailinator).** This is a judgment call; document a "policy of when we reject disposables" with the regional coordinator.
- **A handle that's a slur, includes another user's handle, or impersonates a known person/org.** Reject with a polite note via email; they can re-apply with a different handle.

### What doesn't disqualify an applicant

- A Proton/Tutanota/anonymous email. Encrypted/alias emails are EXPECTED, not suspicious.
- An invite code from someone you don't know. The invite mechanism is opaque-by-design.
- A handle you don't personally like. As long as it's not a slur/impersonation, approve.

### Time commitment & burnout policy

- Start at ~30 min/day; scale down once approval backlog stays under 24h with 50% headroom.
- If you've been an admin for >3 months and approval-quality has dipped, take a break. We'd rather rotate admins than burn out the early ones.
- Tell the regional coordinator if you're going on vacation — they re-route the queue.

### Compensation

- v1 launch: volunteer.
- If/when Mutual Mesh accepts grants, admins get the first 10% of any operating budget as a stipend — explicitly so that "labor of the people doing the trust work" isn't free.
- This is a Sky decision once funding lands; flagged here for transparency.

### How to apply to be an admin

Recruitment goes through Sky directly for v1, since Casey is still building the partner network. Casey expects to publish a public application form once the first 3-5 admins are seated.

---

## Becoming a code contributor

Mutual Mesh's codebase is publicly readable but not yet open to external PRs in v1 — Casey is still drafting the contributor agreement and Steve is finalizing the security disclosure flow. Watch this section for updates.

When v2 opens to contributors, expect:

- A signed contributor privacy agreement (you commit to not exfiltrating user data even if you have access during local development).
- A required pairing with an existing maintainer for your first PR.
- Code review focused on privacy/security as well as code quality.
- A "first issue" curated list of low-stakes tasks (UI polish, doc fixes, test coverage) for new contributors.

If you find a bug or security issue right now, see [`SECURITY.md`](../SECURITY.md) (security) or open a private comm with Sky (bugs).

---

## What governs all roles

- [`PRIVACY.md`](../PRIVACY.md) — what we collect, why, retention.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — public-facing contributor entry point.
- [Constitution v1.3](../../.claude/CONSTITUTION.md) — the operating law. Three pillars (safety, privacy, accessibility) override speed.
- [`SECURITY.md`](../SECURITY.md) — vulnerability disclosure.

All roles inherit the rule: **escalate anything you're not sure about.** Better to pause than to make a privacy-affecting decision alone.

---

## Try the web demo

The Mutual Mesh web demo is live at `https://mutual-mesh.vercel.app`. It requires an invite and a verified account — same as the mobile app. If you've been invited to preview the platform and want to use a browser instead of (or alongside) your phone, see [`web-demo.md`](./web-demo.md) for what to expect and how to get started.

---

## Failure modes we're explicitly trying to avoid

- **Admin power-tripping.** An admin should never feel like a gatekeeper of who's "deserving." Reject only on the criteria above; everything else is a soft yes.
- **Admin underground knowledge.** The criteria above are public. We don't have unwritten rules.
- **Code contributor scope creep.** A contributor with shell access to a local database is not authorized to query for "interesting data." If you're curious about real users, talk to Casey.
- **Saviorism.** None of this is charity. Mutual Mesh works because the people using it are the people running it. If you want to "help the unfortunate," this isn't the project for you. (Casey would say this politely. Riley would say it less politely.)
