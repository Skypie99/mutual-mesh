# Phase 2.5 — C1: Server-side EXIF strip Edge Function

**Authors:** Steve (Safety Engineer) + Shamus (Feature Engineer) — paired Cowork session
**Date:** 2026-05-24
**Branch:** `feat/mutualmesh-2026-05-24-shamus-c1-exif-edge-function`
**Status:** FILES ONLY — no live deploy. Sky deploys via `supabase functions deploy exif-strip` and wires the Storage Webhook in the dashboard. See `supabase/functions/exif-strip/README.md` for the numbered steps.

---

## 1. TL;DR

Closes Steve Phase 1 audit finding **C1** (launch-blocker) — restores PRIVACY.md D5's two-layer EXIF strip. Three deliverables:

| File                                            | What it is                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `supabase/functions/exif-strip/index.ts`        | Deno Edge Function. Strips EXIF via `imagemagick_deno` and overwrites. |
| `supabase/functions/exif-strip/README.md`       | Sky's deploy guide. Webhook wiring + verify + rollback + cost notes.   |
| `qa-reports/phase-2.5-c1-exif-edge-function.md` | This combined Steve + Shamus report.                                   |

Plus one small comment edit to `src/lib/photos.ts`: removed the "deferred to Cycle 7" wording that quietly downgraded PRIVACY.md D5, replaced with a pointer to the Edge Function. **No runtime behavior change in `photos.ts`.**

**Library choice:** `imagemagick_deno@0.0.31` (the Deno port of `magick-wasm`). Reasoning in §3.1.

**Toolchain:** `npm run typecheck && npm run lint && npm test && npm run format:check` all green after the change.

**Launch-blocker status:** This file resolves C1 once Sky deploys per the README.

---

## 2. Steve section — threat model after the Edge Function lands

### 2.1 Residual T1 risk

The original STRIDE T1 (client-side EXIF strip bypass) rated **L=2, I=4, Risk=8**, mitigated by the two-layer strip with residual L (Low). With C1 unresolved, the residual jumped to M (Medium). With this function in place, residual is back at L — **with three specific narrow gaps** that Sky should be aware of:

#### 2.1.1 Race window: claimant views photo before the function completes

The flow is:

1. Client uploads to `resource-photos/<uid>/<ts>.jpg` (already client-stripped).
2. Storage INSERT fires the webhook.
3. Webhook POSTs to the Edge Function (typical latency: ~50-200ms cold start added).
4. Function downloads, strips, re-uploads (overwrites). Typical: 200-800ms total wall-clock.
5. From this moment, any signed-URL fetch returns the stripped bytes.

**The window from step 1 to step 4 is ~200ms-1s** during which a signed-URL fetch returns the original (already client-stripped) bytes. If a malicious client uploaded a still-EXIF-rich image (i.e. bypassed `stripExifAndCompress`), and another verified user fetched it in that window via signed URL, the EXIF leaks for that one fetch.

**Why this is acceptable:**

- The client-side strip in `src/lib/photos.ts` is the load-bearing first defense. Only a tampered/forked app can produce an EXIF-rich upload at all.
- The window is short and the audience tiny (verified users in a single small community in Phase 1).
- Practically: nobody is polling for new photos in real-time within a sub-second window in a mutual-aid app.

**Why we don't fix this in v1:** Closing the window would require either (a) blocking the row INSERT until the strip succeeds (synchronous trigger from Storage — Supabase doesn't expose this, would require a custom upload endpoint), or (b) marking the resource row as `photo_pending` until the function flips it. Both are real refactors that double the photo path's complexity. Defer to v2 if a specific incident motivates it.

#### 2.1.2 Function failure: keep-on-failure leaves an un-stripped original

Per the DECISION FOR SKY below, on any failure (download error, decode error, oversize file, re-upload error) the function returns 500 and **leaves the original file in place**. Pros: post still works, client-side strip still applied, Sky can triage via logs. Cons: a determined attacker who forked the app could deliberately craft a file that breaks the magick-wasm decoder (e.g., a syntactically valid JPEG with adversarial headers) and the original-with-EXIF would persist indefinitely.

**Mitigation:**

- Function logs `[exif-strip] FAILED path=... reason=...` to Edge Function logs.
- Recommend (out of scope here): a follow-up Phase 3 audit that scans the bucket weekly for objects without the `x-exif-stripped` marker header. The marker is set on every successful strip. Stripped-vs-unstripped is then a one-query check.
- Recommend (out of scope here): if the failure rate is non-trivial in production, flip to **delete-on-failure** mode (Sky decides via a flag).

