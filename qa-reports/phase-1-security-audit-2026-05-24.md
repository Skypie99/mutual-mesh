# Mutual Mesh — Phase 1 Security Audit (Cycles 2-6 wiring)

**Author:** Steve (Safety Engineer)
**Date:** 2026-05-24
**Scope:** Cycles 2-6 Supabase wiring that Cowork landed during the schema-apply session, plus migration 001 (RLS-recursion fix). Cycle 1 was previously audited in `2026-05-23_security-cycle-1.md` and is not re-audited here.
**Authority:** Constitution v1.3 Art. 7 (privacy as load-bearing pillar), PRIVACY.md (🟢 APPROVED 2026-05-23), STRIDE model in `2026-05-23_threat-model-stride.md`.
**Status:** READ-ONLY AUDIT. No code modified.

---

## 1. TL;DR

**Overall verdict: SAFE WITH FIXES — not yet safe to invite a real community.**

The Cycle 2-6 wiring is structurally sound: the three-layer `is_verified` gate is intact end-to-end, signed URLs respect the 1h TTL ceiling (S4), the claim path is the atomic RPC (no client UPDATE), the delete-my-account flow honestly discloses the 7-day backup window (D6), and migration 001's SECURITY DEFINER helpers correctly break the RLS recursion without inadvertently widening other policies.

However, **eight findings need to land before the first Tier-1 community is invited**, three of which are launch-blockers:

- **CRITICAL:** Cycle 1 server-side EXIF strip (PRIVACY.md D5, Jordan-approved "belt-and-braces") is **NOT implemented anywhere** in the live wiring. The comment in `photos.ts` says it's "deferred to Cycle 7 ship-readiness" — but the PRIVACY.md approval was for two-layer strip, not single-layer. This is a privacy-load-bearing item that was downgraded without Sky / Jordan sign-off.
- **HIGH:** `deleteResourceById` is exposed as a public client API in `resources.ts`, but storage photo objects for that resource are **NOT cascade-deleted server-side**. PRIVACY.md D6 + data-inventory row 9 say photos cascade. They do not. A caller who forgets to call `deleteResourcePhoto` (and the only caller, `delete_my_account`, also forgets) leaves orphan photos in Storage indefinitely.
- **HIGH:** The `delete_my_account` RPC's cascade does NOT remove Storage objects. The user's resources rows get deleted, but `resource-photos/<uid>/<ts>.jpg` files remain (Storage in Supabase does not cascade on row delete unless you wire a trigger or do it in the RPC). This violates PRIVACY.md row 9 ("Storage object cascade-deletes") and is the single biggest "delete means delete" failure.

