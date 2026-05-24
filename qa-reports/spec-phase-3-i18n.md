# Spec: Phase 3 — Multi-language (i18n) — Quinn — 2026-05-24

## Summary

Phase 3 Tier 3 Feature #19 adds **multi-language support** to Mutual Mesh for v2 launch. The v1 set is **English (default), French (Quebec partners per Casey's growth strategy), and Spanish (refugee/newcomer networks per Casey's growth strategy + Riley's friction analysis)**. Mandarin and Punjabi are roadmapped for a follow-up but NOT in this spec. Translations are **professionally / native-speaker translated**, never AI-translated.

The library is **`react-intl` (FormatJS)** — Quinn picks among the three options the task brief listed (react-intl / i18next / lingui). Reasoning in DFS-1. All user-facing strings extract from screens/components into `messages/<locale>.json` files. The default behavior: detect device locale → fall back to English if no translation exists. The Profile screen gets a language override (replaces device locale).

**Scope:** New dependency (`react-intl`) + new helper (`src/lib/i18n.ts`) + extraction of every user-facing string from all screens/components into `messages/<locale>.json` files + Profile language override + accessibility-label translations + locale-aware date/time formatting + pluralization rules per language. **No schema changes** (no per-user language preference column — device locale + a local override is enough per Jordan's review level).

**Estimated effort:** 4 build days + 2 hardening days. ~6-7 PRs across Shamus (extraction + wiring), Casey + Riley (translation coordination + native-speaker review), Alex (a11y on translated labels, RTL prep), Gary (tests for missing-key behavior), Will (CLAUDE.md update). Heaviest non-build cost is the human-translation timeline — DFS-3 covers the budget.

**READY pending Sky decisions on DFS items and translator engagement.** PRIVACY.md doesn't directly govern i18n (translations are copy, not data); Jordan's review is LIGHT (same posture as Casey's onboarding-tour copy review). The hard constraint is "NEVER AI-translate" — even a draft for sanity-checking — because mistranslated terms in a marginalized-group context can harm users.

## User story

> _As a French-speaking user in Montréal, I sign up and the app is already in French because my device locale is `fr-CA`. Every label, every error message, every accessibility hint, every push-notification title is in French. The "Why we need this" microcopy on every input is in French. I can override to English in Profile if I want; the default respects my device._

> _As a Spanish-speaking refugee newcomer who joined Mutual Mesh through a partner network, the app meets me in Spanish without me having to find a language setting. The terms used for "verification," "handle," "FSA," and "pickup" are translations a native speaker (not Claude) chose because the literal Spanish word for "verification" carries baggage in an immigration context._

> _As an English-speaking user in Toronto, the app is in English and nothing changes from my v1 experience. The i18n machinery is invisible to me._

> _As a screen-reader user in any of the three locales, every accessibility label, hint, and announcement is in my chosen language, with correct pluralization ("1 new resource" vs "2 new resources") and locale-aware number/date formatting._

> _As a future Arabic-speaking user (post-v1), the app is ready for RTL: the UI flips correctly because the layout system uses logical properties (start/end, not left/right) and `react-intl` provides the locale direction. The Arabic translations are not in this v1 spec, but the RTL plumbing is._

## Personas served

- **Mara (recipient)** — indirectly. Mara is English-speaking in this composite, but Riley flagged in Mara's persona: "Mutual Mesh's audience often has limited English." A Spanish-fluent Mara composite exists in many partner networks; she gets the app in her language.
- **Keo (organizer)** — indirectly. Keo is English-speaking in this composite. But Casey's growth-strategy explicitly says "refugee/newcomer support orgs" are Tier-1 targets; Spanish is load-bearing for that audience.
- **Deb (community-fridge organizer)** — directly serves the bilingual / multilingual community fridges Deb runs. Deb herself may be English-speaking, but the fridge's users are not all English-speaking.
- **Casey's Tier-1 community admins** — directly. Casey's growth-strategy lists "refugee/newcomer support orgs" and "tenant unions" (which in Montreal are French) as priority Tier-1 partners. Without i18n, these communities can't seed. With i18n, they can.

## Why now

Per `~/.claude/plans/goofy-singing-steele.md` Phase 3 Sub-3.4 (Days 44-45) and Tier 3 #19: **"French (Quebec partners), Spanish (potential refugee networks), Mandarin (community-fridge partner orgs)."** Sky's open-question 3 in PRIVACY.md ("Multi-language support timeline") was resolved: "**defer to post-v1; Quinn + Casey scope the roadmap. English MVP ships first; multi-language is roadmapped immediately after, with community input deciding which languages land first.**"

This spec is THAT roadmap. i18n is sequenced LAST in Phase 3 for several reasons:

1. **Touches every string.** Every screen needs extraction. Sequencing it last means push (Phase 3.1), map (Phase 3.2), and chat (Phase 3.3) ship FIRST and their strings get included in the i18n extraction in this spec.
2. **Translation timeline > build timeline.** Professional / native-speaker translation takes weeks per language (DFS-3). Casey + Riley coordinate translators in parallel with Phases 3.1-3.3 build work, so by Phase 3.4 the translations are ready.
3. **Lowest privacy risk.** Translations are copy. PRIVACY.md is unaffected. Jordan's review is LIGHT.

The growth-strategy 90-day target — **2-3 seeded communities, 100-300 verified users** — depends on hitting language-accessible communities. Casey's Tier-1 list includes refugee/newcomer support orgs (Spanish-speaking) and Quebec tenant unions (French-speaking). Shipping without i18n cuts those communities OUT of the seed strategy. i18n is therefore a v2-launch precondition for hitting Casey's targets — not a polish item.

## Acceptance criteria

### AC-1: 100% of user-facing strings extracted (load-bearing)

- Every visible-to-user string in `src/screens/` and `src/components/` is extracted from inline JSX/JS into `messages/<locale>.json` keyed by a stable ID (e.g., `home.title`, `chat.empty.description`, `errors.network`).
- Strings include: titles, labels, buttons, error messages, EmptyState copy, FlashBanner copy, accessibility labels, accessibility hints, "Why we need this" microcopy, push notification titles (Phase 3.1 — 4-5 titles), placeholder text, validation messages, microcopy under toggles.
- Strings that are NOT extracted (intentionally NOT translated): user-generated content (resource names, descriptions, pickup_text, contact_handle, chat message bodies, handles), system error codes that map via `userFacingErrorMessage()` (the user-facing message IS extracted; the internal code is not), brand names ("Mutual Mesh" stays English in all locales — DFS-2 confirms), URLs.
- Verified by a `npm run check:strings` script (Gary writes) that greps src/ for hardcoded user-facing strings using a heuristic (any `>...</Text>` or `Alert.alert(...)` not wrapped in `<FormattedMessage>` or `formatMessage()` is flagged).
- Verified by Casey in a manual screen-by-screen pass across the app post-extraction.

### AC-2: RTL prep (Arabic-eventual)

- All layouts use logical CSS properties: `paddingStart` / `paddingEnd` (not `paddingLeft` / `paddingRight`), `marginStart` / `marginEnd`, `start` / `end` for absolute positioning.
- The NativeWind config is audited to ensure `space-x-*` and `flex-row` direction respect RTL when `I18nManager.isRTL === true`.
- Icons that are direction-sensitive (back arrows, navigation chevrons) flip correctly in RTL — verified by setting `I18nManager.allowRTL(true)` and `I18nManager.forceRTL(true)` in dev and confirming the back arrow points right (not left) in Arabic mock.
- The `react-intl` provider provides locale direction; layout responds.
- Arabic translations are NOT in v1 (the actual strings); the RTL plumbing IS in v1.
- Verified by Alex + Shamus in a manual RTL mock test (force RTL, English strings — confirm layout flips correctly).

### AC-3: Pluralization rules per language

- Use ICU MessageFormat (which `react-intl` supports natively) for any string containing a count.
- English: `{count, plural, one {# resource} other {# resources}}`
- French: `{count, plural, one {# ressource} other {# ressources}}`
- Spanish: `{count, plural, one {# recurso} other {# recursos}}`
- The translation file format includes full ICU pluralization, not just two-form fallback.
- Verified by component tests: render with count=0, 1, 2, 5, 21 in each locale and confirm correct form is selected.

### AC-4: Date/time formatted per locale

- All dates and times use `FormattedDate` / `FormattedTime` / `FormattedRelativeTime` from `react-intl`.
- English: "May 22, 2026" / "2 days ago"
- French: "22 mai 2026" / "il y a 2 jours"
- Spanish: "22 may 2026" / "hace 2 días"
- 12-hour vs 24-hour clock: 24-hour in French/Spanish (matches locale convention), 12-hour in English.
- Relative time pluralization is handled by `react-intl`'s built-in CLDR data.
- Verified by component tests across the three locales.

### AC-5: Fallback to English on missing translation

- If a translation key exists in `messages/en.json` but is missing in `messages/fr.json`, the app renders the English string in place of the French one — never an empty string, never the key name, never a runtime error.
- `react-intl`'s `defaultMessage` prop provides this fallback automatically when source strings include `defaultMessage`.
- A `npm run check:translations` script (Gary writes) compares the locale files and reports missing keys; CI fails if the missing-key count for `fr` or `es` exceeds zero post-translation-delivery.
- During development (before translations land), missing keys are ALLOWED but logged to console.warn so Shamus knows what's pending.

### AC-6: Reduced motion respected on transitions

- The language-change transition (when user toggles in Profile from English to French) must NOT animate text fade between locales when `useReducedMotion === true`.
- The default transition is a quick re-render (no explicit animation); reduce-motion preference makes any future animated transition snap.
- Per Phase 3.1 (push) AC-6 + Phase 3.2 (map) AC-6 — the existing `useReducedMotion` helper is reused.

### AC-7: Accessibility labels translated

- Every `accessibilityLabel`, `accessibilityHint`, `accessibilityValue` is sourced from the i18n bundle, not hardcoded.
- Screen-reader output is in the user's locale.
- Pluralization in accessibility labels uses the same ICU rules (AC-3).
- Examples:
  - English: `accessibilityLabel={formatMessage({ id: 'home.tab.label', defaultMessage: 'Home tab, {count, plural, one {# resource available} other {# resources available}}' }, { count: 5 })}`
  - French: same key, French string in `messages/fr.json`: `"Onglet accueil, {count, plural, one {# ressource disponible} other {# ressources disponibles}}"`
- Verified by Alex in a VoiceOver + TalkBack pass per locale.

### AC-8: Test coverage for missing-key behavior

- A Jest test mocks a missing key in the active locale and confirms:
  - The app renders the English `defaultMessage` from the source.
  - The app does NOT crash.
  - A console.warn is emitted in dev mode (suppressed in production builds).
- Snapshot tests for each screen in each locale catch silent regressions.
- Coverage target: 100% of screens have at least one test per locale (English snapshot + French snapshot + Spanish snapshot per screen).

### AC-9: Casey + native speaker review before each language ships (load-bearing)

- For each language, the workflow is:
  1. Shamus extracts strings and creates `messages/<lang>.json` with English placeholders.
  2. Casey + Riley engage a **professional human or native-speaker community member** to translate (DFS-3 covers budget + sourcing).
  3. The translator returns the file; Casey reviews for terminology consistency with partner-network norms.
  4. A SECOND native speaker (peer-review) checks for context-appropriate word choice in the marginalized-group setting (this matters: "verification" in Spanish has different connotations in an immigration context than in a banking context).
  5. Riley confirms the translation respects the persona's voice (e.g., does the Spanish translation imply formality the persona wouldn't use?).
  6. Translated file lands; Gary runs the `npm run check:translations` script; CI green.
  7. Casey writes a release note (in English) for Sky + the partner network.
- **NEVER use AI-translation, including Google Translate, DeepL, or LLM-translation, even as a draft or sanity check.** Mistranslated terms in marginalized-group contexts can harm users. The translation must be human end-to-end.
- Sky personally approves each language before shipping it (light approval — confirms the workflow was followed).

### AC-10: UI layout tested on longest-translation case

- For each language, identify the 5 longest translations (typically: "Why we need this" microcopy paragraphs, error messages, EmptyState descriptions).
- Render every screen with the longest translation in every position to confirm no truncation, no overflow, no layout break.
- Snapshot tests per screen per locale catch these.
- Common pattern: French is ~30% longer than English on average; Spanish ~20% longer. Buttons, labels, and tight spaces need flex-grow or word-wrap to absorb.
- Verified by Dani + Alex in a manual screen-by-screen review.

### AC-11: Device locale detection + Profile override

- On first app launch (or after locale change), the app reads `Localization.locale` (expo-localization) and matches to a supported locale (`en` / `fr` / `es`).
- If device locale starts with `fr` → French; `es` → Spanish; anything else → English.
- The Profile screen has a new "Language" section with three radio options (English / Français / Español) under a "Why we need this" microcopy: `"Sets the language of the app. Defaults to your device language."`
- Selecting a language stores the override in AsyncStorage (`mutualmesh.locale_override`).
- The override OVERRIDES the device locale on every app launch until the user changes it again or clears it.
- A "Reset to device language" button clears the override.

### AC-12: Brand name "Mutual Mesh" stays untranslated

- The app name "Mutual Mesh" is NOT translated. It appears as "Mutual Mesh" in all locales.
- Per DFS-2, brand names are NOT in the i18n bundle.
- App store listings (Phase 4 #20) are localized for the metadata (description, screenshots) but the app name itself stays English.

### AC-13: Push notification titles localized (Phase 3.1 dependency)

- The 5 push notification titles (claim_placed, pickup_confirmed, admin_approved, admin_rejected, chat_message) are localized.
- The Edge Function `deliver_notification` (Phase 3.1) reads the recipient's `locale` (DFS-4 covers how) and selects the title in their language.
- Title-only rule (Phase 3.1 AC-2) still applies in every locale: body is empty.
- Examples per trigger per locale:
  - claim_placed: EN "Your post has an update" / FR "Votre publication a une mise à jour" / ES "Tu publicación tiene una actualización"
- Verified by manual smoke test (Phase 3.1's smoke list, extended).

### AC-14: Server-side strings (error messages from RPCs) — TBD localized?

- Server-side strings (RPC error messages like `'Not authenticated'`, `'Forbidden: not a participant'`, `'Rate limited'`) are technical, not user-facing — they're matched in client code by the `userFacingErrorMessage()` helper.
- The CLIENT-SIDE user-facing equivalents ARE localized (per AC-1 and AC-7).
- The server-side strings stay English (technical identifiers).
- The `userFacingErrorMessage()` helper is extended to take the current locale + the technical error message and return the localized user-facing message.

### AC-15: Bundle size impact bounded

- Each new locale adds ~10-30KB to the bundle (depending on string count + CLDR data).
- Three locales = ~30-90KB total. Acceptable.
- `react-intl`'s polyfill data (CLDR) is bundled selectively — only the locales we support, not all locales.
- Verified by Peter in a pre/post-merge bundle-size check.

## Screens / layout

One new surface (Profile language section) + every existing screen now reads from the i18n bundle.

### Surface 1: Profile → Language section (new)

```
┌──────────────────────────────────────────┐
│  ←  Profile                              │
│                                          │
│  ...                                     │   <- existing profile fields
│                                          │
│  ──────────────────────────────────────  │
│                                          │
│  Language                                │   <- new section header
│                                          │
│  ( ) English                             │   <- radio
│  ( ) Français                            │
│  ( ) Español                             │
│                                          │
│  Sets the language of the app.           │   <- "Why we need this" microcopy
│  Defaults to your device language.       │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │   Reset to device language          │  │   <- secondary Button
│  └────────────────────────────────────┘  │
│                                          │
│  ...                                     │
└──────────────────────────────────────────┘
```

### Surface 2: Every existing screen — locale-aware render

All existing screens render in the user's locale. Example: HomeScreen in French:

```
┌──────────────────────────────────────────┐
│  Accueil                                 │   <- "Home" → "Accueil"
│  ┌──────┐ ┌──────────┐ ┌────────┐       │
│  │ Tout │ │Nourriture│ │ Bébé   │       │   <- category chips translated
│  └──────┘ └──────────┘ └────────┘       │
│  ┌────────────────────────────────────┐  │
│  │ Lait maternisé hypoallergénique    │  │
│  │ M5V · Il y a 2 heures              │  │   <- "M5V · 2 hours ago" → French date
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Surface 3: Lockscreen push notification — locale-aware

```
┌──────────────────────────────────────────┐
│  [Mutual Mesh icon]                      │
│                                          │
│  Mutual Mesh                             │   <- brand name unchanged
│  Votre publication a une mise à jour     │   <- French title
└──────────────────────────────────────────┘
```

### Component reuse map

| Used component                                      | Where                                                     |
| --------------------------------------------------- | --------------------------------------------------------- |
| `IntlProvider` (from react-intl)                    | Wraps `<App>` — provides locale + messages                |
| `FormattedMessage` (from react-intl)                | Inline string render                                      |
| `FormattedDate` / `FormattedTime` / `FormattedRelativeTime` | Date/time formatting                              |
| `formatMessage()` (imperative API from react-intl)  | Accessibility labels + dynamic strings                    |
| `RadioGroup` (NEW or reuse)                         | Language picker in Profile                                |
| `Button` (secondary)                                | "Reset to device language"                                |

New components: if `RadioGroup` doesn't exist (likely doesn't), Shamus files a `qa-reports/feature-radiogroup-component.md` proposal with Dani + Alex before building.

## Data view (Jordan privacy gate — LIGHT review)

This section is privacy-light. Translations are copy. PRIVACY.md is unaffected by this spec. Jordan does a LIGHT review (same posture as Casey's onboarding-tour copy review).

### No new tables / columns

- **Default behavior is device-locale only.** No per-user language stored on the server.
- **AsyncStorage stores the local override** as a string (`'en' | 'fr' | 'es'`). Not synced to the server; not sensitive.
- **Push notification locale** (AC-13) — DFS-4 covers where this comes from (device locale at registration time stored on the push_tokens row, vs. user.locale column on public.users). Either way, it's a non-sensitive locale string.

### What is INTENTIONALLY excluded

| Field                                       | Why excluded                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Per-user language preference on `public.users` | Quinn's recommendation: device locale + AsyncStorage override is enough. DFS-4 may add it for push. |
| AI-translation of any string                | NEVER. AC-9 hard rule.                                                                          |
| Language detection from user-generated content | NEVER. We don't sniff a user's messages or resource descriptions to guess their language.    |
| Reverse-translation to verify accuracy       | NEVER. Translation review is done by humans (AC-9), not by round-tripping through software.   |
| Language as a marketing-segmentation field   | NEVER. We don't segment users by language for any purpose.                                     |

### Translation file format (English example)

```json
{
  "home.title": {
    "defaultMessage": "Home",
    "description": "Title of the marketplace feed screen"
  },
  "home.empty.title": {
    "defaultMessage": "Nothing here yet.",
    "description": "Empty state when no resources are available"
  },
  "home.empty.description": {
    "defaultMessage": "Check back later, or post something yourself.",
    "description": "Empty state description"
  },
  "home.tab.label": {
    "defaultMessage": "Home, {count, plural, one {# resource available} other {# resources available}}",
    "description": "Accessibility label for the Home tab including a count"
  },
  ...
}
```

The `description` field is critical for translators — they need context to choose the right word.

### Privacy posture for translators (AC-9)

- Translators receive the English source file PLUS the `description` field for context.
- Translators do NOT receive screenshots from staging that include real user data.
- If a screenshot is needed for context, Casey + Riley provide a mocked screenshot with placeholder content.
- Translator NDAs (DFS-5) cover the work products + the source app context.

## RPC contracts

**No new RPCs.** i18n is purely a client-side concern with one optional schema column extension if DFS-4 picks (b).

## Tests (Gary writes)

### Unit tests (pure helpers in `src/lib/i18n.ts`)

The helper file exposes:

- `selectLocale(deviceLocale, override, supportedLocales)` — pure function returning the active locale. Table-driven test: device=fr-CA, override=null → 'fr'; device=en-US, override='es' → 'es'; device=zh-CN, override=null → 'en' (fallback); etc.
- `formatRelativeTime(date, locale, now)` — wrapper over react-intl's API; tested across locales for hours/days/weeks ago.
- `pluralKey(count)` — helper for picking the right plural form pre-render; mostly used in tests.

Each helper gets its own `*.test.ts` file in `src/__tests__/`.

### Component tests

- Every screen has a snapshot test in each of the three locales (en, fr, es). Run as:
  - `npm test -- --testNamePattern="snapshot.*en"` for English
  - Same for `fr` and `es`.
- Snapshots verify: locale-aware string rendering, date/time formatting, pluralization edge cases (0, 1, 2, 21).
- A "missing key" test mocks a missing French translation and confirms English `defaultMessage` is rendered (AC-5).
- A "RTL layout" test forces RTL (with English strings) and confirms layout flips correctly (AC-2).
- Accessibility label tests verify the i18n-resolved string is on the right element.

### Integration tests

- The `npm run check:strings` script (AC-1 verifier) is added to the CI pipeline. It fails if hardcoded strings are detected in src/screens or src/components.
- The `npm run check:translations` script (AC-5 verifier) is added to CI. It fails if any locale file is missing keys present in `en.json`.
- A staging smoke test: switch language via Profile; confirm every screen renders correctly.

### Manual smoke test (Sky walks through on staging — Phase 3.4 sync point)

1. Open the app on a device with `fr-CA` locale; confirm every visible string is in French; confirm dates are in French format (22 mai 2026 not May 22, 2026).
2. Open Profile; confirm the Language section shows English / Français / Español radios.
3. Switch to Spanish; confirm the entire app re-renders in Spanish.
4. Confirm "Mutual Mesh" stays as "Mutual Mesh" — not translated.
5. Confirm push notification (Phase 3.1) lockscreen title is in Spanish (e.g., from another account, claim the test user's resource).
6. Confirm "Reset to device language" returns the app to French (the device locale).
7. With VoiceOver enabled in Spanish, confirm accessibility labels are read in Spanish (e.g., "Pestaña de inicio, 3 recursos disponibles").
8. Confirm a missing-key fallback works: temporarily remove a key from `messages/es.json` (manually on staging), reload, confirm English fallback renders.
9. Run the RTL mock: in dev menu, `I18nManager.forceRTL(true)` + reload; confirm back arrows, list directions, and absolute-positioned elements flip correctly.
10. Confirm the longest-translation test pass: French "Why we need this" microcopy fits without truncation in every Profile section.
11. Confirm dates: claim placed "il y a 2 heures" in French; same data renders "2 hours ago" in English.

## A11y (Alex pre-audit notes — Phase 3.4 build)

- **Accessibility labels are i18n-resolved (AC-7).** Every `accessibilityLabel` / `accessibilityHint` / `accessibilityValue` goes through `formatMessage()`.
- **Pluralization in screen-reader output (AC-3).** "1 nouvelle ressource" not "1 nouvelle ressources." ICU MessageFormat handles this; tests verify per locale.
- **RTL layout (AC-2).** Once Arabic ships (post-v1), RTL is already plumbed. v1 ships with RTL prep but no RTL strings.
- **Language change announcement.** When the user switches language in Profile, an `AccessibilityInfo.announceForAccessibility(formatMessage({ id: 'profile.language.changed' }))` runs once. The announcement is itself in the NEW language.
- **Color contrast unchanged.** i18n doesn't affect contrast; existing Alex audits hold.
- **Font choice per locale.** Default system font handles English/French/Spanish characters fine. For Arabic/Mandarin (post-v1), font selection is a follow-up consideration.
- **Reduce motion (AC-6).** No text-fade animation between locale changes when reduce-motion is on.
- **Language picker (Profile new section).** Radio group has `accessibilityRole="radiogroup"`; each option has `accessibilityRole="radio"` with `accessibilityState={{ selected: true/false }}`.

## Performance considerations (Peter pre-notes)

- Bundle size: ~30-90KB total added (AC-15). Acceptable.
- `react-intl`'s CLDR data is selectively bundled (only the locales we support).
- Locale change does NOT trigger a full app reload — `IntlProvider` re-renders the tree with new messages. React's reconciliation handles it.
- Initial app load: `IntlProvider` resolves locale + loads the appropriate `messages/<locale>.json` synchronously from the bundle. No additional network call.
- Memory: a single locale's messages dict is ~10-30KB in memory; we keep one active at a time (switching locale unloads the old dict).
- AsyncStorage read (for the override) happens once at app launch; cached thereafter in memory.
- Per Peter's Phase 1 cap: no new realtime channels introduced.

## Privacy considerations (Jordan pre-audit — LIGHT review)

This section is privacy-light. Translations are copy. PRIVACY.md is unaffected. Jordan does a LIGHT review.

1. **AC-9 (no AI translation, EVER)** is the privacy posture: marginalized-group context requires human translation; AI translation introduces both accuracy risk and a future privacy exposure (sending source content to a third-party translation API would be a data leak).
2. **Translator engagement (AC-9 + DFS-3 + DFS-5)**: translators sign NDAs (or equivalent community-of-trust agreement); they do not see real user data; they see source strings + descriptions only.
3. **No per-user language column on `public.users` by default** (DFS-4). Device-locale + AsyncStorage override is enough. If DFS-4 (b) is picked (column for push delivery), it stores a 2-3 char locale code; non-sensitive.
4. **Push notification localization (AC-13)** does NOT change the title-only rule from Phase 3.1. Translated title; body still empty.
5. **App-store listing localization (Phase 4)** — the privacy policy + ToS pages need to be translated too. Will + Jordan coordinate; out of scope here.
6. **No language detection from user-generated content.** We don't sniff a user's messages or resource descriptions to guess their language. The user picks their language; we respect their pick.

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 3.4 lands. Default behavior in parentheses is what ships if Sky doesn't override.

### DFS-1: Library choice — react-intl / i18next / lingui?

- **(a) react-intl (FormatJS)** — Quinn's recommendation. Pros: ICU MessageFormat (best pluralization, format handling), mature React Native support, CLDR data is well-curated, `<FormattedMessage>` API is widely-documented. Cons: slightly heavier bundle than alternatives.
- **(b) i18next** — Pros: simpler API, lighter bundle. Cons: less ICU support (pluralization is by hand), less locale-aware formatting.
- **(c) lingui** — Pros: compiles strings at build time (smaller runtime). Cons: newer; smaller community; more setup complexity.

**Quinn's proposal:** **(a) react-intl.** ICU MessageFormat is load-bearing for pluralization (AC-3) and date/time (AC-4); the slightly heavier bundle is acceptable. Casey's translators are familiar with the ICU format from other projects.

- [ ] Approve (a) react-intl (Quinn's recommendation)
- [ ] Edit — (b) i18next
- [ ] Edit — (c) lingui

### DFS-2: Brand names — "Mutual Mesh" stays English everywhere?

- **(a) "Mutual Mesh" never translates** (AC-12 default).
- **(b) Localize the brand name** ("Maillage Mutuel" in French, "Malla Mutua" in Spanish).

**Quinn's proposal:** **(a) stay English.** Brand recognition; "Mutual Mesh" is the URL, the App Store name, the partner-network talking-point. Re-evaluate if a specific partner network insists.

- [ ] Approve (a) brand stays English (default)
- [ ] Edit — (b) localize brand name per language

### DFS-3: Translation timeline + budget per language

- Casey + Riley need to engage translators for French and Spanish. Casey's growth-strategy commits to "professional / native-speaker translation" (no AI).
- **Quinn's proposal:** Casey identifies one professional translator per language OR two native speakers from partner networks (per AC-9 two-person review). Budget: Sky decides — typical rates for marketing translation are $0.15-0.30/word; Mutual Mesh has ~500-800 strings averaging ~5 words each = ~$400-1200 per language for professional translation. Community-volunteer routes are cheaper but slower.

**Quinn's proposal:** **Casey identifies candidates; Sky approves budget at $500/language ceiling for professional; community-volunteer route is free + acknowledged in app credits.**

- [ ] Approve $500/language professional translation ceiling
- [ ] Edit — $1000/language ceiling (Sky picks per language)
- [ ] Approve community-volunteer route + acknowledgement credit
- [ ] Edit — combination (e.g., French volunteer, Spanish professional)

### DFS-4: Per-user language preference column on `public.users`?

- **(a) NO column** (Quinn's default). Device locale + AsyncStorage override is enough for client-side rendering. Push notification locale is derived from the device locale stored at push_token registration time (add to `push_tokens` table).
- **(b) Add a `locale TEXT` column to `public.users`.** Cleaner for push notification delivery (Edge Function reads recipient's locale directly). Adds one tiny column.

**Quinn's proposal:** **(b) add column.** Simpler for the Edge Function; the column is non-sensitive; the migration is small.

- [ ] Approve (b) add locale column (Quinn's recommendation)
- [ ] Edit — (a) device-locale + push_tokens-row-only

### DFS-5: Translator NDA / agreement?

- Translators see app source strings + descriptions but NOT real user data.
- **Quinn's proposal:** Casey drafts a one-page agreement covering: (1) confidentiality of pre-launch app features, (2) prohibition on using AI translation tools for any of the work, (3) the marginalized-group context and ethical considerations (no terms that pathologize the audience), (4) crediting in app credits (with optional pseudonymous credit).

- [ ] Approve Casey-drafts-agreement (default)
- [ ] Edit — Sky drafts directly (avoids back-and-forth)
- [ ] Edit — skip formal agreement; rely on community-of-trust handshake for volunteer route

### DFS-6: Languages beyond v1 (French + Spanish) — when?

- Per Casey's growth-strategy and Riley's research: Mandarin (community-fridge partners in Toronto/Vancouver), Punjabi (Brampton/Surrey newcomer networks), Arabic (multiple cities), Tagalog (Filipino-community networks).
- **Quinn's proposal:** **v1 ships en + fr + es.** v1.5 adds whichever language a Tier-1 partner network specifically requests (Casey's call). v2 adds Mandarin + Punjabi + Arabic in a single coordinated translation cycle.

- [ ] Approve v1 = en/fr/es (default)
- [ ] Edit — also ship Mandarin in v1 (adds Casey + Riley translation timeline)
- [ ] Push back — ship only en/fr in v1; defer Spanish to v1.5

### DFS-7: AI translation hard ban — is it absolute?

- AC-9 says NEVER AI-translate. Some translators MAY use AI as a first-draft tool internally then post-edit. Is that acceptable?
- **Quinn's proposal:** **Yes, AI-as-first-draft-with-human-post-edit is acceptable** IF (a) the translator discloses it in their submission, (b) the post-edit is substantive (not a glance), (c) the second reviewer (peer-review per AC-9) is NOT given the AI source. The hard ban is on AI-as-only-translation, with no human review.

- [ ] Approve AI-first-draft-human-post-edit acceptable (default)
- [ ] Push back — absolute ban on AI in any role, including first draft
- [ ] Edit — case-by-case per translator (Casey approves)

### DFS-8: App-store listing localization scope?

- Phase 4 #20 ships EAS Build for App Store + Play Store. Each store has localized metadata (description, screenshots, keywords).
- **Quinn's proposal:** **v1 store listings ship in en/fr/es only.** Matches the in-app language set. The privacy policy + ToS pages (Phase 4 #21) are also translated. Out of scope here — Phase 4 owns; this DFS is a heads-up.

- [ ] Approve en/fr/es store listings (matches in-app set)
- [ ] Edit — English-only store listings; multilingual is in-app only
- [ ] Edit — translate store listings to MORE languages than the in-app set (English-only app for those store listings → users land on English app)

## Out of scope for Phase 3.4 (i18n)

The following are deliberately deferred. Each has a follow-up named.

- **AI-translated strings.** AC-9. NEVER ship. Hard rule, no exceptions.
- **Mandarin / Punjabi / Arabic translations.** Defer to v1.5 / v2 per DFS-6.
- **Per-user language preference UI beyond Profile section.** Out of scope; the Profile section is sufficient.
- **Translation-management platform integration (Crowdin, Transifex, etc.).** Out of scope; manual .json files are fine for 3 languages.
- **Automatic detection of user's preferred language from past behavior.** NEVER. Privacy-adjacent.
- **A-B testing translations.** NEVER ship. Out of scope; would require analytics we don't have (PRIVACY.md D8).
- **Server-side localization of resource names / pickup_text** (i.e., showing English titles to French users). Resources stay in the language the poster wrote them. Casey's growth-strategy: seed communities are language-cohesive; mixed-language threads should be rare.
- **Localization of admin-only screens** (verification queue UI). Initially English only; admins are bilingual enough; revisit if a partner network's admin pool is monolingual non-English.
- **In-app translation of user-generated content.** NEVER. Privacy + content-integrity violation.

## Cross-spec dependencies

- **Phase 3.1 (Push — Spec #1):** REQUIRED — the push notification titles (5 of them) get translated in this spec. Push must ship before i18n so the titles exist to translate. If chat (Phase 3.3) ships, also localize its strings.
- **Phase 3.2 (Map — Spec #2):** Map's UI strings (toggle labels, "Map unavailable" empty state, FSA polygon accessibility labels) get translated.
- **Phase 3.3 (Chat — Spec #3):** Chat's UI strings (placeholder "Type a message", "This pickup is complete. Chat is closed.", "(message deleted)", "(message from a deleted user)", "Open chat with poster") get translated. If chat slides to post-launch per Quinn's DFS-1 in spec #3, i18n picks up the chat strings later.
- **Phase 2 (Onboarding tour, Categories, Pickup confirmation — shipped):** All Phase 2 strings get extracted and translated in this spec. Onboarding tour is the largest single source.
- **Cycle 5 (Admin Verification UI — shipped):** Admin screens are English-only in v1 (per Out-of-Scope above). Revisit later.
- **Phase 4 #20 (EAS Build):** Store listings are localized per DFS-8.
- **Phase 4 #21 (Privacy policy + ToS):** Will + Jordan coordinate translation in Phase 4. Out of scope here.
- **NO dependency on Phase 3.1's push-tokens table** (just shares the locale concept via DFS-4).

## Definition of done

- All 15 AC pass manually on staging.
- All unit + component tests pass green (snapshot tests per locale per screen).
- `npm run check:strings` (string extraction completeness) passes in CI.
- `npm run check:translations` (no missing keys per locale) passes in CI.
- Casey + Riley confirm two native speakers reviewed each language (AC-9 workflow).
- Jordan signs off on Section 5 (no AI translation, translator engagement) — LIGHT privacy review.
- Alex signs off on accessibility labels + RTL prep + reduce-motion behavior.
- Dani signs off on the layout in all three locales (longest-translation case — AC-10).
- Peter signs off on bundle size impact.
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 8 DECISIONS FOR SKY items (DFS-1 through DFS-8) before merge.
- Sky approves each shipping language (en / fr / es) individually (AC-9 final step).
- Will updates `CLAUDE.md` "Status" line + adds "i18n: en/fr/es; never AI-translate" to the Gotchas section + amends the stack list to include `react-intl`.
- Casey writes release-note copy in English (Sky approves) for the partner networks.
- Morgan briefing in `qa-reports/phase-3-i18n-YYYY-MM-DD.md` summarising what shipped + screenshots in each locale.

## Privacy review level

**LIGHT** — translations are copy; PRIVACY.md is unaffected; same posture as Casey's onboarding-tour copy review. Jordan confirms the no-AI-translation rule (AC-9) and the translator-engagement workflow.

## Sky-decision gates beyond default DFS

1. **Translator engagement** — Sky approves the budget (DFS-3), Casey identifies the translators, Sky approves the candidates.
2. **Each language ships individually** (AC-9 final step) — Sky personally approves each language before it goes live.
3. **DFS-1 (library choice)** — sets a long-term dependency.
4. **App-store listing scope (DFS-8)** — affects Phase 4 scope.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
