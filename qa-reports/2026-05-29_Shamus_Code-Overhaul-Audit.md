# Code Quality + Scalability Audit
**Date:** 2026-05-29  
**Author:** Shamus (code quality)  
**Branch:** test/auto-2026-05-28-gary-unit-coverage  
**Proposed fix branch:** shamus/code-overhaul-2026-05-29

---

## Summary

MutualMesh is in excellent shape for a 52-day build. TypeScript `any` usage is effectively zero (2 grep hits, both in comment text — not actual code). Error handling is consistent and thorough. The pure-helper discipline is intact. The main issues are moderate: two screens carry direct Supabase `.from()` / `.rpc()` calls that belong in `src/lib/`, one dead code branch in `ResourceMapScreen`, the admin queue fetch has a magic `500` literal, and the feed + queue have no cursor pagination (acknowledged, Cycle 7 backlog). No critical findings.

---

## 1. TypeScript `any`

**Count:** 0 actual `any` casts in production code.

Grep `": any|as any"` excluding catch/test returns 2 lines — both inside a JSDoc comment in `src/lib/errorReporting.ts` (the text "Silent failure: any network…" and "Default-conservative: anything…"). No `: any` or `as any` in executable TypeScript.

All genuinely-unknown payloads use the correct pattern: `as unknown as TargetType`. This is sound — all three sites are postgrest-js realtime payloads where the SDK returns `RealtimePostgresChangesPayload<{ [key: string]: unknown }>` and a typed cast is unavoidable.

**Verdict:** clean.

---

## 2. Dead Code

### 2a. Dead branch: `MAP_LIBRARY_INSTALLED = true` constant (medium)

`src/screens/ResourceMapScreen.tsx:62` defines `const MAP_LIBRARY_INSTALLED = true`. The `if (!MAP_LIBRARY_INSTALLED)` block at line 236 (approx. 106 lines of JSX) is unreachable at runtime. TypeScript's `--strictNullChecks` will not flag this because it's a `const boolean`, not a type-level narrowing.

The fallback branch was the scaffolding path for "maps not yet installed." The note at line 24 explicitly says react-native-maps IS installed. The dead branch duplicates the full FSA chip UI — a maintenance burden if that UI ever changes.

**Fix:** Remove the `MAP_LIBRARY_INSTALLED` constant and the entire `if (!MAP_LIBRARY_INSTALLED)` block. Retain only the installed-map JSX path (line 347+).

### 2b. `viewMode` state comment contradiction (low)

`ResourceMapScreen.tsx:101` comment says `'list' is the default per Quinn AC-5` but the `useState` initial value is `'map'`. This is a stale comment, not a bug — the component receives a `MapToggle` that handles its own visual state. No behavioral dead code, just misleading documentation.

**Fix:** Correct the comment: `// Initial value 'map' — this screen IS the map screen; list is accessed via onSwitchToList prop.`

### 2c. No other dead code found

No commented-out code blocks, no unreferenced exports in lib, no unused state variables detected. All `eslint-disable` suppressions have accompanying justifications (lazy `require()` for optional native modules — correct use).

---

## 3. Large Components

Files over 300 lines (production only):

| File | Lines | Status |
|---|---|---|
| `src/screens/ResourceMapScreen.tsx` | 703 | See §2a — 106 lines are dead code; effective ~597 |
| `src/screens/AdminVerificationScreen.tsx` | 556 | Acceptable: contains 3 logical sub-components (screen, ApplicantCard, ApplicantDetail) separated by section headers |
| `src/screens/SignInScreen.tsx` | 290 | Borderline; 3 mode-specific render paths in one file |
| `src/screens/OnboardingTourScreen.tsx` | 262 | Fine |

**ResourceMapScreen** is the only true concern, and mostly a consequence of the dead branch (§2a). After removal it drops to ~597 lines but still contains an installed-map branch that duplicates large portions of the chip/center-on-me UI between the two render paths. A `FsaChipList` sub-component extraction would reduce this further — propose-only for now.

