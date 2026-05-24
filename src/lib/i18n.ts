/**
 * i18n setup — Phase 3.4 multi-language support.
 *
 * Provides locale detection, resolution, and message loading for
 * Mutual Mesh. Designed to work with react-intl (FormatJS) once
 * installed, but the pure helpers here have zero external dependencies.
 *
 * Privacy posture (Jordan LIGHT review):
 *   - No language detection from user-generated content (NEVER).
 *   - No AI translation (AC-9 hard rule).
 *   - No per-user language sent to server (device-local only).
 *   - AsyncStorage stores override as a simple 2-char locale code.
 *
 * Supported locales for v1: en (default), fr, es.
 * Brand name "Mutual Mesh" is NEVER translated (AC-12).
 */

// ============================================================================
// Locale types
// ============================================================================

/** Supported locale codes for v1. */
export type SupportedLocale = 'en' | 'fr' | 'es';

/** All supported locales, in display order. */
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'fr', 'es'] as const;

/** Display names for the locale picker (in their own language per convention). */
export const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
};

/** Default fallback locale. */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

// ============================================================================
// Message catalog type
// ============================================================================

/**
 * A message catalog is a flat map of message ID to message string.
 * ICU MessageFormat syntax is used for pluralization and variables.
 */
export type MessageCatalog = Record<string, string>;

// ============================================================================
// Message loading
// ============================================================================

import enMessages from '@/lib/messages/en';
import frMessages from '@/lib/messages/fr';
import esMessages from '@/lib/messages/es';

const MESSAGE_MAP: Record<SupportedLocale, MessageCatalog> = {
  en: enMessages,
  fr: frMessages,
  es: esMessages,
};

/**
 * Get the message catalog for a given locale. Falls back to English
 * if the locale is unknown.
 *
 * Pure. No async. Messages are bundled at build time.
 */
export function getMessages(locale: SupportedLocale): MessageCatalog {
  return MESSAGE_MAP[locale] ?? enMessages;
}

// ============================================================================
// Locale resolution — pure helper
// ============================================================================

/**
 * Resolve the active locale from device locale + user override.
 *
 * Algorithm:
 *   1. If `override` is a supported locale, use it (user explicitly picked).
 *   2. Otherwise, parse `deviceLocale` to extract the language prefix.
 *   3. If the prefix matches a supported locale, use it.
 *   4. Otherwise, fall back to DEFAULT_LOCALE ('en').
 *
 * Pure. Tested in `src/__tests__/i18n.test.ts`.
 *
 * @param deviceLocale - The raw device locale string (e.g., 'fr-CA', 'en-US', 'es-MX').
 * @param override - User's explicit language override from AsyncStorage, or null.
 * @param supported - The set of supported locales. Defaults to SUPPORTED_LOCALES.
 */
export function selectLocale(
  deviceLocale: string | null | undefined,
  override: string | null | undefined,
  supported: readonly string[] = SUPPORTED_LOCALES,
): SupportedLocale {
  // 1. User override takes priority
  if (override && supported.includes(override)) {
    return override as SupportedLocale;
  }

  // 2. Parse device locale
  if (deviceLocale) {
    const prefix = deviceLocale.split(/[-_]/)[0]?.toLowerCase();
    if (prefix && supported.includes(prefix)) {
      return prefix as SupportedLocale;
    }
  }

  // 3. Fallback
  return DEFAULT_LOCALE;
}

// ============================================================================
// Message completeness check — for CI / tests
// ============================================================================

/**
 * Check which message keys from the base (English) catalog are missing
 * in a target locale catalog. Returns the list of missing key IDs.
 *
 * Pure. Used by the i18n test suite to verify translation completeness.
 */
export function findMissingKeys(
  baseCatalog: MessageCatalog,
  targetCatalog: MessageCatalog,
): string[] {
  const missing: string[] = [];
  for (const key of Object.keys(baseCatalog)) {
    if (!(key in targetCatalog) || targetCatalog[key] === undefined) {
      missing.push(key);
    }
  }
  return missing.sort();
}

/**
 * Validate that all supported locale catalogs have every key from the
 * English base. Returns a map of locale -> missing keys.
 *
 * Pure. Used in CI tests.
 */
export function validateAllCatalogs(): Record<string, string[]> {
  const base = enMessages;
  const result: Record<string, string[]> = {};
  for (const locale of SUPPORTED_LOCALES) {
    if (locale === 'en') continue;
    const missing = findMissingKeys(base, MESSAGE_MAP[locale] ?? {});
    if (missing.length > 0) {
      result[locale] = missing;
    }
  }
  return result;
}

// ============================================================================
// AsyncStorage key for locale override
// ============================================================================

/**
 * AsyncStorage key for the user's language override. Non-sensitive.
 * Read once at app launch; updated when user changes language in Profile.
 */
export const LOCALE_OVERRIDE_KEY = 'mutualmesh.locale_override.v1';
