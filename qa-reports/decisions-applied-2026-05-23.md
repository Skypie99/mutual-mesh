# Decisions applied — PRIVACY.md approval — 2026-05-23

Sky worked through all 22 gating items in an interactive walkthrough (MODE A). This log records each outcome and the files touched. No git repo exists yet, so all changes are local working-tree edits for Sky to review and commit. No external sends, no live Supabase changes, no `main` modifications.

## Outcome summary

- **18 of 18 D/S decisions resolved** (zero pending).
- **4 of 4 open questions answered.**
- **PRIVACY.md status flipped 🟡 READY-FOR-REVIEW → 🟢 APPROVED — locked 2026-05-23.**
- **Phase 0b / Cycle 1 is now UNLOCKED.**
- Build chain re-verified green after all edits.

## Jordan's privacy decisions (D1–D10)

| ID  | Outcome                             | Notes                                                                                                                                        |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | ✏️ EDITED (approved + strengthened) | Real names are never collected, stored, OR used as a handle/contact value anywhere — an _enforced_ rule, not just "not collected at signup." |
| D2  | ✏️ EDITED (approved + addition)     | Per-resource contact handle MUST NOT be a real name; posting UI warns the poster at entry time. Pairs with S3.                               |
| D3  | ✅ Approved                         | Postal prefix at 3 chars (FSA-level).                                                                                                        |
| D4  | ✅ Approved                         | Referrer is a single-use hashed invite token, no identity graph.                                                                             |
| D5  | ✅ Approved                         | Two-layer EXIF stripping (client + server).                                                                                                  |
| D6  | ✅ Approved                         | True cascade hard-delete on account deletion; honest 7-day backup disclosure.                                                                |
| D7  | ✅ Approved                         | Resource retention: 30 days after `reserved` or after creation if unclaimed.                                                                 |
| D8  | ✅ Approved                         | No third-party SDKs in MVP.                                                                                                                  |
| D9  | ✅ Approved                         | Admins are regular users with `is_admin=true`, RLS-gated; not a separate DB role.                                                            |
| D10 | ✅ Approved                         | PIPEDA mapping is a draft, not legal advice. Action: budget a Canadian privacy-lawyer consult before Cycle 7.                                |

## Steve's security decisions (S1–S8)

All eight **✅ Approved**, Steve's review notes left as-is:

- **S1** — Invite token 12+ chars (~62 bits), bcrypt cost-10, floor 10.
- **S2** — Rate-limit invite verification 10/min/IP.
- **S3** — Sanitize/cap `pickup_text` (280) & `contact_handle` (64), plain-text render, reject URLs, warn claimants.
- **S4** — PRIVATE Storage bucket, 1h signed URLs, never public.
- **S5** — `delete_my_account()` single transaction + `FOR UPDATE` lock.
- **S6** — `cron_log` table + alert on consecutive prune failures.
- **S7** — Stay on AsyncStorage for MVP; disclose unencrypted-at-rest risk; prominent sign-out; SecureStore as v2 path.
- **S8** — `verification_log` append-only at RLS; Sky-only SELECT.

## Open questions (Q1–Q4)

- **Q1** — OTP-required at signup (in addition to admin verification).
- **Q2** — Explicit city/region dropdown (not auto-derived from postal prefix).
- **Q3** — Multi-language deferred to post-v1; Quinn + Casey scope the roadmap with community input on language order.
- **Q4** — Auto-suspend inactive verification admins; Steve to draft the exact threshold (~30 days starting point) + reinstatement flow.

## Files changed

- `PRIVACY.md` — status header flipped to APPROVED; D1 & D2 marked EDITED with Sky's notes; D3–D10 checkboxes ticked; new "Sky's decisions on S1–S8" tracking checklist added; Q1–Q4 answers recorded in the open-questions section; approval-process tracker updated.
- `CLAUDE.md` — status line updated to "PRIVACY.md APPROVED — locked 2026-05-23" and Phase 0b unlocked.
- `qa-reports/2026-05-23_spec-cycle-1-auth-gate.md` — "Blocking on Sky's approval" flipped to "READY — schema lockable"; confirmed open-question answers noted.
- `qa-reports/2026-05-23_security-privacy-review.md` — unchanged (all S items approved; notes left as-is per process).
- `qa-reports/decisions-applied-2026-05-23.md` — this log (new).

## Build verification (post-edit)

```
typecheck:    ✅ tsc --noEmit clean
test:         ✅ 51 passed, 6 suites
lint:         ✅ eslint clean
format:check: ✅ prettier clean
```

## Follow-ups carried out of this approval (for Dana / Steve / Quinn / Casey in Cycle 1)

- Dana: write `supabase/schema.sql` from the approved model — including the D1/D2 "no real names" enforcement (handle generator + `contact_handle` validation), S1 token format, S4 private bucket RLS, S5 atomic delete RPC, S6 `cron_log`, S8 append-only `verification_log`.
- Steve: draft the Q4 inactive-admin auto-suspend threshold + reinstatement flow.
- Quinn + Casey: scope the Q3 multi-language roadmap.
- Sky (pre-Cycle 7): line up the D10 Canadian privacy-lawyer consult.

## Next move

Kick off Cycle 1: run `/orchestrator` with `~/ClaudeCorp/prompts/per_project/mutualmesh_kickoff.md`.
