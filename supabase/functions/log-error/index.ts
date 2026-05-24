// ============================================================================
// Mutual Mesh — log-error Edge Function
// ============================================================================
//
// PURPOSE
//   The server side of PRIVACY.md D8 ("NO third-party SDKs in MVP. No Sentry,
//   no Mixpanel, no analytics."). The client (src/lib/errorReporting.ts) opts
//   in to anonymous crash reporting and POSTs the raw error message + stack
//   here. This function:
//     1. Verifies it is a POST with a recognized JSON body.
//     2. Rate-limits per IP at 10/min in-process (no DB hit when limited).
//     3. Strips X-Forwarded-For and User-Agent from anything it logs.
//     4. SHA-256-hashes message + stack so the raw text NEVER reaches:
//          - the Postgres table (only hashes are stored)
//          - the Supabase Edge Function logs (we only console.log path/status)
//          - any backup snapshot (the row contains only hashes)
//     5. Calls the public.log_error RPC with hashes only.
//     6. Returns 204 on success; never returns details on failure.
//
// AUTHORITY
//   - PRIVACY.md D8 (Sky-approved 2026-05-23; "no third-party error trackers"
//     replaced with a minimal self-hosted endpoint).
//   - ~/.claude/plans/goofy-singing-steele.md §2 Tier 4 #22 (Phase 4 task).
//   - qa-reports/2026-05-23_threat-model-stride.md I7 (this function plus the
//     migration introduce + mitigate the residual I7 risk).
//
// RUNTIME
//   Deno (Supabase Edge Functions). Same pattern as `exif-strip` next door.
//   Sky deploys via `supabase functions deploy log-error` — file-only output
//   from this task. See README.md for the deploy walkthrough.
//
// AUTH POSTURE
//   Anonymous — the function accepts the project's anon key in the
//   Authorization header (Supabase's default for client-invoked functions).
//   The reasons we do NOT require a per-call secret like exif-strip does:
//     - The client invocation must work from the app for any user (opted in
//       or not — the opt-in gate is on the client side).
//     - The endpoint already does NOT store user identity, IP, or UA, so a
//       leaked anon key reaches an endpoint that produces no PII.
//     - Rate-limiting at 10/min/IP bounds abuse.
//     - The RPC's input validation rejects garbage (non-hex hashes, bad
//       platform/severity strings, etc.) before any row write.
//
// FAILURE MODE
//   Returns 204 on success, 4xx for malformed requests, 429 when rate-limited,
//   500 for internal errors. The response body on non-2xx is intentionally
//   sparse (one short status string) — never echoes the request, never echoes
//   stack frames. The client (errorReporting.ts) swallows all failures
//   silently per the brief; this function just refuses cleanly.
//
// DECISIONS / FLAGS FOR SKY (recorded in qa-reports/phase-4-error-reporting-2026-05-24.md)
//   1. Hashing is SHA-256 (Web Crypto subtle digest). No salt, no namespace
//      — two clients reporting the same crash produce the same hash, which
//      is the whole point of aggregation. A future "salt the hash so even
//      Sky cannot brute-force common shapes" is overkill for v1.
//   2. Rate-limit is in-process per-container — a multi-container Edge
//      deployment effectively allows N×10/min where N is the active container
//      count. Acceptable: the goal is burst suppression, not strict quota.
//   3. The function does NOT trust the client to hash. The brief is explicit
//      ("HASHES message + stack server-side") — that defends against a
//      tampered client that sends pre-hashed raw text under the hash field.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB. Stack traces are usually <16 KB.
const MAX_MESSAGE_CHARS = 8 * 1024; // 8 KB of raw message text. Anything longer is truncated.
const MAX_STACK_CHARS = 32 * 1024; // 32 KB of raw stack. Anything longer is truncated.
const MAX_APP_VERSION_CHARS = 32;

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ----------------------------------------------------------------------------
// In-process rate limiter
// ----------------------------------------------------------------------------
//
// One Map per container. Each entry tracks the rolling window of timestamps
// for an IP. Capped at RATE_LIMIT_PER_MINUTE; older entries are dropped.
// Memory is bounded — entries with no recent activity are pruned opportunistically
// inside `isRateLimited`.

