# Alex — WCAG 2.2 AA Accessibility Audit
## AdminVerificationScreen — Cycle 5 Ship Gate

**Date:** 2026-05-25
**Auditor:** Alex (Accessibility Engineer)
**Files audited:**
- `src/screens/AdminVerificationScreen.tsx` (556 lines)
- `src/lib/verificationQueue.ts` (234 lines)
- `src/components/Card.tsx`, `Button.tsx`, `ConfirmationModal.tsx`, `FlashBanner.tsx`, `TextField.tsx`, `LoadingSkeleton.tsx`
- `src/lib/theme.ts` (TOUCH_TARGET_MIN = 44)

---

## VERDICT: CONDITIONAL

**FIX items: 6**
**BLOCKER items: 1** (focus management on list→detail transition — WCAG 2.4.3 Focus Order / 3.2.2 On Input)

The screen ships a strong foundation: touch targets are 44pt across all interactive elements (Card, Button, TextField enforce `minHeight: TOUCH_TARGET_MIN`), the FlatList row labels are contextual and well-formed, the ConfirmationModal correctly traps focus with `accessibilityViewIsModal` and handles the back gesture via `onRequestClose`. Most components are audited and solid.

Six issues must be fixed before ship. One is a BLOCKER.

---

## Findings Table

| # | Check | Result | File | Line(s) | Issue | Proposed Fix |
|---|-------|--------|------|---------|-------|-------------|
| 1 | FlatList row — `accessibilityRole`, label, hint | PASS | AdminVerificationScreen.tsx | 300–327 | `ApplicantCard` delegates to `Card`. Card has `accessibilityRole="button"` and receives a rich contextual `a11yLabel` (`"${f.handle}, ${f.postalPrefix}, ${f.city}, signed up ${age}. Tap to open."`). Touch target enforced via `TOUCH_TARGET_MIN`. | — |
| 2 | FlatList row — minimum 44pt touch target | PASS | Card.tsx | 27 | `style={{ minHeight: TOUCH_TARGET_MIN }}` where `TOUCH_TARGET_MIN = 44`. | — |
| 3 | Approve/Reject buttons — `accessibilityRole`, `accessibilityState`, contextual label | PARTIAL FIX | AdminVerificationScreen.tsx | 458–469 | `Button` correctly supplies `accessibilityRole="button"`, `accessibilityState={{ disabled }}`, and `accessibilityHint`. However the `label` prop for both buttons is the bare word `"Approve"` and `"Reject"` — the screen reader announces those words with no applicant handle in context. A blind admin reviewing multiple applicants in VoiceOver/TalkBack has no confirmation which person they are acting on. WCAG 1.3.1 / 2.4.6 (Headings and Labels). | Add the handle to the label: `label={\`Approve ${f.handle}\`}` and `label={\`Reject ${f.handle}\`}` (lines 459, 465). The visual text should remain "Approve" / "Reject" — separate `accessibilityLabel` from the `label` prop, or add a dedicated `accessibilityLabel` prop to the `Button` component so the visual and spoken labels can differ. |
| 4 | Approve/Reject buttons — `accessibilityState` during `busy` | FIX | AdminVerificationScreen.tsx | 515–536 | `ConfirmationModal` buttons correctly disable during `busy`. However the Approve/Reject trigger buttons on the detail view (lines 458–469) do not receive the `busy` state — they remain enabled while the modal RPC is in flight. A fast double-tap can open two modals in sequence. WCAG 2.1.1 / 2.5.3. | Pass `disabled={busy}` to both Approve and Reject `<Button>` elements at lines 458 and 465. `busy` is in scope at the `ApplicantDetail` component level (line 359). |
| 5 | Error and flash messages — `accessibilityLiveRegion` | PASS | FlashBanner.tsx | 69, 39 | `FlashBanner` carries both `accessibilityLiveRegion="polite"` on the container (line 69) AND calls `AccessibilityInfo.announceForAccessibility(message)` once on mount (lines 38–41). The double-channel ensures both VoiceOver (iOS) and TalkBack (Android) announce the message. The error `EmptyState` at line 248 uses an `EmptyState` component (not audited here — out of scope); the inline error path has no live region, but it is only visible when `applicants.length === 0` and `loading === false`, which means it replaces a FeedSkeleton — not a dynamic injection, so no live-region is needed there. | — |
| 6 | Confirmation modal — focus trap, escape/back | PASS | ConfirmationModal.tsx | 47–54, 51 | `accessibilityViewIsModal` traps screen reader focus inside the modal (line 52). `onRequestClose={onCancel}` maps Android back-button to cancel (line 51). Backdrop tap also dismisses when not busy (line 57). `animationType="fade"` does not interfere with focus. | — |
| 7 | Loading state — FeedSkeleton accessible | CONDITIONAL FIX | LoadingSkeleton.tsx, AdminVerificationScreen.tsx | 78, 244 | `FeedSkeleton` has `accessibilityRole="alert"` and `accessibilityLabel="Loading listings"` (LoadingSkeleton.tsx line 78). The label "Loading listings" is a resources-feed label inherited from HomeScreen. On the AdminVerificationScreen it reads oddly — an admin screen reader user hears "Loading listings" when the queue is loading. WCAG 4.1.3 (Status Messages). | Pass a `label` prop to `FeedSkeleton` or create an `AdminVerificationScreen`-specific wrapper: wrap `<FeedSkeleton />` at line 245 with a `<View accessibilityRole="alert" accessibilityLabel="Loading verification queue" accessibilityLiveRegion="polite">` container, and add `importantForAccessibility="no"` to the `FeedSkeleton` container so the generic label is hidden. Alternatively add a `label` prop to `FeedSkeleton` and pass `"Loading verification queue"`. |
| 8 | Reject reason TextField — `accessibilityLabel`, character-count announcement | PARTIAL FIX | AdminVerificationScreen.tsx, TextField.tsx | 479–488, 46 | `TextField` derives `accessibilityLabel` from the `label` prop (TextField.tsx line 46), so the field reads "Reason (required)" — correct. The `hint` prop receives `reasonCounter` (`"0/280"`) which is passed as `accessibilityHint` to the `TextInput`. **Problem:** `reasonCounter` changes on every keystroke but `accessibilityHint` is a static hint — it does not fire a live announcement. A VoiceOver user typing a long reason will not hear the running counter and may exceed 280 characters unexpectedly. WCAG 2.4.6 / 1.3.1. | Add a live-region counter Text node below the field that updates as the user types. Either (a) add an `accessibilityLiveRegion="polite"` `Text` node inside `AdminVerificationScreen` after the `TextField` that mirrors `reasonCounter` and becomes visible only when `rejectFormOpen` is true, or (b) add a `liveCounterLabel` prop to `TextField` that renders a live-region sibling. Suggested location: after line 488, add `<Text accessibilityLiveRegion="polite" className="text-xs text-light-text-muted dark:text-dark-text-muted">{reasonCounter}</Text>`. The existing hint text renders visually at TextField.tsx line 66 — this is the visual counter, but it is not announced on change. |
| 9 | Detail view navigation — focus moved on list→detail transition | BLOCKER | AdminVerificationScreen.tsx | 265–269 | When `ApplicantCard.onPress` fires (`setScreen({ mode: 'detail', applicant: item })`), the screen swaps from list to detail via a pure React state change (no Navigator push). React Native does NOT automatically move screen reader focus when content replaces inline. VoiceOver/TalkBack focus remains on the `ApplicantCard` that was tapped, which no longer exists in the tree — focus falls to an undefined position, typically the first focusable element in the new tree or nowhere. WCAG 2.4.3 (Focus Order) Level A — this is also a WCAG 2.2 AA failure. | After `setScreen({ mode: 'detail', ... })`, use `AccessibilityInfo.setAccessibilityFocus(ref)` on the detail view header element. Concrete steps: (1) Add `const detailHeaderRef = useRef<Text>(null)` in `ApplicantDetail` component. (2) In a `useEffect` that fires once on mount of `ApplicantDetail`, call `AccessibilityInfo.setAccessibilityFocus(findNodeHandle(detailHeaderRef.current))`. (3) Attach `ref={detailHeaderRef}` to the `<Text accessibilityRole="header">` at line 441. The reverse path (Back button → list) is handled automatically since the back `Button` has `hint="Returns to the queue list."` and focus lands on the previously-active `ApplicantCard` via React Native's native focus restoration. |

