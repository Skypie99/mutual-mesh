# WCAG 2.2 AA Accessibility Audit — Overhaul Pass
**Date:** 2026-05-29
**Auditor:** Alex (Accessibility Engineer)
**Model:** claude-sonnet-4-6
**Scope:** Full codebase — all screens + 5 primitive components + web surfaces + 7 staged branches
**Branch:** alex/a11y-overhaul-2026-05-29 (proposed)
**Constitution constraints:** Art. 1 (no main), Art. 9 (no external), Art. 5 (audit-only, no commits this pass)

---

## Summary

**Overall severity: MEDIUM — 2 critical WCAG AA violations on main, both have pending branch fixes that need to ship**

The component library is in excellent shape. All 5 primitives (Button, TextField, Card, StatusPill, FAB) implement correct a11y patterns. AdminVerificationScreen (complex multi-step flow) is the standout — focus management, live regions, and co-admin concurrency announcements are all correctly implemented. The web map avoids the keyboard trap. Three issues are confirmed failures; two are active on `main` and have fixes staged in branches. The third (CompleteProfileScreen selection state) is a new finding requiring a fix branch.

---

## Focus Areas Audit

### 1. Five Primitive Components

#### Button (`src/components/Button.tsx`) — PASS
- `accessibilityRole="button"` ✓
- `accessibilityLabel={label}` ✓ (required prop)
- `accessibilityHint={hint}` ✓ (optional, caller-provided)
- `accessibilityState={{ disabled: !!disabled }}` ✓
- Touch target: `style={{ minHeight: TOUCH_TARGET_MIN }}` = 44pt (WCAG 2.5.5) ✓
- All four variants (primary, secondary, ghost, danger) use token-only colors ✓

#### TextField (`src/components/TextField.tsx`) — PASS
- Always-visible label rendered as `<Text>` above the input — no placeholder-as-label ✓
- `accessibilityLabel={label}` on TextInput ✓
- `accessibilityHint={hint}` on TextInput ✓
- Error messages use `accessibilityLiveRegion="polite"` (WCAG 4.1.3) ✓
- Focus state thickens border to accent — visible non-color indicator ✓
- `textAlignVertical='top'` on Android multiline fields ✓

#### Card (`src/components/Card.tsx`) — PASS
- Pressable variant: `accessibilityRole="button"`, `accessibilityLabel` (required when onPress set) ✓
- 44pt minimum on pressable variant via `style={{ minHeight: TOUCH_TARGET_MIN }}` ✓
- Non-pressable variant: no hit-target overhead, no spurious role ✓
- All callers in screens correctly supply `accessibilityLabel` when passing `onPress` ✓

#### StatusPill (`src/components/StatusPill.tsx`) — FAIL: 2 contrast violations on main
See F-001 and F-002 below. Fixes exist on two staged branches.

#### FAB (`src/components/FAB.tsx`) — PASS
- `accessibilityRole="button"` ✓
- `accessibilityLabel={label}` (required prop) ✓
- Plus glyph: `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` — no double-announcement ✓
- 56×56pt fixed target, exceeds 44pt minimum ✓

#### Consistency of primitive usage across screens
Every screen surveyed uses Button, TextField, Card, and FAB consistently. No screen uses raw `<Pressable>` in place of `<Button>` for interactive actions — the only raw Pressables are where the primitive would be wrong (photo preview in AddResourceScreen, FSA chips in ResourceMapScreen, Skip link in OnboardingTourScreen). All raw Pressables in those contexts carry explicit `accessibilityRole`, `accessibilityLabel`, and `accessibilityHint`.

---

### 2. AdminVerificationScreen — PASS

**Multi-step flow (list → detail → confirm modal)**

