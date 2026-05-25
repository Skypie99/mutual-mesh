// ============================================================================
// Mutual Mesh — deliver_notification Edge Function
// ============================================================================
//
// PURPOSE
//   Fire-and-forget push notification delivery, called by server-side RPCs
//   (claim_resource, confirm_pickup, approve_user, reject_user) when a push
//   trigger fires. NEVER called by the client directly.
//
//   Implements Quinn's spec (qa-reports/spec-phase-3-push-notifications.md
//   Revision 2) and the full AC-8 three-layer consent gate as the SERVER LAYER:
//
//     Layer 1 (client): pushNotifications.ts hasAnyTriggerEnabled
//     Layer 2 (RPC):    register_push_token raises on unverified / disabled
//     Layer 3 (HERE):   deliver_notification re-checks before each send
//
// SECURITY POSTURE
//   - NEVER called by the client. Called via supabase.functions.invoke from
//     SECURITY DEFINER RPCs using the service-role key.
//   - All sensitive decisions (recipient_id, trigger source) are SERVER-DERIVED
//     inside the calling RPC — never from client payloads (AC-10 + AC-14).
//   - This function performs an ADDITIONAL recipient-authority check (AC-14)
//     as a defense-in-depth backstop.
//
// PRIVACY RULES — load-bearing; read before modifying
//   - Body is always "" (empty string). This function enforces it at build time
//     and fails-closed if the assertion ever fires (AC-2 — Mara anti-goal #3).
//   - Title is one of THREE fixed generic strings, never resource/user content.
//   - Logs contain NO user_id, NO expo_token, NO recipient_id, NO claim_id.
//     The cron_log row is a sanitized packed summary (AC-5).
//   - Rate-limits prevent spam-notification abuse (AC-15).
//   - 'EXPO_ACCESS_TOKEN' is a Supabase Edge Function secret, NEVER in source.
//
// AUTHORITY
//   - spec: qa-reports/spec-phase-3-push-notifications.md (Revision 2)
//   - steve: qa-reports/phase-3-steve-push-audit-2026-05-24.md
//   - dana: supabase/migrations/009, 010, 011_push_notifications.sql
//   - jordan: qa-reports/phase-3-jordan-review-push.md
//   - constitution: Art. 7.6 (privacy load-bearing — Sky-approved before merge)
//
// RUNTIME
//   Deno (Supabase Edge Functions). Same pattern as log-error.
//
// ENV SECRETS (set via `supabase secrets set ...` — never in source)
//   SUPABASE_URL          — auto-injected by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected; used for privileged DB reads
//   EXPO_ACCESS_TOKEN     — Expo Push API bearer token (Sky rotates quarterly)
//
// DEPLOYMENT
//   Sky runs: supabase functions deploy deliver_notification
//   This file is NEVER applied directly by any Claude Corp role.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ============================================================================
// Constants
// ============================================================================

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** AC-2 — the three fixed title strings. No other values permitted. */
const TITLE_BY_TRIGGER: Record<string, string> = {
  claim_placed: 'Your post has an update',
  pickup_confirmed: 'A pickup was confirmed',
  admin_approved: 'You have an update',
  admin_rejected: 'You have an update',
};

/**
 * AC-2 route destinations by trigger — opaque to the OS lockscreen renderer;
 * only readable in-app after the user opens the notification.
 */
const ROUTE_BY_TRIGGER: Record<string, string> = {
  claim_placed: 'ResourceDetail',
  pickup_confirmed: 'ResourceDetail',
  admin_approved: 'Home',
  admin_rejected: 'Home',
};

/**
 * AC-15 per-trigger-per-hour delivery caps.
 * Window unit for triggers 1 & 2: 1 hour.
 * Window unit for triggers 3 & 4: 24 hours.
 */
const RATE_LIMIT_CAP: Record<string, number> = {
  claim_placed: 20,
  pickup_confirmed: 10,
  admin_approved: 1,
  admin_rejected: 1,
};

