/**
 * Tests for i18n helpers — Phase 3.4 multi-language support.
 *
 * Covers locale resolution, message loading, and translation completeness.
 * Pure helpers only — no React, no AsyncStorage, no native deps.
 */

import {
  DEFAULT_LOCALE,
  findMissingKeys,
  getMessages,
  LOCALE_DISPLAY_NAMES,
  LOCALE_OVERRIDE_KEY,
  selectLocale,
  SUPPORTED_LOCALES,
  validateAllCatalogs,
} from '@/lib/i18n';
import enMessages from '@/lib/messages/en';
import frMessages from '@/lib/messages/fr';
import esMessages from '@/lib/messages/es';

// ============================================================================
// selectLocale — table-driven locale resolution
// ============================================================================

describe('selectLocale', () => {
  it('uses user override when it is a supported locale', () => {
    expect(selectLocale('en-US', 'fr')).toBe('fr');
    expect(selectLocale('en-US', 'es')).toBe('es');
    expect(selectLocale('fr-CA', 'en')).toBe('en');
  });

  it('ignores override when it is not a supported locale', () => {
    expect(selectLocale('fr-CA', 'de')).toBe('fr');
    expect(selectLocale('en-US', 'zh')).toBe('en');
  });

  it('parses device locale prefix correctly', () => {
    expect(selectLocale('fr-CA', null)).toBe('fr');
    expect(selectLocale('fr_CA', null)).toBe('fr');
    expect(selectLocale('es-MX', null)).toBe('es');
    expect(selectLocale('en-GB', null)).toBe('en');
    expect(selectLocale('en', null)).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE for unsupported device locales', () => {
    expect(selectLocale('zh-CN', null)).toBe('en');
    expect(selectLocale('ar-SA', null)).toBe('en');
    expect(selectLocale('de-DE', null)).toBe('en');
    expect(selectLocale('ja', null)).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE for null/undefined device locale', () => {
    expect(selectLocale(null, null)).toBe('en');
    expect(selectLocale(undefined, null)).toBe('en');
    expect(selectLocale(undefined, undefined)).toBe('en');
  });

  it('handles empty string device locale', () => {
    expect(selectLocale('', null)).toBe('en');
  });

  it('is case-insensitive on device locale prefix', () => {
    expect(selectLocale('FR-CA', null)).toBe('fr');
    expect(selectLocale('ES-MX', null)).toBe('es');
  });

  it('accepts a custom supported-locales list', () => {
    expect(selectLocale('de-DE', null, ['en', 'de'])).toBe('de');
    expect(selectLocale('fr-CA', null, ['en', 'de'])).toBe('en');
  });
});

// ============================================================================
// getMessages
// ============================================================================

describe('getMessages', () => {
  it('returns the English catalog for "en"', () => {
    const msgs = getMessages('en');
    expect(msgs).toBe(enMessages);
    expect(msgs['home.title']).toBe('Available now');
  });

  it('returns the French catalog for "fr"', () => {
    const msgs = getMessages('fr');
    expect(msgs).toBe(frMessages);
    expect(msgs['home.title']).toContain('[FR]');
  });

  it('returns the Spanish catalog for "es"', () => {
    const msgs = getMessages('es');
    expect(msgs).toBe(esMessages);
    expect(msgs['home.title']).toContain('[ES]');
  });
});

// ============================================================================
// findMissingKeys
// ============================================================================

describe('findMissingKeys', () => {
  it('returns an empty array when target has all base keys', () => {
    const base = { 'a.b': 'hello', 'c.d': 'world' };
    const target = { 'a.b': 'bonjour', 'c.d': 'monde' };
    expect(findMissingKeys(base, target)).toEqual([]);
  });

  it('returns missing keys sorted', () => {
    const base = { 'z.key': 'z', 'a.key': 'a', 'm.key': 'm' };
    const target = { 'a.key': 'a' };
    expect(findMissingKeys(base, target)).toEqual(['m.key', 'z.key']);
  });

  it('returns all keys when target is empty', () => {
    const base = { 'a.key': 'a', 'b.key': 'b' };
    expect(findMissingKeys(base, {})).toEqual(['a.key', 'b.key']);
  });

  it('returns an empty array when base is empty', () => {
    expect(findMissingKeys({}, { 'a.key': 'a' })).toEqual([]);
  });
});

// ============================================================================
// Translation completeness — FR and ES stubs have ALL EN keys
// ============================================================================

describe('translation completeness', () => {
  it('French catalog has every key from English', () => {
    const missing = findMissingKeys(enMessages, frMessages);
    expect(missing).toEqual([]);
  });

  it('Spanish catalog has every key from English', () => {
    const missing = findMissingKeys(enMessages, esMessages);
    expect(missing).toEqual([]);
  });

  it('validateAllCatalogs returns no missing keys', () => {
    const result = validateAllCatalogs();
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ============================================================================
// Catalog structure
// ============================================================================

describe('catalog structure', () => {
  it('English catalog has at least 50 keys (sanity check)', () => {
    const keyCount = Object.keys(enMessages).length;
    expect(keyCount).toBeGreaterThanOrEqual(50);
  });

  it('all English values are non-empty strings', () => {
    for (const [, value] of Object.entries(enMessages)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('French stubs all start with [FR]', () => {
    for (const [, value] of Object.entries(frMessages)) {
      expect(value).toMatch(/^\[FR\]/);
    }
  });

  it('Spanish stubs all start with [ES]', () => {
    for (const [, value] of Object.entries(esMessages)) {
      expect(value).toMatch(/^\[ES\]/);
    }
  });

  it('brand name "Mutual Mesh" is not a message key (AC-12)', () => {
    expect(enMessages).not.toHaveProperty('brand.name');
    expect(enMessages).not.toHaveProperty('app.name');
  });
});

// ============================================================================
// Constants
// ============================================================================

describe('i18n constants', () => {
  it('SUPPORTED_LOCALES includes en, fr, es', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('fr');
    expect(SUPPORTED_LOCALES).toContain('es');
  });

  it('DEFAULT_LOCALE is "en"', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('LOCALE_DISPLAY_NAMES has entries for all supported locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_DISPLAY_NAMES[locale]).toBeTruthy();
    }
    expect(LOCALE_DISPLAY_NAMES.fr).toBe('Français');
    expect(LOCALE_DISPLAY_NAMES.es).toBe('Español');
  });

  it('LOCALE_OVERRIDE_KEY is the expected AsyncStorage key', () => {
    expect(LOCALE_OVERRIDE_KEY).toBe('mutualmesh.locale_override.v1');
  });
});
