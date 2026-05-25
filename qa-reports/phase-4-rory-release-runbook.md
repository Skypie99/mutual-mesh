# Phase 4 — Rory — Per-Platform Release Runbook

**Author:** Rory (DevOps)
**Date:** 2026-05-24
**Phase:** 4 (Launch infrastructure) — Tier 4 item #20 in `plans/goofy-singing-steele.md`
**Status:** FILE ONLY — Sky executes every `eas build`, `eas submit`, App Store Connect, and Play Console action. Rory does not run builds or submit.

---

## What this is

The end-to-end checklist Sky follows to get a Mutual Mesh build from local source into TestFlight, Google Play Internal Testing, and eventually the iOS App Store + Google Play production tracks. Pairs with:

- `eas.json` (build + submit profiles)
- `app.json` (bundle IDs, version, build numbers, Info.plist privacy strings)
- `qa-reports/phase-4-rory-prod-migration-playbook.md` (production Supabase)

Three audiences for builds:

- **Sky-only dev** (the `development` EAS profile) — internal dev client; never seen by anyone else.
- **QA + TestFlight + Play Internal** (the `preview` EAS profile) — staging Supabase, store-style distribution, real production code path.
- **Public** (the `production` EAS profile) — production Supabase, App Store + Play Store.

---

## Pre-flight (one-time setup before first build)

These steps run ONCE per machine + per account. After they're done, only the per-release steps below apply.

### 0.1 — EAS account + project creation

1. `npm install -g eas-cli` (or `brew install eas-cli`).
2. `eas login` — sign in with Sky's Expo account.
3. From `~/MutualMesh`, run `eas init --id REPLACE-WITH-EAS-PROJECT-ID`. Or, if no project exists yet, omit `--id` and EAS will create one and print the new ID. Paste that ID into `app.json` `extra.eas.projectId` AND into `app.json` `updates.url` (the `u.expo.dev/<id>` portion).
4. Commit the updated `app.json`.

### 0.2 — Apple Developer account

1. Sky enrolls at <https://developer.apple.com/programs/> ($99/yr).
2. Note: enrollment review takes 24–48h. Do this BEFORE Phase 4 starts so it doesn't block.
3. In App Store Connect, create the app shell:
   - <https://appstoreconnect.apple.com> → My Apps → "+" → New App.
   - Platforms: iOS.
   - Name: `Mutual Mesh` (max 30 chars; this is the App Store title).
   - Primary language: English (Canada).
   - Bundle ID: `com.mutualmesh.app` (must match `app.json`).
   - SKU: `mutual-mesh-001` (internal, never visible).
   - User Access: Full Access.
4. Copy the **App Store Connect numeric App ID** (visible in the URL after creating the app) → paste into `eas.json` `submit.production.ios.ascAppId` AND `submit.preview.ios.ascAppId`.
5. Copy your Apple Team ID (Membership page) → paste into `eas.json` `submit.*.ios.appleTeamId`.
6. Replace `REPLACE-WITH-SKY-APPLE-ID@example.com` in `eas.json` with Sky's Apple ID email.

### 0.3 — Google Play Developer account

1. Sky enrolls at <https://play.google.com/console/signup> ($25 one-time).
2. Create the app shell:
   - Play Console → All apps → "Create app".
   - App name: `Mutual Mesh`.
   - Default language: English (Canada) — `en-CA`.
   - App or game: App.
   - Free or paid: Free.
   - Declarations: accept Play guidelines + US export laws.
   - Save.
