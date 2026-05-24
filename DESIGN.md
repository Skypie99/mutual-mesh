# Mutual Mesh — Design System

**Owner:** Dani (Creative Director).
**Status:** v1 — 2026-05-23 — proposed by Dani; Alex verifies in Loop 4.
**Source-of-truth for runtime styling:** `src/lib/theme.ts` (TS values) + `tailwind.config.js` (NativeWind classes).

---

## Mission (informs the visual language)

Mutual Mesh serves people in scarcity. The design feels **calm, dignified, and trustworthy** — not slick, not corporate, not gig-economy. Think community bulletin board, not Uber. The visual signal a user reads on opening the app is: _this is for me, this isn't trying to sell me anything, this won't make me feel watched._

## Design principles

1. **Warm, low-saturation, earthy.** No neon, no harsh blues, no hot reds. Palette anchors in clay/cream/teal — colors found in physical aid spaces (food banks, community kitchens), not in apps.
2. **Generous whitespace; never crowded.** A user in crisis can't parse busy layouts. Density is the enemy.
3. **Type does the work; chrome stays quiet.** Plain text-first layouts. Cards and shadows are minimal.
4. **Dark mode is a peer, not an afterthought.** Many users are outdoors / in shelters / on cracked screens. Dark is the daily-driver mode for half the audience.
5. **Touch targets ≥ 44pt.** Hands cold, stressed, in gloves, on cracked screens.
6. **Motion is opt-in via OS setting.** `prefers-reduced-motion: reduce` is the default behavior; we animate only if the user has explicitly enabled motion.
7. **Imagery is community-supplied or open-source.** No stock photos. Especially no stock photos of "people in need" — that's the saviorist trap Casey's mission narrative warns against.

---

## Color tokens (final v1)

All contrast ratios computed for the foreground vs. their **canonical paired background** (e.g., body text vs. `bg`). All ratios meet **WCAG 2.2 AA** thresholds: **≥4.5:1 for normal text**, **≥3:1 for large text and non-text UI components**. We aim for **≥5:1** on body text as headroom.

### Light mode

| Token                 | Hex       | Used for                            | Pair against   | Contrast | WCAG                                   |
| --------------------- | --------- | ----------------------------------- | -------------- | -------- | -------------------------------------- |
| `light.bg`            | `#F7F3EE` | Screen background                   | —              | —        | —                                      |
| `light.surface`       | `#FFFFFF` | Card / sheet background             | —              | —        | —                                      |
| `light.text`          | `#1A1916` | Body text                           | `light.bg`     | 15.6:1   | AAA                                    |
| `light.textSecondary` | `#4A3D2C` | Subtitles, captions                 | `light.bg`     | 9.2:1    | AAA                                    |
| `light.textMuted`     | `#6B5640` | Hint text, metadata                 | `light.bg`     | 5.8:1    | AA+                                    |
| `light.border`        | `#D9CBBA` | Dividers, card edges                | `light.bg`     | 1.4:1    | non-text (≥3:1 not required)           |
| `light.borderStrong`  | `#8B6F4E` | Form input borders                  | `light.bg`     | 4.24:1   | AA non-text (revised after Alex audit) |
| `light.accent`        | `#1F7A6A` | Primary actions, links              | `light.bg`     | 5.1:1    | AA                                     |
| `light.accentText`    | `#FFFFFF` | Text on accent buttons              | `light.accent` | 5.1:1    | AA                                     |
| `light.success`       | `#3F6B33` | Success banners, "Available" status | `light.bg`     | 5.5:1    | AA                                     |
| `light.warning`       | `#8A5A1F` | Warnings, expiry hints              | `light.bg`     | 5.4:1    | AA                                     |
| `light.danger`        | `#8C2D2D` | Errors, destructive actions         | `light.bg`     | 6.4:1    | AA+                                    |

### Dark mode

| Token                | Hex       | Used for                | Pair against  | Contrast | WCAG                                   |
| -------------------- | --------- | ----------------------- | ------------- | -------- | -------------------------------------- |
| `dark.bg`            | `#0E0D0B` | Screen background       | —             | —        | —                                      |
| `dark.surface`       | `#1A1916` | Card / sheet background | —             | —        | —                                      |
| `dark.text`          | `#F5F2EE` | Body text               | `dark.bg`     | 16.8:1   | AAA                                    |
| `dark.textSecondary` | `#D9CBBA` | Subtitles, captions     | `dark.bg`     | 11.2:1   | AAA                                    |
| `dark.textMuted`     | `#A8957D` | Hint text, metadata     | `dark.bg`     | 6.9:1    | AA+                                    |
| `dark.border`        | `#2E2218` | Dividers, card edges    | `dark.bg`     | 1.3:1    | non-text                               |
| `dark.borderStrong`  | `#8A7659` | Form input borders      | `dark.bg`     | 4.46:1   | AA non-text (revised after Alex audit) |
| `dark.accent`        | `#4FBFA8` | Primary actions, links  | `dark.bg`     | 8.3:1    | AAA                                    |
| `dark.accentText`    | `#0E0D0B` | Text on accent buttons  | `dark.accent` | 8.3:1    | AAA                                    |
| `dark.success`       | `#88BC73` | Success banners         | `dark.bg`     | 8.6:1    | AAA                                    |
| `dark.warning`       | `#DBA951` | Warnings                | `dark.bg`     | 9.2:1    | AAA                                    |
| `dark.danger`        | `#E07878` | Errors                  | `dark.bg`     | 7.5:1    | AAA                                    |

**Mode switching:** Driven by `Appearance.getColorScheme()` (React Native) on first render and `useColorScheme()` for live updates. No in-app override toggle in v1 (the OS toggle is canonical).

---

## Type scale

