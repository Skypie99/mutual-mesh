# Mutual Mesh — Privacy Inventory & Data Model

**Status: 🟢 APPROVED — locked at 2026-05-23.** (Jordan draft v1, reviewed by Steve; all 18 D/S decisions + 4 open questions resolved by Sky on 2026-05-23. D1 & D2 EDITED — see Sky's notes; D3–D10 and S1–S8 approved; Q1–Q4 answered.)
**Owner: Jordan (Privacy Advisor).**
**Constitution authority: Art. 7.6 — privacy review mandatory for marginalized-group + location data; Sky approval required before merge.**
**This is a draft for Sky's review and is NOT legal advice. PIPEDA references are non-authoritative and need professional legal review before public launch.**

This file is the **source of truth for what data Mutual Mesh collects, why, how long, and who can see it.** The PRD's data fields are SUPERSEDED by this document once Sky signs off.

**No code that touches user data may be written until this file's status flips to APPROVED.**

---

## Design principles

1. **Minimum collection.** If a field isn't strictly needed to serve a verified user, we don't collect it.
2. **Public-by-design defaults are FALSE.** Every field defaults to private; we explicitly justify each one that's exposed to other users.
3. **No identity-graph creation.** No "who-vouched-for-whom" maps. Referrers are tokens, not people.
4. **Photos are re-encoded server-side AND client-side.** Belt-and-braces EXIF stripping.
5. **Delete means delete.** No soft-delete, no "tombstones," no retained-for-30-days. Account deletion is a destructive SQL cascade.
6. **Admins see only what's needed to decide.** Verification admins do not see PII beyond the single piece they're reviewing.
7. **Backup honesty.** We disclose Supabase's backup retention window in plain language; we don't pretend deletion is instant.

---

## Answers to the 10 brief questions

### 1. Chosen handle vs real name

**Decision: Chosen handle ONLY.** Real name is never collected. Handle is the user-facing identity in the marketplace. Handle is mutable (user can change it) and is the only thing other users ever see.

### 2. Postal-code granularity

**Decision: First-three-character postal code (e.g., M5V), stored as a 3-char string.** This is the "Forward Sortation Area" in Canadian postal codes — neighborhood-level, not building-level. Cannot be used to find a specific address. (For US ZIPs, equivalent would be the first 3 digits — also FSA-equivalent breadth.)

### 3. Phone number

**Decision: NOT COLLECTED in MVP.** The PRD originally required phone for coordination; we replace this with an **opt-in per-resource contact handle** the poster chooses (e.g., a Signal handle, a Proton Mail alias, "DM me on Reddit @user"). The poster types that handle when they post a resource and it's revealed only to the user who claims the resource. Phone numbers are never collected at all.

### 4. "Referred By"

**Decision: Single-use invite token, not a name.** Existing users can generate a one-time-use invite code (e.g., 8-character alphanumeric). New signups paste the code on signup. The code is hashed and stored on the new user's row as `referrer_token_hash`. **We do NOT store which user generated it.** No identity graph is created.

If anti-abuse needs traceability later, we can add an opt-in `vouch_log` table that records (referrer_user_id, referee_user_id) — but **only with Sky's explicit reconsideration** and not in v1.

### 5. Photos — EXIF stripping

**Decision: Two-layer strip.**

- **Client-side**: `expo-image-manipulator.manipulateAsync(uri, [], { compress: 0.7, format: SaveFormat.JPEG })` re-encodes the image to a fresh JPEG, dropping all EXIF including GPS, device model, timestamps.
- **Server-side**: a Postgres trigger on `resources` Storage uploads runs an Edge Function that re-processes the file with `sharp` or equivalent to guarantee no EXIF survives even if a malicious client bypasses the manipulator.
- A test in `src/__tests__/photos.test.ts` will assert the manipulated output's EXIF is empty before upload happens.

### 6. Verification admin's data view

**Decision: Admins see only `email`, `chosen handle`, `postal prefix`, and `referrer_token_hash` status (valid/invalid/already-used).** They DO NOT see: phone, IP address, device info, timestamps beyond signup date. After approval/rejection, the admin's review session ends and the next admin reviewing the same user (if any) sees only the current state, not prior admins' notes.

Admins are themselves regular users with `is_admin = true` on their row. They do NOT have a separate elevated database role beyond what RLS policies grant. **An admin cannot read any resource photo, message, or claim data unless they would have access as a regular verified user.**

### 7. Retention

**Decision:**

- **Resource rows** (listings): Deleted 30 days after `status = 'reserved'` OR 30 days after creation if never claimed. A nightly Postgres job (`pg_cron` or Supabase Scheduled Function) hard-deletes expired rows. Photos in Storage cascade-delete via the row's `ON DELETE` trigger.
- **User account**: Lives until the user deletes it.
- **Verification logs**: Kept for 90 days post-approval (so a single bad-actor admin pattern is auditable by Sky), then hard-deleted. Logs contain only `(admin_user_id, applicant_user_id, decision, timestamp)`. No data content.

### 8. "Delete my account"

**Decision: True cascade hard delete.**
The user-facing "Delete my account" button calls a Postgres RPC `delete_my_account()` (security definer, `auth.uid()`-scoped) that:

1. Deletes all rows in `resources` where `posted_by = auth.uid()` (cascade-deletes photos via the Storage trigger).
2. Nulls out `claimed_by` on any resource the user has claimed but not yet picked up (so the poster can re-list).
3. Deletes the row in `public.users`.
4. Deletes the row in `auth.users` (cascading any auth-provider state).

A SQL trace test (in `supabase/__tests__/delete_account.sql` or equivalent) will verify a deleted user's `auth.uid()` returns zero rows from any table.

**Backups (honest disclosure)**: Supabase keeps point-in-time-recovery snapshots for 7 days on Pro plan. A deleted account is technically still recoverable from a backup for up to 7 days. We disclose this in the in-app deletion confirmation copy. We do not have a way to scrub backups; that's a Supabase platform limit.

### 9. Logging / analytics

**Decision:**

- **NO third-party SDKs in MVP.** No Sentry, no Mixpanel, no Amplitude, no Google Analytics. `package.json` is verified to contain none.
- **Supabase request logs**: Supabase's platform logs request paths but not request bodies for normal Postgrest queries; this matches their documented behavior. We will NOT enable Supabase Log Drains to a third party.
- **In-app error logging**: errors go to `console.warn` only; nothing is persisted. The `errors.ts` helper hides JWT/URL/Postgrest-code internals before any display.
- **Auth logs**: `auth.audit_log_entries` table in Supabase records sign-ins. We do not query this table from the app. Retention follows Supabase platform defaults (we disclose in privacy policy).

### 10. PIPEDA mapping (draft — legal review required)

Per Canada's Personal Information Protection and Electronic Documents Act, each collected field is justified by one of the 10 fair information principles. Below is Jordan's draft mapping. **This is not legal advice; needs a real privacy lawyer's sign-off before launch.**

| Field                                         | PIPEDA principle invoked                                  | Notes                                                                  |
| --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| email                                         | Identifying Purposes (Principle 2), Consent (Principle 3) | Necessary for auth; consent obtained at signup                         |
| chosen handle                                 | Limiting Collection (Principle 4)                         | Public-facing alternative to real name; minimum needed for marketplace |
| postal prefix                                 | Limiting Collection (Principle 4)                         | Neighborhood-level only; cannot identify individual                    |
| `is_verified` flag                            | Accuracy (Principle 6)                                    | Required for marketplace integrity                                     |
| referrer_token_hash                           | Limiting Collection (Principle 4)                         | Hashed; no identity link                                               |
| resource photo (EXIF-stripped)                | Limiting Collection (Principle 4)                         | User-supplied; metadata removed                                        |
| pickup location text (free-text, no coords)   | Limiting Collection (Principle 4)                         | User chooses granularity                                               |
| per-resource contact handle (poster's chosen) | Consent (Principle 3)                                     | User explicitly publishes per listing                                  |

---

## Data inventory (final)

| #   | Field                  | Table.column                       | Collected at        | Purpose                        | Retention                                                    | Who sees it                                                     | Encrypted at rest             |
| --- | ---------------------- | ---------------------------------- | ------------------- | ------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------- |
| 1   | auth email             | `auth.users.email`                 | Signup              | Auth                           | Until account delete                                         | Supabase auth; verification admins (one-time review)            | Supabase platform default     |
| 2   | chosen handle          | `public.users.handle`              | Signup              | Public marketplace identity    | Until account delete                                         | All verified users                                              | No (intentionally public)     |
| 3   | postal prefix (3 char) | `public.users.postal_prefix`       | Signup              | Neighborhood matching          | Until account delete                                         | All verified users                                              | No                            |
| 4   | `is_verified`          | `public.users.is_verified`         | Set by admin        | Marketplace gate               | Until account delete                                         | Server-side only                                                | No                            |
| 5   | `is_admin`             | `public.users.is_admin`            | Set manually by Sky | Identifies verification admins | Until account delete                                         | Server-side only                                                | No                            |
| 6   | referrer_token_hash    | `public.users.referrer_token_hash` | Signup              | Anti-abuse vouching            | Until account delete                                         | Server-side only                                                | No (already hashed)           |
| 7   | resource name          | `public.resources.name`            | When posting        | Marketplace listing            | 30 days after `status=reserved` OR creation+30d if unclaimed | All verified users                                              | No                            |
| 8   | resource description   | `public.resources.description`     | When posting        | Listing detail                 | Same                                                         | All verified users                                              | No                            |
| 9   | resource photo URL     | `public.resources.photo_url`       | When posting        | Visual trust                   | Same; Storage object cascade-deletes                         | All verified users (signed URL)                                 | EXIF stripped client+server   |
| 10  | pickup info (text)     | `public.resources.pickup_text`     | When posting        | Coordination                   | Same                                                         | All verified users                                              | No (user chooses granularity) |
| 11  | poster contact handle  | `public.resources.contact_handle`  | When posting        | Reveal-on-claim                | Same                                                         | Claimant only, after claim                                      | No (user-supplied)            |
| 12  | status                 | `public.resources.status`          | Lifecycle           | Marketplace state              | Same                                                         | All verified users                                              | No                            |
| 13  | posted_by              | `public.resources.posted_by`       | When posting        | Ownership                      | Same                                                         | Server-side; poster's handle shown indirectly                   | No                            |
| 14  | claimed_by             | `public.resources.claimed_by`      | On claim            | Reservation                    | Same                                                         | Server-side; claimant's handle shown to poster on detail screen | No                            |
| 15  | verification_log       | `public.verification_log` (table)  | On admin decision   | Audit trail                    | 90 days post-decision                                        | Sky only (no admin-to-admin visibility)                         | No                            |

**Fields NOT collected:** real name, full postal code, phone, gender, age, device ID, IP address (beyond Supabase platform defaults), GPS coordinates, browser fingerprint, social-account links, payment info.

---

## DECISIONS FOR SKY

> Each item below needs Sky's ✅ approval, ❌ pushback, or ✏️ edit before code is written.

### D1: Drop real-name and phone collection entirely

**Proposal:** Collect only handle + email + postal prefix at signup. No real name, no phone, no gender.
**Why:** Original PRD's PII set exceeded minimum-collection by a large margin for the audience.
**Alternative considered:** Optional encrypted phone for "trusted users" — rejected because (a) optional fields creep into pseudo-required, (b) it creates two classes of user.
**Rollback:** Add columns later if a specific verified need emerges. We never lose data by NOT collecting it.

**EDITED — see Sky's note (2026-05-23):** Strengthened per Sky. Real names are never collected, stored, OR used as a handle or contact value anywhere in the app. This is an _enforced_ rule, not merely "not collected at signup": the handle default must not produce a real name (random adjective+noun pair per Quinn's Cycle 1 spec), and the per-resource contact handle is validated/warned against real-name entry (see D2). Dana enforces at the schema layer; Shamus enforces at the UI layer.

- [x] ✏️ EDITED (approved with strengthening)

### D2: Per-resource contact handle replaces in-app chat AND phone

**Proposal:** The poster types a contact handle (Signal username, Proton alias, etc.) at posting time. Claimant sees it on claim. No app-managed channel.
**Why:** Keeps Mutual Mesh out of the "messaging app" regulatory category; lets users use channels they already trust.
**Alternative considered:** Build a thin Supabase-Realtime chat in MVP — rejected for scope and the moderation/retention surface it would create.
**Rollback:** Chat can be added as v2 without changing existing data.

**EDITED — see Sky's note (2026-05-23):** Approved with addition per Sky: the per-resource contact handle MUST NOT be a real name. The posting UI warns the poster at entry time (e.g., "Don't use your real name — use a Signal/Proton/app handle"). This pairs with Steve's S3 sanitization (length cap + URL rejection on `contact_handle`).

- [x] ✏️ EDITED (approved with addition)

### D3: Postal prefix at 3 characters

**Proposal:** Store only the first 3 chars of the postal code (Canadian FSA equivalent).
**Why:** Neighborhood matching without identifying a building.
**Alternative considered:** No location at all — rejected because cross-city matching is wasteful (a Toronto user shouldn't see a Vancouver listing). Full postal code rejected as too precise.
**Rollback:** Truncating later is destructive; widening later is easy. Start narrow.

- [x] ✅ Approve

### D4: Referrer is a hashed token, never a name

**Proposal:** Existing users generate single-use invite codes. The new user pastes one on signup. Code is hashed; no link to the generating user is stored.
**Why:** Prevents subpoena-able identity graphs while still gating signups.
**Alternative considered:** Open signup with admin verification only — rejected because it creates an attack vector for admin overload. No referrer at all rejected for same reason.
**Rollback:** Can shift to open signup later if admin verification proves robust.

- [x] ✅ Approve

### D5: Two-layer EXIF stripping (client + server)

**Proposal:** `expo-image-manipulator` strips on client; server-side Edge Function re-processes to guarantee.
**Why:** A malicious client could bypass client-side stripping. Belt-and-braces.
**Alternative considered:** Client-only stripping — rejected as bypassable. Server-only — rejected because client upload bandwidth is wasted on EXIF-bloated images.
**Rollback:** If server-side proves slow/expensive, can downgrade to client-only with documented risk.

- [x] ✅ Approve

### D6: True cascade delete on "Delete my account"

**Proposal:** `delete_my_account()` RPC hard-deletes all user-related rows + Storage objects. No soft-delete.
**Why:** Honest deletion is a load-bearing trust signal for a surveillance-averse audience.
**Alternative considered:** Soft-delete with 30-day grace — rejected; users who want out should be out immediately.
**Backup honesty:** Disclose Supabase 7-day PITR window in the in-app deletion confirmation copy. We cannot scrub backups; that's a platform limit.

- [x] ✅ Approve

### D7: Resource retention — 30 days after `reserved` OR 30 days after creation if unclaimed

**Proposal:** Nightly `pg_cron` job (`prune_expired_resources()`) hard-deletes expired rows; photos cascade.
**Why:** Stale listings clutter the marketplace; unclaimed listings indicate a fit problem worth surfacing in metrics.
**Alternative considered:** 7-day / 14-day / 60-day windows. 30 days is the middle ground.
**Rollback:** Easy to retune the constant.

- [x] ✅ Approve

### D8: No third-party SDKs in MVP

**Proposal:** No Sentry, no Mixpanel, no analytics. `package.json` audit at every Phase boundary.
**Why:** Every SDK is a data-egress surface.
**Alternative considered:** Self-hosted Sentry / Plausible — deferred until launch volume justifies the operational cost.
**Rollback:** Re-evaluate at Cycle 7 (ship-readiness) with a per-SDK privacy review.

- [x] ✅ Approve

### D9: Verification admins are regular users with `is_admin=true` flag, NOT a separate role

**Proposal:** No separate Supabase role for admins. RLS policies use `is_admin = true` as the gate. Admins cannot read photos, claims, or messages of other users via their admin status.
**Why:** Reduces blast radius if an admin account is compromised; admins can do exactly what they need (verify) and nothing more.
**Alternative considered:** Separate `admin` Postgres role — rejected for complexity; defeats RLS-as-source-of-truth.
**Rollback:** Can add separate role later if specific need emerges.

- [x] ✅ Approve

### D10: PIPEDA draft is for Sky's review, NOT legal advice

**Proposal:** Mapping above is Jordan's best-effort draft; needs a real Canadian privacy lawyer to sign off before public launch.
**Why:** Jordan is not a lawyer; AI cannot give legal advice. Constitution Art. 4 (Jordan role): "all findings labeled 'draft for legal review'."
**Action for Sky:** Budget for a 1-2h consultation with a PIPEDA-knowledgeable Canadian privacy lawyer before Cycle 7 (ship-readiness).

- [x] ✅ Approve

---

## Open questions still requiring Sky's call

> **All four resolved by Sky on 2026-05-23.**

1. **Email-verification step at signup** — require Supabase magic link / OTP, OR allow any plausible email and gate via the admin step? Recommend: **OTP-required**, because it raises the bar against throwaway-email sock-puppet attacks. (Defaults to OTP unless Sky overrides.)
   - ✅ **Sky's call (2026-05-23): OTP-required.** Supabase magic-link/OTP at signup, in addition to the admin verification step. Aligns with Quinn's Cycle 1 AC-2.
2. **City/region selector on signup** — explicit dropdown ("Toronto", "Vancouver", etc.) vs auto-derive from postal prefix? Recommend: **explicit dropdown** because postal prefixes can be ambiguous near city borders.
   - ✅ **Sky's call (2026-05-23): explicit dropdown.** User picks city/region; avoids border ambiguity and keeps disclosure in the user's control.
3. **Multi-language support timeline** — English MVP locked, but Mutual Mesh's audience often has limited English. When does French/Spanish/Mandarin/Punjabi land? (Out of Jordan's scope; for Quinn + Casey.)
   - ✅ **Sky's call (2026-05-23): defer to post-v1; Quinn + Casey scope the roadmap.** English MVP ships first; multi-language is roadmapped immediately after, with community input deciding which languages land first.
4. **What happens to verification admins who go inactive** — auto-suspend after N days no-action? (Steve to draft an answer in his audit.)
   - ✅ **Sky's call (2026-05-23): auto-suspend after inactivity; Steve drafts the exact threshold + reinstatement flow.** Starting point ~30 days no-action → suspended, reinstated on request.

---

## How this file gets approved

1. ✅ Jordan writes the redesign (THIS draft).
2. ✅ Steve reviews from a security angle and appends notes below (S1–S8).
3. ✅ Morgan briefs Sky (`qa-reports/2026-05-23_push-2-briefing.md`); Sky reviewed directly.
4. ✅ Sky reviewed and resolved all 18 D/S decisions (D1 & D2 edited; rest approved) and answered the four open questions — 2026-05-23.
5. ✅ All D & S items resolved; status flipped from 🟡 READY-FOR-REVIEW to **🟢 APPROVED — locked at 2026-05-23**. Cycle 0 Phase 0b begins.

Step 5 is complete — code that reads or writes user data may now be written (Cycle 1 / Phase 0b).

---

## Steve's security audit notes — 2026-05-23

Steve reviewed Jordan's v1 draft and surfaces eight additional decisions (S1–S8) for Sky's review. None are showstoppers; all are implementation specifics for Cycle 0 Phase 0b. **Full report: [`qa-reports/2026-05-23_security-privacy-review.md`](qa-reports/2026-05-23_security-privacy-review.md).**

Summary of Steve's eight asks:

- **S1**: Invite token must be ≥12 chars (62+ bits entropy), bcrypt-hashed.
- **S2**: Rate-limit signup invite-verification endpoint to 10/min/IP.
- **S3**: Sanitize and length-cap `pickup_text` (280) and `contact_handle` (64); reject URLs in handle field.
- **S4**: Photos go in a PRIVATE Storage bucket with 1h signed URLs, NOT a public bucket. (Load-bearing — Jordan referenced signed URLs once; Steve elevates to a numbered decision.)
- **S5**: `delete_my_account()` RPC wraps cascade in a single transaction with `FOR UPDATE` lock.
- **S6**: Add `cron_log` table; the prune job logs success/failure with row counts; alert on consecutive failures.
- **S7**: Disclose AsyncStorage is unencrypted on device (session-on-stolen-phone risk).
- **S8**: `verification_log` table is append-only at the RLS level; only Sky can SELECT.

Steve's recommendation: **APPROVE Jordan's D1–D10 AND Steve's S1–S8 together in one Morgan briefing.** They build on each other; partial approval creates gaps.

### Sky's decisions on S1–S8 (recorded 2026-05-23)

> Full text of each item is in [`qa-reports/2026-05-23_security-privacy-review.md`](qa-reports/2026-05-23_security-privacy-review.md). Approvals leave Steve's notes as-is; any pushback/edit notes are appended under that item in the security review file.

- [x] ✅ **S1** — Approved (invite token 12+ chars / ~62 bits, bcrypt cost-10, floor 10).
- [x] ✅ **S2** — Approved (rate-limit invite verification 10/min/IP).
- [x] ✅ **S3** — Approved (sanitize/cap `pickup_text` 280 & `contact_handle` 64, plain-text render, reject URLs, warn claimants).
- [x] ✅ **S4** — Approved (PRIVATE Storage bucket, 1h signed URLs, never public).
- [x] ✅ **S5** — Approved (`delete_my_account()` single transaction + `FOR UPDATE` lock).
- [x] ✅ **S6** — Approved (`cron_log` table + alert on consecutive prune failures).
- [x] ✅ **S7** — Approved (stay on AsyncStorage for MVP; disclose unencrypted-at-rest risk; prominent sign-out; SecureStore as v2 path).
- [x] ✅ **S8** — Approved (`verification_log` append-only at RLS; Sky-only SELECT).

---

## Addendum — Guest demo exception (2026-06-05)

A read-only, anonymous **guest demo** (`?demo=1` on the web build) was added and privacy-reviewed (Jordan gate: `qa-reports/2026-06-05_Jordan_DemoMode_Privacy_Gate.md`, APPROVE-WITH-CONDITIONS). It renders ONLY bundled synthetic fixtures (`src/lib/demo/fixtures.ts`) and makes **zero Supabase calls** — no real listing, handle (`contact_handle` is structurally `null`), photo (`photo_url` is `null`), or location is ever exposed. This does **not** change any D1–D10 / S1–S8 decision above: the rule "no unauthenticated access to *real* user data" stands and is honored by construction; only the broader "no guest mode at all" note (previously in LEARNINGS/README) is narrowed to permit a synthetic, zero-network demo.
