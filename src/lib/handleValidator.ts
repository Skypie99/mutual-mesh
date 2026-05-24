/**
 * Handle validator.
 *
 * **PRIVACY.md D1/D2 EDITED:** No real names anywhere. The validator runs at
 * signup step 3 (handle picker) and any future "edit handle" UI.
 *
 * Per DFS-C1.1 (decisions-applied 2026-05-23): the real-name check is a
 * **SOFT WARNING, never a block.** Reasoning:
 *   - Hard-blocking has high false-positive cost (creative handles get rejected)
 *   - The random-handle default + visible warning copy is the load-bearing UX
 *   - User agency: someone choosing to use their real name should be allowed to
 *
 * Returns:
 *   - { ok: true }              when the handle is fine
 *   - { ok: false, reason }     when it must be fixed (empty / too-long / format / reserved)
 *   - { ok: true, warning }     when it's allowed but worth flagging (real-name shape)
 */

const MIN_HANDLE_LENGTH = 3;
const MAX_HANDLE_LENGTH = 32;

// Allowed handle characters: lowercase letters, digits, hyphens. No spaces,
// no underscores (to keep visual character distinct from a username regex
// from other apps), no special chars.
const HANDLE_FORMAT = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Reserved handles the marketplace shouldn't allow (impersonation surface,
// admin look-alikes, generic system terms). Steve S3-adjacent.
const RESERVED_HANDLES = new Set([
  'admin',
  'moderator',
  'mod',
  'support',
  'help',
  'staff',
  'system',
  'mutualmesh',
  'mutual-mesh',
  'mesh',
  'jordan',
  'morgan',
  'sky',
  'official',
  'verified',
  'team',
]);

/**
 * Common given names — used ONLY for the soft warning. Deliberately short
 * and broad; we are not gate-keeping names. If a user wants to be `sage`
 * (which is also one of our adjectives), we let them — but we ask if they
 * meant their real name. List is illustrative, not exhaustive; intentionally
 * includes names from multiple cultures.
 *
 * Casey may want to review/extend this list once real-world signup data
 * exists (DFS-C1.1).
 */
const COMMON_FIRST_NAMES = new Set([
  // Anglophone
  'john',
  'jane',
  'mary',
  'james',
  'mike',
  'michael',
  'sarah',
  'sara',
  'david',
  'emma',
  'olivia',
  'noah',
  'liam',
  'sophia',
  'lucas',
  'ava',
  'mia',
  // Hispanic/Latinx
  'maria',
  'carlos',
  'jose',
  'juan',
  'ana',
  'sofia',
  'diego',
  'lucia',
  // Arabic / Muslim-majority cultures
  'mohammed',
  'mohamed',
  'ahmed',
  'omar',
  'fatima',
  'aisha',
  'ali',
  'hassan',
  'yousef',
  // East Asian
  'wei',
  'jing',
  'min',
  'hiro',
  'yuki',
  'sakura',
  'haruto',
  'yui',
  // South Asian
  'arjun',
  'priya',
  'rahul',
  'anika',
  'rohan',
  'isha',
  'aarav',
  'diya',
  // West African
  'kofi',
  'ade',
  'amara',
  'kwame',
  'nia',
  'zara',
  // Eastern European / Slavic
  'sasha',
  'mikhail',
  'olga',
  'anna',
  'nikolai',
  'vlad',
  'irina',
  // Continental European
  'pierre',
  'jean',
  'sophie',
  'henri',
  'klaus',
  'greta',
  // Indigenous (small sample; respectful inclusion — flag for Casey)
  'tahnee',
  'kai',
  'aiyana',
  // Hebrew/Israeli
  'noa',
  'tal',
  'shira',
  'eitan',
]);

export type HandleValidationFailure =
  | 'empty'
  | 'too-short'
  | 'too-long'
  | 'invalid-format'
  | 'reserved';

export type HandleValidationResult =
  | { ok: true; warning?: 'looks-like-real-name' }
  | { ok: false; reason: HandleValidationFailure };

/**
 * Validate a user-supplied handle.
 *
 * Hard rejections (must fix): empty, too-short, too-long, invalid-format, reserved.
 * Soft warning (allowed but flagged): looks-like-real-name.
 */
export function validateHandle(input: string): HandleValidationResult {
  const trimmed = input.trim().toLowerCase();

  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length < MIN_HANDLE_LENGTH) return { ok: false, reason: 'too-short' };
  if (trimmed.length > MAX_HANDLE_LENGTH) return { ok: false, reason: 'too-long' };
  if (!HANDLE_FORMAT.test(trimmed)) return { ok: false, reason: 'invalid-format' };
  if (RESERVED_HANDLES.has(trimmed)) return { ok: false, reason: 'reserved' };

  // Soft warning: if the handle is a single token (no hyphens, no digits)
  // matching a common given name, flag it. The user can ignore.
  if (looksLikeRealName(trimmed)) {
    return { ok: true, warning: 'looks-like-real-name' };
  }

  return { ok: true };
}

/**
 * Internal: does this input look like a single-token real name? Pure, exported
 * for testing.
 */
export function looksLikeRealName(input: string): boolean {
  const t = input.trim().toLowerCase();
  // Multi-token handles are out — they don't read as a real name.
  if (t.includes('-') || /\d/.test(t)) return false;
  return COMMON_FIRST_NAMES.has(t);
}

/**
 * Human-readable message for a validation failure. Used in the form UI.
 */
export function handleFailureMessage(reason: HandleValidationFailure): string {
  switch (reason) {
    case 'empty':
      return 'Please choose a handle.';
    case 'too-short':
      return `Handle must be at least ${MIN_HANDLE_LENGTH} characters.`;
    case 'too-long':
      return `Handle must be at most ${MAX_HANDLE_LENGTH} characters.`;
    case 'invalid-format':
      return 'Handles can use lowercase letters, digits, and hyphens. No spaces or special characters.';
    case 'reserved':
      return 'That handle is reserved. Please choose another.';
  }
}

/**
 * Copy for the soft warning when looksLikeRealName fires. Per DFS-C1.1.
 */
export function realNameWarningMessage(): string {
  return (
    "Reminder: your handle is public — don't use your real name unless you're choosing to. " +
    'Try the randomized suggestion if you want privacy.'
  );
}