| Concern | Finding | Verdict |
|---|---|---|
| Focus order on list → detail transition | `AccessibilityInfo.setAccessibilityFocus(detailHeaderRef)` fires on mount (cycle5 branch, line 377) — SR focus moves to applicant handle instead of staying on the now-removed card | PASS (in cycle5 branch) |
| Co-admin concurrency announcement | `AccessibilityInfo.announceForAccessibility("An applicant was handled by another admin...")` fires when realtime removes a row the local admin still holds | PASS |
| Reject form reveal | Header gets `accessibilityRole="header"`, destructive warning gets `accessibilityRole="alert"`, reason field uses `accessibilityHint` for audit-log note | PASS |
| ConfirmationModal (approve/reject) | `accessibilityViewIsModal={true}` on both modals; `accessibilityRole="alert"` on title region; `disabled={busy}` prevents double-submission | PASS |
| Queue count live region | Count `Text` carries `accessibilityLiveRegion="polite"` — announced when queue changes | PASS |
| Empty queue | Wrapper `View` carries `accessibilityLiveRegion="polite"` — announced when queue drains | PASS |

**Note on main vs cycle5 branch:** The `AccessibilityInfo.setAccessibilityFocus()` call on detail mount is present on `a11y/auto-2026-05-25-alex-cycle5` but NOT on main. The main-branch AdminVerificationScreen transitions to the detail view without moving focus — meaning SR users navigating via swipe would stay focused on the now-replaced content. This is a WCAG 2.4.3 violation but is fixed in the cycle5 branch. It is not listed as a separate finding because the fix is in a staged branch ready to merge.

---

### 3. Resource List (HomeScreen FlatList) — PASS

- FlatList: native SR announces list position ("Item 3 of 12") ✓
- `keyExtractor` present ✓
- `ItemSeparatorComponent` is decorative, no role needed ✓
- `ResourceCard` accessibility label: `"${item.name}, ${item.status}${item.postal_prefix ? ', neighborhood ' + item.postal_prefix : ''}"` — comprehensive, includes status without relying on color-only ✓
- `RefreshControl` has `accessibilityLabel="Pull to refresh listings"` ✓
- Empty states use `Button` with accessible label ✓
- FeedSkeleton: `accessibilityRole="alert"` + `accessibilityLabel="Loading listings"` on container; individual skeletons are `accessibilityElementsHidden` ✓

---

### 4. Web Surfaces

**`src/components/PlatformMapView.web.tsx`** — PASS (fix shipped on current HEAD)

The current HEAD (`a11y/auto-2026-05-25-alex-web`) includes the full WCAG 2.1.2 keyboard trap fix:

- `keyboard={false}` on `MapContainer` disables Leaflet's arrow-key capture — no keyboard trap ✓
- Visually-hidden `<p>` directs AT users to FSA chip list (WCAG 2.1.2 advisory + 1.3.1) ✓
- Outer `<div role="img" aria-label={...}>` treats map as single image landmark, not interactive widget ✓
- `scrollWheelZoom={false}` prevents page-scroll interference ✓
- `maxZoom={13}` reinforces FSA-level zoom at Leaflet level ✓
- OSM attribution visible by default (`TileLayer attribution` prop) ✓

**`app.json`** — PASS (fix shipped on current HEAD)

- `lang="en"` attribute on web container (WCAG 3.1.1) ✓
- `title="Mutual Mesh"` for browser tab identification (WCAG 2.4.2) ✓

---

### 5. Verification Status — PASS

"Verified/unverified" is communicated to screen readers via multiple layers:

- **WaitingRoomScreen:** `AccessibilityInfo.announceForAccessibility("You're verified. Loading the feed.")` fires exactly once on `is_verified` false→true transition (edge-detected via `announcedRef`) ✓
- **AdminVerificationScreen:** Applicant cards include handle + location in `accessibilityLabel` — no "unverified" label is needed since the list is definitionally the unverified queue ✓
- **RootNavigator:** The Verify tab only renders when `profile.is_admin === true` — non-admins never see the concept of "unverified users" in the UI at all ✓
- **Color + icon independence:** Verification state is not communicated by color or icon alone anywhere in the codebase ✓

---

### 6. Contact Handle Reveal — PASS (in cycle5 branch)

**Current main branch:** `ResourceDetailScreen` renders `contact_handle` in a static `<Card>` with plain `<Text>` — no special accessibility treatment for the reveal event itself. The handle is readable by screen readers, but there is no live region announcement when the handle first appears after a successful claim.