**AdminVerificationScreen** at 556 lines is borderline but well-structured. The `ApplicantDetail` function (lines 344–538) is a natural split candidate — it already has its own typed props. Extracting to `src/components/ApplicantDetail.tsx` would drop the screen to ~260 lines. Propose-only.

---

## 4. Business Logic in Components

### 4a. AdminVerificationScreen: direct `.from()` + `.rpc()` (medium)

`src/screens/AdminVerificationScreen.tsx:84-90` contains a direct `supabase.from('users').select(...)` query. Lines 372 and 393 contain `supabase.rpc('approve_user', ...)` and `supabase.rpc('reject_user', ...)` directly in event handlers.

These belong in `src/lib/verificationQueue.ts` (or a new `src/lib/adminActions.ts`). The `verificationQueue.ts` file already owns the pure merge logic for this screen — the Supabase I/O layer should live there too.

The `fetchQueue` function (lines 82–105) and the approve/reject handlers at lines 369–407 are the primary offenders.

**Fix:** Move `fetchQueue` into `src/lib/verificationQueue.ts` as `fetchVerificationQueue(): Promise<AdminApplicantRow[]>`, and add `approveUser(id: string)` / `rejectUser(id: string, reason: string)` wrappers. Screen wires to those.

### 4b. SignInScreen: `consume_invite_token` RPC called directly (low)

`src/screens/SignInScreen.tsx:111` calls `supabase.rpc('consume_invite_token', ...)` directly. The surrounding OTP flow already delegates to `verifyOtp()` from `src/lib/supabase.ts`. This one RPC call was not extracted.

The auth lib (`src/lib/supabase.ts`) has wrappers for all auth operations. `consume_invite_token` should live there (or in a new `src/lib/invites.ts`).

**Fix:** Add `consumeInviteToken(plainToken: string)` to `src/lib/supabase.ts`. Screen calls that instead.

### 4c. Realtime channel subscriptions in hooks/screens (acceptable)

`src/hooks/useResources.ts` and `src/lib/auth.tsx` open Supabase Realtime channels. This is intentional — hooks own their own subscription lifecycle (AccessMap LEARNINGS pattern). `AdminVerificationScreen` opens one channel, which is appropriate because only one instance of that screen exists. Channel cleanup via `supabase.removeChannel()` is correct in all three places.

---

## 5. Error Handling

Pattern is consistent and correct across all screens:
- All async handlers use `try/catch` with typed `userFacingErrorMessage()` calls.
- `mountedRef.current` guards all post-await `setState` calls (AccessMap LEARNINGS pattern).
- `console.warn` used for non-user-surfaced failures (auth profile fetch, push token, signOut) — per CLAUDE.md error handling tiers.
- No bare `.catch()` chains found. No unguarded `void somePromise` without cleanup.
- `ErrorBoundary` component exists as a last-resort for render errors.

One minor note: `src/lib/auth.tsx:171` calls `void supabase.rpc('touch_my_last_active').then(...)` — a `.then()` chain on a `void`ed promise. This is intentional (fire-and-forget last_active ping) but `.catch` is missing; if the RPC fails before `.then()` resolves, the rejection is swallowed silently. The `console.warn` inside `.then()` only handles the Supabase-error-in-data case, not a network-level rejection. This is very low risk (last_active is non-critical) but worth a note.

**Verdict:** solid. One low-severity gap in `touch_my_last_active` rejection handling.

---

## 6. resourcesRealtime.ts Pure-Helper Discipline

The split is fully maintained:

- `src/lib/resourcesRealtime.ts` — pure, no SDK imports, exports `applyResourceDelta` / `applyResourceDeltas`. Confirmed: no `supabase` import.
- `src/hooks/useResources.ts` — owns the channel subscription, calls pure helpers on each event.
- `src/lib/verificationQueue.ts` — same pattern; pure `applyVerificationDelta`, no SDK import.
- The channel adapter (Supabase subscription) lives in the hook/screen layer, not in the pure-helper file.

This discipline is sound and correctly inherited from AccessMap's LEARNINGS.

