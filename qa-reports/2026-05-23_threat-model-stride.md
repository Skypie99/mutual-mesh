# STRIDE Threat Model — Steve — 2026-05-23

## Summary

A STRIDE-style threat model for Mutual Mesh v1 + planned v2. STRIDE: **S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege. Each threat scored on **likelihood (L)** × **impact (I)**, with the residual risk after mitigation.

This model assumes the data model described in Jordan v1 PRIVACY.md + Steve's 8 hardening additions, applied as specified.

**Scoring:** L and I on 1-5 scales. Risk = L × I, max 25. Categories:

- 1-5: low (accept)
- 6-12: medium (mitigate, document residual)
- 13-25: high (must mitigate before launch)

---

## Trust boundaries

```
[Untrusted user device]
   │
   │ TLS
   ▼
[Supabase platform: Postgres + Storage + Auth + Realtime + Edge Functions]
   │
   │ Service-role key (NEVER in client) — only used by:
   │   - Sky's local schema apply
   │   - pg_cron jobs
   │   - server-side Edge Functions (Casey/Sky deploy)
   ▼
[Backups: Supabase platform backups (7d PITR retention, Sky cannot scrub)]
```

Trust falls off precipitously at each boundary. The user device is fully untrusted (the user is anyone, including bad actors). Supabase is semi-trusted (we trust the platform's hardening but not its surface area). Backups are out of our reach (a real residual risk).

---

## Threats

### S — Spoofing

#### S1: Account-takeover via stolen credentials

**Description:** An attacker obtains a verified user's email + password (phishing, credential reuse, malware) and signs in.
**L:** 3 (common attack class)
**I:** 4 (attacker can browse marketplace, claim items, see contact handles)
**Risk:** 12 (medium)
**Mitigations:**

- Email-OTP at signup (anti-throwaway) — limits but doesn't prevent.
- Supabase's built-in rate limiting on `signInWithPassword`.
- 2FA (TOTP) — **NOT in v1.** Recommend for v2.
- AsyncStorage session is unencrypted at rest (per Steve S7 disclosure). If phone is stolen + unlocked, session is stolen.
  **Residual:** Medium-low. v2 2FA closes most of the gap.

#### S2: Account creation with someone else's invite token

**Description:** Token is shared/leaked/screenshotted; an attacker uses it before the intended recipient.
**L:** 3
**I:** 2 (gets into the app, but still has to pass admin verification)
**Risk:** 6 (medium)
**Mitigations:**

- Single-use enforcement at DB level (`UNIQUE` on hash).
- 12+ char entropy (Steve S1) prevents brute force.
- Admin verification step catches "this person doesn't match the community."
  **Residual:** Low. The admin step is the load-bearing trust check.

#### S3: Impersonation via similar handle

**Description:** Attacker registers a handle similar to a trusted user's (e.g., `j0hn_smith` vs `john_smith`) to fool claimants.
**L:** 3
**I:** 3 (claimant could trust a fake contact handle)
**Risk:** 9 (medium)
**Mitigations:**

- Handle is unique (UNIQUE constraint).
- Casey's onboarding tells admins to reject "handles that impersonate."
- No mitigation for similar-but-distinct handles.
  **Residual:** Medium. Recommend: in v2, add a "Last edited handle on YYYY-MM-DD" timestamp to detail screens so impersonators can be spotted. Also: contact-handle warning copy ("verify before sharing personal details") is already in ResourceDetailScreen.

---

### T — Tampering

#### T1: Client-side EXIF strip bypass

**Description:** A malicious client uploads a photo with EXIF intact (GPS, device).
**L:** 2 (requires forking the app)
**I:** 4 (location leak)
**Risk:** 8 (medium)
**Mitigations:**

- Two-layer strip (Jordan D5): client + server-side Edge Function.
- Server-side function fails-closed: if EXIF can't be removed, photo is rejected.
  **Residual:** Low. The server-side strip is load-bearing.

#### T2: Direct SQL via leaked anon key

**Description:** Attacker extracts the `EXPO_PUBLIC_SUPABASE_ANON_KEY` from a decompiled app bundle and crafts queries.
**L:** 5 (the anon key IS public by design)
**I:** Depends on RLS
**Risk:** Capped by RLS strength
**Mitigations:**

- **RLS is the only thing between an anon-key holder and arbitrary data.**
- Cycle 1 RLS policies require `auth.uid()` ∈ verified users for every read/write on `public.resources` + storage.
- Steve will write `supabase/__tests__/rls.sql` that runs each policy against anonymous + unverified + verified roles.
  **Residual:** Cap at whatever RLS allows. RLS audit is a recurring check.

#### T3: Race condition on atomic Claim

**Description:** Two users tap Claim within milliseconds; both succeed.
**L:** 3
**I:** 3 (poster confused; one claimant believes they got the item but didn't)
**Risk:** 9 (medium)
**Mitigations:**

- `claim_resource()` RPC uses `SELECT ... FOR UPDATE` inside a transaction (PRD §3, Steve S5).
- Postgres transaction isolation guarantees exactly-one winner.
  **Residual:** Very low. Confirmed by transactional Postgres semantics.

#### T4: Invite token forgery

**Description:** Attacker generates plausible-looking 12-char tokens and tries them at signup.
**L:** 2 (rate-limited)
**I:** 2 (admin verification still required)
**Risk:** 4 (low)
**Mitigations:**

- 62+ bits of entropy (Steve S1) — unguessable.
- 10/min/IP rate limit (Steve S2).
- bcrypt cost 10 makes each verify ~50ms — natural rate limit.
  **Residual:** Negligible.

---

### R — Repudiation

#### R1: Admin denies making a verification decision

**Description:** An admin approves a bad actor, then claims they didn't.
**L:** 2
**I:** 3 (community trust damaged)
**Risk:** 6 (medium)
**Mitigations:**

- `verification_log` table records (admin_id, applicant_id, decision, timestamp) immutably (append-only RLS per Steve S8).
- Only Sky can SELECT — so the admin can't see their own history to plausibly deny.
  **Residual:** Low.

#### R2: Claimant denies claiming a resource that never showed up

**Description:** Claimant denies they ever pressed Claim.
**L:** 2
**I:** 1 (no real recourse exists in v1; poster just re-lists)
**Risk:** 2 (low)
**Mitigations:** N/A for v1.
**Residual:** Acceptable — Mutual Mesh isn't a transaction system.

---

### I — Information disclosure

#### I1: Photo URL enumeration in a public bucket

**Description:** An attacker who knows the path scheme (`{user-id}/{ts}.jpg`) enumerates photos.
**L:** 5 (trivial if bucket is public)
**I:** 5 (mass photo exposure)
**Risk:** 25 (CRITICAL if mis-configured)
**Mitigations:**

- **Bucket is PRIVATE** (Steve S4).
- Signed URLs only, 1h TTL.
- RLS on `createSignedUrl` requires `is_verified = true`.
  **Residual:** Low IF S4 is enforced. Verifying this is the single most important RLS test in Cycle 3.

#### I2: Real names leaking via email handle

**Description:** A user signs up with `firstname.lastname@gmail.com`. If the handle defaults to the email local part, real names leak into the marketplace.
**L:** 4
**I:** 4
**Risk:** 16 (high)
**Mitigations:**

- **Handle default is a random adjective+noun pair**, NOT the email local part. Quinn's Cycle 1 spec already calls this out.
- Email is never shown to other users.
  **Residual:** Low.

#### I3: Realtime subscription leaks other users' rows

**Description:** Supabase Realtime sends row deltas. If a user subscribes to `public.users` to watch their own verification, they could see deltas for OTHER users' `is_verified` flips.
**L:** 4 (default Realtime behavior)
**I:** 3 (knowing who's verifying ≠ knowing who they are, but still meta-data leak)
**Risk:** 12 (medium)
**Mitigations:**

- RLS on Realtime channels: Supabase respects RLS for replication.
- Channel filter: `filter: id=eq.{auth.uid()}` on the WaitingRoom subscription.
- Verify in Steve's RLS test suite (`rls.sql`) that an unverified user receives ZERO realtime events from anyone else's rows.
  **Residual:** Low if filter is enforced.

#### I4: Backups retaining deleted data (Supabase platform limit)

**Description:** A user deletes their account; data is gone from live tables but persists in Supabase PITR for 7 days.
**L:** 5 (every deletion)
**I:** 3 (recoverable only by Supabase staff under their own access controls)
**Risk:** 15 (high)
**Mitigations:**

- Disclosed honestly in `PRIVACY.md` D6 and in the in-app delete confirmation copy.
- No way to scrub backups from our side; this is a platform limit.
- Consider Supabase self-hosted in v3 if backup retention becomes intolerable.
  **Residual:** Medium — accepted risk with mitigation = disclosure.

#### I5: Push notification copy on lock screen

**Description:** A push notification with resource details ("@user claimed your hypoallergenic formula") appears on a lock screen that the wrong person sees.
**L:** 5 (push is intrinsically lock-screen-visible)
**I:** 4 (per Mara persona — stalking concerns)
**Risk:** 20 (high — IF push is ever added)
**Mitigations:**

- **NO PUSH NOTIFICATIONS IN V1.** Pull-only.
- When/if v2 adds push, copy MUST be generic ("You have an update") — never include resource name, handle, or other PII.
  **Residual:** Zero in v1.

#### I6: Error message leaks Supabase internals

**Description:** A failing query returns a Postgres-shaped error to the client; client renders it; user sees `PGRST116` codes / signed-URL paths.
**L:** 3
**I:** 2
**Risk:** 6 (medium)
**Mitigations:**

- `userFacingErrorMessage()` in `src/lib/errors.ts` strips JWT/URL/PGRST patterns before display. Tests cover this.
- Sentry / error tracking NOT in v1 — so no third-party gets the raw error either.
  **Residual:** Low.

---

### D — Denial of service

#### D1: Marketplace flooding by a single user

**Description:** A verified user posts thousands of listings to bury legitimate ones.
**L:** 2
**I:** 3
**Risk:** 6 (medium)
**Mitigations:**

- Rate-limit AddResource at ~20 posts/hour/user (Steve recommends; not in S1-S8 yet).
- Admin can revoke verification (`is_verified = false`) via the verification UI in Cycle 5.
  **Residual:** Low.

#### D2: Photo upload abuse

**Description:** Large or malformed images consume Storage bandwidth + tokens.
**L:** 2
**I:** 2
**Risk:** 4 (low)
**Mitigations:**

- `expo-image-manipulator` re-encodes + compresses on client (already in PRIVACY.md D5).
- Hard cap photo size at 5MB at the Storage policy level.
- Server-side strip refuses files >5MB.
  **Residual:** Low.

#### D3: Supabase Realtime channel exhaustion

**Description:** A client opens many subscriptions, exhausting our connection budget.
**L:** 1
**I:** 2
**Risk:** 2 (low)
**Mitigations:**

- Supabase enforces per-project connection limits.
- App code only opens ~2-3 channels per user (auth state + resources feed).
  **Residual:** Negligible.

---

### E — Elevation of privilege

#### E1: Non-admin user setting `is_admin = true` on themselves

**Description:** Via a crafted UPDATE, a user grants themselves admin.
**L:** 1 (requires RLS bypass)
**I:** 5 (admin can approve other bad actors)
**Risk:** 5 (low, conditional)
**Mitigations:**

- RLS: NO UPDATE policy on `is_admin` for `authenticated` role. Only `service_role` (Sky) can set the bit.
- `is_admin` is set MANUALLY by Sky via the Supabase dashboard SQL editor. There is no in-app admin-promotion UI.
  **Residual:** Negligible. The lack of a promotion path is the mitigation.

#### E2: Verification admin abusing their flag to read other users' data

**Description:** An `is_admin = true` user crafts a query expecting elevated read permissions.
**L:** 3
**I:** 4
**Risk:** 12 (medium)
**Mitigations:**

- RLS policies do NOT grant admins read access to `public.resources` or photos. Admins only see the verification queue — and only minimum-necessary fields per Jordan D9.
- `verification_log` SELECT is RLS-locked to Sky.
- Steve's RLS test suite verifies this for an admin role.
  **Residual:** Low.

#### E3: User claiming their own listing to hide it from the marketplace

**Description:** A poster claims their own resource to remove it from feeds without deleting.
**L:** 3
**I:** 1 (no real harm, just confusing)
**Risk:** 3 (low)
**Mitigations:**

- `claim_resource()` RPC checks `posted_by ≠ auth.uid()` and raises.
  **Residual:** Negligible.

---

## Summary table

| ID  | Threat                | Risk                        | Status                      | Residual   |
| --- | --------------------- | --------------------------- | --------------------------- | ---------- |
| S1  | Credential theft      | 12                          | Mitigated                   | M-L        |
| S2  | Token leak            | 6                           | Mitigated                   | L          |
| S3  | Handle impersonation  | 9                           | Partially                   | M          |
| T1  | EXIF bypass           | 8                           | Mitigated                   | L          |
| T2  | Anon-key direct query | (capped by RLS)             | RLS-load-bearing            | L          |
| T3  | Claim race            | 9                           | Mitigated                   | VL         |
| T4  | Invite forgery        | 4                           | Mitigated                   | N          |
| R1  | Admin repudiation     | 6                           | Mitigated                   | L          |
| R2  | Claimant repudiation  | 2                           | Accepted                    | A          |
| I1  | Photo enumeration     | 25 → with S4 → L            | Mitigated (S4 load-bearing) | L          |
| I2  | Real names via email  | 16 → with random handle → L | Mitigated                   | L          |
| I3  | Realtime row leak     | 12                          | Mitigated (RLS + filter)    | L          |
| I4  | Backup retention      | 15                          | Disclosed                   | M-accepted |
| I5  | Push notif leak       | 20 (if added)               | Excluded in v1              | Zero       |
| I6  | Error msg leak        | 6                           | Mitigated                   | L          |
| D1  | Posting flood         | 6                           | Mitigated                   | L          |
| D2  | Photo abuse           | 4                           | Mitigated                   | L          |
| D3  | Realtime exhaustion   | 2                           | Mitigated                   | N          |
| E1  | Self-promote admin    | 5                           | Mitigated                   | N          |
| E2  | Admin reads user data | 12                          | Mitigated                   | L          |
| E3  | Self-claim            | 3                           | Mitigated                   | N          |

**Highest residual risks after mitigation:**

1. **I4 (Backup retention)** — accepted with disclosure. Real but unavoidable platform limit.
2. **S3 (Handle impersonation)** — partial mitigation. Recommend v2 timestamp-edited indicator.
3. **S1 (Credential theft)** — recommend v2 2FA.

## Recommendations for Cycle 7 (ship-readiness)

1. **Run penetration test against deployed app.** Especially: anon-key direct query attacks against RLS, EXIF bypass via crafted upload, race condition on Claim under load.
2. **Verify Supabase project settings:** rate limiting on auth endpoints enabled, no Log Drains to third parties, backup retention disclosed in user-facing privacy policy.
3. **Test admin compromise scenario:** if an admin account is taken over, what data can the attacker reach? Should match findings above.
4. **Schedule quarterly threat-model re-audit.** Add new threats as features are added (v2 chat, push, multi-language).

## DECISIONS FOR SKY

None new beyond what's already in Jordan v1 + Steve S1-S8. This model confirms those decisions are sufficient with the residual risks accepted.

## What I shipped

This threat model document. No code changed.
