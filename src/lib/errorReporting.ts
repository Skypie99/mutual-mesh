/**
 * Anonymous error reporting — client side.
 *
 * Default OFF. Opt-in via Profile screen. Per PRIVACY.md D8 (NO third-party
 * SDKs in MVP — no Sentry, no Mixpanel, no analytics) the only sink is our
 * own `log-error` Supabase Edge Function, which hashes the message + stack
 * server-side and stores ONLY the SHA-256 hashes in public.error_reports
 * (migration 008).
 *
 * Two layers of PII defense:
 *   1. Client-side heuristic stripping in `stripPii()` below. Runs BEFORE
 *      the raw text leaves the device. Matches: emails, Canadian postal
 *      codes (full + FSA), URLs with embedded auth tokens, handle-like
 *      strings. See PII_HEURISTICS for the canonical list.
 *   2. Server-side SHA-256 hashing inside the Edge Function. Even after
 *      client stripping, the Edge Function further reduces the text to a
 *      hash so the raw string never lands in any persistent store.
 *
 * Silent failure: any network / serialization / storage error is swallowed.
 * Logging errors should never crash the app or surface to the user.
 *
 * Storage key convention matches `categoryStorage.ts`:
 *   `mutualmesh.errorReporting.optIn.v1`
 * (versioned so a future shape change can be ignored).
 *
 * AUTHORITY
 *   - PRIVACY.md D8 (Sky-approved 2026-05-23)
 *   - ~/.claude/plans/goofy-singing-steele.md §2 Tier 4 #22 (Phase 4)
 *   - qa-reports/2026-05-23_threat-model-stride.md I7 (data minimization)
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ============================================================================
// Constants — exported for tests
// ============================================================================

/**
 * AsyncStorage key for the opt-in flag. Versioned so a future shape change
 * can ignore stale keys. Mirrors categoryStorage's `FILTER_STORAGE_KEY`.
 */
export const OPT_IN_STORAGE_KEY = 'mutualmesh.errorReporting.optIn.v1';

/** Default state: opt-in is OFF until the user explicitly enables it. */
export const DEFAULT_OPT_IN = false;

/** Hard upper bound on message/stack chars sent to the Edge Function. */
export const MAX_MESSAGE_CHARS = 8 * 1024;
export const MAX_STACK_CHARS = 32 * 1024;

// ============================================================================
// Storage adapter — lazy-required to keep pure helpers importable in
// pure-Jest tests without pulling the native AsyncStorage module. Same
// pattern as src/lib/categoryStorage.ts.
// ============================================================================

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function getStorage(): AsyncStorageLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-async-storage/async-storage');
  return (mod.default ?? mod) as AsyncStorageLike;
}

// ============================================================================
// PII heuristic stripping — pure, exported for tests
// ============================================================================

/**
 * Replacement label used for each redacted PII span. Stable across runs so
 * the server-side hash for the same logical error remains stable too — two
 * users encountering "email=alice@example.com" both produce
 * "email=[REDACTED_EMAIL]" which hashes to the same fingerprint.
 */
export const REDACTED_EMAIL = '[REDACTED_EMAIL]';
export const REDACTED_POSTAL = '[REDACTED_POSTAL]';
export const REDACTED_HANDLE = '[REDACTED_HANDLE]';
export const REDACTED_TOKEN = '[REDACTED_TOKEN]';

/**
 * The four PII heuristics applied to message + stack BEFORE the text leaves
 * the device. Each entry: a stable label + the regex.
 *
 * Order matters: tokens (URLs with auth) match first because they may
 * contain emails or handle-like fragments inside the URL. Emails next, then
 * postal codes, then bare handles.
 *
 * The regexes intentionally err on the side of OVER-stripping. A false
 * positive (e.g. redacting "user1234" that happens to look like a handle)
 * is harmless — we lose one bit of crash context. A false negative (leaking
 * an email through) is a privacy regression and a much higher cost.
 */