---

## 7. Scalability

### 7a. Resources feed (medium risk)

`listResources()` in `src/lib/resources.ts` uses `.limit(500)` (the `LIST_LIMIT` constant). The comment acknowledges this: "Cursor pagination is Cycle 7 work." The same cap applies to `listMyPosts()` and `listMyClaims()`.

At 500 resources, the initial render will hydrate a FlatList with 500 items. FlatList is windowed, so render performance is fine, but the network payload + JS serialization for 500 rows may feel sluggish on low-end devices at launch. With photos (URL strings) in each row, 500 rows is roughly 50–150 KB of JSON.

This is a known accepted risk. The `LIST_LIMIT` constant being named (not magic inline) is the right setup for when Cycle 7 cursor pagination ships.

**No immediate action** — but flagging for Cycle 7 prioritization: `listResources` should add cursor pagination first (feed), then `listMyPosts`/`listMyClaims` (profile).

### 7b. Verification queue (high risk at scale)

`AdminVerificationScreen.tsx:90` has `.limit(500)` inline (not via a named constant, unlike `resources.ts`). This is the magic number finding (§9 below).

More importantly: the admin queue query uses **`.order('created_at', { ascending: true })`** which means the oldest 500 unverified users. If > 500 unverified users exist, newer applicants are invisible to admins. This is the correct queue ordering (FIFO), but there's no visible indicator to the admin that they might be seeing a truncated list.

For early launch with invite-gated access, 500 is well beyond any realistic queue depth. At scale (open access or burst) this becomes a real gap.

**Fix (medium priority):** Extract `ADMIN_QUEUE_LIMIT = 500` into `src/lib/verificationQueue.ts`, and add a "showing oldest 500 — load more" affordance when `applicants.length === ADMIN_QUEUE_LIMIT`.

### 7c. Realtime channel count

Three channels open simultaneously at most (user-row per-user, resources-feed global, admin-verification-queue admin-only). Channel names are stable constants:
- `user-row-${uid}` — per-user, cleaned up on session change.
- `resources-feed` — single global channel; only one `useResources` hook instance active at a time (HomeScreen).
- `admin-verification-queue` — admin-only, cleaned up on unmount.

No per-resource channels. No channel proliferation risk. Cleanup via `removeChannel` verified in all three subscriptions.

**Verdict:** channel usage is correct and scalable.

---

## 8. contactHandle.ts Validation

URL_PATTERN from LEARNINGS:2026-05-23:

```
/(https?:|javascript:|data:|vbscript:|tel:|mailto:|file:|www\.)/i
```

Coverage assessment:
- `https:` / `http:` — covered.
- `javascript:` — covered (XSS via auto-link).
- `data:` — covered.
- `vbscript:` — covered.
- `tel:` / `mailto:` — covered (no-link rule).
- `file:` — covered.
- `www.` — covered.

Gaps (low severity, not exploitable in current plain-Text render):
- `ftp://` and `ftps://` not covered. Not an XSS vector with plain `<Text>` but inconsistent with the "handles, not links" rule.
- Unicode homoglyphs in URL prefixes (e.g., `hтtps:` with Cyrillic `т`) are not blocked. Again, not exploitable in plain `<Text>` but relevant if the handle is ever rendered in a context that auto-links.
- `//` (protocol-relative URL) not blocked. Low risk.

Steve's loop-6 audit noted the current set is sufficient for the MVP. These gaps are propose-only additions.

**Verdict:** adequate for current render context. Document the gaps for a future Steve pass when/if handles are rendered in web contexts.

---

## 9. Magic Numbers