Font family: **system default** in v1 (San Francisco on iOS, Roboto on Android, system-ui on web). Custom font shipping deferred to v2 to minimize bundle size and avoid licensing complexity.

| Token          | Size | Weight | Line height | Used for                 |
| -------------- | ---- | ------ | ----------- | ------------------------ |
| `display`      | 32pt | 600    | 40pt        | Onboarding hero          |
| `h1`           | 24pt | 600    | 32pt        | Screen title             |
| `h2`           | 20pt | 600    | 28pt        | Section header           |
| `h3`           | 17pt | 600    | 24pt        | Card title               |
| `body`         | 16pt | 400    | 24pt        | Default text             |
| `bodyEmphasis` | 16pt | 600    | 24pt        | Strong inline            |
| `bodySmall`    | 14pt | 400    | 20pt        | Captions, secondary text |
| `caption`      | 12pt | 400    | 16pt        | Timestamps, metadata     |
| `button`       | 16pt | 600    | 24pt        | CTA labels               |

**Dynamic Type:** All sizes are baseline. The app respects iOS Dynamic Type and Android Font Scaling — values multiply by `PixelRatio.getFontScale()`. Layouts must accommodate up to 200% scaling without truncation.

---

## Spacing scale (4pt grid)

| Token | Value | Used for                    |
| ----- | ----- | --------------------------- |
| `xs`  | 4     | Tight inline gaps           |
| `sm`  | 8     | Default inline gaps         |
| `md`  | 16    | Card padding, screen edge   |
| `lg`  | 24    | Section spacing             |
| `xl`  | 32    | Major section breaks        |
| `xxl` | 48    | Empty-state vertical margin |

**Hit target rule:** Every interactive element has a minimum **44 × 44 pt** touch surface. If the visual element is smaller, padding extends the hit area (use `hitSlop` in React Native).

---

## Border radius

| Token    | Value | Used for                |
| -------- | ----- | ----------------------- |
| `card`   | 12    | Cards, sheets           |
| `button` | 8     | Buttons, inputs         |
| `pill`   | 9999  | Tag chips, status pills |

---

## Motion

**Default behavior: respect `prefers-reduced-motion`.** If the user has enabled reduce-motion on iOS / Android / browser, all transitions are skipped (instant state changes). The `useReducedMotion()` hook (Alex's pattern) guards every animation.

| Token  | Duration | Easing        | Used for                         |
| ------ | -------- | ------------- | -------------------------------- |
| `fast` | 120ms    | `ease-out`    | Press feedback, micro-animations |
| `base` | 200ms    | `ease-in-out` | Screen transitions, fade-ins     |
| `slow` | 320ms    | `ease-in-out` | Bottom sheets, modal entries     |

No spring physics in v1; deterministic easings only. Spring may be added in v2 if motion-enabled users request it.

---

## Component primitives (Dani specs, Shamus implements)

Each primitive lives in `src/components/`. Visual spec lives in `designs/` (Figma exports — Dani fills the folder in a later cycle).

### Button

Three variants: `primary`, `secondary`, `ghost`. All meet 44pt hit target. `primary` uses `accent` background + `accentText` foreground. Pressed state darkens by ~10% (NativeWind `active:` variant).

### Input

Text input. Border `borderStrong`, focus state thickens border + changes to `accent`. Label always present (no placeholder-as-label — accessibility anti-pattern).

### Card

`surface` background, `border` 1pt edge, `card` border-radius, `md` internal padding.

### FAB (Floating Action Button)

56pt round, `accent` background, `accentText` icon, positioned 16pt from bottom-right safe area. Shadow is minimal (`elevation: 2` Android, subtle shadow on iOS).

### FlashBanner

Top-anchored, slides in from top (skips animation if reduce-motion). Variants: `success`, `warning`, `danger`, `info`. Auto-dismiss after 4s; can be dismissed by tap. **Announces via `AccessibilityInfo.announceForAccessibility` exactly once on appearance.**

### ResourceCard

Used in the feed list. Image (square thumbnail, 80pt), title (`h3`), subtitle (`bodySmall`, status pill), caption (`caption`, postal prefix + age).

### StatusPill

Small pill showing `Available` / `Reserved`. `success` background for Available; `textMuted` background for Reserved. White text in both cases (contrast verified by Alex).

---

## Imagery guidance

- **No stock photos of people.** Especially no "people-in-need" stock — Casey's mission narrative explicitly rejects this.
- **Illustrations** (if any) should be loose, hand-drawn aesthetic — Maggie Appleton-style notebook sketches or open-source illustration sets like Open Doodles.
- **App icon / wordmark** TBD (deferred to v2; default Expo icon in dev).
- **Photos in the marketplace** are user-supplied and EXIF-stripped (see `PRIVACY.md` D5).

---

## What's NOT in this system (deferred)

- Custom font — deferred to v2 (bundle size + licensing).
- Brand mark / logo — deferred until Casey + Riley land enough community input to inform it.
- Illustrations — open-source set chosen in Cycle 6 or later.
- Spring animation — v2.
- Theme override (light/dark toggle inside the app) — v2 (OS-driven only in v1).

---

## Sign-off checklist

- [x] Color tokens listed with contrast ratios (Dani)
- [x] All ratios independently verified by Alex — see `qa-reports/2026-05-23_a11y-tokens.md` (Loop 4, 2026-05-23). Two `borderStrong` values revised to meet WCAG 1.4.11.
- [x] Type scale supports Dynamic Type up to 200% (asserted; Alex verifies in screen audits)
- [x] All interactive components meet 44pt hit target (asserted)
- [ ] All animations gated on `useReducedMotion()` (Shamus implements; Alex verifies)
- [ ] Components mocked in Figma → `designs/` (deferred; Cycle 0 ships token-based primitives without mockups)