export const PII_HEURISTICS: ReadonlyArray<{ label: string; regex: RegExp; replacement: string }> =
  [
    {
      // Token leakage in URLs and free-text — query-string and bare-assignment
      // auth tokens (?token=..., token=..., access_token=..., api_key=..., jwt=...,
      // secret=...) and bearer-style "Authorization: ..." header fragments. The
      // character class allows the long opaque values these typically carry.
      // Replaces the value while preserving the param name so the crash shape
      // is still readable (e.g. "GET /v1/x?token=[REDACTED_TOKEN]").
      //
      // Catches Supabase signed URLs (?token=eyJ..., a JWT-shaped string) which
      // is a realistic stack-trace leak path for our app — the photos.ts helper
      // produces exactly this URL shape. Also catches bare `token=...` strings
      // that may appear in HTTP-debug stack frames or in console.error rest-args
      // joined into the message text.
      //
      // The 16-char length floor on the value is the false-positive guard: a
      // short literal like `code=42` doesn't match.
      label: 'token',
      regex:
        /((?:\b(?:access_)?token|\bapi[_-]?key|\bjwt|\bsecret|\bauth(?:orization)?|Bearer\s+|\bkey)\s*=?\s*)[A-Za-z0-9\-_.~+/=]{16,}/gi,
      replacement: `$1${REDACTED_TOKEN}`,
    },
    {
      // Email — RFC-lite. Local-part allows the common subset (no obscure
      // quoted forms — those are essentially zero in stack traces). Domain
      // requires at least one dot and two-letter TLD floor.
      label: 'email',
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      replacement: REDACTED_EMAIL,
    },
    {
      // Canadian postal code. Two shapes:
      //   - Full: A1A 1A1 or A1A1A1 (with optional space)
      //   - FSA-only (the 3-char form we store per PRIVACY.md D3): A1A
      // The full form is matched first; the FSA pattern below only fires on
      // FSAs that are not part of a full code (the global replace processes
      // matches left-to-right, and the full pattern consumes the longer
      // match before the FSA pattern sees it).
      //
      // We accept the FSA pattern even though our schema stores it
      // (postal_prefix). A bug-report that says "FSA M5V missing handler"
      // is a privacy leak we'd rather over-strip than emit.
      label: 'postal_full',
      regex: /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/g,
      replacement: REDACTED_POSTAL,
    },
    {
      // FSA-only fallback. Same character class as the full form's prefix.
      // 5-digit US ZIP would NOT match (digit start) so this is Canada-only,
      // matching our app's audience.
      label: 'postal_fsa',
      regex: /\b[A-Z]\d[A-Z]\b/g,
      replacement: REDACTED_POSTAL,
    },
    {
      // Handle-like — matches our handleGenerator.ts output shape
      // (adjective-noun-NNNN) AND common user-supplied handle patterns
      // (@signaluser, /u/redditname, u/redditname). Word boundary + length
      // floor avoids stripping every short identifier.
      //
      // Note: this is the most aggressive heuristic and the most likely to
      // false-positive. The pillar-of-trust ordering accepts that cost: in
      // a surveillance-averse app, "we over-redacted your stack trace" is
      // never the wrong choice.
      label: 'handle',
      regex:
        /(?:@[A-Za-z0-9_.]{2,32}\b|\b\/?u\/[A-Za-z0-9_.-]{2,32}\b|\b[a-z]{3,16}-[a-z]{3,16}-\d{4}\b)/g,
      replacement: REDACTED_HANDLE,
    },
  ];

/**
 * Apply all PII heuristics in order. Pure — no IO. Idempotent (running
 * twice produces the same output as running once because the replacement
 * labels don't match any heuristic).
 *
 * Exported for unit testing — the test file asserts each heuristic catches
 * its intended pattern AND the redaction labels themselves do not get
 * re-redacted.
 *
 * @privacy-load-bearing PRIVACY.md §E1 — strips PII from error messages
 * before they leave the device. Do not remove heuristics or weaken regex
 * patterns without Jordan review. Failure here leaks email addresses,
 * tokens, phone numbers, and postal codes in error reports.
 */
export function stripPii(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  let output = input;
  for (const { regex, replacement } of PII_HEURISTICS) {
    // RegExp objects with the /g flag are stateful in JS; constructing a
    // fresh copy per call avoids cross-call lastIndex bleed under unusual
    // call patterns. Negligible perf cost.
    const safe = new RegExp(regex.source, regex.flags);
    output = output.replace(safe, replacement);
  }
  return output;
}

// ============================================================================
// Platform helpers — pure, testable
// ============================================================================

/**
 * Normalize Platform.OS to the 3-value enum the schema accepts
 * (`ios | android | web`). Anything unexpected falls back to 'web' as the
 * least-revealing default. Exported for tests.
 */
export function normalizePlatform(os: string): 'ios' | 'android' | 'web' {
  if (os === 'ios' || os === 'android') return os;
  return 'web';
}

/**
 * Read the app version from expo-constants. Pure-ish — it reads
 * Constants.expoConfig?.version which is a static string baked at build
 * time. Falls back to '0.0.0' so the schema's NOT NULL constraint never
 * blocks a report. Exported for tests.
 */
