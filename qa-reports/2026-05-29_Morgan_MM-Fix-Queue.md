# MutualMesh QA Fix Queue — 2026-05-29

## Status: QUEUED — waiting on migrations 012-014 apply + 7-branch merge wave

**Total findings:** 41 | **Fixable:** 32

---

## Per-Domain Summary

| Domain | Severity | Findings | Fixable | Branch | Status |
|--------|----------|----------|---------|--------|--------|
| Accessibility | medium | 6 | 4 | `alex/a11y-overhaul-2026-05-29` | QUEUED |
| Security | medium | 3 | 3 | `steve/security-overhaul-2026-05-29` | QUEUED |
| Performance | medium | 7 | 4 | `peter/perf-overhaul-2026-05-29` | QUEUED |
| Privacy | medium | 6 | 4 | `jordan/privacy-overhaul-2026-05-29` | QUEUED |
| Testing | high | 10 | 8 | `gary/test-overhaul-2026-05-29` | QUEUED |
| Code Quality | medium | 9 | 8 | `shamus/code-overhaul-2026-05-29` | QUEUED |

---

## CRITICAL Items

### Accessibility — Dark-mode contrast failures (WCAG 1.4.3 AA fail)

**F-001 & F-002: StatusPill variants**
- **File:** `src/components/StatusPill.tsx`
- **Issue:** Reserved (contrast 2.89:1) and Completed (2.25:1) fail minimum 4.5:1 ratio
- **Fix:** Lighten text or darken background in dark mode for both variants
- **Branch:** `alex/a11y-overhaul-2026-05-29`

**F-003: FlashBanner all variants**
- **File:** `src/components/FlashBanner.tsx`
- **Issue:** Success, warning, error, info all below 4.5:1 in dark mode
- **Fix:** Unified color palette adjustment across all four variants
- **Branch:** `alex/a11y-overhaul-2026-05-29`

### Privacy — Unfiltered contact_handle exposure

**PRIV-1: getResourceById() over-selects**
- **File:** `src/lib/resources.ts`
- **Issue:** `select('*')` returns `contact_handle` to all verified users; only org admins should see it
- **Fix:** Replace `select('*')` with explicit column list, exclude `contact_handle` for non-admin queries
- **Branch:** `jordan/privacy-overhaul-2026-05-29`
- **Severity:** HIGH — data exposure

### Testing — Privacy-critical error path uncovered

**E1: logError() opt-out not tested**
- **File:** `src/lib/errorReporting.ts:352-353`
- **Issue:** Early exit when `optedIn=false` never exercised; privacy-critical path
- **Fix:** Add unit test asserting `logError()` returns early and does not POST when opted out
- **Branch:** `gary/test-overhaul-2026-05-29`

**E2: logError() network failure uncovered**
- **File:** `src/lib/errorReporting.ts:380-391`
- **Issue:** `fetch` throw path untested; error swallowing behavior unvalidated
- **Fix:** Mock fetch to throw and assert no unhandled rejection
- **Branch:** `gary/test-overhaul-2026-05-29`

---

## HIGH Items

### Testing — Error handling edge cases

| ID | File | Issue | Fix |
|----|----|----|----|
| E3 | `src/lib/errorReporting.ts:374-375` | Missing `EXPO_PUBLIC_SUPABASE_ANON_KEY` edge case; ternary in Authorization header may fail | Add test for missing env var; ensure graceful fallback or explicit error |

### Performance — Unmemoized re-renders

| ID | File | Issue | Fix |
|----|----|----|----|
| PERF-001 | `src/screens/HomeScreen.tsx` | ResourceCard not memoized; FlatList re-renders all on parent state change | Wrap with `React.memo()` |
| PERF-002 | `src/screens/AdminVerificationScreen.tsx` | ApplicantCard not memoized; same issue | Wrap with `React.memo()` |

---

## MEDIUM Items

### Security — Pending migrations (apply gate)

| ID | File | Issue | Status |
|----|----|----|----|
| S-013 | `supabase/migrations/013_verification_log_fix.sql` | FK constraint change `CASCADE → SET NULL` on `verification_log.applicant_id` | **PENDING APPLY** — awaits Sky approval |
| S-012 | `supabase/migrations/012_push_rate_limit.sql` | `increment_push_rate_limit()` is SECURITY DEFINER; privilege check missing | **PENDING APPLY** — awaits Steve sign-off |

### Code Quality — Dead code & direct RPC calls

| ID | File | Issue | Fix |
|----|----|----|----|
| SH-1 | `src/screens/ResourceMapScreen.tsx:62` | Dead code: `const MAP_LIBRARY_INSTALLED = true`; conditional never used | Delete unused variable and dead branch |
| SH-2 | `src/screens/AdminVerificationScreen.tsx` | Direct `supabase.from('users').select(...).eq(...).limit(500)` query in `fetchQueue` | Extract to lib function for reusability & testability |
| SH-3 | `src/screens/AdminVerificationScreen.tsx:372` | Direct `supabase.rpc('approve_user', ...)` and `reject_user()` calls | Extract to lib RPC wrappers |

### Privacy — Documentation gaps

| ID | File | Issue | Fix |
|----|----|----|----|
| PRIV-2 | `supabase/schema.sql` | PRIVACY.md D7 promises 90-day retention for verification logs; schema comment says 30 | Align schema & PRIVACY.md; add retention policy trigger if not present |
| PRIV-3 | `supabase/schema.sql:381` | `delete_my_account()` comment says "Storage objects cleaned up by separate job"; no job exists | Either implement cleanup job or update comment to reflect manual/operational model |

### Performance — Dependency array clarity

| ID | File | Issue | Fix |
|----|----|----|----|
| PERF-003 | `src/screens/AdminVerificationScreen.tsx` | `fetchQueue` callback has empty dependency array; no comment explaining why stable | Add inline comment: `// fetchQueue is stable across renders; dependencies intentionally empty` |

---

## Sky Actions Required Before Fix Wave

1. **Approve migrations 012-014** — Steve's security overhaul depends on these applying first. Verify you've reviewed S-013 & S-012 changes with Steve.
2. **Confirm PRIVACY.md intent on retention** — PRIV-2 flags conflict between D7 promise (90 days) and schema (30 days). Which is binding?
3. **Clarify Storage cleanup model** — Is Storage deletion manual, scheduled, or part of `delete_my_account()`? Document in PRIVACY.md so future audits don't flag it.

---

## Merge Wave Sequence

Once Sky approves migrations & clarifications:

1. Apply migrations 012, 013, 014 (Steve to confirm each)
2. Merge in order: `steve/security-overhaul` → `jordan/privacy-overhaul` → `peter/perf-overhaul` → `alex/a11y-overhaul` → `gary/test-overhaul` → `shamus/code-overhaul`
3. Run full test suite post-merge
4. Re-run audit on `main` to confirm fix

---

## Notes

- **PRIV-1 (contact_handle)** is the highest-risk finding — data exposure to non-admins. Prioritize `jordan/privacy-overhaul` in merge wave.
- **E1 & E2 (error reporting)** are privacy-critical tests. Gary's branch must land before any production error logging is live.
- **Migrations 012-014** are on Steve's branch but not yet applied. Sequencing: apply → test locally → merge → re-apply on main.
