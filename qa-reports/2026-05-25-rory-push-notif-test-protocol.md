# Push Notification — Physical Device Test Protocol

**Author:** Rory (DevOps)
**Date:** 2026-05-25
**Scope:** End-to-end push notification path on a physical iOS or Android device.
**Note:** This test CANNOT run in a simulator. `getExpoPushTokenAsync()` returns null on simulators.

---

## Prerequisites

- Physical iOS (16+) or Android (13+) device with the app installed via **Expo Go** or a **development build** (not TestFlight — requires the Expo push token flow to be live).
- App connected to the live Supabase project (migrations 009, 010, 011 applied; `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` set in `.env`).
- A second authenticated account (or the admin account) to trigger a claim/pickup event that fires a notification.
- Supabase Table Editor or SQL editor access to verify `push_tokens` and `users.push_preferences`.

> **BLOCKER:** `supabase/functions/deliver_notification` does not exist yet. The client-side token registration path can be tested (Steps 1–5), but end-to-end delivery (Step 6) is blocked until Dana writes and Sky deploys that Edge Function.

---

## Test Procedure

**1. Fresh install — verify default state.**
Sign in as a verified user. Open Profile. Confirm the notification toggle section shows master toggle OFF.

- Expected DB: `users.push_preferences = {"enabled": false}`. No row in `push_tokens` for this user.

**2. Enable master toggle.**
Tap the master "Enable notifications" toggle ON.

- Expected: OS permission prompt appears (iOS: "Allow Mutual Mesh to send notifications?"; Android 13+: similar).

**3. Grant permission.**
Tap Allow on the OS prompt.

- Expected: UI reflects permission granted. `registerPermissionAndRegister()` fires.
- Expected DB: one row appears in `push_tokens` for this user with correct `platform` (`ios` or `android`) and a non-empty `expo_token` string. `users.push_preferences.enabled = true`.

**4. Enable at least one trigger (e.g., "When someone claims your post").**
Tap the on_claim toggle ON.

- Expected DB: `users.push_preferences = {"enabled": true, "on_claim": true, ...}`.

**5. Verify token not duplicated on re-open.**
Background and foreground the app.

- Expected DB: still exactly one row in `push_tokens` for this user (UPSERT, not insert).

**6. Trigger a notification — server side. (BLOCKED until `deliver_notification` Edge Function is deployed.)**
From the second account, claim a post owned by the test user.

- Expected: device receives a push notification with a generic title only (e.g., "Someone claimed your post"). Body must be empty. Resource name must NOT appear anywhere in the notification.

**7. Disable all and verify cleanup.**
Tap master toggle OFF. Confirm "Disable all" path.

- Expected DB: `push_tokens` row is deleted for this user. `users.push_preferences.enabled = false`.

---

## Pass Criteria

- Steps 1–5 complete without error and DB state matches expected at each step.
- Step 6 (when unblocked): notification arrives on device, title-only, no resource name visible.
- Step 7: token row removed from DB.

## Fail Criteria and Diagnosis

| Symptom                                                   | Likely cause                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `push_tokens` row never appears after granting permission | RPC `register_push_token` failing — check Supabase logs for `is_verified` gate or preference gate rejection |
| `getExpoPushTokenAsync()` returns null                    | Running on simulator, or `EXPO_PUBLIC_SUPABASE_URL` misconfigured                                           |
| Notification body shows resource name                     | `deliver_notification` Edge Function payload bug — violates AC-2 / title-only rule                          |
| Duplicate rows in `push_tokens`                           | UNIQUE `(user_id, platform)` constraint from migration 010 not applied — verify migration 010 is in DB      |
| Permission prompt never appears                           | Notifications already denied at OS level — user must reset via device Settings                              |
