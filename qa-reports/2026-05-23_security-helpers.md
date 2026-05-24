# Helper-library security & robustness audit — Steve + Gary — 2026-05-23

## Summary

Reviewed the three pure helper libraries landed in Loop 5 (`verification.ts`, `contactHandle.ts`, `resourcesRealtime.ts`) plus their tests. Found two real edge-case issues; both fixed in-loop. Tests expanded from 43 to 47. All findings are within Steve's "safely fixable" lane (Constitution Art. 5).

## Findings + fixes

### F1: `contactHandle.URL_PATTERN` missed dangerous schemes (FIXED)

**Issue:** The original `/(https?:\/\/|www\.)/i` regex caught `http://` and `https://` and `www.` but missed:

- `javascript:alert(1)` — XSS vector if ever rendered by code that auto-links text
- `data:text/html,<script>` — XSS vector
- `vbscript:msgbox` — XSS vector (legacy)
- `tel:+155501100` — defeats the "handle, not a link" rule; should be bare phone
- `mailto:me@example.com` — defeats the rule; should be bare email
- `file:///etc/passwd` — defense in depth

**Why it matters:** React Native `<Text>` is escape-safe and won't auto-link by default — but a future feature (web share, copy-to-clipboard preview, chat in v2) could change that. We reject these at the validation layer so the handle never enters the database with a dangerous payload.

**Fix:** Updated regex to `/(https?:|javascript:|data:|vbscript:|tel:|mailto:|file:|www\.)/i`. Six new test cases added in `contactHandle.test.ts`.

### F2: `sortByNewest` could produce undefined sort order on invalid dates (FIXED)

**Issue:** `Date.parse('not-a-date')` returns `NaN`. The comparator `tb - ta` with NaN returns NaN, and per ECMAScript spec a NaN comparator return is **undefined behavior** (engines may stable-sort or may not). A malicious or buggy producer of `created_at` could trigger inconsistent ordering across renders.

**Fix:** Coerce NaN → 0 in a `safeParse` helper. Invalid dates sort to the end (same as undated rows). One test added.

## Other findings (advisory, no fix needed yet)

### A1: `verification.ts` strict-equality check is correct and load-bearing

The `if (input.isVerified === true)` check refuses to route to home for any non-strictly-true value. This is deliberate — if `isVerified` arrives as `"true"` (string) or `1` from a malformed Supabase response, we refuse to optimistically expose data. Existing tests cover this. Don't loosen.

### A2: `applyResourceDelta` returns same reference on no-op

`applyResourceDelta(state, INSERT-of-existing-id) === state` (reference equality). This matters for React rerender behavior: if a stale event arrives, the subscriber's `setState` call gets the same reference and React skips re-rendering. Don't change this contract without updating callers.

### A3: Phone classification false positives are harmless

`classifyContactHandle('((((((((')` returns `'phone'` because the regex matches `[\d\s\-()]{7,}`. This is only used to pick an icon for display, not for validation. Acceptable false positive.

### A4: 64-char `MAX_CONTACT_HANDLE_LENGTH` may be too short for some XMPP / Matrix handles

Matrix user IDs can run to 255 chars (`@user:matrix.example.org`). Steve flags but doesn't recommend changing in MVP — XMPP/Matrix users can fit in 64 chars by truncating the homeserver to a short form. Revisit if real users report it's too tight.

## Test coverage after this loop

```
Test Suites: 4 passed, 4 total
Tests:       47 passed, 47 total
```

Breakdown:

- `errors.test.ts`: 9
- `verification.test.ts`: 6
- `contactHandle.test.ts`: 18 (+8 from this loop)
- `resourcesRealtime.test.ts`: 14 (+1 from this loop)

## DECISIONS FOR SKY

None. All changes are local and reversible (Constitution Art. 5).

## FAIL_FAST / BLOCKER states

None.

## What I shipped

- `src/lib/contactHandle.ts` — URL_PATTERN tightened
- `src/lib/resourcesRealtime.ts` — sortByNewest defensive NaN handling
- `src/__tests__/contactHandle.test.ts` — +8 tests
- `src/__tests__/resourcesRealtime.test.ts` — +1 test
- This audit report

## What's next

Helpers are foundation-ready. Loop 7 (Shamus stub screens) consumes them. The Supabase-integration layer (`src/lib/resources.ts`, `auth.tsx`) lands in Phase 0b after Sky approves PRIVACY.md.
