# Jordan — Web Build Privacy Gate — 2026-05-25

**Reviewer:** Jordan (Privacy Advisor)
**Scope:** Web-demo build privacy gate — Platform.OS === 'web' branching + react-leaflet map
**Constitution authority:** Art. 7.6 — privacy review mandatory for marginalized-group + location + PII data. Sky approval required before merge.
**Sources reviewed:** PRIVACY.md (🟢 APPROVED 2026-05-23), supabase/schema.sql + all migrations (001–011), supabase/__tests__/rls.sql, src/lib/resources.ts, src/lib/contactHandle.ts, src/lib/supabase.ts, phase-3-jordan-review-map.md, phase-3-jordan-review-chat.md, AccessMap web build pattern.
**NOT A LAWYER DISCLAIMER.** Not legal advice. PIPEDA references are non-authoritative.

---

## Decision: APPROVE WITH CONDITIONS

The existing RLS posture is the strongest privacy asset this codebase has. The anon role is explicitly denied on every table (confirmed in supabase/__tests__/rls.sql T1: `FAIL T1.a–T1.d` assertions). No unauthenticated web visitor can reach user data, resource data, contact handles, or any sensitive table through the Supabase anon key. That finding alone makes a guarded APPROVE possible.

The conditions below are not cosmetic — two of them are BLOCKING.

---

## Four specific questions answered

### 1. Is it safe to expose location data in the web build?

**Yes, with the FSA-precision constraint from the prior map review.**

MutualMesh does not collect GPS coordinates at any layer (PRIVACY.md "Fields NOT collected" — confirmed absent from schema.sql). The only location fields are `resources.postal_prefix` (3-char FSA, neighborhood-level) and `resources.city` (explicit dropdown). A web map that renders FSA-level polygons — identical to what the Phase 3 map review approved for mobile — is safe at the same precision.

No user location is collected on the web build. The web build is a read-only demo: it shows available resources on a map. The only location data is what posters voluntarily supplied at post time (FSA + city). The Phase 3 map review's conditions (tile provider disclosure, max-zoom clamp, small-cell suppression for FSAs with < 2 unique posters, offline graceful fallback, no expo-location import) ALL carry forward to the web build verbatim. Shamus must not relax any of those conditions for the web surface.

### 2. Is disability/mutual-aid context visible to unauthenticated web visitors? Should it be?

**Currently: No. Should it stay No.**

The RLS test T1 in supabase/__tests__/rls.sql explicitly asserts "anon can SELECT public.resources" raises an exception. The `resources_verified_read` RLS policy requires `is_verified = true` on the caller's `public.users` row — which the anon role, by definition, cannot satisfy. Resource category (including `hrt`, `baby`, `hygiene`) is a column on `public.resources` and is therefore RLS-gated behind verified status.

For the portfolio demo, this means unauthenticated web visitors see no resources. That is the correct posture for a privacy-first app serving marginalized groups. A visitor who creates an account and passes verification will see the feed — same as mobile.

**The web demo should NOT loosen RLS to allow anonymous browsing of resources**, even for demo appeal. Exposing `category='hrt'` or `category='baby'` to unauthenticated web visitors would directly violate the threat model (Keo persona, state-actor/doxxing adversary, STRIDE I1) and require a full re-review and Sky approval before it could ship.

### 3. Are contact handles exposed in the web read path?

**No. The existing RLS architecture prevents it at two layers.**

First layer — RLS on `public.resources`: unauthenticated users cannot SELECT any resource row at all (T1 above). Second layer — the `contact_handle` field is only meaningful post-claim (`PRIVACY.md §11: "Claimant only, after claim"`). The `claim_resource()` RPC enforces authenticated caller + FOR UPDATE + self-claim rejection. The web build does not change either layer.

There is one nuance: the `listResources()` helper in `src/lib/resources.ts` does `select('*')`, which includes `contact_handle` in every response row. On the web, any verified user who calls this will receive `contact_handle` values for all available resources — the same as mobile. This is intentional per PRIVACY.md (the field is described as "user-supplied" and the poster chooses to publish it). For the web build, `select('*')` on `resources` returns `contact_handle` to verified users. That is acceptable per PRIVACY.md but should be documented (see Condition 2).

No additional exposure on web. The anon role gets nothing.

### 4. Does the Supabase anon key grant read access to any sensitive tables that shouldn't be public?

**No. RLS denies the anon role on every table.**

Confirmed by `supabase/__tests__/rls.sql` TEST 1: the test script sets `SET LOCAL ROLE anon` and asserts zero rows returned from `public.users`, `public.resources`, `public.verification_log`, and `public.invite_tokens`. `public.cron_log` and `public.config` have Sky-only SELECT policies (auth.uid() must match sky_uuid) — the anon role fails this predicate.

The anon key is safe to embed in a web bundle. It grants no table read access. The only thing the anon key enables is: calling `signUpWithEmail()` / `signInWithEmail()` / `verifyOtp()` (auth surface — expected) and, in theory, invoking an RPC. The RPCs all check `auth.uid() IS NULL → RAISE EXCEPTION 'Not authenticated'`, so anon-key RPC calls are also blocked.

