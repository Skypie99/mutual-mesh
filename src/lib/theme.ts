/**
 * Theme tokens for Mutual Mesh.
 *
 * NativeWind classes (tailwind.config.js) are the runtime source of truth for
 * styling. This file mirrors the same values for cases where a TS value is
 * needed (e.g., StatusBar tint, react-navigation theme, programmatic shadows).
 *
 * **All values are Dani v1 (2026-05-23).** Contrast ratios documented in
 * DESIGN.md; verified by Alex in qa-reports/2026-05-23_a11y-tokens.md.
 *
 * Rule: NO raw hex colors anywhere else in the codebase. Import from here, or
 * (preferably) use the matching NativeWind class.
 */

export const colors = {
  light: {
    bg: '#F7F3EE',
    surface: '#FFFFFF',
    text: '#1A1916',
    textSecondary: '#4A3D2C',
    textMuted: '#6B5640',
    border: '#D9CBBA',
    borderStrong: '#8B6F4E',
    accent: '#1F7A6A',
    accentText: '#FFFFFF',
    success: '#3F6B33',
    warning: '#8A5A1F',
    danger: '#8C2D2D',
  },
  dark: {
    bg: '#0E0D0B',
    surface: '#1A1916',
    text: '#F5F2EE',
    textSecondary: '#D9CBBA',
    textMuted: '#A8957D',
    border: '#2E2218',
    borderStrong: '#8A7659',
    accent: '#4FBFA8',
    accentText: '#0E0D0B',
    success: '#88BC73',
    warning: '#DBA951',
    danger: '#E07878',
  },
} as const;

export const radii = {
  card: 12,
  button: 8,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '600' as const },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '600' as const },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  h3: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyEmphasis: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  button: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/** Minimum touch target per WCAG 2.5.5 + Apple HIG + Material. */
export const TOUCH_TARGET_MIN = 44;

export type Mode = 'light' | 'dark';

/** Helper: pick the appropriate color palette for a mode. */
export function paletteFor(mode: Mode): (typeof colors)[Mode] {
  return colors[mode];
}