3. Set up internal testing:
   - Testing → Internal testing → Create new release (you'll attach the first build here later).
4. Create a Play Console service account for EAS submit:
   - Setup → API access → Choose "Link existing Google Cloud project" OR "Create new project".
   - Service accounts → Create service account → grant "Service Account User" role.
   - Generate a JSON key → download.
   - SAVE THE KEY JSON AT `~/MutualMesh/../play-store-service-account.json` (one level ABOVE the repo) so the path in `eas.json` (`../play-store-service-account.json`) resolves at build time. NEVER commit this file — it's already covered by `.gitignore`'s `*.key` and JSON-outside-the-repo rule, but verify.
   - In Play Console → Users and permissions → Invite users → invite the service-account email → grant "Release manager" on the Mutual Mesh app.

### 0.4 — EAS credential setup

EAS Build manages iOS code-signing certificates + Android keystores for you. First build per profile per platform asks; subsequent builds reuse.

1. Sky runs (from `~/MutualMesh`):
   ```
   eas credentials
   ```
2. Pick platform (iOS first, then Android). EAS walks through Distribution Certificate + Provisioning Profile creation for iOS, and Keystore generation for Android. **Always pick "Let EAS handle it"** unless Sky has an existing keystore to migrate (we don't).
3. The Android keystore is auto-generated and stored on EAS servers. Back it up: `eas credentials` → Android → Production → Download. Save in 1Password. **Losing this keystore = losing the ability to update the app on Play Store ever**. Critical.

### 0.5 — Verify clean state

Before any build:

```
git status                          # working tree clean
git pull origin main                # latest main
npm ci --legacy-peer-deps           # exact lockfile install
npm run typecheck                   # green
npm run lint                        # green
npm test                            # green
npm run format:check                # green
```

If any of those fail, fix before building.

---

## Versioning convention

We use **semver** for the JS-visible `expo.version` and **monotonically incrementing integers** for the native build counters. Both bump together on a release, but the platform-specific counters drift over time because EAS auto-increments per build attempt.

| Layer          | Field                      | Bumps when                                                     | Example                                                                           |
| -------------- | -------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| User-visible   | `expo.version`             | Every public release (feature or fix)                          | `0.1.0` → `0.1.1` (patch); `0.2.0` (minor); `1.0.0` (major / public launch)       |
| iOS native     | `expo.ios.buildNumber`     | Every iOS build (auto via EAS `autoIncrement`)                 | `1` → `2` → `3`…                                                                  |
| Android native | `expo.android.versionCode` | Every Android build (auto via EAS `autoIncrement`)             | `1` → `2` → `3`…                                                                  |
| OTA bundle     | `expo.runtimeVersion`      | When native code changes (new SDK, new plugin, new permission) | `1.0.0` stays the same across OTA updates; bumps to `1.1.0` on a new native build |

**Rules:**

- A new feature → bump `expo.version` minor (e.g. `0.2.0`); rebuild both platforms.
- A bug fix → bump `expo.version` patch (e.g. `0.2.1`); rebuild both platforms (or OTA — see "Update strategy" below).
- Public launch v1 → `expo.version` = `1.0.0`; rebuild both platforms; submit to App Store + Play Store production tracks.

Build numbers auto-increment in EAS Build so Sky never has to manually bump `app.json` between builds. The `appVersionSource: "local"` flag in `eas.json` means the `expo.version` in `app.json` is the source of truth; bump it in a commit before the build that ships it.

---

## OTA vs full rebuild — when to use which

Expo Updates (EAS Update) lets you push JS-only changes to existing installed apps **without** going through the App Store / Play Store review queue. This is "Over-The-Air" updates. But it has hard limits:

| Change type                                             | OTA possible?                                                       | Why                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| JS code, React Native component, styling                | YES                                                                 | Pure JS bundle replace                             |
| New string, copy edit, image asset bundled in `assets/` | YES                                                                 | Bundle includes assets                             |
| New `expo-*` plugin OR new permission                   | NO — full rebuild                                                   | Native module + Info.plist/AndroidManifest changes |
| Bump `expo` SDK version                                 | NO — full rebuild                                                   | Native runtime changes                             |
| New `runtimeVersion`                                    | NO — by definition, OTA only applies within the same runtimeVersion |

**Decision tree:**

1. Did this change add or remove an `expo-*` plugin? → Full rebuild.
2. Did this change add a permission to `app.json`? → Full rebuild.
3. Did this change touch `metro.config.js`, `babel.config.js`, or the native build chain? → Full rebuild.
4. Otherwise → OTA via EAS Update on the matching channel.

**To push an OTA update:**

```
# From a clean main with the change committed:
eas update --channel production --message "Fix: feed scroll restoration"
# (or --channel preview / --channel development as appropriate)
```

The update is downloaded by installed apps on next launch (or in the background if you've configured `fallbackToCacheTimeout`). For a critical fix you can also force it with EAS dashboard "Promote to production".

---

## Per-release runbook — iOS

### Step 1 — Confirm release is ready

- [ ] `main` is at the commit you want to ship.
- [ ] `expo.version` bumped in `app.json` (and committed).
- [ ] `CHANGELOG.md` entry added with the version.
- [ ] All CI green on `main` (typecheck, lint, test, format:check).
- [ ] If first-ever build: pre-flight section 0.2 (Apple Developer) done.

### Step 2 — Build

```
eas build --profile preview --platform ios     # for TestFlight
# OR
eas build --profile production --platform ios  # for App Store
```

Build runs on EAS servers (~15–25 min). EAS picks the profile's `env` block → bakes `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` into the JS bundle → archives → uploads `.ipa`.

Watch for:

- "Pod install failed" → usually means a JS dep version is incompatible with the iOS native side. Check `expo-doctor` (see CI job).
- "Could not find distribution certificate" → run `eas credentials` and re-create.
- "Provisioning profile expired" → EAS auto-renews on the next build if you're enrolled in Apple Developer.

### Step 3 — Submit to App Store Connect

```
eas submit --profile preview --platform ios     # uploads to TestFlight
# OR
eas submit --profile production --platform ios  # uploads, you finish in App Store Connect
```

EAS reads `submit.<profile>.ios` from `eas.json`, picks the latest build for that profile, and uploads it via App Store Connect's API.

After upload (~5 min processing):

- **TestFlight path:** App Store Connect → TestFlight → builds list → new build appears with "Processing" → flips to "Ready to test" within ~15 min. Add Sky as an Internal Tester (no review). For external testers, fill in the test information (description, what to test, etc.) and submit for Beta App Review (~24h).
- **App Store path:** App Store Connect → My Apps → Mutual Mesh → iOS App → Build section → "Select a build" → pick the new build. Fill all required metadata (see Step 4 below).

### Step 4 — App Store Connect metadata (first-time submission only)

App Store reviewers need every field filled. Sky completes these in App Store Connect:

- **App information:** category (Social Networking), content rights, age rating questionnaire (likely 12+ due to user-generated content).
- **Pricing and availability:** Free, available in Canada (and any other countries you want to launch in — start with Canada only).
- **App privacy:** Detail what data the app collects. Use Jordan's PRIVACY.md as the authoritative source. Likely answers:
  - Contact info → email (linked to identity, used for app functionality; required for account creation).
  - Identifiers → user ID (linked to identity, used for app functionality).
  - User content → photos, other user content (linked to identity, used for app functionality).
  - Location → coarse location via postal-prefix (NOT linked to identity per our model; used for app functionality).
  - **Tracking → NO** (we don't share data with any third party; this is the central privacy promise).
- **Version information:**
  - Screenshots: 6.7" iPhone (required), 5.5" iPhone (required for legacy support), iPad 12.9" (required since we set `supportsTablet: true`). Dani generates from designs.
  - Description: max 4000 chars. Will + Casey co-author.
  - Keywords: max 100 chars total. Casey owns.
  - Support URL: `https://mutualmesh.org/support` (or similar; landing-page repo, separate task).
  - Marketing URL: `https://mutualmesh.org`.
  - Promotional text (170 chars max, can be updated without re-review).
- **Build:** select the build uploaded in Step 3.
- **Review information:**
  - Sign-in required: YES.
  - Demo account: create a verified test user in production specifically for App Review (handle: `appstore-reviewer-XXXX`, password in 1Password). Provide credentials in the demo account fields.
  - Notes: explain (a) it's invite-only normally, (b) the demo account is pre-verified, (c) the contact-handle reveal model.
- **Version release:** "Automatically release this version" OR "Manually release" (recommended for first launch).

### Step 5 — App Store submission

- Click "Submit for Review."
- Review queue: ~24–48h typical.
- Expect 1–2 rejections on first submission. Common causes:
  - Demo account not working → re-verify your demo user is still verified in production.
  - Permission strings not clear enough → revise `NSPhotoLibraryUsageDescription` / `NSCameraUsageDescription` in `app.json`, rebuild.
  - Guideline 5.1.1 (data collection) — if reviewer thinks privacy disclosure mismatch — re-check the App Privacy section against PRIVACY.md.

### Step 6 — Approved → released

- If "Manually release," click "Release this version" when ready.
- App appears on App Store within ~30 min.

---

## Per-release runbook — Android

### Step 1 — Confirm release is ready

Same as iOS Step 1.

### Step 2 — Build

```
eas build --profile preview --platform android     # for Internal Testing
# OR
eas build --profile production --platform android  # for production
```

Build runs on EAS servers (~15–25 min). Produces an `.aab` (Android App Bundle, Play's preferred format).

Watch for:

- "Keystore not found" → run `eas credentials` once.
- "Gradle build failed" → check the EAS log for the specific Gradle error.

### Step 3 — Submit to Play Console

```
eas submit --profile preview --platform android     # uploads to Internal Testing
# OR
eas submit --profile production --platform android  # uploads to Production track
```

EAS reads `submit.<profile>.android` from `eas.json`, picks the latest build, uses the service account key (Step 0.3.4) to upload, and creates a release in the configured track (`internal` for preview, `production` for production).

`releaseStatus: "draft"` in `eas.json` means EAS uploads but does NOT auto-publish. Sky finishes in Play Console.

### Step 4 — Play Console metadata (first-time submission only)

Play Console → All apps → Mutual Mesh:

- **Main store listing:**
  - Short description: max 80 chars.
  - Full description: max 4000 chars.
  - App icon: 512×512 PNG (Dani).
  - Feature graphic: 1024×500 PNG (Dani).
  - Screenshots: phone (2–8 required), tablet 7" (recommended), tablet 10" (recommended).
  - Categorization: Communication or Social.
  - Contact details: email, website.
- **Privacy policy URL:** required. Point to the in-app PRIVACY.md mirror on the marketing site.
- **App content:**
  - Privacy policy: paste URL.
  - Ads: NO.
  - App access: provide demo credentials (same demo account as App Store).
  - Content rating: take the IARC questionnaire honestly.
  - Target audience: 13+.
  - Data safety: this is Google's equivalent of Apple's "App Privacy." Mirror the answers from PRIVACY.md.
- **Production release:**
  - Internal testing track (preview profile lands here automatically).
  - Closed testing (alpha): one tester group, optional ~5–10 community reps.
  - Open testing (beta): optional, can skip for v1.
  - Production track (production profile lands here automatically when `releaseStatus: "draft"` is flipped to "review").

### Step 5 — Play Store submission

- Play Console → Production → Releases overview → "Review release" on the draft.
- Click "Send X devices for review."
- Review queue: 1–7 days (faster than App Store typically, but more variable).
- Common rejections:
  - Data safety form mismatch → align with what the app actually does.
  - Privacy policy URL 404 → make sure the landing page is up before submitting.
  - Permissions not declared in store listing → declare them.

### Step 6 — Approved → released

- Production release goes live automatically when approved (unless you set rollout %).
- Recommended: 10% rollout for first day, then 100%.

---

## Update strategy summary

| Change                                | Tool                                                                      | Time-to-users                    |
| ------------------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| JS-only fix                           | `eas update --channel production --message "..."`                         | ~minutes                         |
| New permission, plugin, or native dep | Full rebuild + submit                                                     | iOS: 1–3 days; Android: 1–7 days |
| Critical security fix in native code  | Full rebuild + expedited App Store review (request via App Store Connect) | iOS: ~24h                        |
| Critical security fix in JS           | `eas update` as above                                                     | ~minutes                         |

---

## Hotfix procedure

A "hotfix" is a critical-severity bug discovered post-release that needs to ship NOW.

### Pre-conditions

- Active bug confirmed reproducible in production.
- Fix exists on a branch.
- Sky decides hotfix vs. wait for next planned release.

### Steps

**Decide path:**

- Is the fix JS-only? → Path A (OTA).
- Does the fix require native changes? → Path B (full rebuild + expedited review).

**Path A — OTA hotfix (preferred when possible):**

1. Cherry-pick the fix to `main` (Sky merges per Constitution).
2. CI green on `main`.
3. ```
   eas update --channel production --message "hotfix: [one-line description]"
   ```
4. Installed apps pick up the update on next launch.
5. New downloads from the store still get the old binary; the OTA update applies on first launch after install.
6. Monitor `qa-reports/` for follow-up; backport the fix into the next planned rebuild so new downloads ship with it natively.

**Path B — Native hotfix:**

1. Cherry-pick the fix to `main`.
2. Bump `expo.version` patch (e.g. `0.1.0` → `0.1.1`).
3. Bump `expo.runtimeVersion` if the change affects the native runtime (rare for JS fixes; required for new plugins).
4. ```
   eas build --profile production --platform ios
   eas build --profile production --platform android
   ```
5. iOS: `eas submit` → App Store Connect → "Submit for Review" → in the submission form, check "Expedited Review" and explain (security, data loss, crash on launch). Apple reviewers prioritize these.
6. Android: `eas submit` → Play Console → submit. Play Console has no formal "expedited" path but reviewers tend to be faster than Apple already.

**During the hotfix:**

- Morgan writes a `qa-reports/hotfix-<date>-<short-name>.md` with: trigger, fix, who decided to hotfix vs. defer, OTA-or-rebuild path, timeline.
- Steve gets a security audit on the fix even though it's "small" — small fixes are where regressions hide.
- Gary runs full test suite on the hotfix branch before it merges.

---

## After-release monitoring (week 1)

After ANY release (full or OTA):

- Day 1: Sky checks the production app from a fresh install. Verifies signup → claim flow still works end-to-end.
- Day 1–3: Sky monitors:
  - App Store Connect → Crashes (iOS).
  - Play Console → Android vitals → Crash rate (Android).
  - Supabase dashboard → Logs → Auth + Database (production project) — look for spike in errors.
  - Edge Function logs → `exif-strip` failures.
- Day 7: Morgan compiles a `qa-reports/post-release-<version>-<date>.md` with crash rate, user-reported issues, OTA-update success rate.

If crash rate >1% in the first 48h → hotfix.

---

## DECISIONS FOR SKY

1. **Apple Developer enrollment timing:** This takes 24–48h. Start it NOW even if Phase 4 starts later. Without it nothing iOS-shippable happens. **Action: enroll today.**
2. **Google Play Developer account:** $25 one-time. **Action: enroll today.**
3. **EAS account tier:** Free tier supports the development workflow. Production submissions are free; only Build minutes are metered. ~$29/mo Production tier may make sense once we ship monthly. **Decide: start free, upgrade later, or upgrade now?**
4. **App Store category:** I suggested "Social Networking." Alternatives: "Lifestyle," "News" (less fitting), "Education" (NO — we'd risk Apple thinking we're targeting minors). **Confirm: Social Networking.**
5. **Play Store category:** I suggested "Communication." Alternative: "Social." **Confirm: Communication.**
6. **Demo account for App Review:** Reviewers need real credentials. Sky creates a verified production user `appstore-reviewer-XXXX`, stores credentials in 1Password, and re-verifies after each review cycle. **Note + action when first submitting.**
7. **Rollout strategy:** I recommend 10% on day 1, 100% on day 2 for first launch. Conservative. Alternative: 100% immediately (faster validation, more risk). **Decide before first production release.**
8. **`runtimeVersion` strategy:** I set `"1.0.0"` literal. Expo also supports `{ "policy": "sdkVersion" }` (auto-bumps when Expo SDK bumps) or `{ "policy": "fingerprint" }` (auto-bumps on any native change). Literal is simplest for v1; fingerprint policy is the long-term right answer. **Decide: literal for v1, switch to fingerprint at v1.1?**
9. **OTA update auto-application:** I set `fallbackToCacheTimeout: 0` which means "if the update isn't available immediately, run the cached bundle instantly." Trades update freshness for startup speed. Alternative: `fallbackToCacheTimeout: 5000` (wait 5s for update before falling through). **Confirm: 0 is right for our UX.**
10. **Marketing site URL placeholders:** `mutualmesh.org` is a placeholder. **Action: register a domain (Cloudflare Registrar or Namecheap) before first submission.**
