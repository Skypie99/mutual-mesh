# Mutual Mesh — Learnings

Durable patterns, recipes, and gotchas. Append-only. Each entry is dated. Each entry should be useful to someone reading it cold months from now.

Mirror the AccessMap LEARNINGS.md style: dated headers, ~3–4 paragraphs each, concrete recipes with file paths.

---

## 2026-05-23 — Phase 0a toolchain stack & two fixes worth remembering

The Day-0 scaffold landed with Expo SDK 54 + React Native 0.81.5 + React 19.1 + Supabase JS 2.45 + NativeWind 4 + Jest 29 + TS 5.9 + ESLint 8 + Prettier 3, mirroring AccessMap's tested versions. Two non-obvious pieces had to be patched live before `npm test && npm run typecheck && npm run lint && npm run format:check` was green end-to-end:

**(1) `react-native-worklets` is a required dev-dep for Jest on RN 0.81+.** The `babel-preset-expo` chain transitively requires `react-native/jest/react-native-env.js`, which in turn requires `react-native-worklets/plugin`. Without it, every `npm test` invocation fails with `Cannot find module 'react-native-worklets/plugin'` even if your code has no animations. Fix: `npm install --save-dev react-native-worklets --legacy-peer-deps`. Do not assume worklets is only needed by reanimated — removing reanimated does **not** drop the requirement, because RN itself reaches for it.

**(2) `eslint-config-expo` is incompatible with `@typescript-eslint` v8.** The `expo` preset references `@typescript-eslint/ban-types`, a rule removed in v8 of the TS-ESLint stack. Result: every TS/TSX file fails lint with "Definition for rule '@typescript-eslint/ban-types' was not found". Fix: drop `eslint-config-expo` and use a leaner stack: `eslint:recommended` + `plugin:@typescript-eslint/recommended` + `plugin:react/recommended` + `plugin:react-hooks/recommended`. See `.eslintrc.json` for the working config. Revisit if/when `eslint-config-expo` ships a v8-compatible release.

**Toolchain commands** (from repo root, after `npm install --legacy-peer-deps`):

```bash
npm run typecheck     # tsc --noEmit              — green
npm test              # jest                       — 9/9 passing
npm run lint          # eslint . --ext .ts,.tsx    — clean
npm run format:check  # prettier --check ...       — clean
npm run format        # prettier --write ...       — auto-fix
```

CI runs all four on every PR (see `.github/workflows/ci.yml`). The `--legacy-peer-deps` flag is required because of the React-version pin (Expo SDK 54 pins React 19.1, while some libs want 19.2+).

---

## 2026-05-23 — Pure-helper split (verification, contactHandle, resourcesRealtime)

Three foundational helpers landed before any Supabase wiring. All are PURE — no side effects, no SDK imports. This is the AccessMap pattern from `flagsRealtime.ts`: split the channel adapter from the merge logic so the merge can be unit-tested with plain JS objects.

**The pattern:**

- `src/lib/verification.ts` — `routeForGate({ session, isVerified })` returns `'sign-in' | 'wait' | 'home'`. Strict `=== true` check on `isVerified`; null defaults to `'wait'` (never optimistically expose).
- `src/lib/contactHandle.ts` — `validateContactHandle(input)` returns `{ ok: true } | { ok: false, reason }`. URL_PATTERN rejects `https?:`, `javascript:`, `data:`, `vbscript:`, `tel:`, `mailto:`, `file:`, and `www.` prefixes — Steve loop-6 hardening.
- `src/lib/resourcesRealtime.ts` — `applyResourceDelta(state, event)` returns a new array (or same ref on no-op for React render perf). Handles INSERT/UPDATE/DELETE with idempotency and out-of-order delivery.

**The discipline**: Helpers don't import from `@supabase/supabase-js`. When Phase 0b lands `src/lib/resources.ts`, that file owns the channel subscription and calls these pure helpers on each event. The split keeps test coverage cheap.

47 tests across `errors.test.ts` (9), `verification.test.ts` (6), `contactHandle.test.ts` (18), `resourcesRealtime.test.ts` (14) — all run in <2s with `jest-expo`.

---

## 2026-05-23 — Design tokens with documented contrast ratios

DESIGN.md v1 lists every color token alongside its computed WCAG contrast ratio against its canonical paired background. Alex independently re-computed all 18 pairs using the WCAG sRGB → linear → relative-luminance formula and found two pairs (`light.borderStrong` and `dark.borderStrong`) below the 3:1 non-text minimum. Both replaced (`#A8957D` → `#8B6F4E`; `#5E4A33` → `#8A7659`) and verified to clear AA.

**Recipe for future Dani/Alex passes:** When proposing a token, compute the ratio yourself and put it in DESIGN.md _at the same time you write the hex_. Don't ship "looks right" colors — ship "passes AA with X:1 headroom" colors. The Node one-liner for batch verification lives in `qa-reports/2026-05-23_a11y-tokens.md`.

Mode-pair tokens are sufficient for v1. APCA (the algorithm WCAG 3 is moving toward) is on the Cycle 7 list — current AA-passing pairs may sit closer to APCA thresholds than the WCAG numbers suggest.

---

## 2026-05-23 — Component primitive set + a11y baseline

