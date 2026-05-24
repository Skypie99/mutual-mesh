# exif-strip — Supabase Edge Function

Second layer of the two-layer EXIF strip per PRIVACY.md D5. The client (`src/lib/photos.ts`, `expo-image-manipulator`) is the first layer; this function is the belt-and-braces second layer. Triggered by a Storage Webhook on `INSERT` events in the `resource-photos` bucket; it downloads the new object, re-encodes it via `imagemagick_deno` (the WASM port of ImageMagick) with `strip()`, and overwrites the same path with the cleaned bytes.

Closes Steve audit finding **C1** (launch-blocker) from `qa-reports/phase-1-security-audit-2026-05-24.md`. Closes the PRIVACY.md D5 promise that was downgraded by a code comment.

**This file is the deploy guide for Sky. The Edge Function source is `index.ts` next to this file. The Cowork pair that wrote it did NOT deploy — Sky deploys.**

---

## Prerequisites

- Supabase CLI installed locally: `npm i -g supabase` (or `brew install supabase/tap/supabase`).
- Logged in: `supabase login` (uses Sky's Supabase account).
- Project linked: from the repo root, `supabase link --project-ref <your-project-ref>` (the ref is the subdomain of your project URL, e.g. `abcdefghijklmno` for `https://abcdefghijklmno.supabase.co`).
- Project secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist as built-in secrets on every Supabase project (no action needed).

---

## 1. Generate a webhook secret

This secret is the only thing preventing arbitrary callers from invoking the function and wasting compute / overwriting objects. Make it long and random.

```sh
# macOS / Linux. Pick any sufficiently long random string.
openssl rand -hex 32
```

Copy the output. You will paste it twice in the next two steps.

---

## 2. Set the webhook secret on the function

```sh
# From the repo root (~/MutualMesh).
supabase secrets set STRIP_WEBHOOK_SECRET=<paste-the-openssl-output-here>
```

Verify it landed:

```sh
supabase secrets list
# should include STRIP_WEBHOOK_SECRET with a masked value
```

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every Edge Function — no need to set them by hand.

---

## 3. Deploy the function

From the repo root:

```sh
supabase functions deploy exif-strip
```

The CLI will print the function URL. It looks like:

```
https://<project-ref>.supabase.co/functions/v1/exif-strip
```

Copy this URL. You will paste it in the next step.

---

## 4. Wire the Storage Webhook

In the Supabase Dashboard:

1. Open the project → **Database** → **Webhooks** (NOT the Storage tab; storage triggers live under Database Webhooks because `storage.objects` is a Postgres table).
2. Click **Create a new hook**.
3. Configure:
   - **Name:** `exif-strip-on-upload`
   - **Table:** `storage.objects`
   - **Events:** check **Insert** only (leave Update/Delete unchecked)
   - **Type:** HTTP Request
   - **HTTP method:** POST
   - **URL:** the function URL from step 3
   - **HTTP Headers:**
     - `Content-Type` → `application/json`
     - `x-webhook-secret` → the secret from step 1 (same value)
   - **HTTP Params:** none
4. Click **Confirm** to save.

The webhook fires on every INSERT into `storage.objects` — including buckets other than `resource-photos`. The function itself filters and ignores any other bucket (returns 200 with `skipped: wrong_bucket`), so this is safe but slightly wasteful. If you want to filter at the webhook layer, add a **conditions** clause in the dashboard:

```
bucket_id = 'resource-photos'
```

---

## 5. Verify it works

The test you want: upload a photo that has known EXIF (especially GPS) and check that the stored object has none after the function runs.

### 5a. Create a known-EXIF-rich test photo

On macOS, any photo straight from Photos.app preserves GPS + device + timestamp. Or use an old phone photo. To inspect:

```sh
brew install exiftool        # if not already
exiftool ~/Desktop/test.jpg  # prints all metadata; look for GPSLatitude, Model, etc.
```

You should see lines like `GPS Latitude`, `GPS Longitude`, `Camera Model Name`, `Date/Time Original`. **If your test image does not have these, the test will pass trivially and prove nothing.** Pick a photo with real EXIF.

### 5b. Upload via the app

1. Run the app: `npm start`.
2. Sign in as a verified test user.
3. Add a resource and pick the test photo.
4. Wait ~2 seconds (the webhook fires a moment after the upload completes).

### 5c. Inspect the stored object

In the Supabase Dashboard → Storage → `resource-photos` → find the new file (path is `<user-uuid>/<timestamp>.jpg`). Click it, then **Download**. Re-run exiftool:

```sh
exiftool ~/Downloads/<timestamp>.jpg
```

A successful strip looks like (only basic JPEG container info remains):

```
File Name             : 1716598000000.jpg
File Size             : ...
MIME Type             : image/jpeg
JFIF Version          : 1.01
Image Width           : 2048
Image Height          : 1536
Encoding Process      : Baseline DCT, Huffman coding
Bits Per Sample       : 8
Color Components      : 3
```

**No `GPS *`, no `Make`, no `Model`, no `Date/Time Original`, no `Software` lines.** If you see any of those, the function is not running or is failing. Check the function logs (step 6) and the webhook delivery history.

### 5d. (Optional) Test idempotency

Re-trigger the webhook manually from the dashboard → Webhooks → exif-strip-on-upload → **Send a test event**. The function should return 200 with `skipped: already_stripped` — proving re-runs are no-ops once the marker is set.

---

## 6. Watch the logs

In the dashboard → **Edge Functions** → **exif-strip** → **Logs** tab. Every invocation prints either:

- `[exif-strip] ok path=... bytesIn=... bytesOut=...` (success)
- `[exif-strip] FAILED path=... reason=... bytesIn=...` (failure — keeps the original)

For programmatic alerting, `console.error` lines also surface in the project's `log_drain` if Sky has one configured.

---

## 7. Rollback procedure

If the function misbehaves and you want to restore the prior single-layer (client-only) state:

```sh
# 1. Delete the webhook (Dashboard → Database → Webhooks → exif-strip-on-upload → Delete).
#    This stops new invocations immediately.

# 2. Delete the function.
supabase functions delete exif-strip

# 3. (Optional) Remove the secret.
supabase secrets unset STRIP_WEBHOOK_SECRET
```

Files already in the `resource-photos` bucket that were processed are now stripped permanently — there is no un-strip. The `src/lib/photos.ts` client layer remains unchanged and will keep stripping client-side; you are back to the (auditably-broken) PRIVACY.md D5 promise that the C1 audit finding documented. Restore the function whenever you're ready.

---

## 8. Cost & quota notes

- Each invocation downloads + re-uploads the photo (2× the bucket bytes for one POST event).
- magick-wasm is a ~10 MB WASM binary loaded once per cold start. First invocation per container is slower (~1-2s); subsequent are ~200-400ms.
- The function memory ceiling on Supabase Edge Functions is 256 MB by default; the 10 MB photo cap in `index.ts` keeps us well below that.
- For Mutual Mesh's expected volume (Phase 1 = a single Tier-1 community, ~50 photos/week), this is negligible cost.

---

## 9. What this function deliberately does NOT do

- **Does not delete the original on failure.** A failure leaves the un-stripped original in place so the post still works. The decision rationale is in `qa-reports/phase-2.5-c1-exif-edge-function.md` under "DECISIONS FOR SKY".
- **Does not validate the image contents** (e.g., refuse photos of certain types). Out of scope for an EXIF stripper.
- **Does not rate-limit.** The webhook secret is the only auth; Supabase Edge Functions' platform-level rate limit is the only quota guardrail.
- **Does not run on UPDATE or DELETE events.** Only INSERT — re-uploads via the API would already be re-stripped clients, and DELETEs have no payload to strip.

---

## 10. Environment variable summary

| Var                         | Source                                   | Required | Notes                                                                                           |
| --------------------------- | ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Auto-injected by Supabase Edge Functions | yes      | Read inside `index.ts` to build the service-role client.                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase Edge Functions | yes      | Service-role required to bypass RLS for the download + overwrite.                               |
| `STRIP_WEBHOOK_SECRET`      | Set via `supabase secrets set`           | yes      | Webhook auth gate. Function refuses every request without a matching `x-webhook-secret` header. |