const rateLimitState: Map<string, number[]> = new Map();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const previous = rateLimitState.get(ip) ?? [];
  // Keep only timestamps within the rolling window.
  const recent = previous.filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_PER_MINUTE) {
    // Save back the trimmed list so the next call still sees an accurate count.
    rateLimitState.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateLimitState.set(ip, recent);
  // Opportunistic GC — every ~100 requests, drop empty buckets.
  if (rateLimitState.size > 1000) {
    for (const [k, v] of rateLimitState.entries()) {
      if (v.length === 0 || v[v.length - 1]! < cutoff) {
        rateLimitState.delete(k);
      }
    }
  }
  return false;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function shortStatus(status: number, message: string): Response {
  // Sparse error responses — never echo request data. The Content-Type is
  // set so the client errorReporting.ts can parse the status without
  // tripping CORS preflight (we serve JSON across origins).
  return new Response(JSON.stringify({ status: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Derive a stable per-caller key for rate-limiting. We prefer X-Forwarded-For
 * (Supabase's standard reverse-proxy header) over CF-Connecting-IP. If neither
 * is present, fall back to a single "unknown" bucket — the worst case is
 * lumping all unknown callers together which is acceptable for v1.
 *
 * IMPORTANT: this value is used ONLY for the in-process Map key. It is NEVER
 * logged, written to a table, or returned. Per PRIVACY.md D8 + STRIDE I7,
 * IP must not be persisted.
 */
function getRateLimitKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    // X-Forwarded-For can be a comma-separated list; the first entry is the
    // origin client. Trim whitespace.
    return fwd.split(',')[0]!.trim();
  }
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}

/**
 * Compute SHA-256 of a UTF-8 string. Returns 64-char lowercase hex.
 *
 * This is the load-bearing privacy guarantee: the input string is hashed
 * synchronously inside this function — it is never written to a table or
 * logged. The RPC accepts only the hash.
 */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Defensive truncation. If a misconfigured client sends a 10MB stack trace,
 * we hash the first MAX_STACK_CHARS rather than refusing — partial
 * fingerprinting beats no fingerprinting. Total payload is also capped via
 * MAX_PAYLOAD_BYTES at the request-body stage.
 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

type LogErrorPayload = {
  app_version: string;
  platform: 'ios' | 'android' | 'web';
  severity: 'error' | 'warning';
  message: string;
  stack: string;
};

function isValidPayload(obj: unknown): obj is LogErrorPayload {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.app_version !== 'string') return false;
  if (o.app_version.length < 1 || o.app_version.length > MAX_APP_VERSION_CHARS) return false;
  if (o.platform !== 'ios' && o.platform !== 'android' && o.platform !== 'web') return false;
  if (o.severity !== 'error' && o.severity !== 'warning') return false;
  if (typeof o.message !== 'string') return false;
  if (typeof o.stack !== 'string') return false;
  return true;
}

// ----------------------------------------------------------------------------
// Entrypoint
// ----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // 1. CORS preflight — the client may be running on the web build (Expo
  //    web export) and hit this from a different origin. Supabase Edge
  //    Functions normally pass through CORS; we add the bare minimum.
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

  // 2. Method gate.
  if (req.method !== 'POST') {
    return shortStatus(405, 'method_not_allowed');
  }

  // 3. Rate limit BEFORE doing any work that touches the DB. The key is
  //    derived from X-Forwarded-For but NEVER persisted (PRIVACY.md D8 +
  //    STRIDE I7). We also discard the value as soon as the request ends —
  //    only the in-process Map holds it transiently.
  const rlKey = getRateLimitKey(req);
  if (isRateLimited(rlKey)) {
    // Don't echo the IP in the response body. Just a generic 429.
    return shortStatus(429, 'rate_limited');
  }

  // 4. Body size gate. Read the full body once; refuse oversized payloads
  //    BEFORE calling JSON.parse so we never allocate megabytes of string.
  let raw: string;
  try {
    const len = req.headers.get('content-length');
    if (len && Number(len) > MAX_PAYLOAD_BYTES) {
      return shortStatus(413, 'payload_too_large');
    }
    raw = await req.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return shortStatus(413, 'payload_too_large');
    }
  } catch {
    return shortStatus(400, 'unreadable_body');
  }

  // 5. Parse + shape-validate.
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return shortStatus(400, 'invalid_json');
  }
  if (!isValidPayload(payload)) {
    return shortStatus(400, 'invalid_payload');
  }

  // 6. Hash message + stack server-side. The raw strings live in this
  //    function's local scope and are released as soon as the function
  //    returns; they are never written to a table, log, or backup.
  const messageHash = await sha256Hex(truncate(payload.message, MAX_MESSAGE_CHARS));
  const stackHash = await sha256Hex(truncate(payload.stack, MAX_STACK_CHARS));

  // 7. Build a Supabase client. We use the anon key (auto-injected) — the
  //    log_error RPC is GRANT EXECUTE TO anon (migration 008) and is
  //    SECURITY DEFINER, so the anon key has enough privilege to call it
  //    but no read access to the underlying table.
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    // Misconfigured deployment. Sky-only visible in function logs.
    console.error('[log-error] missing env');
    return shortStatus(500, 'misconfigured');
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  // 8. Call the RPC. On any failure we log the path (status only — no
  //    request body, no hashes, no IP) and return 500. Successful calls
  //    return 204 with no body to minimize information leak.
  const { error } = await supabase.rpc('log_error', {
    p_app_version: payload.app_version,
    p_platform: payload.platform,
    p_severity: payload.severity,
    p_message_hash: messageHash,
    p_stack_hash: stackHash,
  });

  if (error) {
    // The RPC raises 'invalid_*' on validation regressions; we already
    // pre-validate so this should only fire on infrastructure errors.
    console.error(`[log-error] rpc_failed code=${error.code ?? 'unknown'}`);
    return shortStatus(500, 'ingest_failed');
  }

  // 9. Success. 204 No Content — no body, minimum information leak.
  return noContent();
});
