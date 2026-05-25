# Dana Type Sync — Cowork Run — 2026-05-24

Invoked by: Cowork session (Morgan briefing 2026-05-24)
Operator: Claude (Cowork)
Date: 2026-05-24

## Branch: data/sync-types-mig-002-009-2026-05-24

Commit: f216b6d
Based on: main @ 6a44bcc
Typecheck: PASS (tsc --noEmit, 0 errors)
Shamus Phase 2/3 UI breakage: NONE detected

## Delta applied this run

Section A only — VerificationDecision += 'demote' (Mig 002)

File: src/types/database.ts
Change: 'approve' | 'reject' | 'escalate' -> 'approve' | 'reject' | 'escalate' | 'demote'

## Sections already present (no action needed)

Sections B-F were already applied by prior sessions before this run:

Section A (ResourceStatus, ResourceCategory): present
Section B (UserRow.onboarding_complete, UserRow.push_preferences, PushPreferences): present
Section C (ResourceRow.category, confirmed_at, confirmed_by, ResourceStatus): present
Section D (ErrorReportRow type + error_reports table): present
Section E (PushTokenRow type + push_tokens table): present
Section F (confirm_pickup, complete_onboarding, register_push_token,
revoke_push_token, update_push_preferences, log_error RPCs): present

## Notes on shape differences vs Dana proposal

PushPreferences uses flat keys (on_claim, on_pickup, on_approve, on_reject)
rather than Dana's proposed nested triggers object. This reflects the actual
implementation by prior sessions; changing it would break existing Shamus UI
code. Left as-is per the "stop if Shamus Phase 2/3 breaks" gate.

ErrorReportRow uses 'count' (not 'occurrences') and omits 'first_seen_at'.
Same rationale — implementation already shipped; type matches the actual
migration body.

PushTokenRow.platform is typed as 'string' (not the union 'ios'|'android'|'web').
Additive tightening deferred; not in approved scope for this run and would
require verifying all call sites.

## Result

database.ts is now fully in lockstep with migrations 002-009.
Typecheck canary is green. Safe to merge.