/**
 * AC-15 window length in seconds per trigger.
 */
const RATE_LIMIT_WINDOW_SECONDS: Record<string, number> = {
  claim_placed: 3600, // 1 hour
  pickup_confirmed: 3600, // 1 hour
  admin_approved: 86400, // 24 hours
  admin_rejected: 86400, // 24 hours
};

/** Maps trigger names to push_preferences JSONB keys (AC-8 preference gate). */
const PREF_KEY_BY_TRIGGER: Record<string, string> = {
  claim_placed: 'on_claim',
  pickup_confirmed: 'on_pickup',
  admin_approved: 'on_approve',
  admin_rejected: 'on_reject',
};

// ============================================================================
// Types
// ============================================================================

type DeliverPayload = {
  trigger: string;
  recipient_id: string; // UUID — must be server-derived by calling RPC
  caller_user_id: string; // UUID — auth.uid() of the calling RPC session
  route_id?: string | null; // UUID — resource/claim id for in-app deep link
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: null;
  _displayInForeground: boolean;
};

type CronLogEntry = {
  delivered?: number;
  failed?: number;
  skipped_preference?: number;
  skipped_rate_limited?: number;
  skipped_authority?: number;
  assertion_failed?: number;
  reason_codes?: string;
};

// ============================================================================
// Helpers
// ============================================================================