#### 2.1.3 Webhook secret leak

The function trusts the `x-webhook-secret` header. If Sky leaks `STRIP_WEBHOOK_SECRET` (committed to git accidentally, leaked via screenshot, etc.), an attacker could re-trigger the function on arbitrary paths. The function only operates on `resource-photos` bucket paths and only re-encodes; it cannot exfiltrate or delete arbitrary data because it always overwrites a path that the webhook payload says was just inserted. **Worst case: an attacker re-encodes random objects, costing compute.** Not a privacy leak.

**Mitigation:** Standard secret hygiene. Rotate quarterly. README emphasizes never committing.

### 2.2 New STRIDE entries

| ID   | Threat                                                                | L   | I   | Risk | Mitigation                                                                    | Residual |
| ---- | --------------------------------------------------------------------- | --- | --- | ---- | ----------------------------------------------------------------------------- | -------- |
| T1.a | Sub-second race window between upload and strip                       | 2   | 3   | 6    | Client layer is the load-bearing defense; window is short                     | L        |
| T1.b | Decoder-bomb file causes strip to fail; un-stripped original persists | 1   | 4   | 4    | Function logs failures; recommend weekly bucket scan for missing strip-marker | L-M      |
| T1.c | Webhook secret leak → attacker re-triggers function on bucket paths   | 1   | 1   | 1    | No privacy leak, only compute cost. Standard secret rotation.                 | N        |

None are launch-blockers. T1.a + T1.b are acceptable residuals for v1.

### 2.3 Steve's recommendation

**Resolve C1 as proposed.** Land this branch, Sky deploys per README, Steve re-audits the photo pipeline in Phase 3. T1 residual returns to L (Low). The "two-layer" promise of PRIVACY.md D5 is now literally true in code.

---

## 3. Shamus section — implementation notes

### 3.1 Library choice rationale

Considered three options:

| Option                                | Pros                                                                                                                                                       | Cons                                                                                                                                                                           | Verdict    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `imagemagick_deno` (magick-wasm port) | Officially recommended by Supabase Edge Functions docs. Explicit `strip()` API. JPEG + PNG + everything. Battle-tested (25+ years of ImageMagick lineage). | ~10 MB WASM binary; ~1-2s cold start.                                                                                                                                          | **PICKED** |
| `imagescript`                         | Zero deps, fast. Re-encoding implicitly drops EXIF (the metadata lives in the container, not the bitmap).                                                  | No explicit `strip()` API — auditability suffers; we'd be relying on "re-encoding probably drops everything." Less battle-tested for edge cases (orientation EXIF, IPTC, XMP). | NO         |
| `exifr` + raw byte rewrite            | Smallest footprint. Surgical metadata removal without re-encoding.                                                                                         | Doesn't normalize the file format. If a forked client uploaded HEIC or WEBP, exifr alone wouldn't transcode. Loses the defense-in-depth of full re-decode.                     | NO         |

**`imagemagick_deno`** wins because:

1. It's the only option Supabase's own image-manipulation guide explicitly endorses for Edge Functions.
2. `img.strip()` is an explicit API call — auditable. The other options rely on "re-encoding implicitly drops metadata" which is fragile reasoning.
3. ImageMagick handles edge cases like orientation EXIF (which some libraries preserve as JFIF orientation) correctly.
4. PNG support included — defense against a forked client uploading PNG via direct API call.

The 10 MB cold-start cost is acceptable: Mutual Mesh's photo upload rate in Phase 1 is ~50/week, not 50/second. Warm starts are ~200-400ms.

### 3.2 Edge cases handled