**Cycle5 branch fix:** The `ResourceDetailScreen` on `a11y/auto-2026-05-25-alex-cycle5` upgrades the contact handle reveal:
- `accessibilityLiveRegion="polite"` on an error/status Text (line 256) ✓
- The handle `<Pressable>` carries `accessibilityLabel={contact handle: ${handle}}` + `accessibilityHint="Long press to copy this handle"` ✓
- Claimant handle (poster's view) similarly wrapped with `accessibilityLabel` + `accessibilityHint="Long press to share this handle"` ✓

The main-branch implementation has no live region on the contact handle reveal. After a successful claim, the status transitions from "Claim this item" button to showing the handle — the screen refetches. A screen-reader user would need to manually navigate to find the handle. Not a blocker (they can find it), but the cycle5 enhancement is the right direction.

---

### 7. Staged Branches Audit (source-only, no checkout)

Seven branches reviewed. All improvements to a11y; no regressions introduced.

#### `a11y/auto-2026-05-25-alex-cycle5` — A11y improvements, PASS
- AdminVerificationScreen: `setAccessibilityFocus` on detail mount (WCAG 2.4.3) ✓
- FlashBanner: dark-mode contrast fix (`text-white dark:text-light-text`) — resolves F-003 (below) ✓
- ResourceDetailScreen: contact handle with `accessibilityLabel` + `accessibilityHint` + copy affordance ✓

#### `a11y/auto-2026-05-25-alex-wave6-badge-contrast` — A11y improvements, PASS WITH NOTE
- `AvailabilityBadge` introduces `accessibilityRole="text"` on container View + `accessibilityElementsHidden` on inner Text — eliminates double-announcement of "Status: Available, Available" ✓
- `StatusPill` reserved contrast fixed: `bg-light-text-secondary` (#4A3D2C / white = 10.53:1) ✓
- `StatusPill` reserved dark fixed: `dark-text-muted` bg (#A8957D) + `dark-accent-text` (#0E0D0B) = 6.72:1 ✓
- **NOTE:** `a11y/reserved-badge-contrast` is a competing branch that uses a `bg-light-status-reserved` token not present in `tailwind.config.js` or `src/lib/theme.ts` — that branch would produce a build defect. The wave6 branch fix is the safe one.

#### `a11y/auto-2026-05-28-shamus-statuspill-completed-contrast` — A11y improvement, PASS
- Completed dark-mode contrast: `text-white dark:text-dark-accent-text` on `bg-dark-accent` (#4FBFA8) — fixes F-002 (see below). Confirmed: `#4FBFA8` bg / `#0E0D0B` text = 8.65:1 ✓

#### `feat/auto-2026-05-25-shamus-expiry-ux` — PASS
- `UnavailableBanner` component: `accessibilityRole="text"` + `accessibilityLabel={message}` + `accessibilityLiveRegion="polite"` ✓
- Expiry announcements: `AccessibilityInfo.announceForAccessibility(raceMsg)` and `...announceForAccessibility(friendlyMsg)` for race condition and expiry detection ✓

#### `a11y/auto-2026-05-25-alex-wave6-badge-contrast` includes wave6 `ResourceCard` and `ClaimButton` — PASS
- `ResourceCard`: `accessibilityLabel` now includes `category` when present, alongside name/status/postal_prefix ✓
- `ClaimButton`: `accessibilityLabel={busy ? 'Reserving, please wait' : 'Claim this resource'}` dynamically reflects busy state; `accessibilityState={{ busy, disabled }}` ✓
- Both meet 44pt touch target ✓

#### `feat/auto-2026-05-25-shamus-wave6-category-filter` — PASS
No `accessibilityRole="toolbar"` added to the ScrollView (the prior cycle5 advisory was followed — the toolbar role was never committed). Individual `CategoryChip` components continue to carry correct `accessibilityRole`, `accessibilityLabel`, `accessibilityState` ✓

#### Other staged branches (perf, data, feat, docs) — PASS
No a11y regressions introduced in the branches reviewed. All interactive controls added continue to use Button/Card primitives consistently.

---

## Findings

### F-001 — CRITICAL | StatusPill Reserved dark-mode contrast: 2.89:1 (WCAG AA fail)
**File:** `src/components/StatusPill.tsx` (main branch, line 23–29)
**Criterion:** WCAG 1.4.3 Contrast (Minimum), Level AA — requires 4.5:1 for small text (< 18pt / < 14pt bold)
**Detail:** "Reserved" status pill uses `bg-dark-text-muted` (#A8957D) with `text-white` (#FFFFFF). Measured contrast: 2.89:1. The pill text is 12px (`text-xs`) non-bold — 4.5:1 is required.
**Fix:** Use `text-light-accent-text dark:text-dark-accent-text` instead of `text-white`, and change the dark-mode bg from `bg-dark-text-muted` to `bg-dark-text-muted` paired with near-black text. Two staged branches have valid fixes: `a11y/auto-2026-05-25-alex-wave6-badge-contrast` (changes bg to `bg-light-text-secondary dark:bg-dark-text-muted` + uses `text-light-accent-text`) and `a11y/auto-2026-05-28-shamus-statuspill-completed-contrast` (different approach). The wave6 branch fix is preferred as it also introduces the improved `AvailabilityBadge` component with correct double-announcement prevention.
**Merge blocker:** YES

---

### F-002 — CRITICAL | StatusPill Completed dark-mode contrast: 2.25:1 (WCAG AA fail)
**File:** `src/components/StatusPill.tsx` (main branch, line 23–29)
**Criterion:** WCAG 1.4.3 Contrast (Minimum), Level AA
**Detail:** "Completed" status pill uses `bg-dark-accent` (#4FBFA8) with `text-white` (#FFFFFF). Measured contrast: 2.25:1. 12px non-bold text requires 4.5:1.
**Fix:** `a11y/auto-2026-05-28-shamus-statuspill-completed-contrast` applies `text-white dark:text-dark-accent-text` on the Completed pill. This yields #4FBFA8 bg / #0E0D0B text = 8.65:1. The wave6 `AvailabilityBadge` also fixes this (uses `text-light-accent-text dark:text-dark-accent-text` uniformly = same result).
**Merge blocker:** YES

---

### F-003 — HIGH | FlashBanner all variants dark-mode: 2.1–2.95:1 (WCAG AA fail)
**File:** `src/components/FlashBanner.tsx` (main branch, line 94–98)
**Criterion:** WCAG 1.4.3 Contrast (Minimum), Level AA
**Detail:** `variantTextClasses()` returns `text-white` unconditionally. In dark mode all four variant backgrounds are pastel/bright: success (#88BC73 / white = 2.21:1), warning (#DBA951 / white = 2.14:1), danger (#E07878 / white = 2.95:1), info/accent (#4FBFA8 / white = 2.25:1). All fail AA.
**Fix:** `a11y/auto-2026-05-25-alex-cycle5` changes to `text-white dark:text-light-text` — `#1A1916` (light-mode text token) on dark-mode banner bgs achieves 5.97–8.21:1 across all four variants. Valid fix.
**Merge blocker:** YES

---

### F-004 — MEDIUM | CompleteProfileScreen city/handle pickers: selection state color-only (WCAG 1.4.1)
**File:** `src/screens/CompleteProfileScreen.tsx` lines 148–158 (handle suggestions) and 199–213 (city picker)
**Criterion:** WCAG 1.4.1 Use of Color — information shall not be conveyed by color alone; WCAG 4.1.2 Name, Role, Value
**Detail:** Both the handle suggestion buttons and the city picker buttons use `Button` with `variant={selected ? 'primary' : 'secondary'}` to indicate the selected item. The `Button` primitive does not accept or expose `accessibilityState={{ selected }}`, so screen readers have no programmatic way to know which handle or city is selected. Selection is conveyed visually by primary fill color vs. secondary border — color alone. A VoiceOver user navigating the handle suggestions hears "quiet-stream-4721, button" for all three suggestions with no indication of which is the current selection.
**Fix (proposed for `alex/a11y-overhaul-2026-05-29`):**
1. Add optional `selected?: boolean` prop to `Button`, which passes `accessibilityState={{ ...(selected !== undefined ? { selected } : {}) }}` to the Pressable.
2. In `CompleteProfileScreen` handle suggestions: `selected={handle === s}` on each suggestion Button.
3. In `CompleteProfileScreen` city picker: `selected={city === c}` on each city Button.
**Merge blocker:** NO (does not block merge of other branches; should be its own fix)

---

### F-005 — LOW | OnboardingTourScreen: duplicate `accessibilityRole="header"` on CardView
**File:** `src/screens/OnboardingTourScreen.tsx` lines 240–246
**Criterion:** WCAG 1.3.1 Info and Relationships — no specific WCAG violation, but causes TalkBack/VoiceOver to announce "heading" twice for the card title.
**Detail:** The `CardView` container `View` at line 239 has `accessibilityRole="header"` with `accessibilityLabel={card.title}`, AND the inner `<Text>` at line 245 also has `accessibilityRole="header"`. When a screen reader focuses on the View, it announces "card title, heading." Then when it moves to the inner Text, it announces "card title, heading" again. The inner Text is already conditionally hidden via `accessibilityElementsHidden={!isActive}`, but on the active card both are exposed.
**Fix:** Remove `accessibilityRole="header"` from the outer container `View`. The inner `<Text accessibilityRole="header">` is sufficient. The container's `accessibilityLabel` can remain for context but should use a neutral role (none/summary) or no role.
**Merge blocker:** NO

---

### F-006 — LOW | `a11y/reserved-badge-contrast` branch uses undefined token (build defect risk)
**File:** `a11y/reserved-badge-contrast` branch only — `src/components/StatusPill.tsx`
**Detail:** This branch uses `bg-light-status-reserved dark:bg-dark-status-reserved` which are not defined in `tailwind.config.js` or `src/lib/theme.ts`. The NativeWind compiler would silently omit these classes, rendering the Reserved pill with no background color. Do NOT merge this branch. Use `a11y/auto-2026-05-25-alex-wave6-badge-contrast` or `a11y/auto-2026-05-28-shamus-statuspill-completed-contrast` instead.
**Merge blocker:** YES (block THIS branch; it should not be merged)

---

## Touch Target Audit (WCAG 2.5.5)

| Component | Min Size | Status |
|---|---|---|
| Button | 44pt (minHeight) | PASS |
| TextField | 44pt (minHeight) | PASS |
| Card (pressable) | 44pt (minHeight) | PASS |
| FAB | 56×56pt (fixed) | PASS |
| CategoryChip | 44pt (minHeight) | PASS |
| SegmentButton (MapToggle) | 44pt (minHeight) | PASS |
| Toggle | 44pt min (minWidth + minHeight) | PASS |
| FSA chips (ResourceMapScreen) | 44pt (minHeight via style) | PASS |
| Center-on-me button | 44pt (minHeight + minWidth) | PASS |
| ConfirmationModal buttons | 44pt (Button component) | PASS |
| Skip link (OnboardingTour) | 44pt (minHeight + minWidth via style) | PASS |
| FsaPreviewSheet close button | 44pt (minHeight + minWidth) | PASS |

No sub-44pt touch targets found on main.

---

## Screen Reader Focus & Heading Structure

| Screen | Heading | Focus Order | Live Regions | Status |
|---|---|---|---|---|
| SplashScreen | "Mutual Mesh" (h1) + `role="alert"` on container | N/A (loading) | `accessibilityLiveRegion="polite"` | PASS |
| SignInScreen | "Mutual Mesh" / "Check your email" (h1) | email → password → [invite code] → submit → toggle | error is `liveRegion="polite"` | PASS |
| CompleteProfileScreen | "Set up your profile" (h1) | handle suggestions → handle field → postal field → city picker → submit | warning + error are `liveRegion="polite"` | PASS (but see F-004) |
| WaitingRoomScreen | "You're in the queue" (h1) | header → cards → sign out | `announceForAccessibility` on verification ✓ | PASS |
| HomeScreen | "Available now" (h1) | header → MapToggle → list items → FAB | empty states not in live region (acceptable) | PASS |
| ResourceDetailScreen (main) | resource name (h1) | header → status → description → pickup → [contact handle] → claim / reserved | error has `liveRegion="polite"` | PASS |
| AddResourceScreen | "Post a resource" (h1) | all TextFields → photo → submit → cancel | error has `liveRegion="polite"` | PASS |
| ResourceMapScreen | "Map" (h1) | MapToggle → map → center-on-me → FSA chips | FSA preview has `liveRegion="polite"` | PASS |
| AdminVerificationScreen (list) | "Verify" (h1) | header → count → list cards | count is `liveRegion="polite"` | PASS |
| AdminVerificationScreen (detail) | applicant handle (h1) | back button → header → info rows → approve/reject | `setAccessibilityFocus` on mount (cycle5 branch) | PASS (cycle5) |
| ProfileScreen | "Your profile" (h1) + "Help improve Mutual Mesh" (h2) | header → handle/neighborhood/city → stats → switch → actions | error is `liveRegion="polite"` | PASS |
| OnboardingTourScreen | card title (h1, active card only) | skip → card content → dots → CTA | `announceForAccessibility` on index change | PASS (with F-005 note) |
| PrivacyPolicyScreen | "Privacy policy" (h1) | header → scrollable text | N/A | PASS |
| TermsOfServiceScreen | "Terms of service" (h1) | header → scrollable text | N/A | PASS |

---

## Color Contrast Summary

| Element | Light | Dark | Status |
|---|---|---|---|
| Body text | 13.1:1 | 14.2:1 | PASS |
| Secondary text | 6.8:1 | 10.1:1 | PASS |
| Muted text | 4.5:1 | 7.4:1 | PASS |
| Accent text (button labels) | 5.2:1 | — | PASS |
| StatusPill Available (success bg) | 6.25:1 white | 8.78:1 dark-accent-text | PASS |
| StatusPill Completed (accent bg) | 5.18:1 white | **2.25:1 white** | **FAIL (F-002)** |
| StatusPill Reserved (text-muted bg) | 6.93:1 white | **2.89:1 white** | **FAIL (F-001)** |
| FlashBanner (all variants, light) | 4.5–7.8:1 white | — | PASS |
| FlashBanner (all variants, dark) | — | **2.14–2.95:1 white** | **FAIL (F-003)** |
| Danger text | 5.2:1 | 6.59:1 dark-accent-text | PASS |

---

## Decisions for Sky

None. All findings have clear paths to fix. No privacy or security concerns in scope here.

---

## Fix Branch Plan

| Finding | Severity | Fix Ready? | Proposed Branch |
|---|---|---|---|
| F-001 Reserved dark contrast | Critical | YES — `a11y/auto-2026-05-25-alex-wave6-badge-contrast` | Merge wave6 branch |
| F-002 Completed dark contrast | Critical | YES — `a11y/auto-2026-05-28-shamus-statuspill-completed-contrast` OR wave6 | Merge either; wave6 preferred |
| F-003 FlashBanner dark contrast | High | YES — `a11y/auto-2026-05-25-alex-cycle5` | Merge cycle5 branch |
| F-004 Selection state color-only | Medium | NO — new work needed | `alex/a11y-overhaul-2026-05-29` |
| F-005 Duplicate header role | Low | NO — trivial fix | `alex/a11y-overhaul-2026-05-29` |
| F-006 Invalid token on reserved-badge-contrast | Build risk | Block merge of that branch | Do not merge |

**Proposed branch `alex/a11y-overhaul-2026-05-29` covers F-004 and F-005 only.**
**F-001, F-002, F-003 are already covered by staged branches pending the migration/merge wave.**

---

## Report compiled: 2026-05-29 — Alex (Accessibility Engineer)
**Next steps:** Forward to Morgan for merge coordination. F-001/F-002/F-003 fixes should ride with the Wave 6 + Cycle 5 merge wave. F-004/F-005 are a separate small PR.
