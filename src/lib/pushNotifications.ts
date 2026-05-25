/**
 * Push notification helper — Phase 3.1 client side.
 *
 * Wraps `expo-notifications` with the privacy-safe defaults Quinn's spec
 * mandates. Server-side (Edge Function `deliver_notification`) does the
 * actual send and re-checks the recipient's preferences as last-line
 * defense; this file is the thin client adapter.
 *
 * --- Title-only payload rule (Mara persona anti-goal #3 — AC-2) ---
 *
 * The notification payload sent from our Edge Function MUST always be:
 *
 *     {
 *       title:  "<one of four fixed strings, generic and resource-name-free>",
 *       body:   "",                       // EMPTY — load-bearing
 *       data:   { route: ..., id: ... },  // opaque routing key only
 *       sound:  null,                     // silent by default (DFS-4)
 *       _displayInForeground: true,
 *     }
 *
 * Forbidden in any payload, ever: resource name, claimant handle, item
 * description, category, postal prefix, contact handle, email, or any
 * other user-identifying field. The Edge Function fails-closed if
 * `body !== ""` — see supabase/functions/deliver_notification (Dana).
 *
 * --- Three-layer enforcement (AC-8) ---
 *
 * 1. Client (this file): refuses to register a token unless the user has
 *    at least one trigger ON.
 * 2. Server RPC `register_push_token`: same check, server-side, returns
 *    "No push preferences enabled" if the gate fails.
 * 3. Edge Function `deliver_notification`: re-checks the recipient's
 *    preferences immediately before send.
 *
 * If a stale token exists from a previous opt-in, the Edge Function's
 * pre-send re-check is the last line of defense.
 *
 * --- Mounted-ref pattern (CLAUDE.md gotcha #5) ---
 *
 * Callers MUST guard `setState` after any await on these helpers. The
 * helpers themselves never call React; that's the caller's job.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  hasAnyTriggerEnabled,
  mergePushPreferences,
  type PushPreferences,
} from './pushPreferences';

/**
 * What the OS reports about our notification permission status. Mirrors
 * the subset of expo-notifications' permission shape we care about.
 */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export type RegisterResult =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | {
      ok: false;
      reason: 'permission-denied' | 'no-preferences' | 'unsupported-platform' | 'rpc-failed';
      message?: string;
    };

/**
 * Returns the current OS permission status without prompting the user.
 * Useful for the Profile screen to show "permission denied — open Settings"
 * affordance without re-prompting on every render.
 */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Ask the OS for notification permission. iOS shows the system prompt the
 * first time only; Android 13+ shows it too. Returns the new status.
 *
 * Per Quinn DFS-6 default (a) — we only ask just-in-time, when the user
 * toggles a trigger ON. We never prompt on first launch or during onboarding.
 */
export async function requestPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: false,
      allowDisplayInCarPlay: false,
      allowCriticalAlerts: false,
      provideAppNotificationSettings: false,
      allowProvisional: false,
    },
  });
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Read the current Expo push token. Returns null if the OS hasn't issued
 * one yet (typical on simulators) or if our project id is missing.
 *
 * NOTE: This never logs the token (Spec AC-12 — Steve grep-checks for
 * `console.log(token)`).
 */
export async function getCurrentToken(): Promise<string | null> {
  try {
    const result = await Notifications.getExpoPushTokenAsync();
    return result.data;
  } catch {
    // Simulator / missing projectId / OS-level revoke — silent failure is
    // fine; the caller checks the return value.
    return null;
  }
}

/**
 * Resolve the current device platform into the enum the schema expects.
 * Returns null for unsupported platforms (web, etc.); the caller surfaces
 * that as a UX error.
 */
function detectPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/**
 * Request permission AND register an Expo push token with our server.
 *
 * Flow (AC-8 client layer):
 *   1. Check the caller's preferences — at least one trigger must be ON.
 *   2. Request OS permission (just-in-time per DFS-6 default).
 *   3. Read the Expo push token from the OS.
 *   4. Call `register_push_token(token, platform)` RPC. The RPC handles
 *      rotation (deletes the prior token for this (user, platform) pair)
 *      and the server-side preference gate.
 *
 * NEVER throws. Returns a discriminated result for the caller to map to UI.
 *
 * Mounted-ref pattern: callers MUST guard their setState after `await`.
 */
export async function requestPermissionAndRegister(
  prefs: PushPreferences | null | undefined,
): Promise<RegisterResult> {
  // Layer 1: client-side preference gate.
  if (!hasAnyTriggerEnabled(prefs)) {
    return { ok: false, reason: 'no-preferences' };
  }

  const platform = detectPlatform();
  if (!platform) {
    return { ok: false, reason: 'unsupported-platform' };
  }

  const permission = await requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'permission-denied',
      message: 'Notifications are disabled in your device settings.',
    };
  }

  const token = await getCurrentToken();
  if (!token) {
    return { ok: false, reason: 'rpc-failed', message: 'Could not read your device token.' };
  }

  // Layer 2: server-side preference gate inside the RPC.
  const { error } = await supabase.rpc('register_push_token', { token, platform });
  if (error) {
    return { ok: false, reason: 'rpc-failed', message: error.message };
  }

  return { ok: true, token, platform };
}

/**
 * Revoke registration with our server. Deletes all push_tokens rows for
 * the caller and flips every preference to false in one transaction.
 *
 * Idempotent: safe to call when nothing is registered.
 */
export async function revokeRegistration(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('revoke_push_token');
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Persist a preference patch on the server. Merges the patch with the
 * caller's existing preferences (server-side function) and returns the
 * merged result for the UI to reflect.
 *
 * On success, the AuthProvider's realtime subscription (user-row channel)
 * will also receive the UPDATE — but we return the result so the UI can
 * render optimistically without waiting on the realtime round-trip.
 */
export async function updatePreferences(
  current: PushPreferences | null | undefined,
  patch: Partial<PushPreferences>,
): Promise<{ ok: true; preferences: PushPreferences } | { ok: false; message: string }> {
  const merged = mergePushPreferences(current, patch);
  const { error } = await supabase.rpc('update_push_preferences', { prefs: merged });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, preferences: merged };
}