Built five primitives (Button, TextField, Card, StatusPill, FAB) that every screen consumes. Each one bakes in WCAG 2.5.5 (44pt hit target via `TOUCH_TARGET_MIN`), `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, and `accessibilityState`. The TextField's error message uses `accessibilityLiveRegion="polite"` so screen readers announce validation failures without the user re-focusing.

**The rule baked into Card**: when `onPress` is set, the Pressable variant enforces `minHeight: TOUCH_TARGET_MIN`. When `onPress` is unset, no minimum — non-interactive cards are not targets. This prevents accidental sub-44pt hit boxes without bloating decorative cards.

**Multiline TextField gotcha:** Android defaults multiline TextInput `textAlignVertical` to `'center'`, which puts the caret in the middle of an empty field. We override to `'top'` only when `multiline` is true. iOS already top-aligns; the override is a no-op there.

---

## 2026-05-23 — Navigator orphaned by design until Phase 0b

`src/navigation/RootNavigator.tsx` is wired into `App.tsx` so `npm start` boots into the marketplace feed (mock data). The real Gate logic (`routeForGate` + AuthProvider) is **deliberately not** wired in — that crosses the privacy gate that's blocked until Sky approves PRIVACY.md.

When Phase 0b lands, the wiring is two lines in App.tsx:

```tsx
const route = routeForGate(useAuth());
if (route === 'sign-in') return <SignInScreen onSignIn={...} onSignUp={...} />;
if (route === 'wait') return <WaitingRoomScreen onSignOut={signOut} />;
return <RootNavigator />;
```

The HomeStack inside RootNavigator wires Feed → Detail (push) → AddResource (modal). Tab navigator has HomeTab + ProfileTab. NavigationContainer theme pulls from `colors.light`/`colors.dark` via `useColorScheme()` so react-navigation's chrome (header, tab bar) matches the rest of the design system without a second source of truth.

Glyphs in the tab bar are plain Unicode characters (`◧`, `◉`) because no icon-font dep is installed yet. Phase 0b or Cycle 6 picks one (`react-native-vector-icons` or `@expo/vector-icons`) and replaces.

---

## 2026-05-23 — Push 2: research + community + Cycle 1 spec + threat model + missing primitives

Phase 0a complete + a follow-on push adding the work that wasn't strictly required to ship but is required to ship _well_:

**Research layer.** Riley landed three composite personas (Mara — recipient, Keo — trans organizer, Deb — community poster), two journey maps (Mara claiming, Deb posting), and a cross-persona friction analysis. Top friction: **empty marketplace in early days**, which makes Casey's seed-drive plan load-bearing for retention. See `research/`.

**Community layer.** Casey filled in `community/mission.md`, `onboarding.md`, `growth-strategy.md` with real narrative grounded in Riley's personas. Headline principle: **Mutual Mesh grows by serving small dense networks, not by going broad.** No social-media virality; no paid acquisition; no referral rewards.

**Cycle 1 ready.** Quinn wrote the full spec for the Auth + Verification Gate + Waiting Room cycle (`qa-reports/2026-05-23_spec-cycle-1-auth-gate.md`). When Sky approves PRIVACY.md, Cycle 1 can start without re-spec'ing.

**Threat model.** Steve wrote a STRIDE-style threat model (`qa-reports/2026-05-23_threat-model-stride.md`) covering 21 distinct threats. Three highest residual risks: backup retention (platform-limited, disclosed), handle impersonation (recommend v2 timestamp indicator), credential theft (recommend v2 2FA). All others mitigated to low/negligible with the Jordan v1 + Steve S1-S8 model.

**Five new UI primitives** — `useReducedMotion` hook, `FlashBanner`, `EmptyState`, `LoadingSkeleton` / `FeedSkeleton`, and `ErrorBoundary`. All gate animation on `useReducedMotion`. ErrorBoundary wraps RootNavigator in App.tsx so a render-time crash anywhere shows a friendly fallback instead of a blank screen.

**Pattern locked in: announce-once via mounted-ref.** `FlashBanner` calls `AccessibilityInfo.announceForAccessibility(message)` exactly once on mount (using a `useRef(false)` edge-detector). This is the AccessMap pattern — see qa-reports there too. Any future component that announces something (toast, banner, modal entry) MUST use the same pattern: announce on the false→true transition, not on every render.

**Pattern locked in: skip animation when `useReducedMotion()` is true.** Components animate via `Animated.timing` ONLY when `reducedMotion === false`. When true, the animated value is set directly (no easing). Future contributors: don't try to provide a "lighter" animation when reduce-motion is on. Just skip. The signal is "don't move things at all," not "move them more softly."

**Pattern locked in: NO third-party error tracking.** ErrorBoundary logs to `console.warn` only. No Sentry, no Bugsnag. Per Jordan D8. If we ever need crash analytics, host them ourselves with the same privacy posture as the rest of the data.

Tests: 51 across 6 suites (added `useReducedMotion.test.ts` + `errorBoundary.test.ts` — contract-only since RTL isn't installed; deferred component-level tests to Phase 0b).

---

_Phase 0a + Push 2 complete. Next entries land when Cycle 1 ships post-Sky-approval._