The AccessMap pattern (public flag-photos Storage bucket + publicly readable flags) is explicitly NOT being replicated here. MutualMesh's `resource-photos` bucket is PRIVATE (S4), Storage RLS requires `is_verified = true`, and photos are signed-URL only. This is a meaningful privacy improvement over AccessMap's design and must be preserved in the web build.

---

## Conditions

### BLOCKING — Condition 1: No anonymous resource browsing in the web build

The web build must NOT add a `"browse as guest"` mode, a public-facing resource feed, or any mechanism that lets an unauthenticated visitor query resources, categories, or any table. If the portfolio demo wants to show the feed to Sky or a reviewer, the reviewer must sign up and be verified — or Sky must add a test verified account and share those credentials privately.

If a future product decision wants anonymous resource browsing, that requires: (a) a new Jordan review, (b) a full PRIVACY.md amendment covering which fields become publicly readable, (c) Sky approval before merge. The HRT category alone makes this a non-trivial change.

### BLOCKING — Condition 2: contact_handle must not render in the web feed list

`listResources()` returns `contact_handle` in `select('*')` for every available resource. On mobile, the field is only shown post-claim in `ResourceDetailScreen`. On web, if Shamus builds a feed card that naively renders all fields, `contact_handle` could appear in the feed before a user has claimed.

Shamus must ensure `contact_handle` is NOT rendered in any web feed card or list view. It must only appear on the detail/claim screen, after `claim_resource()` succeeds — same as mobile. Alternatively, Shamus can switch `listResources()` to an explicit column selection that excludes `contact_handle` (and `contact_handle` is fetched only by `getResourceById()` on the detail screen). Either approach satisfies this condition.

### Advisory — Condition 3: Tile provider disclosure in the web build

The Phase 3 map review (phase-3-jordan-review-map.md, BLOCKING CONDITION 1.3) required a plain-language disclosure of the tile provider. That condition was written for mobile. On web, the disclosure is at least as important (web visitors are less likely to understand that a map makes tile requests). The same disclosure language must appear in the web build's About or map screen, whichever Shamus uses.

### Advisory — Condition 4: expo-location must not be imported on web

The Phase 3 map review (Concern 5) required a CI check that no source file imports `expo-location`. `Platform.OS === 'web'` branching does not automatically prevent a web bundle from including the import if it's in shared code. Shamus must verify that any `expo-location` usage is gated inside a `Platform.OS !== 'web'` branch or an `.native.ts` file extension that the web bundler does not bundle. Recommend Gary adds the CI grep test at the same time.

---

## Safe web surface: what Shamus can expose without re-review

The following are safe to build on the web surface without returning to Jordan, assuming the two BLOCKING conditions above are met and the Phase 3 map review conditions carry forward:

- **Auth flow** (sign up, OTP verify, sign in, sign out) — identical to mobile. Anon key + Supabase auth is the same contract on web.
- **Waiting room screen** — unverified users see the waiting room. No data leak.
- **Available resources feed** — for verified users only. RLS enforces this. Column selection must exclude `contact_handle` in the list query (Condition 2).
- **Resource detail + Claim** — for verified users. `contact_handle` is revealed post-claim via `getResourceById()` only after `claim_resource()` succeeds.
- **FSA-level map** — react-leaflet rendering FSA polygons from `postal_prefix`. Same precision contract as mobile Phase 3 map. Tile provider, max-zoom clamp, small-cell suppression, offline fallback all apply.
- **Resource photos (signed URLs)** — `resource-photos` bucket is PRIVATE. Signed URLs work on web the same as mobile. Verified users get 1h signed URLs. Unauthenticated visitors cannot fetch photos.
- **My posts / my claims** — ProfileScreen equivalent on web. Verified users only. Same RLS.
- **Add resource form** — verified users only. EXIF stripping must still happen (see below).

**One web-specific caution on EXIF:** `expo-image-manipulator` is a native-only module. The EXIF-stripping pipeline (PRIVACY.md D5) does not work on web. If the web demo includes photo upload, Shamus must either (a) disable photo upload on web (`Platform.OS === 'web'` guard) or (b) implement a web-compatible EXIF strip (browser Canvas re-encode before upload). **Photo upload on web without EXIF stripping is a privacy violation (PRIVACY.md D5).** If in doubt, disable photo upload on web for the demo.

---

## Requires re-review if:

- Any anonymous/guest-mode resource browsing is added
- `contact_handle` is exposed in any unauthenticated or pre-claim surface
- `resource-photos` Storage bucket is changed to `public = true`
- A new table or RPC is added that the anon key can call
- Web-specific analytics, third-party SDKs, or error-tracking services are added (PRIVACY.md D8)
- The map precision contract is relaxed (street-level zoom, GPS pins, per-poster polygon, category-colored polygons per neighborhood)
- Photo upload is enabled on web without a web-compatible EXIF strip implementation
- A "social share" feature exposes any resource data to unauthenticated public URLs
- The category column is exposed in a publicly accessible API endpoint (e.g., a Supabase Edge Function with no auth check)

---

*Jordan — Privacy Advisor, Claude Corp. File-only output. No external side effect. Const. Art. 9.*