The remaining MEDIUM/LOW items are tighten-ups: contact-handle validation is only client-enforced (no DB check); `getResourceById` lacks an `is_verified` UI gate (RLS holds, but defense-in-depth is missing per gotcha #8); a few small leaks in `console.warn` paths that should go through `userFacingErrorMessage`.

**Three launch-blockers; cannot ship to a real community until they're resolved.**

---

## 2. STRIDE map — Cycles 2-6 surfaces

Each row updates the original STRIDE model (`2026-05-23_threat-model-stride.md`) with what changed once code wired the data path.

| Surface                                                | New threats found                                                                                                                                                                                                                              | Notes vs. original model                                                                                                                                                                                         | Residual (1-5; 5=worst) |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Photo upload + signed URL** (`photos.ts`)            | T1 partially-mitigated only (server-side strip missing); I1 mitigated (PRIVATE bucket + 1h TTL confirmed in code)                                                                                                                              | Original model assumed two-layer strip. Live wiring is one-layer (client-side only).                                                                                                                             | **3** (was 1)           |
| **Resources API** (`resources.ts`)                     | New: storage-orphan on `deleteResourceById`. New: contact_handle DB-level validation missing.                                                                                                                                                  | T3 (claim race) confirmed atomic; D1 (post-flood) still unmitigated for rate-limit, but PRD doesn't require it for v1.                                                                                           | **3** (was 2)           |
| **Auth realtime** (`auth.tsx`)                         | I3 mitigation verified: filter is `id=eq.${uid}` from `session.user.id` (server-supplied, not attacker-controllable). Channel teardown on signOut works via the cleanup useEffect when `session.user.id` flips to undefined.                   | Confirmed clean.                                                                                                                                                                                                 | **1**                   |
| **AddResource screen** (`AddResourceScreen.tsx`)       | Photo-optional flow works (Deb persona). Contact-handle validator catches all 8 URL patterns. New: UI does NOT block submit if user is unverified — RLS catches it but UI surfaces a confusing error.                                          | Defense-in-depth gap per gotcha #8.                                                                                                                                                                              | **2**                   |
| **ResourceDetail screen** (`ResourceDetailScreen.tsx`) | Signed-URL failure path silently hides photo (graceful — good). New: screen has NO `is_verified` UI gate; deep-link from unverified user reaches it, RLS denies, user sees "Resource not found." (acceptable but suboptimal).                  | Defense-in-depth gap per gotcha #8.                                                                                                                                                                              | **2**                   |
| **Profile delete flow** (`ProfileScreen.tsx`)          | Confirmation modal honest about backups (good — matches D6 disclosure). New: RPC succeeds but Storage objects are NOT cleaned up. "Delete means delete" violated.                                                                              | High residual until Storage cascade is wired.                                                                                                                                                                    | **4** (was 2)           |
| **Migration 001 (RLS-recursion fix)**                  | SECURITY DEFINER helpers set `search_path = public` — verified safe (only queries `public.users`; no risk of attacker-controlled schema interposition). Helpers are STABLE + bypass RLS for the inner lookup — by design and correctly scoped. | No widening of other policies; the only thing changed is the `users_verified_read_others` and `users_admin_read_unverified` policies, both of which still gate on the calling user's flag — just via the helper. | **1**                   |

---

## 3. Findings

### CRITICAL

#### C1 — Server-side EXIF strip is missing (PRIVACY.md D5 violation)

**File:** `/Users/skypie/MutualMesh/src/lib/photos.ts:8-9` (comment says deferred); no `supabase/functions/` directory exists.
**What's wrong:** PRIVACY.md D5 was approved by Sky as a TWO-LAYER strip (client + server-side Edge Function). The live code only does client-side re-encode. The comment "deferred to Cycle 7 ship-readiness" is the source code unilaterally downgrading a Jordan-led + Sky-approved privacy decision.
**Why it's wrong:** Threat T1 in the STRIDE model rates this at L=2, I=4 (location leak), Risk=8. Mitigation explicitly required server-side strip as load-bearing: "Server-side function fails-closed: if EXIF can't be removed, photo is rejected." A malicious client (forked app, MITM'd photo before upload, or a deliberately bypassed `stripExifAndCompress` call) can today upload an EXIF-bloated JPEG and the server will accept it. Bucket is private and signed-URL-gated, but the EXIF is still inside the file once a claimant fetches it.
**Recommended fix (no code changes here — describe only):**

1. Write a Supabase Edge Function `strip-exif-on-upload` triggered by `storage.objects` INSERT on bucket `resource-photos`. Use `sharp` or `image-rs` to re-encode and overwrite the object. On any failure, delete the object and log.
2. Alternative (simpler, but less load-bearing): in `photos.ts`, after upload, call a server-side RPC that re-reads the object and confirms zero EXIF before allowing the resources INSERT to proceed.
3. Until then, change the inline comment in `photos.ts` to remove "deferred to Cycle 7 ship-readiness" — that language sneaks a downgrade past code review. Replace with "TODO(launch-blocker): server-side strip per PRIVACY.md D5 — DO NOT GO LIVE WITHOUT THIS."
   **Launch-blocker:** YES. Cannot invite a real Tier-1 community while we have a single-point EXIF defense.

#### C2 — Storage objects are NOT deleted when a resource row is deleted (PRIVACY.md D6 violation)

**File:** `/Users/skypie/MutualMesh/supabase/schema.sql:380-388` (delete_my_account RPC); `/Users/skypie/MutualMesh/src/lib/resources.ts:129-131` (deleteResourceById).
**What's wrong:** PRIVACY.md data-inventory row 9 ("resource photo URL") says retention is "30 days … Storage object cascade-deletes." PRIVACY.md D6 ("True cascade hard delete") says `delete_my_account` "cascade-deletes photos via the Storage trigger." Neither cascade exists. The `delete_my_account` RPC runs `DELETE FROM public.resources WHERE posted_by = me` — Supabase Storage does NOT cascade on row deletes; storage and tables are separate subsystems. Migration 001 doesn't address it. There is no `ON DELETE` trigger anywhere in `schema.sql` that calls `storage.objects.remove()`.
**Why it's wrong:** A user deletes their account. The next day, an attacker with a leaked anon key + a guessable filename + the (now-stale) RLS check sees nothing — bucket is private, RLS gate blocks. BUT: the Storage objects accumulate forever, growing the project's bill and (worse) sitting in backups. Most importantly: the user trusted the "delete means delete" promise; the photo is still there.
**Recommended fix:**

1. Add a Postgres trigger on `public.resources` AFTER DELETE that calls a SECURITY DEFINER function which deletes the matching Storage object via the `storage.objects` table. The function path is something like `DELETE FROM storage.objects WHERE bucket_id = 'resource-photos' AND name = OLD.photo_url`.
2. In `delete_my_account`, after the resource delete, also do `DELETE FROM storage.objects WHERE bucket_id = 'resource-photos' AND (storage.foldername(name))[1] = me::text` — sweeps any orphan objects from prior failures.
3. In `prune_expired_resources`, do the same sweep for the pruned rows' photos before/after the row delete.
4. Same for `deleteResourceById` callers: add the trigger so callers don't have to remember.
   **Launch-blocker:** YES. This is a "delete means delete" violation of a user-facing trust promise, and we're a surveillance-averse-audience app.

#### C3 — `prune_expired_resources` does NOT delete photos either

**File:** `/Users/skypie/MutualMesh/supabase/schema.sql:430-456`.
**What's wrong:** Same root cause as C2. The nightly cron deletes 30-day-old resource rows but leaves orphan `resource-photos/<uid>/<ts>.jpg` objects in Storage. Over 30 days × N posts/day × M users, this is unbounded growth + an indirect privacy leak (a deleted resource's photo is still in the bucket).
**Why it's wrong:** Same as C2.
**Recommended fix:** Whatever C2's trigger-based fix is, must also fire on this DELETE.
**Launch-blocker:** YES (same severity class as C2; same fix resolves both).