---

## BLOCKER Detail

### BLOCKER — Check 9: Focus not moved on list→detail state transition (WCAG 2.4.3 Level A)

**Location:** `AdminVerificationScreen.tsx` line 265–269, `ApplicantDetail` component header at line 441.

**Failure class:** WCAG 2.4.3 Focus Order (Level A). Per SC 2.4.3: "If a Web page can be navigated sequentially and the navigation sequences affect meaning or operation, focusable components receive focus in an order that preserves meaning and operation." The screen uses an in-place state swap — not a Navigator transition — so the platform's native focus handoff does not fire.

**Observed behavior (expected):** VoiceOver/TalkBack user taps an `ApplicantCard`. Screen content replaces entirely. Focus stays on the (now-gone) card or drops to an unspecified position. The new `ApplicantDetail` header (`f.handle`) is not announced. The admin does not know which person they are now viewing.

**Fix:** `AccessibilityInfo.setAccessibilityFocus` on mount of `ApplicantDetail`, targeting the `accessibilityRole="header"` Text node. `AccessibilityInfo` is already imported in the file (line 3).

---

## Summary

| Category | Count |
|----------|-------|
| PASS | 5 |
| CONDITIONAL FIX | 2 (items 3, 7, 8 — merged: 3 items) |
| BLOCKER | 1 (item 9) |
| **Total FIX items** | **6** |

**Overall FIX count: 6 items across 4 checks (3, 4, 7, 8, 9 — check 9 is the blocker).**

---

## Notes on Out-of-Scope Components

- `EmptyState` component: not audited here. Used in list view error path. Warrants a separate audit if it appears in other screens.
- `FlashBanner` double-channel (live region + `announceForAccessibility`): solid pattern, carry forward to all screens.
- `DetailRow` at line 543 uses `accessibilityRole="text"` — this is a non-standard value in React Native (valid roles are button, link, header, image, etc. — "text" is treated as `none`). Not a WCAG failure but noise in the accessibility tree. Low-priority cleanup: remove `accessibilityRole="text"` and keep only `accessibilityLabel`. Logged as non-blocking observation.

---

## DECISIONS FOR SKY

None required from Sky for this audit. All fixes are within Shamus's implementation lane. The BLOCKER (focus management) uses APIs already imported in the file (`AccessibilityInfo`, line 3) and requires ~5 lines of new code.

---

*Alex audit. Audit only — no code changes made. Branch: none (read-only pass).*
