/**
 * Pure helpers for push-notification preference merging — Phase 3.1.
 *
 * These functions never touch React, expo-notifications, AsyncStorage, or
 * Supabase. They are tested directly in `src/lib/__tests__/pushPreferences.test.ts`.
 *
 * Privacy posture (Quinn AC-1, AC-7):
 *   - DEFAULT is OFF for every trigger, master included.
 *   - Master OFF means no notifications, regardless of per-trigger booleans.
 *   - Per-trigger toggles in the UI are visible only when the master is ON.
 *
 * The merger always treats `null` / `undefined` server values as "use the
 * default" (all OFF). Anything else passes through. Callers should never
 * trust a stray `enabled: true` arriving from a stale cache without
 * looking at the per-trigger booleans — `shouldDeliverFor()` is the canonical
 * decision helper.
 */

import type { PushPreferences } from '@/types/database';
export type { PushPreferences } from '@/types/database';

/**
 * Canonical default preferences for a brand-new user. All OFF.
 *
 * This shape is also what Dana's migration sets as the DB DEFAULT for the
 * `push_preferences` JSONB column. Keep these in sync — the test
 * `pushPreferences.test.ts` references this constant.
 */
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  enabled: false,
  on_claim: false,
  on_pickup: false,
  on_approve: false,
  on_reject: false,
};

/**
 * The four trigger keys, in their canonical order. Used by the Profile UI
 * to render the per-trigger toggles in a stable order.
 */
export const PUSH_TRIGGERS: readonly ['on_claim', 'on_pickup', 'on_approve', 'on_reject'] = [
  'on_claim',
  'on_pickup',
  'on_approve',
  'on_reject',
] as const;

export type PushTriggerKey = (typeof PUSH_TRIGGERS)[number];

/**
 * Display labels for the per-trigger toggles. Pure data; localized later in
 * Phase 3.4 via the i18n bundle.
 */
export const PUSH_TRIGGER_LABELS: Record<PushTriggerKey, string> = {
  on_claim: 'When someone claims your post',
  on_pickup: 'When a pickup is confirmed',
  on_approve: 'When your account is approved',
  on_reject: 'When your account is reviewed',
};

/**
 * Microcopy under each toggle (Mara persona requirement — Spec AC-7).
 * Reinforces the "title-only on lockscreen" rule.
 */
export const PUSH_TRIGGER_MICROCOPY: Record<PushTriggerKey, string> = {
  on_claim: 'Title-only. The item name never appears on your lock screen.',
  on_pickup: 'Title-only. No item names ever.',
  on_approve: 'One-time. Title-only.',
  on_reject: 'One-time. Title-only.',
};

/**
 * Merge a possibly-partial preference patch onto the canonical defaults,
 * preserving every field that was already present and overwriting only the
 * fields supplied by `patch`.
 *
 * **Behavior:**
 * - `null` / `undefined` base treated as all defaults (so a freshly-signed-up
 *   user without a server row still produces a coherent object).
 * - `null` / `undefined` patch returns the base unchanged.
 * - The `enabled` field is special: if `patch.enabled === false` we OFF every
 *   per-trigger boolean too (sane revoke semantics — when the user turns the
 *   master off we shouldn't show stale per-trigger ON state).
 */
export function mergePushPreferences(
  base: PushPreferences | null | undefined,
  patch: Partial<PushPreferences> | null | undefined,
): PushPreferences {
  const safeBase: PushPreferences = base ?? DEFAULT_PUSH_PREFERENCES;
  if (!patch) return { ...safeBase };

  const next: PushPreferences = {
    ...safeBase,
    ...patch,
  };

  // Hard rule: master OFF means every trigger is OFF in the resulting view.
  // The server-side RPC must enforce this too; we mirror it on the client
  // so the UI never shows trigger=ON while master=OFF.
  if (next.enabled === false) {
    next.on_claim = false;
    next.on_pickup = false;
    next.on_approve = false;
    next.on_reject = false;
  }

  return next;
}

/**
 * Returns true if the given preference object would result in at least one
 * notification trigger firing.
 *
 * Used to:
 *   - Decide whether the client needs to register a push token at all
 *     (AC-1 + AC-8 client layer).
 *   - Decide whether the "Disable all notifications" button needs to do work.
 */
export function hasAnyTriggerEnabled(prefs: PushPreferences | null | undefined): boolean {
  const safe = prefs ?? DEFAULT_PUSH_PREFERENCES;
  if (safe.enabled !== true) return false;
  return Boolean(safe.on_claim || safe.on_pickup || safe.on_approve || safe.on_reject);
}

/**
 * Returns true if the recipient's preferences allow delivery for the given
 * trigger. Mirrors the Edge Function's pre-send check (Quinn AC-8 last layer)
 * so client decisions stay consistent with the server gate.
 */
export function shouldDeliverFor(
  prefs: PushPreferences | null | undefined,
  trigger: PushTriggerKey,
): boolean {
  const safe = prefs ?? DEFAULT_PUSH_PREFERENCES;
  if (safe.enabled !== true) return false;
  return Boolean(safe[trigger]);
}

/**
 * Flip every preference OFF without losing the keys. Used by the "Disable
 * all" button BEFORE the RPC round-trip so the UI reflects the action
 * instantly (the RPC's final state replaces this on success).
 */
export function disableAllPushPreferences(): PushPreferences {
  return { ...DEFAULT_PUSH_PREFERENCES };
}