export function getAppVersion(): string {
  const v =
    (Constants?.expoConfig?.version as string | undefined) ??
    (Constants?.manifest2?.extra?.expoClient?.version as string | undefined) ??
    '0.0.0';
  // Defensive cap to the schema's 32-char limit.
  return v.slice(0, 32);
}

// ============================================================================
// Endpoint URL resolver — pure
// ============================================================================

/**
 * Compute the log-error Edge Function URL. Precedence:
 *   1. `EXPO_PUBLIC_LOG_ERROR_URL` env var (explicit override).
 *   2. Derived from `EXPO_PUBLIC_SUPABASE_URL` by appending
 *      `/functions/v1/log-error` (standard Supabase shape).
 *   3. `null` if neither is configured — caller should bail.
 *
 * Exported for tests.
 */
export function resolveLogErrorUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_LOG_ERROR_URL;
  if (explicit && explicit.length > 0) return explicit;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && supabaseUrl.length > 0) {
    return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/log-error`;
  }
  return null;
}

// ============================================================================
// Opt-in IO
// ============================================================================

/**
 * Read the persisted opt-in flag. Returns DEFAULT_OPT_IN (false) on any
 * error — missing key, IO error, parse failure. Never throws.
 */
export async function getErrorReportingOptIn(): Promise<boolean> {
  try {
    const raw = await getStorage().getItem(OPT_IN_STORAGE_KEY);
    if (raw === null) return DEFAULT_OPT_IN;
    return raw === 'true';
  } catch {
    return DEFAULT_OPT_IN;
  }
}

/**
 * Persist the opt-in flag. Best-effort — silently swallows IO errors.
 * Returns void for caller simplicity (the toggle is a UX nicety, not a
 * correctness gate).
 */
export async function setErrorReportingOptIn(value: boolean): Promise<void> {
  try {
    await getStorage().setItem(OPT_IN_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Intentionally swallowed — see JSDoc.
  }
}

// ============================================================================
// Reporting
// ============================================================================

/**
 * Pure extractor — given an `unknown` error value, produce { message, stack }
 * strings. Always returns strings (never null) so the Edge Function's
 * NOT-NULL inputs are guaranteed. Exported for tests.
 */
export function extractErrorParts(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return {
      message: error.message ?? '',
      stack: error.stack ?? '',
    };
  }
  if (typeof error === 'string') {
    return { message: error, stack: '' };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    const s = (error as { stack?: unknown }).stack;
    return {
      message: typeof m === 'string' ? m : String(m ?? ''),
      stack: typeof s === 'string' ? s : '',
    };
  }
  return { message: String(error ?? ''), stack: '' };
}

/**
 * Fire-and-forget error report. Workflow:
 *   1. Read opt-in flag from AsyncStorage. If false, return early — no
 *      network call, no logging.
 *   2. Extract message + stack from the error value.
 *   3. Strip PII (4 heuristics — emails, postal codes, tokens, handles).
 *   4. Truncate to the Edge Function's max-input sizes.
 *   5. POST to the log-error Edge Function. Use the anon key in the
 *      Authorization header so Supabase's function gateway accepts it.
 *   6. Swallow any failure silently — logging should never crash the app.
 *
 * The function does NOT await network completion in a way that matters to
 * the caller — but `await`-ing inside is fine because the helper itself
 * isn't critical-path.
 */
export async function logError(
  error: unknown,
  severity: 'error' | 'warning' = 'error',
): Promise<void> {
  try {
    const optedIn = await getErrorReportingOptIn();
    if (!optedIn) return;

    const url = resolveLogErrorUrl();
    if (!url) return;

    const { message, stack } = extractErrorParts(error);

    // PII strip first, THEN truncate. Stripping the full text first means
    // a redaction label that lands across the truncation boundary still
    // appears as a clean "[REDACTED_*]" rather than a hanging "[REDACT".
    const safeMessage = stripPii(message).slice(0, MAX_MESSAGE_CHARS);
    const safeStack = stripPii(stack).slice(0, MAX_STACK_CHARS);

    const payload = {
      app_version: getAppVersion(),
      platform: normalizePlatform(Platform.OS),
      severity,
      message: safeMessage,
      stack: safeStack,
    };

    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

    // fetch with no-store cache hint; the response body isn't read (the
    // Edge Function returns 204 on success and we don't care about the
    // body on failure either). Failures (network, 5xx, 429) throw or
    // resolve — both branches go through the catch in the outer try.
    await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        // Supabase Edge Functions require the project's anon (or auth'd)
        // key in either Authorization or apikey header. Anon is fine — the
        // function is GRANT EXECUTE TO anon on the underlying RPC.
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Intentionally swallowed. Logging errors must never crash the app or
    // surface to the user. See JSDoc.
  }
}