| Location | Value | Status |
|---|---|---|
| `src/lib/resources.ts:23` | `const LIST_LIMIT = 500` | Named constant — correct. |
| `src/screens/AdminVerificationScreen.tsx:90` | `.limit(500)` | **Inline magic number.** Should use a named constant from `verificationQueue.ts`. |
| `src/screens/AdminVerificationScreen.tsx:58` | `const REJECT_REASON_MAX = 280` | Named constant in file scope — acceptable, but belongs in `verificationQueue.ts` with the other admin constants. |
| `src/components/FlashBanner.tsx:29` | `autoDismissMs = 4000` | Default prop value — acceptable as named default. |
| `src/components/Toggle.tsx:59-60` | `trackWidth = 48`, `markerSize = 22` | Layout constants — acceptable inline, no business impact. |
| `src/lib/mapHelpers.ts:155` | `threshold = 0.001` | Default parameter — acceptable with comment. |
| `src/screens/ResourceMapScreen.tsx:539` | `resources.slice(0, 3)` | Inline `3` for preview sheet max. Low severity but `PREVIEW_MAX_RESOURCES = 3` would make intent clearer. |

**Primary fix:** Move the inline `500` in `AdminVerificationScreen.tsx:90` to a named constant in `verificationQueue.ts`.

---

## 10. Import Paths

All production imports use the `@/` alias (e.g., `@/lib/supabase`, `@/components/Button`). No relative `../../` paths found in production source. Three `eslint-disable-next-line @typescript-eslint/no-require-imports` suppressed dynamic `require()` calls — all justified (optional native modules loaded lazily).

`tsconfig.json` and `babel.config.js` both configure the `@/` → `src/` alias. Consistent across all source files.

**Verdict:** clean.

---

## Findings Summary

| ID | Severity | File | Description |
|---|---|---|---|
| SH-1 | medium | `ResourceMapScreen.tsx:62` | Dead `MAP_LIBRARY_INSTALLED = false` branch (~106 lines unreachable) |
| SH-2 | medium | `AdminVerificationScreen.tsx:84` | Direct `supabase.from('users')` query in component — move to `verificationQueue.ts` |
| SH-3 | medium | `AdminVerificationScreen.tsx:372,393` | Direct `supabase.rpc` approve/reject calls in component — move to lib |
| SH-4 | medium | `AdminVerificationScreen.tsx:90` | Magic `500` limit inline — no named constant, no truncation warning to admin |
| SH-5 | low | `SignInScreen.tsx:111` | Direct `supabase.rpc('consume_invite_token')` in screen — move to `src/lib/supabase.ts` |
| SH-6 | low | `auth.tsx:171` | `void supabase.rpc(...).then()` missing `.catch()` — rejection silently swallowed |
| SH-7 | low | `ResourceMapScreen.tsx:101` | `viewMode` comment says `'list'` is default but initial value is `'map'` |
| SH-8 | low | `ResourceMapScreen.tsx:539` | Inline `3` for preview max — minor magic number |
| SH-9 | low | `contactHandle.ts:23` | `ftp://`, `//`, unicode homoglyph URLs not blocked — low risk in current plain-Text render |

**Fixable this sprint:** SH-1 through SH-8 (8 of 9). SH-9 is propose-only pending Steve review.

---

## DECISIONS FOR SKY

None. All findings are within Shamus's authority to propose. No privacy, security, or DB changes required.

---

## Proposed Branch: `shamus/code-overhaul-2026-05-29`

1. **SH-1:** Remove `MAP_LIBRARY_INSTALLED` constant and dead fallback branch from `ResourceMapScreen.tsx`.
2. **SH-2/3:** Extract `fetchVerificationQueue()`, `approveUser()`, `rejectUser()` to `src/lib/verificationQueue.ts`. Update `AdminVerificationScreen` to call them.
3. **SH-4:** Add `ADMIN_QUEUE_LIMIT = 500` to `verificationQueue.ts`; use in screen fetch; add a visible "showing oldest 500" note when list is at capacity.
4. **SH-5:** Add `consumeInviteToken(token: string)` to `src/lib/supabase.ts`. Update `SignInScreen`.
5. **SH-6:** Add `.catch(() => { /* fire-and-forget — swallow */ })` to `touch_my_last_active` call.
6. **SH-7:** Fix stale `viewMode` comment.
7. **SH-8:** Add `const PREVIEW_MAX = 3` constant near usage in `FsaPreviewSheet`.