---

### HIGH

#### H1 — `contact_handle` URL-pattern validation is client-only

**File:** `/Users/skypie/MutualMesh/src/lib/contactHandle.ts:23`; `/Users/skypie/MutualMesh/supabase/schema.sql:133` (length cap only).
**What's wrong:** The 8-pattern URL/scheme rejection (`https?:`, `javascript:`, `data:`, `vbscript:`, `tel:`, `mailto:`, `file:`, `www.`) lives in JS. A malicious anon-key holder bypassing the client can INSERT a resource with `contact_handle = "javascript:alert(1)"` — RLS will allow it (the policy only checks `posted_by = auth.uid()` AND verified). The DB only enforces `length <= 64`.
**Why it's wrong:** Today, `ResourceDetailScreen.tsx:181` renders `{resource.contact_handle}` as plain `<Text>`. React Native `<Text>` does NOT auto-link, so `javascript:` is rendered as-is. That's safe TODAY. But:

- If Cycle 5 (admin UI) or any future cycle wires `contact_handle` through a web-based admin tool (e.g., a future Next.js admin dashboard), the unfiltered string flows to a browser DOM.
- If a future v2 chat re-uses `contact_handle` and one screen accidentally uses `<a href={handle}>` or `Linking.openURL(handle)`, we have an XSS / deep-link-injection vector.
- The validation rule exists for a reason — putting it client-only makes it not actually a rule.
  **Recommended fix:** Add a CHECK constraint to `public.resources.contact_handle`: `CHECK (contact_handle !~* '(https?:|javascript:|data:|vbscript:|tel:|mailto:|file:|www\.)')`. Or do it in a BEFORE INSERT/UPDATE trigger. Belt-and-braces with the client-side check.
  **Launch-blocker:** NO (no exploit today, but Cycle 5 admin UI will hit this — better to fix now).

#### H2 — `pickup_text` is also rendered without sanitization and only client-trimmed