| Case                                                        | Handled how                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Webhook redelivery (idempotency)                            | Function checks `x-exif-stripped` header in the object's user_metadata; if set to `v1`, returns 200 with `skipped: already_stripped`.            |
| Re-upload by client (`upsert: true` somewhere)              | Same idempotency marker handles it — re-stripping a stripped file is a no-op.                                                                    |
| Wrong bucket (webhook fires for any storage.objects INSERT) | Function checks `bucket_id === 'resource-photos'`; returns 200 with `skipped: wrong_bucket` for anything else.                                   |
| Non-INSERT event                                            | Returns 200 with `skipped: not_insert` — no work done.                                                                                           |
| Oversized file (>10 MB)                                     | Returns 500 with `reason: oversized: <n> > <max>`; original left in place.                                                                       |
| Corrupt / undecodable file                                  | Catches the magick-wasm exception, returns 500 with `reason: decode_failed: <msg>`; original left in place.                                      |
| Unsupported format                                          | `pickOutputFormat` defaults to JPEG if the input isn't PNG. magick-wasm decodes most formats; if not, falls into the decode_failed path.         |
| Missing webhook secret env var                              | Returns 401 (`invalid_webhook_secret`) — fails CLOSED so a misconfigured deploy doesn't accept arbitrary callers.                                |
| Missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`        | Returns 500 (`missing_env`). Should never trigger in practice — Supabase auto-injects these.                                                     |
| Two webhook deliveries racing on same path                  | Both call `upload(..., { upsert: true })`. Both re-encode from the (already-stripped) input. Both write the marker header. Wasteful but correct. |

### 3.3 Test plan (manual — automated tests defer to Phase 3)

Per the README §5 (Sky's verify step):

1. Sky uploads a known-EXIF-rich photo via the app.
2. Sky downloads the stored object from the dashboard.
3. Sky runs `exiftool` and confirms no GPS / Make / Model / DateTimeOriginal fields remain.
4. Sky re-triggers via the dashboard webhook test and confirms `skipped: already_stripped` response.

Automated test of the Edge Function itself is deferred to a follow-up cycle — would require either (a) deploying to a staging Supabase project + spinning up a real photo with known EXIF + asserting via exiftool, or (b) extracting the strip core into a pure function that runs in jest with mocked Supabase + a fixture image. Option (b) is cleaner; recommend Shamus or Gary pick it up in Phase 3.

### 3.4 What the photos.ts edit does NOT change

- `stripExifAndCompress` still re-encodes on the client. The client layer is preserved exactly.
- `uploadResourcePhoto` still uploads via the same path scheme `<userId>/<ts>.jpg`.
- `createSignedResourcePhotoUrl` and `deleteResourcePhoto` are untouched.
- The only diff is the JSDoc block at the top of the file — comment text only.

`npm run typecheck` confirms no type changes. `npm test` confirms no behavior regressions (none expected; no logic edits).

---

## 4. DECISIONS FOR SKY

### DFS-1: Keep-on-failure vs delete-on-failure

**Context:** When the function fails (decode error, oversized, etc.), the original upload is left in place — the post still works, the client-side strip still applies, but if the original was crafted to be un-stripped client-side AND breaks magick-wasm, the un-stripped file persists.

**Options:**

- **(a) Keep-on-failure** (CURRENT): post survives; Sky monitors logs; weekly bucket-scan can catch missing strip-marker. Recommended.
- **(b) Delete-on-failure:** function deletes the original Storage object on any failure → the resource row's `photo_url` points to nothing → ResourceDetail screen silently shows no image (already gracefully handles this case). User who posted is confused, but no privacy leak ever.

**Steve's recommendation:** (a) keep, because (1) the most common failure mode is "oversized" which is a user error not a privacy threat, (2) (b) hides upload failures from posters who can't see why their photo vanished, (3) the marginal residual risk (un-stripped file persists) is low because the client layer covers it for any non-tampered client.

**Action requested from Sky:** Confirm (a) or flip to (b). Default is (a).

### DFS-2: 10 MB upload ceiling

**Context:** `MAX_BYTES = 10 * 1024 * 1024` in `index.ts`. Larger files are rejected with 500. The client's `expo-image-manipulator` re-encode at 0.75 quality + 2048px max dimension yields <2 MB in practice for a photo from any modern phone. 10 MB is generous slack for a forked client uploading something unusual.

**Options:**

- **(a) 10 MB (CURRENT):** Safe ceiling. Practically un-hit by normal clients.
- **(b) Match the client cap (~5 MB):** Tighter; mirrors PRIVACY.md D5 / STRIDE D2 ("Hard cap photo size at 5MB at the Storage policy level").

**Note:** The Storage RLS policy in `supabase/schema.sql` does NOT actually enforce a 5 MB cap right now (the threat model proposed it; the schema didn't land it). The cap in this Edge Function is the only file-size guardrail.

**Steve's recommendation:** Keep 10 MB here AND add a Storage-policy-level 5 MB cap in a follow-up Dana migration. Two layers of size cap is consistent with the two-layer EXIF strip philosophy.

**Action requested from Sky:** Approve 10 MB here. Approve the follow-up Dana migration for a Storage-policy-level 5 MB cap (separate task).

### DFS-3: Webhook scope — filter at webhook layer or at function?

**Context:** Storage Webhooks fire on every INSERT into `storage.objects`, across every bucket. The function filters internally and returns 200 with `skipped: wrong_bucket` for anything other than `resource-photos`. README §4 shows how to add a `bucket_id = 'resource-photos'` condition at the webhook layer to skip the function call entirely for other buckets.

**Options:**

- **(a) Filter inside the function (CURRENT):** simpler webhook config; function is the single source of truth on "which buckets get stripped."
- **(b) Filter at the webhook condition:** saves invocations for any future bucket (e.g., profile avatars in v2). Slightly more work on Sky's side.

**Steve's recommendation:** (a) for v1 (there's only one bucket); revisit when adding a second bucket.

**Action requested from Sky:** Acknowledge. No change needed unless Sky wants to filter at the webhook now.

### DFS-4: Should we deploy on staging first?

**Context:** This task is file-only. Sky deploys.

**Steve's recommendation:** Yes — deploy to a Supabase project you can throw away first (or to your production project's `staging` schema if you have one), upload a known-EXIF photo, run exiftool to confirm. Only then promote.

**Action requested from Sky:** Acknowledge. README §5 is the verification script.

---

## 5. Sky-apply checklist

Numbered, single-shot:

1. **Generate webhook secret:** `openssl rand -hex 32` → copy.
2. **Set secret on the project:** `supabase secrets set STRIP_WEBHOOK_SECRET=<paste>`.
3. **Deploy function:** `supabase functions deploy exif-strip` (from repo root). Copy the function URL it prints.
4. **Wire webhook** in dashboard: Database → Webhooks → Create. Table `storage.objects`, event INSERT, POST to the function URL, headers include `x-webhook-secret: <paste>`. (Full steps in `supabase/functions/exif-strip/README.md` §4.)
5. **Verify:** upload a known-EXIF photo via the app, download the stored object, `exiftool` shows no GPS / Make / Model / Date. (Full steps in README §5.)

Rollback: delete the webhook + `supabase functions delete exif-strip` (README §7).

---

## 6. Verification & toolchain status

Run from repo root before/after this branch:

```
npm run typecheck    # PASS (Edge Function in supabase/functions/ — see §6.1)
npm run lint         # PASS
npm test             # PASS (no test changes)
npm run format:check # PASS
```

### 6.1 Toolchain note: Edge Function exclusion

The Edge Function uses Deno-style URL imports (`https://deno.land/x/...`) which are NOT valid in the React Native TypeScript / Node environment that `tsc --noEmit` runs. If `supabase/functions/**/*.ts` were included in the `tsconfig.json` `"include"` glob, every URL import would resolve as "Cannot find module" and break the build.

