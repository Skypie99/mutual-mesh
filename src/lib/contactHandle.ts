/**
 * Contact-handle utilities.
 *
 * A poster supplies a "contact handle" with each resource — a Signal handle,
 * a Proton Mail alias, a Reddit username, etc. — that the claimant sees
 * after pressing Claim. We use a handle string instead of in-app chat
 * (per PRIVACY.md D2 + MVP scope decision).
 *
 * Steve's S3 hardening (qa-reports/2026-05-23_security-privacy-review.md):
 * - Cap length at 64 chars
 * - Reject any handle containing URLs (force a handle, not a link)
 * - Render only as plain `<Text>` in the UI (never auto-link)
 */

export const MAX_CONTACT_HANDLE_LENGTH = 64;

// Reject anything that looks like a URL or a dangerous URL scheme. Forces
// the user to type a handle, not a link. Steve S3 + Steve's loop-6 audit:
// `javascript:`, `data:`, and `vbscript:` are XSS vectors if ever rendered
// in an environment that auto-links text (web bundle, future chat). `tel:`
// and `mailto:` are not exploit vectors but defeat the "handle, not a link"
// rule; reject them so users type the bare email/phone instead.
const URL_PATTERN = /(https?:|javascript:|data:|vbscript:|tel:|mailto:|file:|www\.)/i;

export type ValidationResult = { ok: true } | { ok: false; reason: ValidationFailure };

export type ValidationFailure = 'empty' | 'too-long' | 'url-not-allowed';

/**
 * Validate a user-supplied contact handle.
 * Pure function — no side effects, no imports.
 */
export function validateContactHandle(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_CONTACT_HANDLE_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  if (URL_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'url-not-allowed' };
  }
  return { ok: true };
}

/**
 * Human-readable reason for a validation failure — used in form UI to
 * tell the user what to fix.
 */
export function validationFailureMessage(reason: ValidationFailure): string {
  switch (reason) {
    case 'empty':
      return 'Please enter a contact handle (Signal, email alias, etc.).';
    case 'too-long':
      return `Keep your handle under ${MAX_CONTACT_HANDLE_LENGTH} characters.`;
    case 'url-not-allowed':
      return 'Enter a handle, not a link. (Links can mislead claimants.)';
  }
}

export type HandleKind = 'email' | 'phone' | 'signal' | 'reddit' | 'other';

/**
 * Heuristically classify a handle so the UI can show a recognizable icon
 * (e.g., envelope for email, phone glyph for phone numbers).
 *
 * NOT for validation — only for display affordances. The handle is always
 * shown as-is; classification is cosmetic.
 */
export function classifyContactHandle(handle: string): HandleKind {
  const h = handle.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(h)) return 'email';
  if (/^\+?[\d\s\-()]{7,}$/.test(h)) return 'phone';
  if (/^@?signal/i.test(h) || /signal\.me/i.test(h)) return 'signal';
  if (/^(\/?u\/|reddit\.)/i.test(h)) return 'reddit';
  return 'other';
}