function shortStatus(status: number, message: string): Response {
  return new Response(JSON.stringify({ status: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isValidPayload(obj: unknown): obj is DeliverPayload {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.trigger !== 'string' || !TITLE_BY_TRIGGER[o.trigger]) return false;
  if (typeof o.recipient_id !== 'string' || !isValidUUID(o.recipient_id)) return false;
  if (typeof o.caller_user_id !== 'string' || !isValidUUID(o.caller_user_id)) return false;
  if (o.route_id !== undefined && o.route_id !== null) {
    if (typeof o.route_id !== 'string' || !isValidUUID(o.route_id)) return false;
  }
  return true;
}

/**
 * Build the push payload (AC-2 + AC-9).
 *
 * This builder is intentionally DUPLICATED from any client-side helper —
 * the server is the load-bearing security boundary (spec AC-2 + Steve H1).
 * The body must always be an empty string; if the assertion fires, the
 * function fails-closed and no payload is sent.
 */
function buildPayload(
  expoToken: string,
  trigger: string,
  routeId: string | null | undefined,
): ExpoMessage {
  const title = TITLE_BY_TRIGGER[trigger];
  // AC-2 LOAD-BEARING ASSERTION — fails-closed if violated.
  // This must NEVER be removed; it is the server-side enforcement of the
  // "title-only on lockscreen" privacy rule (Mara anti-goal #3).
  const body = '';
  if (body !== '') {
    // This branch is unreachable by construction but is the explicit
    // fail-closed sentinel that Gary's Deno test asserts against.
    throw new Error('assertion: body must be empty string');
  }

  const route = ROUTE_BY_TRIGGER[trigger] ?? 'Home';

  return {
    to: expoToken,
    title: title!,
    body,
    data: {
      route,
      ...(routeId ? { id: routeId } : {}),
    },
    sound: null, // AC-6 — no audio alert; DFS-4 sound default is null
    _displayInForeground: true,
  };
}

/**
 * Sanitize an error_text string for cron_log. Strips any UUID-shaped
 * substrings so no recipient_id / token / user_id leaks (AC-5).
 */
function sanitizeErrorText(s: string): string {
  return s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]');
}

function packCronLog(entry: CronLogEntry): string {
  const parts: string[] = [];
  if (entry.delivered !== undefined) parts.push(`delivered=${entry.delivered}`);
  if (entry.failed !== undefined) parts.push(`failed=${entry.failed}`);
  if (entry.skipped_preference !== undefined)
    parts.push(`skipped_preference=${entry.skipped_preference}`);
  if (entry.skipped_rate_limited !== undefined)
    parts.push(`skipped_rate_limited=${entry.skipped_rate_limited}`);
  if (entry.skipped_authority !== undefined)
    parts.push(`skipped_authority=${entry.skipped_authority}`);
  if (entry.assertion_failed !== undefined)
    parts.push(`assertion_failed=${entry.assertion_failed}`);
  if (entry.reason_codes) parts.push(`reason_codes=${entry.reason_codes}`);
  return sanitizeErrorText(parts.join(';'));
}

// ============================================================================
// Entrypoint
// ============================================================================

Deno.serve(async (req: Request) => {
  // 1. CORS preflight (supports web build).
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, apikey',
        'access-control-max-age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return shortStatus(405, 'method_not_allowed');
  }

  // 2. Env validation.
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

  if (!supabaseUrl || !serviceRoleKey || !expoAccessToken) {
    // Misconfigured deployment — visible only in Supabase function logs.
    // No PII logged here (env var names only).
    console.error('[deliver_notification] missing_env');
    return shortStatus(500, 'misconfigured');
  }

  // 3. Parse + validate payload.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return shortStatus(400, 'unreadable_body');
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return shortStatus(400, 'invalid_json');
  }

  if (!isValidPayload(body)) {
    return shortStatus(400, 'invalid_payload');
  }

  const { trigger, recipient_id, caller_user_id, route_id } = body;

  // 4. Build privileged Supabase client (service role — bypasses RLS for
  //    the authority check and preference reads that must see any user's row).
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Mutable per-cycle log accumulator (aggregated into one cron_log row at end).
  let delivered = 0;
  let failed = 0;
  let skipped_preference = 0;
  let skipped_rate_limited = 0;
  let skipped_authority = 0;
  let assertion_failed = 0;
  const reason_codes: string[] = [];

  // -------------------------------------------------------------------------
  // STEP 1: AC-14 Recipient-authority check (defense-in-depth).
  //
  // Even though the calling RPC MUST derive recipient_id server-side (AC-10),
  // this check catches contract violations introduced by future code.
  //
  // Allowed relationships:
  //   (a) self-notification: recipient_id === caller_user_id
  //   (b) resources/claims linkage: caller posted a resource claimed by
  //       recipient, or vice versa, for trigger 1 & 2
  //   (c) admin → non-admin: caller is an admin, for trigger 3 & 4
  // -------------------------------------------------------------------------
  const { data: authorityOk, error: authorityErr } = await checkRecipientAuthority(
    supabase,
    trigger,
    recipient_id,
    caller_user_id,
  );

  if (authorityErr || !authorityOk) {
    // No IDs in the log (AC-5).
    console.error('[deliver_notification] authority_check_failed');
    skipped_authority = 1;
    await writeCronLog(supabase, 0, false, packCronLog({ skipped_authority }));
    // Return 200 — the calling RPC must not be disrupted by push failures (spec).
    return shortStatus(200, 'ok');
  }

  // -------------------------------------------------------------------------
  // STEP 2: AC-15 Rate-limit check.
  //
  // Atomically increment the counter for (recipient_id, trigger, window_start).
  // If over the cap, skip delivery.
  // -------------------------------------------------------------------------
  const windowSeconds = RATE_LIMIT_WINDOW_SECONDS[trigger] ?? 3600;
  const cap = RATE_LIMIT_CAP[trigger] ?? 20;
  const windowStart = computeWindowStart(windowSeconds);

  const { data: currentCount, error: rlErr } = await incrementRateLimit(
    supabase,
    recipient_id,
    trigger,
    windowStart,
  );

  if (rlErr) {
    // Rate-limit table unavailable — fail-open with logging (non-blocking).
    console.error(`[deliver_notification] rate_limit_error code=${rlErr.code ?? 'unknown'}`);
  } else if ((currentCount ?? 0) > cap) {
    skipped_rate_limited = 1;
    await writeCronLog(supabase, 0, false, packCronLog({ skipped_rate_limited }));
    return shortStatus(200, 'ok');
  }

  // -------------------------------------------------------------------------
  // STEP 3: AC-8 Layer 3 — preference re-check.
  //
  // Read the RECIPIENT's push_preferences and verify the specific trigger is ON.
  // If all triggers are OFF, also delete the stale push_tokens rows (H2 cleanup).
  // -------------------------------------------------------------------------
  const { data: recipientRow, error: prefErr } = await supabase
    .from('users')
    .select('push_preferences')
    .eq('id', recipient_id)
    .single();

  if (prefErr || !recipientRow) {
    // Can't verify preferences — fail-closed (no send without consent).
    console.error(`[deliver_notification] pref_read_failed code=${prefErr?.code ?? 'unknown'}`);
    skipped_preference = 1;
    await writeCronLog(supabase, 0, false, packCronLog({ skipped_preference }));
    return shortStatus(200, 'ok');
  }

  const prefs = (recipientRow.push_preferences ?? {}) as Record<string, unknown>;
  const masterEnabled = prefs['enabled'] === true;
  const prefKey = PREF_KEY_BY_TRIGGER[trigger];
  const triggerEnabled = prefKey ? prefs[prefKey] === true : false;

  if (!masterEnabled || !triggerEnabled) {
    // Preference gate failed — skip delivery.
    // If ALL triggers are now OFF, delete stale tokens (AC-3 H2 belt-and-braces).
    const allOff =
      !masterEnabled ||
      (!prefs['on_claim'] && !prefs['on_pickup'] && !prefs['on_approve'] && !prefs['on_reject']);

    if (allOff) {
      // Delete stale tokens — no log of recipient_id (AC-5).
      const { error: deleteErr } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', recipient_id);
      if (deleteErr) {
        console.error(
          `[deliver_notification] stale_token_delete_failed code=${deleteErr.code ?? 'unknown'}`,
        );
      }
    }

    skipped_preference = 1;
    await writeCronLog(supabase, 0, false, packCronLog({ skipped_preference }));
    return shortStatus(200, 'ok');
  }

  // -------------------------------------------------------------------------
  // STEP 4: Fetch recipient's push tokens.
  //
  // One row per platform (UNIQUE user_id, platform after migration 010).
  // Deliver to all registered platforms for this user.
  // -------------------------------------------------------------------------
  const { data: tokenRows, error: tokenErr } = await supabase
    .from('push_tokens')
    .select('id, expo_token, platform')
    .eq('user_id', recipient_id);

  if (tokenErr || !tokenRows || tokenRows.length === 0) {
    // No registered tokens — nothing to deliver. Not a failure.
    console.error(`[deliver_notification] no_tokens code=${tokenErr?.code ?? 'none'}`);
    await writeCronLog(supabase, 0, true, packCronLog({ delivered: 0 }));
    return shortStatus(200, 'ok');
  }

  // -------------------------------------------------------------------------
  // STEP 5: Build payload + AC-2 assertion + Expo delivery.
  //
  // Deliver to each token. One-at-a-time (Expo's 100-message batch is out of
  // scope — Phase 3.1 volume is <<100/day; spec §Out-of-scope P1 note).
  // -------------------------------------------------------------------------
  for (const tokenRow of tokenRows) {
    const expoToken: string = tokenRow.expo_token;

    // Build payload — may throw if body assertion is violated (unreachable by
    // construction, but fail-closed per AC-2 spec requirement).
    let message: ExpoMessage;
    try {
      message = buildPayload(expoToken, trigger, route_id ?? null);
    } catch (err) {
      // AC-2 assertion fired — log and abort WITHOUT sending.
      // No PII in log (no token, no recipient_id).
      console.error(`[deliver_notification] payload_assertion_failed trigger=${trigger}`);
      assertion_failed++;
      reason_codes.push('assertion');
      continue;
    }

    // POST to Expo Push API.
    let expoResponse: Response;
    try {
      expoResponse = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${expoAccessToken}`,
        },
        body: JSON.stringify(message),
      });
    } catch (fetchErr) {
      // Network-level failure — no PII logged.
      console.error(`[deliver_notification] delivery_failed reason=network`);
      failed++;
      reason_codes.push('network');
      continue;
    }

    if (!expoResponse.ok) {
      console.error(
        `[deliver_notification] delivery_failed reason=expo code=${expoResponse.status}`,
      );
      failed++;
      reason_codes.push(`expo:${expoResponse.status}`);
      continue;
    }

    // Parse Expo response to detect DeviceNotRegistered (AC-4 / spec DFS-3).
    let expoBody: unknown;
    try {
      expoBody = await expoResponse.json();
    } catch {
      // Can't parse response — treat delivery as succeeded (Expo accepted it).
      delivered++;
    }

    if (expoBody && typeof expoBody === 'object') {
      const data = (expoBody as Record<string, unknown>)['data'];
      if (data && typeof data === 'object') {
        const status = (data as Record<string, unknown>)['status'];
        const details = (data as Record<string, unknown>)['details'];
        if (status === 'error') {
          const errorType =
            details && typeof details === 'object'
              ? String((details as Record<string, unknown>)['error'] ?? 'unknown')
              : 'unknown';

          if (errorType === 'DeviceNotRegistered') {
            // DFS-3 auto-delete: token is stale — delete the specific row.
            // Log the event (no token in log — AC-5).
            console.error(`[deliver_notification] delivery_failed reason=DeviceNotRegistered`);
            const { error: delErr } = await supabase
              .from('push_tokens')
              .delete()
              .eq('id', tokenRow.id);
            if (delErr) {
              console.error(
                `[deliver_notification] stale_token_delete_failed code=${delErr.code ?? 'unknown'}`,
              );
            }
          } else {
            console.error(
              `[deliver_notification] delivery_failed reason=apns_fcm code=${errorType}`,
            );
            reason_codes.push(`apns_fcm:${errorType}`);
          }
          failed++;
          continue;
        }
      }
    }

    // Delivery accepted.
    delivered++;

    // Bump last_used_at (AC-4 / spec §token rotation).
    const { error: bumpErr } = await supabase
      .from('push_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);
    if (bumpErr) {
      // Non-fatal — stale-token cleanup cron is the backstop.
      console.error(
        `[deliver_notification] last_used_at_bump_failed code=${bumpErr.code ?? 'unknown'}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // STEP 6: Write aggregate cron_log row (AC-5).
  //
  // NO user_id, NO expo_token, NO recipient_id, NO claim_id.
  // Packed error_text with aggregate counts only.
  // -------------------------------------------------------------------------
  const overallSuccess = assertion_failed === 0 && failed === 0;
  const errorText = packCronLog({
    delivered,
    failed,
    skipped_preference,
    skipped_rate_limited,
    skipped_authority,
    assertion_failed,
    reason_codes: reason_codes.length > 0 ? reason_codes.join(',') : undefined,
  });

  await writeCronLog(supabase, delivered + failed, overallSuccess, errorText);

  return shortStatus(200, 'ok');
});

// ============================================================================
// AC-14 Authority check
// ============================================================================
//
// Returns { data: true, error: null } if the caller has a legitimate
// relationship to the recipient for this trigger. Fails-closed on any DB error.

async function checkRecipientAuthority(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  trigger: string,
  recipient_id: string,
  caller_user_id: string,
): Promise<{ data: boolean; error: Error | null }> {
  // (a) Self-notification (reserved, currently unused).
  if (recipient_id === caller_user_id) {
    return { data: true, error: null };
  }

  // (b) Admin-to-non-admin for approval/rejection triggers.
  if (trigger === 'admin_approved' || trigger === 'admin_rejected') {
    const { data, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', caller_user_id)
      .single();

    if (error) return { data: false, error };
    const isAdmin = data?.is_admin === true;

    if (!isAdmin) return { data: false, error: null };

    // Recipient must be a non-admin user.
    const { data: recipData, error: recipError } = await supabase
      .from('users')
      .select('id, is_admin')
      .eq('id', recipient_id)
      .single();

    if (recipError) return { data: false, error: recipError };
    // Can notify any non-admin user.
    return { data: recipData?.is_admin === false, error: null };
  }

  // (c) Resources/claims linkage for trigger 1 & 2.
  //
  // Trigger 1 (claim_placed): a claim was placed on a resource POSTED by
  // recipient — the caller must be a verified user who just claimed it.
  // Trigger 2 (pickup_confirmed): the caller confirmed a pickup on a resource
  // involving both parties.
  //
  // We verify a row in resources links both IDs in any direction to avoid
  // tightening the check beyond the spec while still catching misuse.
  const { data: linkData, error: linkError } = await supabase
    .from('resources')
    .select('id')
    .or(`posted_by.eq.${caller_user_id},claimed_by.eq.${caller_user_id}`)
    .or(`posted_by.eq.${recipient_id},claimed_by.eq.${recipient_id}`)
    .limit(1);

  if (linkError) return { data: false, error: linkError };
  return { data: (linkData?.length ?? 0) > 0, error: null };
}

// ============================================================================
// AC-15 Rate-limit increment (atomic upsert)
// ============================================================================

async function incrementRateLimit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recipient_id: string,
  trigger: string,
  window_start: string,
): Promise<{ data: number | null; error: Error | null }> {
  // Upsert the rate-limit row; increment count atomically via RPC-style update.
  // Supabase JS v2 does not natively support atomic increments on upsert, so we
  // use an INSERT ... ON CONFLICT ... DO UPDATE pattern via raw SQL or two steps.
  //
  // Step 1: Try INSERT with count=1 (new window).
  const { error: insertErr } = await supabase
    .from('push_rate_limit')
    .insert({
      user_id: recipient_id,
      trigger,
      window_start,
      count: 1,
    })
    .select();

  // If no conflict, the INSERT succeeded — count is 1 (first event in window).
  if (!insertErr) {
    return { data: 1, error: null };
  }

  // Conflict means a row already exists. Increment via UPDATE + read back.
  // The `count + 1` expression is safe inside a single-row UPDATE.
  const { data: updated, error: updateErr } = await supabase.rpc('increment_push_rate_limit', {
    p_user_id: recipient_id,
    p_trigger: trigger,
    p_window_start: window_start,
  });

  if (updateErr) {
    return { data: null, error: updateErr };
  }

  return { data: updated as number, error: null };
}

/**
 * Compute the start of the current rate-limit window, truncated to the
 * window size. Returns an ISO 8601 string suitable for the push_rate_limit PK.
 */
function computeWindowStart(windowSeconds: number): string {
  const now = Math.floor(Date.now() / 1000); // Unix seconds
  const windowStart = now - (now % windowSeconds); // truncate to window
  return new Date(windowStart * 1000).toISOString();
}

// ============================================================================
// cron_log writer (AC-5 — aggregate-only, no PII)
// ============================================================================

async function writeCronLog(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rows_affected: number,
  success: boolean,
  error_text: string,
): Promise<void> {
  const { error } = await supabase.from('cron_log').insert({
    job_name: 'push_deliver_batch',
    rows_affected,
    success,
    error_text: error_text || null,
  });

  if (error) {
    // cron_log write failure — not retriable; log the code only (no PII).
    console.error(`[deliver_notification] cron_log_write_failed code=${error.code ?? 'unknown'}`);
  }
}
