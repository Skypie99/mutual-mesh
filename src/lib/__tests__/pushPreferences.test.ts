/**
 * Tests for the pure preferences merger — Phase 3.1 push notifications.
 *
 * These tests cover Quinn AC-1 (default OFF), AC-7 (per-trigger granularity),
 * and AC-3 (revoke semantics).
 */

import {
  DEFAULT_PUSH_PREFERENCES,
  disableAllPushPreferences,
  hasAnyTriggerEnabled,
  mergePushPreferences,
  PUSH_TRIGGERS,
  PUSH_TRIGGER_LABELS,
  PUSH_TRIGGER_MICROCOPY,
  shouldDeliverFor,
} from '@/lib/pushPreferences';

describe('DEFAULT_PUSH_PREFERENCES', () => {
  it('has every trigger OFF and master OFF (AC-1 load-bearing)', () => {
    expect(DEFAULT_PUSH_PREFERENCES).toEqual({
      enabled: false,
      on_claim: false,
      on_pickup: false,
      on_approve: false,
      on_reject: false,
    });
  });

  it('is frozen-shape with all four trigger keys + master', () => {
    expect(Object.keys(DEFAULT_PUSH_PREFERENCES).sort()).toEqual(
      ['enabled', 'on_approve', 'on_claim', 'on_pickup', 'on_reject'].sort(),
    );
  });
});

describe('PUSH_TRIGGERS metadata', () => {
  it('has exactly four trigger keys in canonical order', () => {
    expect(PUSH_TRIGGERS).toEqual(['on_claim', 'on_pickup', 'on_approve', 'on_reject']);
  });

  it('has a label and microcopy for every trigger', () => {
    for (const trigger of PUSH_TRIGGERS) {
      expect(typeof PUSH_TRIGGER_LABELS[trigger]).toBe('string');
      expect(PUSH_TRIGGER_LABELS[trigger].length).toBeGreaterThan(0);
      expect(typeof PUSH_TRIGGER_MICROCOPY[trigger]).toBe('string');
      expect(PUSH_TRIGGER_MICROCOPY[trigger].length).toBeGreaterThan(0);
    }
  });
});

describe('mergePushPreferences', () => {
  it('returns defaults when both base and patch are null', () => {
    expect(mergePushPreferences(null, null)).toEqual(DEFAULT_PUSH_PREFERENCES);
  });

  it('returns defaults when base is null and patch is empty', () => {
    expect(mergePushPreferences(null, {})).toEqual(DEFAULT_PUSH_PREFERENCES);
  });

  it('passes through base unchanged when patch is null', () => {
    const base = { enabled: true, on_claim: true, on_pickup: false };
    expect(mergePushPreferences(base, null)).toEqual({ ...base });
  });

  it('overlays a partial patch onto base, keeping unchanged fields', () => {
    const base = { enabled: true, on_claim: true, on_pickup: false, on_approve: false };
    const result = mergePushPreferences(base, { on_pickup: true });
    expect(result).toEqual({
      enabled: true,
      on_claim: true,
      on_pickup: true,
      on_approve: false,
    });
  });

  it('flips every per-trigger boolean OFF when master is patched to false (revoke semantics)', () => {
    const base = { enabled: true, on_claim: true, on_pickup: true, on_approve: true };
    const result = mergePushPreferences(base, { enabled: false });
    expect(result.enabled).toBe(false);
    expect(result.on_claim).toBe(false);
    expect(result.on_pickup).toBe(false);
    expect(result.on_approve).toBe(false);
    expect(result.on_reject).toBe(false);
  });

  it('does NOT mutate the input base object', () => {
    const base = { enabled: true, on_claim: true };
    const baseCopy = { ...base };
    mergePushPreferences(base, { on_pickup: true });
    expect(base).toEqual(baseCopy);
  });

  it('does NOT mutate the input patch object', () => {
    const patch = { on_claim: true };
    const patchCopy = { ...patch };
    mergePushPreferences(null, patch);
    expect(patch).toEqual(patchCopy);
  });

  it('treats undefined base same as null base', () => {
    expect(mergePushPreferences(undefined, { enabled: true })).toEqual({
      ...DEFAULT_PUSH_PREFERENCES,
      enabled: true,
    });
  });
});

describe('hasAnyTriggerEnabled', () => {
  it('returns false for the canonical defaults (all OFF)', () => {
    expect(hasAnyTriggerEnabled(DEFAULT_PUSH_PREFERENCES)).toBe(false);
  });

  it('returns false when master is OFF even if triggers are ON in the stale view', () => {
    // This shape shouldn't exist (merger zeroes triggers when master OFF),
    // but defense-in-depth: the consumer never assumes triggers ON without
    // master ON.
    const stale = { enabled: false, on_claim: true, on_pickup: true };
    expect(hasAnyTriggerEnabled(stale)).toBe(false);
  });

  it('returns false when master is ON but no triggers are ON', () => {
    expect(hasAnyTriggerEnabled({ enabled: true })).toBe(false);
  });

  it('returns true when master is ON and one trigger is ON', () => {
    expect(hasAnyTriggerEnabled({ enabled: true, on_claim: true })).toBe(true);
  });

  it('returns true when master is ON and all triggers are ON', () => {
    expect(
      hasAnyTriggerEnabled({
        enabled: true,
        on_claim: true,
        on_pickup: true,
        on_approve: true,
        on_reject: true,
      }),
    ).toBe(true);
  });

  it('treats null and undefined inputs as no-triggers-on', () => {
    expect(hasAnyTriggerEnabled(null)).toBe(false);
    expect(hasAnyTriggerEnabled(undefined)).toBe(false);
  });
});

describe('shouldDeliverFor', () => {
  it('returns false for every trigger when master is OFF', () => {
    const prefs = {
      enabled: false,
      on_claim: true,
      on_pickup: true,
      on_approve: true,
      on_reject: true,
    };
    for (const trigger of PUSH_TRIGGERS) {
      expect(shouldDeliverFor(prefs, trigger)).toBe(false);
    }
  });

  it('returns true only for the trigger that is ON', () => {
    const prefs = { enabled: true, on_claim: true };
    expect(shouldDeliverFor(prefs, 'on_claim')).toBe(true);
    expect(shouldDeliverFor(prefs, 'on_pickup')).toBe(false);
    expect(shouldDeliverFor(prefs, 'on_approve')).toBe(false);
    expect(shouldDeliverFor(prefs, 'on_reject')).toBe(false);
  });

  it('treats null and undefined as no-delivery', () => {
    for (const trigger of PUSH_TRIGGERS) {
      expect(shouldDeliverFor(null, trigger)).toBe(false);
      expect(shouldDeliverFor(undefined, trigger)).toBe(false);
    }
  });

  it('treats absent trigger key as no-delivery', () => {
    // Per-trigger keys are optional in the type; absence == false (AC-1).
    const prefs = { enabled: true };
    expect(shouldDeliverFor(prefs, 'on_claim')).toBe(false);
  });
});

describe('disableAllPushPreferences', () => {
  it('returns a fresh defaults object (all OFF)', () => {
    expect(disableAllPushPreferences()).toEqual(DEFAULT_PUSH_PREFERENCES);
  });

  it('returns a new object reference each call (no shared mutable state)', () => {
    const a = disableAllPushPreferences();
    const b = disableAllPushPreferences();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
