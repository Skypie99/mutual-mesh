// ============================================================================
// Mutual Mesh — exif-strip Edge Function
// ============================================================================
//
// PURPOSE
//   Second of two layers in PRIVACY.md D5 ("two-layer EXIF strip"). The client
//   strips with expo-image-manipulator before upload (src/lib/photos.ts); this
//   server-side function re-strips after the file lands in the
//   `resource-photos` bucket so a tampered or forked client cannot bypass.
//
// AUTHORITY
//   - PRIVACY.md D5 (Jordan-approved 2026-05-23, two-layer client+server strip)
//   - STRIDE T1 (location leak via EXIF) — Risk 8, mitigated only with this
//     layer in place; without it the residual jumps from L to M.
//   - Steve Phase 1 audit finding C1 (launch-blocker) —
//     qa-reports/phase-1-security-audit-2026-05-24.md
//
// RUNTIME
//   Deno (Supabase Edge Functions). Triggered by a Storage Webhook on the
//   `resource-photos` bucket for INSERT events. See README.md in this folder
//   for the dashboard wiring steps. Sky deploys via `supabase functions deploy
//   exif-strip` — file-only output from this task.
//
// LIBRARY CHOICE
//   `imagemagick_deno` — the official Deno port of magick-wasm. Reasons:
//     1. Supabase's own image-manipulation guide recommends magick-wasm; it is
//        WASM-based which is the only kind of image library Supabase Edge
//        Functions supports (no native deps like sharp).
//     2. Exposes an explicit `img.strip()` method that removes EXIF, IPTC, XMP,
//        ICC color profile, and other metadata. Equivalent to ImageMagick's
//        `convert in.jpg -strip out.jpg`. Auditable, well-tested API.
//     3. Re-encoding via ImageMagick mirrors what the client does with
//        expo-image-manipulator — both layers use a battle-tested decoder.
//     4. Handles PNG too, even though the client only uploads JPEG. Defense
//        against a forked client uploading PNG directly.
//
// IDEMPOTENCY
//   Re-running on an already-stripped file is a near-no-op (re-encodes
//   identical bitmap to identical metadata-free output; bytes may differ
//   slightly due to encoder quantization but no metadata is added). The
//   function uses a marker header (`x-amz-meta-exif-stripped`) on the upload
//   so a webhook redelivery skips the re-process entirely.
//
// AUTH
//   The Storage Webhook adds an `Authorization: Bearer <SUPABASE_ANON_KEY>`
//   header by default. We require a webhook secret (`STRIP_WEBHOOK_SECRET`)
//   in the `x-webhook-secret` header that Sky configures when wiring the
//   webhook — this is the only invocation gate. The function refuses any
//   request without it.
//
// FAILURE MODE
//   On any failure (download, decode, strip, re-upload), the function returns
//   500 with a short message. Per Steve's design recommendation we DO NOT
//   delete the original object on failure (keeping it makes the issue
//   recoverable; deleting it makes the post disappear silently). Sky monitors
//   via Supabase Edge Function logs; consecutive failures should trigger a
//   `qa-reports/` follow-up.
//
// DECISION FOR SKY (recorded in qa-reports/phase-2.5-c1-exif-edge-function.md)
//   - Keep-on-failure vs delete-on-failure: keep wins (no silent post loss).
//   - File-size ceiling: 10 MB hard cap. Larger files are rejected and the
//     original is left intact for Sky to triage.
//   - Race condition: if a claimant views the photo in the ~200ms before this
//     function completes, they may receive a still-EXIF-containing version.
//     The client-side strip is the load-bearing defense against that window.
// ============================================================================

import {
  ImageMagick,
  IMagickImage,
  initialize,
  MagickFormat,
} from 'https://deno.land/x/imagemagick_deno@0.0.31/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const BUCKET = 'resource-photos';

/**
 * Hard upper bound on photo size. Anything larger is refused — both because
 * Storage abuse (D2 in the STRIDE model) is a real risk and because magick-wasm
 * memory is bounded inside the Edge Function sandbox. The client compresses
 * via expo-image-manipulator to ~2048px / 0.75 quality which yields <2 MB
 * in practice, so 10 MB is generous slack.
 */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Custom metadata marker. After a successful strip we set this on the Storage
 * object's HTTP metadata so a webhook redelivery (or a retry after a transient
 * error) is a fast no-op instead of re-processing.
 */
const STRIPPED_MARKER_KEY = 'x-exif-stripped';
const STRIPPED_MARKER_VALUE = 'v1';

// ----------------------------------------------------------------------------
// Magick init — module-scoped so it runs once per container, not per request.
// initialize() loads the magick.wasm bytes; subsequent calls are no-ops.
// ----------------------------------------------------------------------------

let magickReady: Promise<void> | null = null;

function ensureMagickInitialized(): Promise<void> {
  if (!magickReady) {
    magickReady = initialize();
  }
  return magickReady;
}

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Shape of a Supabase Storage Webhook payload for an INSERT event on
 * storage.objects. Other event types (UPDATE, DELETE) are ignored.
 */
type StorageWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'objects';
  schema: 'storage';
  record: {
    id: string;
    bucket_id: string;
    name: string;
    metadata?: {
      size?: number;
      mimetype?: string;
      cacheControl?: string;
      [key: string]: unknown;
    } | null;
    user_metadata?: Record<string, unknown> | null;
  };
  old_record: unknown;
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Verify the webhook secret. Storage Webhooks let Sky set arbitrary headers;
 * we require `x-webhook-secret` to match the `STRIP_WEBHOOK_SECRET` env var.
 * Without this any caller could invoke and waste compute (and potentially
 * overwrite a Storage object with a re-encoded version).
 */
function verifyWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get('STRIP_WEBHOOK_SECRET');
  if (!expected) {
    // Fail-closed: if the secret isn't configured, refuse every request.
    return false;
  }
  const got = req.headers.get('x-webhook-secret');
  return got === expected;
}

/**
 * Pick the MagickFormat the encoder should emit. The client always uploads
 * JPEG, but defense-in-depth: if a forked client uploaded PNG, re-encode as
 * PNG. Anything else (HEIC, WEBP, GIF) is also a sign of a non-standard
 * client — we re-encode as JPEG to normalize.
 */
function pickOutputFormat(
  name: string,
  mimetype?: string,
): {
  format: MagickFormat;
  contentType: string;
} {
  const lower = (mimetype ?? '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (lower === 'image/png' || ext === 'png') {
    return { format: MagickFormat.Png, contentType: 'image/png' };
  }
  // JPEG is the default — matches the client (photos.ts forces .jpg).
  return { format: MagickFormat.Jpeg, contentType: 'image/jpeg' };
}

// ----------------------------------------------------------------------------
// Core: download → strip → re-upload
// ----------------------------------------------------------------------------

async function stripExifForObject(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  mimetype: string | undefined,
): Promise<{ stripped: boolean; reason?: string; bytesIn?: number; bytesOut?: number }> {
  // 1. Download.
  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(path);

  if (downloadError || !blob) {
    return { stripped: false, reason: `download_failed: ${downloadError?.message ?? 'no blob'}` };
  }

  const bytesIn = blob.size;
  if (bytesIn > MAX_BYTES) {
    return { stripped: false, reason: `oversized: ${bytesIn} > ${MAX_BYTES}` };
  }

  const inputBuf = new Uint8Array(await blob.arrayBuffer());

  // 2. Re-encode with strip().
  await ensureMagickInitialized();

  const { format, contentType } = pickOutputFormat(path, mimetype);

  let outputBuf: Uint8Array | null = null;
  try {
    await ImageMagick.read(inputBuf, async (img: IMagickImage) => {
      // strip() removes EXIF, IPTC, XMP, color profile, and other metadata.
      // Equivalent to `convert in.jpg -strip out.jpg`.
      img.strip();
      await img.write(format, (data: Uint8Array) => {
        // Copy the slice; the buffer is reused after the callback returns.
        outputBuf = new Uint8Array(data);
      });
    });
  } catch (err) {
    return {
      stripped: false,
      reason: `decode_failed: ${err instanceof Error ? err.message : String(err)}`,
      bytesIn,
    };
  }

  if (!outputBuf) {
    return { stripped: false, reason: 'no_output_buffer', bytesIn };
  }

  // 3. Re-upload, overwriting the original. Mark with the stripped header so
  //    a webhook redelivery sees it and skips.
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, outputBuf, {
    contentType,
    upsert: true,
    cacheControl: '3600',
    // user-defined metadata becomes object metadata on the Storage object.
    metadata: { [STRIPPED_MARKER_KEY]: STRIPPED_MARKER_VALUE },
  });

  if (uploadError) {
    return {
      stripped: false,
      reason: `upload_failed: ${uploadError.message}`,
      bytesIn,
      bytesOut: outputBuf.byteLength,
    };
  }

  return { stripped: true, bytesIn, bytesOut: outputBuf.byteLength };
}

// ----------------------------------------------------------------------------
// Entrypoint
// ----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // 1. Method gate.
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  // 2. Auth gate (the only invocation control).
  if (!verifyWebhookSecret(req)) {
    return jsonResponse(401, { error: 'invalid_webhook_secret' });
  }

  // 3. Parse payload.
  let payload: StorageWebhookPayload;
  try {
    payload = (await req.json()) as StorageWebhookPayload;
  } catch (_e) {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  if (payload.type !== 'INSERT') {
    // UPDATE/DELETE are not our concern; ack so the webhook doesn't retry.
    return jsonResponse(200, { skipped: 'not_insert', type: payload.type });
  }
  if (payload.schema !== 'storage' || payload.table !== 'objects') {
    return jsonResponse(200, { skipped: 'not_storage_objects' });
  }
  if (payload.record.bucket_id !== BUCKET) {
    return jsonResponse(200, { skipped: 'wrong_bucket', bucket: payload.record.bucket_id });
  }

  // 4. Idempotency check — if a prior run already marked this object stripped,
  //    skip. Avoids re-processing on webhook redelivery.
  const userMeta = payload.record.user_metadata ?? {};
  if (userMeta[STRIPPED_MARKER_KEY] === STRIPPED_MARKER_VALUE) {
    return jsonResponse(200, { skipped: 'already_stripped', path: payload.record.name });
  }

  // 5. Build a service-role client. The function runs server-side and needs
  //    to bypass RLS to download/overwrite the object.
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    return jsonResponse(500, { error: 'missing_env', url: !!url, serviceRole: !!serviceRoleKey });
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 6. Strip.
  const result = await stripExifForObject(
    supabase,
    BUCKET,
    payload.record.name,
    payload.record.metadata?.mimetype,
  );

  if (!result.stripped) {
    // Keep-on-failure per the DECISION FOR SKY. Sky alerted via function logs.
    console.error(
      `[exif-strip] FAILED path=${payload.record.name} reason=${result.reason} bytesIn=${result.bytesIn ?? '?'}`,
    );
    return jsonResponse(500, {
      error: 'strip_failed',
      reason: result.reason,
      path: payload.record.name,
    });
  }

  console.log(
    `[exif-strip] ok path=${payload.record.name} bytesIn=${result.bytesIn} bytesOut=${result.bytesOut}`,
  );
  return jsonResponse(200, {
    stripped: true,
    path: payload.record.name,
    bytesIn: result.bytesIn,
    bytesOut: result.bytesOut,
  });
});
