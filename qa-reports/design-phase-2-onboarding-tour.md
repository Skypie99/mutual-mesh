# Design — Phase 2 Onboarding Tour — Dani — 2026-05-24

## Summary

Visual + layout design for the 3-card first-run onboarding tour specced by Quinn in `qa-reports/spec-phase-2-onboarding-tour.md`. This report is markdown-only; Shamus implements from the ASCII layouts and the token list below. **No new primitives are needed** beyond a tiny `TourDots.tsx` indicator (proposed below). All other elements compose the existing `Button` primitive + raw `View` / `Text` + the existing `FlashBanner` for the rare RPC-failure case. Tour respects `useReducedMotion()`, the 4pt spacing grid, the warm-cream + clay-teal palette in `DESIGN.md`, and the 44pt minimum hit target enforced by `TOUCH_TARGET_MIN`.

**Status: Proposal only — no files changed in main.** Mode: ACTIVE (direct `/dani` invocation, not background; Const. Art. 12 BACKGROUND mode rules N/A). External sends: none — this file is the only deliverable. Morgan is the sole external channel (Const. Art. 9).

---

## 1. Overall layout

The tour is a **full-screen surface, not a modal sheet**. It is rendered as the entire screen body by `App.tsx`'s Gate when `decideGateRoute()` returns `'tour'` (per Quinn AC-2). Rationale:

- A modal on top of the marketplace would imply "the marketplace is loaded and I can dismiss this." That's a misread. The user is not yet in the marketplace — the tour is the route.
- A full-screen surface matches the privacy-gate framing: this is the first thing you see after verification, and it should feel as load-bearing as the SignIn or WaitingRoom screen, not a popover on top of "real" content.
- It also means we can skip the modal mounting cost + the close-button affordance + the backdrop scrim — all of which the spec explicitly excludes (no pull-to-dismiss; Skip + Next are the only exits).

**Layout primitives:**