**File:** `/Users/skypie/MutualMesh/supabase/schema.sql:132` (length 280); `/Users/skypie/MutualMesh/src/screens/ResourceDetailScreen.tsx:171` (`{resource.pickup_text}`).
**What's wrong:** Same shape as H1 but for pickup_text. The S3 review approved "plain-text render only" — and it IS rendered as React Native `<Text>`. Today, no exploit. But pickup_text has no URL-scheme rejection at all (not even client-side), and the screen could in future use a `Linking.openURL` or hyperlink-detection wrapper.
**Why it's wrong:** Defense-in-depth: if anyone ever wraps pickup_text in an autolink component, a malicious poster could embed `javascript:` URIs. Today: not exploited. Tomorrow: easy to forget.
**Recommended fix:** Same CHECK constraint pattern as H1 (looser — pickup is a paragraph, not a handle, so allow `http://` since pickup directions might legitimately say "we're across from https://example-park.ca", but reject `javascript:`/`data:`/`vbscript:`).
**Launch-blocker:** NO.

#### H3 — `error.message` flows directly into `useResources` state, bypassing `userFacingErrorMessage`

**File:** `/Users/skypie/MutualMesh/src/hooks/useResources.ts:50`.
**What's wrong:** `setError(err.message ?? 'Failed to load listings.')` displays the raw Supabase error message. Compare to every other screen which goes through `userFacingErrorMessage()` (which strips `PGRST` codes / URLs / JWT mentions). On a failure mode like RLS denial, the raw message includes `PGRST116` etc.
**Why it's wrong:** STRIDE I6 mitigation (error-message leak) is supposed to be enforced everywhere. This is the only path that bypasses.
**Recommended fix:** Wrap with `userFacingErrorMessage(err, 'Failed to load listings.')` in `useResources.ts:50`.
**Launch-blocker:** NO (cosmetic risk only, no PII leak).

#### H4 — `is_verified` UI gate is missing inside the screen tree

**File:** `/Users/skypie/MutualMesh/src/screens/ResourceDetailScreen.tsx`, `/Users/skypie/MutualMesh/src/screens/AddResourceScreen.tsx`, `/Users/skypie/MutualMesh/src/screens/HomeScreen.tsx`.
**What's wrong:** Per CLAUDE.md gotcha #8, the `is_verified` gate must hold in three layers. App.tsx's `Gate` is layer 1 (routes unverified → WaitingRoom). But: if a deep-link or React-Navigation state restoration ever pushes a Detail/Add/Home route while the auth state is mid-flux (`profile.is_verified` momentarily null after a `signOut` race), the screen renders. RLS catches the actual fetch (good). But: no UI assertion that says "if not verified, render nothing / redirect." Single-point UI gate violates the "three layers" rule in spirit.
**Why it's wrong:** Defense in depth. The original threat-model assumes three layers; today we have two solid (DB + Storage) and one (UI gate) that only operates at the App-root level.
**Recommended fix:** In each protected screen's first render (HomeScreen, ResourceDetailScreen, AddResourceScreen, ProfileScreen), check `profile?.is_verified === true` and return a SplashScreen-style placeholder otherwise. This is a small `if` at the top of the function. Five lines per screen.
**Launch-blocker:** NO (RLS holds; this is hardening, not patching).

---

### MEDIUM

#### M1 — Realtime `resources-feed` channel name is global, not session-scoped

**File:** `/Users/skypie/MutualMesh/src/hooks/useResources.ts:76` (`supabase.channel('resources-feed')`).
**What's wrong:** All clients subscribe to the SAME channel name. Supabase Realtime is usually fine with this (the channel is just a routing key), but it has had bugs in the past where reusing a channel name across signOut/signIn within the same JS context leaves a dangling subscription. Per Cycle 1 gotcha 3 (mounted-ref + channel teardown) the safe pattern is `channel(\`resources-feed-${uid}\`)`.
**Why it's wrong:** If user A signs out and user B signs in in the same JS session, the channel for A's subscription may collide with B's. Not a security exploit; a correctness issue that could manifest as ghost data.
**Recommended fix:** `supabase.channel(\`resources-feed-${session?.user?.id ?? 'anon'}\`)`. Re-create the subscription on user-id change.
**Launch-blocker:** NO.