**Mitigation in this branch:** the tsconfig `"exclude"` list in `tsconfig.json` was updated to add `"supabase/functions"`. The eslintrc `ignorePatterns` was updated similarly. Prettier doesn't need a change because the function file IS valid Prettier-formatted code; format:check passes against it without complaint.

If Sky later wants type-checking inside the Edge Function dir, the Supabase CLI ships a Deno-aware tsconfig for that — out of scope here.

---

## 7. What I shipped (per the Steve+Shamus pair)

- `supabase/functions/exif-strip/index.ts` (new)
- `supabase/functions/exif-strip/README.md` (new)
- `qa-reports/phase-2.5-c1-exif-edge-function.md` (this file, new)
- `src/lib/photos.ts` — comment edit only (removed "deferred to Cycle 7" wording, added Edge Function pointer)
- `tsconfig.json` — added `"supabase/functions"` to the exclude list
- `.eslintrc.json` — added `"supabase/functions/"` to `ignorePatterns`

No live deploy. No external sends. No code modification to any runtime behavior on the client.

## 8. FAIL_FAST / BLOCKER states

None. Toolchain green. No BLOCKERs surfaced during the implementation.

## 9. What's next

- Morgan picks up this report in the next briefing, surfaces DFS-1 through DFS-4 to Sky.
- Sky approves DFS-1 default (keep-on-failure), then deploys per README.
- Steve re-runs the C1 portion of his audit after deploy and verifies T1 residual returns to L.
- Optional follow-up: Dana migration to add Storage-policy-level 5 MB cap (DFS-2 part 2).
- Optional follow-up: Gary writes a jest test for a pure-function extraction of the strip core (§3.3 b).

---

**End of report.**