| Aspect           | Decision                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container        | `<SafeAreaView>` (react-native, **not** the react-native-safe-area-context one — match the existing SignIn / WaitingRoom pattern). `flex: 1`, `bg-light-bg dark:bg-dark-bg`.                   |
| Nav header       | **None.** No back arrow, no title bar, no tab bar. The tour owns the entire viewport between the safe-area insets.                                                                             |
| Tab bar          | **Not visible** (the Gate hasn't mounted `RootNavigator` yet, so this is automatic — no extra work).                                                                                           |
| Minimum width    | 320pt (iPhone SE 1st-gen / Android small). Tested via Shamus's manual sim run + Gary's `<View style={{ width: 320 }}>` snapshot test (proposed in §7 below).                                   |
| Safe-area top    | Honored — the Skip link sits below the top inset.                                                                                                                                              |
| Safe-area bottom | Honored — the Next/Skip button row sits above the bottom inset (home-bar safe).                                                                                                                |
| Status bar       | Inherits app default (light content in dark mode, dark content in light mode). No change.                                                                                                      |
| Horizontal pager | Native RN `<ScrollView horizontal pagingEnabled>` (per Quinn AC-3). One card per page. `showsHorizontalScrollIndicator={false}`. `bounces={false}` so users don't bounce past card 1 / card 3. |
| Card stack       | 3 cards rendered horizontally inside the ScrollView. Each card is a full-viewport-width `<View>` with internal vertical layout (see §2).                                                       |

**Why ScrollView and not a custom Animated.View pager:** Quinn's spec is explicit that no carousel library lands in MVP, and `pagingEnabled` covers the swipe-snap behavior natively. Custom pagers always have edge cases (RTL, momentum, voice-control nav). Defer to native unless we hit a real edge case (Phase 3 #19 i18n / RTL).

---

## 2. Per-card layout (ASCII sketch + token table per element)

Every card uses **identical structural layout** — only the icon, headline, and body change. This is intentional: card-to-card consistency lowers the cognitive cost of swiping through them. The Skip link, dot indicator, and Next/Get-started button live in the **same screen position** on every card so a screen-reader user (or anyone) learns where they are after the first card.

### Card 1 — "You're in."

```
┌─────────────────────────────────┐  <- safe-area top inset
│                                 │
│                          [Skip] │  <- Skip link, top-right (44pt hit area)
│                                 │
│                                 │
│            ◉                    │  <- icon (60pt glyph, decorative)
│                                 │
│                                 │
│      You're in.                 │  <- headline (h1: 24pt / 600)
│                                 │
│  You've been verified by a      │  <- body (body: 16pt / 400)
│  community admin. You can       │
│  leave the network any time —   │
│  there's a 'Delete my account'  │
│  button in Profile that erases  │
│  everything you posted.         │
│                                 │
│                                 │
│         ● ○ ○                   │  <- TourDots (8pt active, 8pt inactive)
│                                 │
│  ┌───────────┐  ┌───────────┐   │  <- button row (44pt min height)
│  │   Skip    │  │   Next    │   │     equal-width on small screens
│  └───────────┘  └───────────┘   │
│                                 │
└─────────────────────────────────┘  <- safe-area bottom inset
```

### Card 2 — "Your handle is your name here."

```
┌─────────────────────────────────┐
│                          [Skip] │
│                                 │
│            ◈                    │  <- icon
│                                 │
│  Your handle is your name       │  <- headline (may wrap to 2 lines)
│  here.                          │
│                                 │
│  You can change it any time.    │  <- body
│  Don't use a real name —        │
│  yours, your kid's, your        │
│  roommate's. If you see anyone  │
│  using a real name, it's        │
│  probably a mistake; you can    │
│  ignore those listings.         │
│                                 │
│         ○ ● ○                   │
│                                 │
│  ┌───────────┐  ┌───────────┐   │
│  │   Skip    │  │   Next    │   │
│  └───────────┘  └───────────┘   │
└─────────────────────────────────┘
```

### Card 3 — "When you claim, the poster knows."

```
┌─────────────────────────────────┐
│                          [Skip] │
│                                 │
│            ◧                    │  <- icon
│                                 │
│  When you claim, the poster     │  <- headline (wraps to 2 lines)
│  knows.                         │
│                                 │
│  Tap Claim on a listing and     │  <- body (longest of the three)
│  the poster sees that you've    │
│  claimed it. You'll see the     │
│  contact handle they chose for  │
│  that listing (Signal, Proton,  │
│  etc.). You and the poster      │
│  work out pickup outside the    │
│  app.                           │
│                                 │
│         ○ ○ ●                   │
│                                 │
│  ┌───────────┐  ┌───────────┐   │
│  │   Skip    │ Get started ┐   │  <- last card: right button changes label
│  └───────────┘  └───────────┘   │
└─────────────────────────────────┘
```

### Per-element token table

This table applies to every card; differences are noted inline.

| Element              | Layout                                                                                                                                                                                                            | Color (light → dark)                                                                                                                                                    | Typography                                | Spacing                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Screen container** | `SafeAreaView` → `View flex:1`, vertical stack, `justifyContent: 'space-between'` between header/body/footer                                                                                                      | `light.bg` → `dark.bg`                                                                                                                                                  | —                                         | `spacing.md` (16pt) horizontal screen padding                                                |
| **Skip link (top)**  | Absolute / flex-end; top-right inside safe area. Pressable. 44pt min hit area via `hitSlop` if visual is smaller.                                                                                                 | `light.accent` (#1F7A6A, 5.1:1) → `dark.accent` (#4FBFA8, 8.3:1)                                                                                                        | `bodyEmphasis` (16pt / 600)               | `spacing.md` (16pt) from top safe-area, `spacing.md` (16pt) from right edge                  |
| **Icon**             | Centered horizontally. Decorative — `accessibilityElementsHidden`.                                                                                                                                                | Inherits text color: `light.text` → `dark.text` (15.6:1 / 16.8:1, AAA)                                                                                                  | 60pt font size (Unicode glyph)            | `spacing.xl` (32pt) top margin (below Skip), `spacing.lg` (24pt) bottom margin to headline   |
| **Headline (h1)**    | Centered; max 2 lines at default type size (auto-wraps).                                                                                                                                                          | `light.text` → `dark.text` (15.6:1 / 16.8:1, AAA)                                                                                                                       | `h1` token (24pt / 600 / lineHeight 32)   | `spacing.md` (16pt) horizontal padding (so wrap is natural), `spacing.md` bottom to body     |
| **Body**             | Centered; flex-grow so it pushes the dot+button row to the bottom. Max ~7 lines at default type, more with dynamic-type.                                                                                          | `light.textSecondary` (#4A3D2C, 9.2:1, AAA) → `dark.textSecondary` (#D9CBBA, 11.2:1, AAA)                                                                               | `body` token (16pt / 400 / lineHeight 24) | `spacing.md` (16pt) horizontal padding                                                       |
| **TourDots**         | Centered horizontally. Three 8pt circles, 4pt gap between. NOT pressable.                                                                                                                                         | Active dot: `light.accent` → `dark.accent`. Inactive: `light.textMuted` (#6B5640, 5.8:1) → `dark.textMuted` (#A8957D, 6.9:1). Both pairs meet WCAG 1.4.11 non-text 3:1. | —                                         | `spacing.xl` (32pt) bottom margin from body, `spacing.lg` (24pt) bottom margin to button row |
| **Button row**       | Horizontal flex; two equal-width Buttons; `spacing.md` (16pt) gap between. On 320pt screens with 16pt screen padding × 2 + 16pt gap = each button gets (320 − 48) / 2 = **136pt wide** (well above the 44pt min). | Skip: `secondary` variant (border only). Next / Get started: `primary` variant (`light.accent` / `dark.accent` bg with `accentText` foreground; 5.1:1 / 8.3:1).         | `button` token (16pt / 600)               | `spacing.lg` (24pt) bottom margin from safe-area bottom (so home-bar doesn't crowd)          |

**Note on the top-right Skip + bottom-left Skip duplication:** Quinn's spec puts Skip in the top-right of every card. Dani's recommendation **adds a second Skip as the left button in the button row**. Reasoning:

1. Top-right Skip is small / tap-easy-to-miss for shaky hands; the bottom-row Skip is the 44pt full-width version everyone can hit.
2. Two affordances are not confusing here — they map to the same action; Alex's accessibility note pinned focus order so the SR user hits them in a predictable order.
3. The "see how this app respects me" trust signal is reinforced: there are two visible exits on every card, not buried.

If Sky disagrees: the bottom-row Skip can be dropped and the Next button can be centered + half-width. See DECISIONS FOR SKY → DFS-D2.

---

## 3. Motion design

| State                                                 | Behavior                                                                                                                                                        | Token / value                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Swipe (gesture-driven)                                | Native `pagingEnabled` ScrollView snap. Uses iOS / Android system curve.                                                                                        | OS-native (~200–300ms). No JS-driven token override.                                                                       |
| Next button tap → next card                           | `scrollViewRef.current.scrollTo({ x: nextIndex * width, animated: true })`. The `animated: true` triggers the same OS curve.                                    | `motion.base` (200ms) **target**; actual is OS-controlled. Close enough to Quinn's 250ms goal that no new token is needed. |
| TourDots active-dot change                            | Opacity crossfade from 0.4 → 1.0 on the newly-active dot; reverse on the previously-active dot. NO sliding "indicator pill."                                    | `motion.fast` (120ms) — close enough to Quinn's 150ms goal that no new token is needed.                                    |
| **Reduced motion = true** (from `useReducedMotion()`) | `scrollTo({ animated: false })` — instant cut. ScrollView pager still works on swipe (the gesture itself is user-driven), but Next-tap snaps with no animation. | —                                                                                                                          |
| **Reduced motion = true** — TourDots                  | Dot color change is instant (no opacity crossfade). The active-dot color appears on the new dot in the same frame as the swipe completes.                       | —                                                                                                                          |
| Pull-to-dismiss / swipe-down dismiss                  | **NONE.** The user must tap Skip or Next or Get started. Quinn AC explicitly requires engagement with the choice.                                               | —                                                                                                                          |
| Card mount / unmount transitions                      | None — the whole tour mounts once, then the ScrollView handles page swaps inside.                                                                               | —                                                                                                                          |

**Note on token deltas:** Quinn's spec mentions `motion.swift` (250ms) and `motion.snap` (150ms) — neither exists in `DESIGN.md` today. Rather than propose two new tokens for a single feature, Dani maps to the closest existing tokens (`motion.base` = 200ms and `motion.fast` = 120ms). The 50ms / 30ms deltas are imperceptible to almost all users and well within the 200ms threshold of "feels instant." If Alex or Shamus disagrees during build, propose the new tokens then — but don't pre-emptively bloat the token set.

---

## 4. Accessibility (Alex pre-check)

| Concern                            | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card change announcement           | When the active card index changes (via swipe OR Next-tap), call `AccessibilityInfo.announceForAccessibility(card.title)` exactly once. Use the mounted-ref edge-detector pattern from `FlashBanner.tsx` to prevent double-announces on re-render. Quinn AC-6 + Alex pre-audit pin this as load-bearing.                                                                                                                                                                                                                                                                     |
| `accessibilityLiveRegion`          | A hidden `<Text accessibilityLiveRegion="polite">` near the bottom of the screen announces `"Card N of 3"` on every card change. This is the screen-reader-only progress signal that complements the visual dots.                                                                                                                                                                                                                                                                                                                                                            |
| Focus order on each card           | (1) Skip link (top-right) → (2) icon (skip — `accessibilityElementsHidden`) → (3) headline → (4) body → (5) dot-row container with `"Card N of 3"` label (single accessibility element, NOT individual dots) → (6) bottom Skip → (7) Next / Get started. Per Alex's pre-audit + WCAG 2.4.3.                                                                                                                                                                                                                                                                                  |
| Dot indicator: is it pressable?    | **No.** Each dot is a `<View>` (not `Pressable`). The dot row container has a single `accessibilityLabel="Card N of 3"`; individual dots are decorative (`accessibilityElementsHidden`). This matches Quinn AC-6 and Alex's explicit warning ("Shamus tempted to make it tappable; resist").                                                                                                                                                                                                                                                                                 |
| Touch target ≥ 44pt                | Bottom-row Skip + Next/Get-started: enforced by the `Button` primitive (`minHeight: TOUCH_TARGET_MIN`). Top-right Skip: enforced via `hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}` because the visible "Skip" text is smaller.                                                                                                                                                                                                                                                                                                                                    |
| Color contrast                     | Body text on bg: 9.2:1 / 11.2:1 (AAA, headroom). Headline on bg: 15.6:1 / 16.8:1 (AAA). Skip link on bg: 5.1:1 (light) / 8.3:1 (dark) — both clear AA, dark clears AAA. Active dot vs bg: same as Skip (accent → bg). Inactive dot vs bg: 5.8:1 (light) / 6.9:1 (dark) — well above non-text 3:1. No contrast issues.                                                                                                                                                                                                                                                        |
| Dynamic Type at 200%               | The longest card (Card 3) at 200% wraps to ~10 lines of body. Headline wraps to 4 lines. The `flex` layout with `justifyContent: 'space-between'` keeps Skip pinned top-right and the dot+button row pinned at the bottom; the body region scrolls within itself **if** it overflows. Recommendation: wrap the body region in a `ScrollView` (vertical, `showsVerticalScrollIndicator={false}`) so a 200%-type Card-3 user can read everything. (This adds a nested ScrollView inside the horizontal pager — RN handles this fine because gesture directions don't collide.) |
| VoiceOver / TalkBack swipe gesture | The horizontal ScrollView is fine for VoiceOver — the user moves between cards with the 3-finger horizontal swipe (iOS) or two-finger left-right (TalkBack). The card title announcement fires on focus change. No additional gesture handling needed.                                                                                                                                                                                                                                                                                                                       |
| No autoplay / autoscroll           | Confirmed. The user controls all progression. Per Quinn AC-7 + WCAG 2.2.2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Screen-reader-only progress signal | The hidden `accessibilityLiveRegion="polite"` `<Text>` (above) announces `"Card 1 of 3"` on initial mount + on every card change. Helps SR users orient.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| RTL future-proofing                | All horizontal layouts use `flex-direction: 'row'` (NOT a hardcoded `marginLeft`); RTL mirror happens automatically in Phase 3 #19. The Skip-top-right will become Skip-top-left on RTL — that's fine.                                                                                                                                                                                                                                                                                                                                                                       |

---

## 5. Token list (final)

Every token used in this design, grouped by category. **All tokens already exist in `src/lib/theme.ts` + `tailwind.config.js`. No new tokens proposed.**

### Colors

| Token (light)         | Token (dark)         | Used for                                                                                |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `light.bg`            | `dark.bg`            | Screen background                                                                       |
| `light.text`          | `dark.text`          | Headline color, icon glyph color                                                        |
| `light.textSecondary` | `dark.textSecondary` | Body copy color                                                                         |
| `light.textMuted`     | `dark.textMuted`     | TourDots **inactive** dot color (3:1+ non-text per WCAG 1.4.11)                         |
| `light.accent`        | `dark.accent`        | TourDots **active** dot color, top-right Skip link text, Next/Get-started button bg     |
| `light.accentText`    | `dark.accentText`    | Next/Get-started button label color (on accent bg)                                      |
| `light.borderStrong`  | `dark.borderStrong`  | Bottom Skip button border (secondary variant, via `Button` primitive)                   |
| `light.danger`        | `dark.danger`        | FlashBanner bg if `complete_onboarding()` errors (via existing `FlashBanner` primitive) |

### Spacing

| Token        | Value | Used where                                                                        |
| ------------ | ----- | --------------------------------------------------------------------------------- |
| `spacing.xs` | 4     | TourDots inter-dot gap                                                            |
| `spacing.sm` | 8     | (unused in this design directly)                                                  |
| `spacing.md` | 16    | Horizontal screen padding; button row inter-button gap; Skip-link top/right inset |
| `spacing.lg` | 24    | Headline → body gap; dot-row → button-row gap; bottom safe-area-to-button-row gap |
| `spacing.xl` | 32    | Icon top margin; body → dot-row gap                                               |

### Radii

| Token          | Value | Used where                                         |
| -------------- | ----- | -------------------------------------------------- |
| `radii.button` | 8     | Button corners (inherited from `Button` primitive) |
| `radii.pill`   | 9999  | TourDots circles (full-pill on a square = circle)  |

### Typography

| Token                     | Used for                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `typography.h1`           | Card headline (24pt / 600 / lineHeight 32)                                                        |
| `typography.body`         | Card body copy (16pt / 400 / lineHeight 24)                                                       |
| `typography.bodyEmphasis` | Top-right Skip link (16pt / 600 — slightly heavier so it reads as a tappable link, not body text) |
| `typography.button`       | Bottom row Skip + Next/Get started (inherited from `Button` primitive)                            |

### Motion

| Token         | Value | Used where                                                                  |
| ------------- | ----- | --------------------------------------------------------------------------- |
| `motion.fast` | 120ms | TourDots active-dot opacity crossfade (NOT used when reduced-motion = true) |
| `motion.base` | 200ms | Next-tap → `scrollTo({ animated: true })` (handed to native pager)          |

### Constants

| Constant           | Value | Used where                                                                                                                                             |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TOUCH_TARGET_MIN` | 44    | Bottom Skip + Next/Get-started (inherited from `Button` primitive); top-right Skip via `hitSlop` (12+12+12+12 = 24pt × 2 + visible text bounds ≥ 44pt) |

### Icons (Unicode geometric glyphs — see DFS-D1)

Per project convention in `src/navigation/RootNavigator.tsx`, the existing tab-bar icons are **Unicode geometric glyphs**, NOT emoji:

| Card   | Icon glyph | Codepoint | Rationale                                                                                                                                                    |
| ------ | ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card 1 | `◉`        | U+25C9    | "Bullseye" / fisheye — implies "you're at the centre / you're in." Matches the existing Profile tab icon (a friendly nod to the user's identity in the app). |
| Card 2 | `◈`        | U+25C8    | "White diamond containing black small diamond" — implies layered identity (handle / real name). Matches the existing Admin Verify icon.                      |
| Card 3 | `◧`        | U+25E7    | "Square with left half black" — implies a transaction / a side being revealed. Matches the existing Feed tab icon.                                           |

All three are decorative (`accessibilityElementsHidden`); the headline carries the meaning for SR users.

---

## 6. Dark mode

Verified per token table in §2 / §5. Every text/bg pair clears WCAG AA (most clear AAA). The warm-cream + clay-teal palette holds in both modes — no neutral-grey fallbacks. Specifically:

| Pair                                                                            | Light contrast | Dark contrast | Verdict                                     |
| ------------------------------------------------------------------------------- | -------------- | ------------- | ------------------------------------------- |
| Headline (text) on screen bg                                                    | 15.6:1         | 16.8:1        | AAA / AAA                                   |
| Body (textSecondary) on screen bg                                               | 9.2:1          | 11.2:1        | AAA / AAA                                   |
| Top-right Skip link (accent) on screen bg                                       | 5.1:1          | 8.3:1         | AA / AAA                                    |
| Active dot (accent) on screen bg                                                | 5.1:1          | 8.3:1         | AA non-text — well above 3:1 / AAA non-text |
| Inactive dot (textMuted) on screen bg                                           | 5.8:1          | 6.9:1         | AA non-text — well above 3:1 / AAA non-text |
| Next/Get-started button label (accentText) on accent bg                         | 5.1:1          | 8.3:1         | AA / AAA                                    |
| Bottom Skip button label (text) on screen bg (secondary variant has no bg fill) | 15.6:1         | 16.8:1        | AAA / AAA                                   |
| Bottom Skip button border (borderStrong) on screen bg                           | 4.24:1         | 4.46:1        | AA non-text / AA non-text                   |

**No contrast issues found.** No token tweaks proposed.

---

## 7. Reuse vs new components

| Element                          | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen container                 | Raw `SafeAreaView` + `View`. NOT a new "OnboardingScreen" primitive — only this screen uses this layout.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Cards (1, 2, 3)                  | Raw `View` per card inside the ScrollView. **Do NOT use the existing `Card` primitive** — `Card` has a 1pt border and `surface` bg, which would render the tour card as a tiny floating sheet inside the screen, not a full-screen card. Tour cards are conceptually screens-within-a-pager, not Card primitives.                                                                                                                                                                                                                        |
| Skip link (top-right)            | Raw `Pressable` + `Text`. NOT a new primitive. Mirrors the inline-link pattern used by "See intro again" on ProfileScreen (Quinn AC-9).                                                                                                                                                                                                                                                                                                                                                                                                  |
| Skip button (bottom-left in row) | Existing `Button` primitive, `variant="secondary"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Next / Get started               | Existing `Button` primitive, `variant="primary"`. Label switches based on `index === 2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **TourDots indicator**           | **NEW tiny primitive — `src/components/TourDots.tsx`.** ~25 lines: takes `count: number` + `activeIndex: number` props, renders a row of `count` circles with the active-index colored as `accent` and others as `textMuted`. Container has `accessibilityLabel={`Card ${activeIndex + 1} of ${count}`}`. Individual dots are `accessibilityElementsHidden`. Default size: 8pt diameter, 4pt gap (see DFS-D3). Reduced-motion-aware: crossfades dot color with `motion.fast` opacity animation; instant if `useReducedMotion()` is true. |
| FlashBanner                      | Existing primitive — shown if `complete_onboarding()` RPC errors (per Quinn's error mapping table). Already accessibility-announced via the FlashBanner internals.                                                                                                                                                                                                                                                                                                                                                                       |
| LoadingSkeleton                  | Existing primitive — Quinn's spec optionally uses it if RPC takes >500ms. Dani recommends **NOT** using it for a one-shot RPC; instead disable the Skip + Get-started buttons and change Get-started's label to "Working…" (matches the `ConfirmationModal` pattern). Lower visual churn, same UX.                                                                                                                                                                                                                                       |

**Summary: one new component (`TourDots.tsx`).** All other parts compose existing primitives + raw `View` / `Text` / `Pressable`. No new Button variants.

### Suggested test additions (Gary's lane — Dani flagging)

Not Dani's lane to write; surfacing for Gary:

- Snapshot test rendering the tour at `width: 320` to catch any layout regression at the smallest target.
- Snapshot at `width: 320, fontScale: 2.0` (the 200% Dynamic Type case) — confirms the body region scroll-wrap kicks in cleanly on Card 3.

---

## 8. DECISIONS FOR SKY

### DFS-D1: Card icon style — emoji vs Unicode glyphs vs SVG

Quinn's spec proposes "emoji (cross-platform, low-effort)" and notes "matches RootNavigator tab bar pattern." That note is **incorrect** — `src/navigation/RootNavigator.tsx` actually uses **Unicode geometric glyphs** (`◧`, `◈`, `◉`), not emoji.

**Dani's recommendation: Unicode geometric glyphs (matching the existing tab-bar pattern).**

Reasoning:

1. **Consistency with the rest of the app.** The user has seen `◉ You` and `◧ Feed` and `◈ Verify` in the bottom tab bar (post-Gate). Reusing the same visual vocabulary in the tour primes them for what's coming.
2. **Cross-platform parity.** Emoji render differently on iOS / Android / web (Apple's heart is round, Google's is square, etc.). Unicode geometric glyphs render identically in any system font.
3. **A11y / SR consistency.** Both emoji and Unicode glyphs are decorative here (`accessibilityElementsHidden`). No SR difference.
4. **Bundle size.** Both are zero-bundle (system font). SVG would add ~3kb per icon for no perceptible benefit.

**Default if Sky says nothing:** Unicode geometric glyphs as specified in §5 (`◉` / `◈` / `◧`).

- [ ] Approve Unicode glyphs (default — matches existing tab bar)
- [ ] Edit — switch to emoji (e.g., `🤝` / `✋` / `📦`)
- [ ] Edit — defer icons entirely (no icon on any card; Quinn's spec allows this as a fallback)

### DFS-D2: Bottom-row Skip button — keep or drop?

Quinn's spec has Skip only in the top-right corner. Dani's design **adds a second Skip as the left button in the bottom row**, equal-width with Next.

**Dani's recommendation: Keep both Skip affordances (top-right + bottom-left).**

Reasoning:

1. The top-right Skip is small (visible text size ~14pt); even with `hitSlop`, it's harder to hit one-handed than the 136pt-wide bottom button.
2. The two affordances map to the same action — no decision paralysis.
3. The trust signal "this app gives me visible exits" is reinforced.
4. If Sky disagrees: the bottom-row Skip can be dropped and Next becomes a centered, half-width button. Top-right Skip remains the only escape (Quinn's original spec).

**Default if Sky says nothing:** Both Skip affordances ship (Dani's design as drawn above).

- [ ] Approve both Skip affordances (default)
- [ ] Edit — Skip only in top-right (Quinn's original spec); Next/Get-started becomes centered half-width

### DFS-D3: TourDots dot size — 6pt / 8pt / 10pt

**Dani's recommendation: 8pt with 4pt spacing between dots.**

Reasoning:

1. 6pt is too small to read at arm's length on a 6.7" phone.
2. 10pt looks chunky / playful — the wrong tone for a privacy-first app.
3. 8pt matches the typical iOS / Android page indicator size and matches `spacing.sm`.
4. 4pt gap (`spacing.xs`) is the smallest gap on the grid; keeps the indicator visually compact.

Total indicator width for 3 dots: 3 × 8pt + 2 × 4pt = **32pt**. Easy to centre, easy to scan, doesn't compete with the headline.

**Default if Sky says nothing:** 8pt dots, 4pt gap.

- [ ] Approve 8pt / 4pt (default)
- [ ] Edit — 6pt dots, 4pt gap (more minimal)
- [ ] Edit — 10pt dots, 6pt gap (more emphasis)

### DFS-D4: Card horizontal padding — 16pt vs 24pt

Quinn's instruction (in the design brief) recommends 24pt "for breathing room on dense copy."

**Dani's recommendation: 16pt — match the rest of the app's `spacing.md` screen padding.**

Reasoning:

1. The app's existing screens (`HomeScreen`, `ProfileScreen`, `SignInScreen`) all use 16pt screen edge padding. The tour should not feel like a different design language.
2. On a 320pt screen, 24pt × 2 = 48pt of horizontal padding leaves only 272pt for content — body copy on Card 3 already wraps at 200% type; tighter horizontal space makes that worse.
3. Vertical breathing room is provided by `spacing.xl` (32pt) between icon and headline + the flex-grow on the body region. Horizontal whitespace is not where the "calm" comes from.
4. If Sky prefers the roomier 24pt: bump `spacing.md` → `spacing.lg` in the screen padding. Cards then have 272pt content width — still works at 320pt screens, but pushes the dynamic-type Card 3 closer to overflow.

**Default if Sky says nothing:** 16pt (matches the rest of the app).

- [ ] Approve 16pt (default — matches the rest of the app)
- [ ] Edit — 24pt for the tour only (Quinn's "breathing room" recommendation)

### DFS-D5: Should the tour pre-mount Card 2 + Card 3 (eager) or render lazily?

Performance + UX tradeoff Peter would normally weigh in on.

**Dani's recommendation: Eager-mount all 3 cards inside the ScrollView.**

Reasoning:

1. Cards are pure static text. No images larger than a glyph. Mount cost is sub-millisecond per card.
2. Lazy-rendering would mean Card 2 and Card 3 "pop in" during swipe — visually janky.
3. The 3-card scope is small enough that pre-rendering is the right call. (If we ever ship a 10-card tour, revisit.)

**Default:** all 3 cards eager-rendered.

- [ ] Approve eager-render (default)
- [ ] Edit — lazy-render (Card 2 + 3 only mount when scrolled into view)

---

## FAIL_FAST / BLOCKER states

None. Design is a paper-only proposal; no code touched; no live database interaction; no external sends; warm-cream + clay-teal palette respected (no neutral-grey-only design); all WCAG checks pass with headroom.

---

## What I shipped (if anything)

**Proposal only — no files changed in main.**

This report is the entire deliverable. Files cited but not edited:

- `/Users/skypie/MutualMesh/qa-reports/spec-phase-2-onboarding-tour.md` (read — Quinn's spec)
- `/Users/skypie/MutualMesh/DESIGN.md` (read — token reference; NOT modified)
- `/Users/skypie/MutualMesh/src/lib/theme.ts` (read — token reference; NOT modified)
- `/Users/skypie/MutualMesh/src/components/Button.tsx`, `Card.tsx`, `FlashBanner.tsx`, `EmptyState.tsx`, `LoadingSkeleton.tsx`, `ConfirmationModal.tsx`, `TextField.tsx`, `StatusPill.tsx` (read — primitive inventory)
- `/Users/skypie/MutualMesh/src/lib/useReducedMotion.ts` (read — hook reference)
- `/Users/skypie/MutualMesh/src/navigation/RootNavigator.tsx` (read — Unicode-glyph icon pattern confirmation, contradicting Quinn's spec note about "emoji")
- `/Users/skypie/MutualMesh/tailwind.config.js` (read — NativeWind class verification)

**No new tokens proposed.** All 8 of the design's color tokens, all 4 spacing tokens, both motion tokens, and the `TOUCH_TARGET_MIN` constant already exist in `src/lib/theme.ts`. Quinn's `motion.swift` and `motion.snap` references are mapped to existing `motion.base` and `motion.fast` (50ms / 30ms drift is imperceptible).

**One new component proposed for Shamus to build:** `src/components/TourDots.tsx` (~25 lines; spec in §7).

---

## What's next

1. **Sky** resolves DFS-D1 through DFS-D5 (5 decisions, all with sensible defaults). The orchestrator can proceed on defaults if Sky doesn't override before Shamus starts.
2. **Shamus** builds `OnboardingTourScreen.tsx` + `TourDots.tsx` from this design, on `feat/mutualmesh-2026-05-24-shamus-tour-ui` (or the orchestrator-assigned branch). Compose existing `Button` primitive; do NOT use existing `Card`.
3. **Casey + Will + Jordan** finalize the copy in the cards (Quinn AC-4 + spec §"Privacy considerations"). Dani's design is copy-agnostic — any copy iteration that keeps the three load-bearing concepts will land cleanly in the layout.
4. **Alex** runs the screen-level a11y audit once Shamus has a working build: confirms the SR announcement fires once per card change, confirms focus order, confirms `useReducedMotion()` correctly disables the dot crossfade + scrollTo animation, confirms all 8 contrast pairs at runtime.
5. **Peter** sanity-checks: the 3-card pre-mount + the single RPC on Skip / Get-started are both well within budget; no pre-cycle perf review needed unless we deviate from eager-render (DFS-D5).
6. **Gary** writes snapshot tests at width 320 + at width 320 / fontScale 2.0; extends `verification.test.ts` per Quinn's spec.
7. **Design Compiler** (Const. Art. 2.4) runs before Shamus marks the UI DONE: this design's token list (§5) is the input to Layer 1 (Tokenization) — no raw hex, all 4pt grid, all motion gated on `useReducedMotion`.

— Dani, 2026-05-24 — file-only design proposal; no code touched, no external sends; Morgan owns the briefing channel.