#### M2 — `auth.tsx` channel teardown depends on `session?.user?.id` becoming falsy

**File:** `/Users/skypie/MutualMesh/src/lib/auth.tsx:137-164` (realtime useEffect); `/Users/skypie/MutualMesh/src/lib/auth.tsx:179-189` (signOut).
**What's wrong:** signOut sets `session = null`, which triggers the realtime useEffect's cleanup. Good. BUT: if `supabase.auth.signOut()` throws (already caught and logged at line 182), the state update at line 187 still runs (good). However, there's a tiny race: between `signOut()` resolving and the React render cycle running the cleanup, the channel briefly exists with a now-invalid session. Realtime will close it on the next reconnect attempt, but the gap is observable.
**Why it's wrong:** Minor. If a verification flip arrives in that window, the now-signed-out client briefly processes a realtime payload. RLS blocks the re-fetch (auth.uid() is null), so no data leak. But the `reloadProfile()` call runs and warns to console.
**Recommended fix:** Explicit `supabase.removeChannel(channel)` call inside `signOut`, before clearing state. Or move the channel ref to a `useRef` and teardown there. Low priority.
**Launch-blocker:** NO.

#### M3 — `delete_my_account` doesn't sign the user out — it leaves a stale session

**File:** `/Users/skypie/MutualMesh/src/screens/ProfileScreen.tsx:54-68`.
**What's wrong:** The flow does `await deleteMyAccount()` then `await signOut()`. The RPC deletes from `auth.users`, which invalidates the session server-side. But the client may have already cached `session.user.id` in memory; until `signOut()` returns, the client tries one more `touch_my_last_active()` RPC (via the useEffect at `auth.tsx:169`) which 401s. The error is swallowed (console.warn). Not exploitable, but noisy.
**Why it's wrong:** Cleanup ordering. Also: if `signOut` fails (network), the user sees the "Could not delete your account" toast even though the account WAS deleted. Confusing.
**Recommended fix:** Either (a) call signOut FIRST, then RPC (won't work — RPC needs the JWT), or (b) accept the noise, or (c) wrap signOut in its own try/catch so a failed signOut doesn't surface a misleading error after a successful delete.
**Launch-blocker:** NO.

#### M4 — `signed URL` failure paths do not differentiate between "not authorized" and "object missing"

**File:** `/Users/skypie/MutualMesh/src/lib/photos.ts:95-105`.
**What's wrong:** `createSignedResourcePhotoUrl` returns null on ANY error. Caller (`ResourceDetailScreen.tsx:62`) silently shows no image. Good UX. BUT: a `console.warn` at line 101 prints `error.message`, which can include the Storage path (the path is the object key; the message format from supabase-js sometimes includes it). The path scheme is `<userId>/<timestamp>.jpg` — the userId is a UUID, not directly exploitable, but it does confirm "an account with this UUID exists."
**Why it's wrong:** Information disclosure via dev console. In production with `__DEV__ === false`, this only flows to whatever debug console is hooked up — which per Jordan D8 is none (no Sentry, no third-party). So practically: a developer running the app sees it; not an end user. Low risk.
**Recommended fix:** `console.warn('[photos] createSignedUrl failed for resource photo');` — drop the `error.message` interpolation.
**Launch-blocker:** NO.

#### M5 — `delete_my_account` cascade doesn't NULL out `claimed_by` referencing rows where I posted them (only the inverse)

**File:** `/Users/skypie/MutualMesh/supabase/schema.sql:381-385`.
**What's wrong:** The RPC: (a) DELETEs my posted resources, (b) NULLs claims I placed on OTHERS' resources. But the FK on `public.resources.claimed_by` is `ON DELETE SET NULL` (schema.sql:128), so when a user's `public.users` row is deleted (via cascade from `auth.users`), any resources where they were the CLAIMANT have `claimed_by` set to NULL — but the `status` stays `'reserved'`. That leaves zombie reservations: rows with no claimant, but still locked from new claims.
**Why it's wrong:** Functional issue (zombie reservation), and a small data-leak issue: the resources I posted that were claimed by others are still on my list of posts when I delete, but they're deleted entirely (step a). Good. The inverse: resources I claimed are returned to 'available' (step b). Good. The gap is when other users claimed MY posts: those rows are deleted (step a, posted_by = me). Good. So actually the gap is: if any future feature deletes a USER row WITHOUT going through `delete_my_account` (e.g., admin `reject_user` after they've claimed something), zombie reservations result. `reject_user` does `DELETE FROM auth.users` → cascades to `public.users` → orphan `claimed_by` NULLs but status stays 'reserved'.
**Recommended fix:** Add a small trigger on `public.users` AFTER DELETE that does `UPDATE public.resources SET status = 'available' WHERE claimed_by IS NULL AND status = 'reserved'`. Or fold the same NULL-out + status-flip into the FK action (Postgres doesn't support compound ON DELETE actions, so trigger is the way).
**Launch-blocker:** NO (functional issue, no privacy leak).

---

### LOW

#### L1 — `photos.ts` quality + dimension constants are magic numbers; should be documented

**File:** `/Users/skypie/MutualMesh/src/lib/photos.ts:20-21`.
**What's wrong:** `MAX_DIMENSION = 2048` and `COMPRESS_QUALITY = 0.75`. The PRIVACY.md D5 review explicitly says `compress: 0.7`. Live wiring uses 0.75. Both produce equivalent EXIF stripping behavior (any re-encode strips it), so no privacy impact, but the spec drift should be tracked.
**Recommended fix:** Either match the PRIVACY.md value or update the doc to match the code with a note ("0.75 vs 0.7 — no functional difference for EXIF, slightly better quality, lands in cycle X").
**Launch-blocker:** NO.

#### L2 — `cron_log` policy uses a subquery from `public.config`; check that policy works across sessions

**File:** `/Users/skypie/MutualMesh/supabase/schema.sql:594-598`.
**What's wrong:** The policy uses `(SELECT value FROM public.config WHERE key = 'sky_uuid')`. `public.config` itself has the same Sky-only policy (line 605-607). So when Sky reads `cron_log`, the policy fires `SELECT value FROM public.config`, which fires its own policy, which fires `SELECT value FROM public.config` again — and recurses just like the original users RLS issue migration 001 fixed.
**Why it's wrong:** Same shape as the bug migration 001 patched. May not have triggered yet because nobody queries cron_log today.
**Recommended fix:** Apply the same SECURITY DEFINER helper pattern. Create `public.current_user_is_sky()` returning boolean and use it in the policy.
**Launch-blocker:** NO (latent issue; would surface as soon as Sky tries to read cron_log).

#### L3 — `consume_invite_token` returns boolean; doesn't distinguish "no match" from "all used up"

**File:** `/Users/skypie/MutualMesh/supabase/schema.sql:262-300`.
**What's wrong:** From a security PoV, this is correct (oracle hardening — don't tell an attacker WHICH token-state was the failure mode). But for UX, the user just sees "Invalid token." Acceptable.
**Recommended fix:** None — keep as-is. Logging this finding so future Cowork doesn't "improve" it into an oracle.
**Launch-blocker:** NO.

#### L4 — `prune_expired_resources` raises on failure but cron schedule won't retry

**File:** `/Users/skypie/MutualMesh/supabase/schema.sql:450-455`.
**What's wrong:** If the prune fails, it logs failure + raises. pg_cron does not retry. Next run is 24h later.
**Recommended fix:** Add an alert path — Steve-S6 was approved as "cron observability"; verify the dashboard surfaces a 36h-old-cron warning. Defer to Cycle 5 / Phase 1 closeout.
**Launch-blocker:** NO.

---

## 4. DECISIONS FOR SKY

### DFS-1: Server-side EXIF strip — is this still load-bearing or has the threat model shifted?

**Context:** C1 (CRITICAL) above. The live code defers server-side EXIF strip with a comment. PRIVACY.md D5 says two-layer. There's a gap between the approved spec and the code.

**Options:**

- **(a) Restore the spec** — write the Supabase Edge Function in Phase 1 before any public launch. Treats the gap as a regression to fix. Aligns with Constitution Art. 7.6 (privacy-load-bearing changes need Sky + Jordan sign-off; the comment-based downgrade did not get that).
- **(b) Formally downgrade** — Sky + Jordan re-review D5, accept client-only strip as the v1 mitigation (with Steve recommending: keep the EXIF strip test in `__tests__` to verify the client always re-encodes), and document the residual risk. Threat T1 risk goes from 8 (Mitigated, residual L) to 8 (Mitigated, residual M). Acceptable for a small private staging community? Not for public launch.
- **(c) Re-prioritize** — defer to Phase 4 (launch infrastructure). Means we don't invite real users until Phase 4, which the expansion plan doesn't intend.

**Steve's recommendation:** Option (a). Server-side strip via Edge Function is small (~50 LoC + a cron trigger) and is the difference between "two-layer defense" and "single-point client validation." For a surveillance-averse audience, the cost-benefit is overwhelming.

### DFS-2: Storage object cascade — wire trigger now or wait?

**Context:** C2 + C3 (CRITICAL) above. Photo objects do not delete when their parent row deletes.

**Options:**

- **(a) Add a Postgres trigger now** — Dana writes a migration file; Sky applies. Trigger fires on `public.resources` AFTER DELETE → DELETE from `storage.objects`. Adds a new migration `002_cascade_photo_delete.sql`.
- **(b) Add it to the `delete_my_account` + `deleteResourceById` + `prune_expired_resources` paths directly** — three code-paths instead of a trigger. More fragile but no new schema migration.
- **(c) Add a nightly orphan-cleanup cron** — runs after prune, scans `storage.objects` for any object whose `(uid, ts)` doesn't match a live row. Catches all four code paths plus any future ones.

**Steve's recommendation:** (a) + (c) together. Trigger handles the happy paths; nightly orphan sweep handles the corner cases.

### DFS-3: Tier-1 invite — gate on these critical findings?

**Context:** Casey's growth strategy says Tier-1 communities go live in Phase 1. C1/C2/C3 are all "delete means delete" / "two-layer privacy strip" failures.

**Question:** Is Casey's first Tier-1 invite allowed before C1-C3 are fixed?

**Steve's recommendation:** No. These are privacy-load-bearing items per Constitution Art. 7. The expansion plan can sequence them as Phase 1 Stream B's deliverable — they fit in the 10-day budget.

---

## 5. Items deferred to later cycles (audit-only, not fixes)

- **Penetration test against deployed staging** — recommended for Phase 4 / Cycle 7 ship-readiness per the original threat model. Defer.
- **Realtime channel exhaustion test under N=100 concurrent clients** — Peter's perf audit territory, not Steve's. Defer to Peter Phase 1.
- **Two-FA / TOTP wiring** — STRIDE S1 mitigation explicitly v2. Defer.
- **Bot-detection on signup** — out of scope for v1 per PRIVACY.md. Defer.
- **Native push notifications privacy review** — Phase 3 work; no code today. Defer.
- **Group accounts RLS rework** — Phase 2/3 backlog. Defer.
- **Backup-purge SLA from Supabase** — platform-level; we cannot scrub. Disclosed in delete-confirmation copy. Defer indefinitely.
- **Anonymous error reporting design** — Phase 4 Stream C. Defer.

---

## What I shipped

This audit report. No code changed. No external sends. Findings counts: **3 CRITICAL · 4 HIGH · 5 MEDIUM · 4 LOW = 16 total**. **3 launch-blockers** (C1, C2, C3 — all interlinked around the photo / delete-means-delete promise).

## FAIL_FAST / BLOCKER states

None for Steve's read-only audit. The audit itself completes cleanly.

The three CRITICAL findings (C1-C3) are launch-blockers for Phase 1 (the first Tier-1 community invite). They are NOT blockers for ongoing development — Shamus, Dani, Quinn, etc. can keep working in parallel while Dana + Sky + a follow-up Steve loop resolve them.

## What's next

- Morgan picks up this report and surfaces C1-C3 to Sky in the next briefing.
- If Sky accepts Steve's recommendations: Dana writes `supabase/migrations/002_cascade_photo_delete.sql` + `supabase/functions/strip-exif-on-upload/` Edge Function spec. Sky applies migration via dashboard.
- Quinn updates Phase 1 plan to include these as Stream B sub-tasks.
- Steve re-audits the photo-pipeline once the Edge Function lands.

---

**End of audit.**
