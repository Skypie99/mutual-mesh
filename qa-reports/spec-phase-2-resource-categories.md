# Spec: Phase 2 — Resource Categories — Quinn — 2026-05-24

## Summary

Phase 2 adds a single `category` column to `public.resources` (a fixed 5-value enum: `food`, `hygiene`, `baby`, `HRT`, `other`), a category picker in AddResourceScreen, and a filter-chip row on HomeScreen that lets users toggle which categories appear in the feed. Casey gets per-category seed metrics; Deb gets the category structure her community-fridge catalog needs; Keo gets an explicit HRT category so HRT supplies are findable without a full-text search; Mara still browses the food/baby slice she actually needs.

**Scope:** schema change (one new column on `resources` + CHECK constraint + filter index), one new picker UI on AddResourceScreen, one new filter-chip row on HomeScreen, AsyncStorage-backed filter persistence, optional `StatusPill`-style category tag on the existing `ResourceCard`. **No new screens, no new RPCs, no new triggers.** Dana writes the migration (`supabase/migrations/004_resource_categories.sql`); Shamus does the UI; Sky applies via the Supabase dashboard.

**Estimated effort:** 1 build day + 0.5 day audit/test pass. Two PRs (schema/migration + UI), Steve confirms RLS is unchanged, Alex audits the chip row, Gary writes tests.

**READY.** PRIVACY.md is APPROVED + locked. Category is a non-PII field; flagging for Jordan for completeness but the expected outcome is a one-line "no privacy impact" sign-off, not a full review.

## User story

> _As Deb, I post 12 items from this morning's food-bank haul; each item I tag with a category (food / hygiene / baby / HRT / other) instead of typing a free-form label, so my building's residents can scan the right slice fast._

> _As Keo, I open the feed and turn off every chip except "HRT" because I'm scanning for shared HRT supplies — I don't want food listings in the way._

> _As Mara, I open the feed and the chips default to "all on" because I want to see everything in my area — but when I'm hunting formula specifically I turn off everything except "baby"._

> _As Casey, I can query `SELECT category, count(*) FROM resources GROUP BY category` against staging to see whether the seed marketplace has the variety I promised the partner network — or whether it's all-food-no-hygiene and I need to ask Deb for more diaper posts._

> _As a verification admin, my admin queue is unaffected; I see no category filter, no chips, no category column — categories don't gate access._

## Personas served

- **Deb (poster) — primary.** Anti-goal: "Required photos for every post (she sometimes posts dry goods in bulk and doesn't have time)." Category gives Deb a structured-but-fast way to organize her bulk posts without an additional free-text field. Her "Building 22 Fridge" Telegram channel already uses category-like tags ("groceries today", "diapers needed"); Mutual Mesh now mirrors that mental model.
- **Keo (organizer) — primary.** Persona insight (line 66): "Resource categories must include HRT / medical supplies as a first-class category." Without an explicit HRT category, HRT supplies blend into "other" and Keo has to scan every listing. Filter chips let Keo collapse the feed to just-HRT in one tap.
- **Mara (recipient) — secondary.** Mara doesn't strictly need categories to find formula (she'd find it via "baby" or via free-text search in Phase 2 #10), but a "baby" chip cuts her scan time and reduces exposure to listings she's not in the market for.
- **Casey (Community Manager) — secondary.** `community/growth-strategy.md` section "What we measure" lists per-category seed metrics implicitly via "the marketplace has enough listings for them to find what they came for" (Riley friction #1). Categories make that measurable without instrumentation overhead.

## Why now

Expansion plan Tier 2 #6 (`~/.claude/plans/goofy-singing-steele.md` line 59) says: "Deb persona explicitly asks; Keo needs HRT category visible only to verified peers in same network. Casey wants per-category seed metrics." It is the first Phase 2 feature in the parallel-streams ordering (Stream A) precisely because:

1. It is the lowest-risk schema change (one nullable→backfilled column).
2. It unblocks Keo's HRT use case, which was identified in Riley's persona work as a load-bearing motivation for the trans/queer survival-network seed Tier-1 (`community/growth-strategy.md`).
3. It unblocks Casey's seed-mix monitoring without adding analytics infra (preserves PRIVACY.md D8 "No third-party SDKs").
4. It pairs naturally with Stream E (search/filter, expansion plan #10) — categories are the filter dimension that has the highest payoff per implementation cost.

Risk-of-deferral: every additional week of feed traffic without categories means more rows landing in `category = 'other'` once the column is added, and more user posts that the poster never re-edits. Shipping categories early minimizes the backfill skew. (The migration handles backfill cleanly — see "Data view" — but a smaller initial backfill is preferable.)

## Acceptance criteria

### AC-1: Schema migration adds `category` with CHECK constraint + index

- A new migration file `supabase/migrations/004_resource_categories.sql` (Dana writes — see "Data view") adds:
  1. `ALTER TABLE public.resources ADD COLUMN category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('food','hygiene','baby','HRT','other'));`
  2. `CREATE INDEX IF NOT EXISTS idx_resources_category_status ON public.resources (category, status, created_at DESC);` — supports the filter-feed query (filter chips + status='available' + DESC sort).
  3. A `COMMENT ON COLUMN public.resources.category IS 'Fixed 5-value enum: food|hygiene|baby|HRT|other. See spec-phase-2-resource-categories.md.';`
- Migration is idempotent (uses `IF NOT EXISTS` for the index, and the `ADD COLUMN` is implicitly idempotent in Postgres if you wrap in a `DO $$ ... $$` block — Dana's call which pattern to use).
- Rollback file documented at the top: `ALTER TABLE public.resources DROP COLUMN category;` (DROP COLUMN cascades drop of the CHECK constraint and the index; safe).
- **Sky applies via dashboard; Dana never applies.** Migration file lands; Sky runs it.

### AC-2: All existing rows backfill to `'other'` on apply

- The `DEFAULT 'other'` + `NOT NULL` on the new column means every existing row in `public.resources` gets `category = 'other'` automatically on `ALTER TABLE`.
- Steve verifies post-apply via `SELECT category, count(*) FROM public.resources GROUP BY category` — expected output: 100% in 'other' before any user re-edits.
- No data is lost; no row is rejected.

### AC-3: AddResourceScreen requires a category before submit

- The AddResourceScreen form gains a "Category" section above the existing "Pickup info" section.
- Five buttons or chips render the enum values (`food`, `hygiene`, `baby`, `HRT`, `other`), each with a screen-reader-friendly label and an icon (Dani picks; default no icons if Dani is OOO).
- Exactly one category may be selected at a time (radio-group semantics — `accessibilityRole="radio"` per chip, `accessibilityState={{ selected: true|false }}`).
- The form's "Post" button is `disabled` until `category !== null`. Other existing required fields (name, pickup_text) still gate as today; this AC adds a new gate, never removes one.
- The selected category is passed into `createResource()` (in `src/lib/resources.ts`) as part of the row. The existing INSERT is extended to include `category`.

### AC-4: HomeScreen renders a filter-chip row above the feed

- A new `CategoryFilterRow` component (small; lives in `src/components/CategoryFilterRow.tsx`) renders 5 toggle chips along a horizontal scrollable row above the FlatList.
- Each chip shows the category name + (optionally) a count of currently-visible listings in that category. Tap to toggle on/off.
- Default state on first mount: **all 5 chips ON** (show everything). This matches Mara's "I just want to see what's near me" mode.
- Tapping a chip toggles its `selected` state; the feed re-filters client-side immediately. No new network request — `useResources` already returns all available rows; filtering is in memory (no perf hit at <500 rows per CLAUDE.md gotcha #6).

### AC-5: Filter state persists across sessions via AsyncStorage

- The current selection (an array of 5 booleans, or a `Set<Category>`) is persisted under a single key `mm:home:categoryFilters` via AsyncStorage (`@react-native-async-storage/async-storage` is already in the deps — see `src/lib/supabase.ts` line 2).
- On HomeScreen mount, the value is read once; while the user is in the screen, every chip toggle writes the new state.
- Storage format: a JSON string of the form `{"food":true,"hygiene":true,"baby":false,"HRT":true,"other":true}`. Defensive default: if the key is missing, malformed, or contains unknown values, fall back to "all ON" (never crash; never persist a corrupted shape back).
- AsyncStorage is intentionally unencrypted per PRIVACY.md S7. Filter preferences are NOT PII; this is acceptable.

### AC-6: RLS is unchanged (categories don't gate access)

- The existing four RLS policies on `public.resources` (resources_verified_read, resources_verified_insert, resources_owner_update, resources_owner_delete — schema.sql lines 563-588) are NOT modified by this spec.
- Steve verifies via the existing `supabase/__tests__/rls.sql` test suite — no test changes required because no policy changes.
- **Important:** even when a user's filter excludes HRT, the RLS layer still allows them to SELECT all categories. Filtering is client-side; the server returns the full visible-set. If a category-restricted RLS is ever needed (e.g., "only show HRT to users in trans-survival networks"), that's a v2 cycle with its own Jordan review — out of scope here.

### AC-7: Realtime updates respect the active filter (no flicker for excluded categories)

- The `useResources` hook's realtime subscription (`src/hooks/useResources.ts` line 75-86) is unmodified.
- The filter logic lives in HomeScreen (or in a small derived-state `useMemo` over `resources`), NOT inside `useResources`. Reasoning: keeping `useResources` filter-agnostic preserves its reusability for the admin UI in v2 and for any future screen that wants the full feed.
- When a realtime INSERT arrives for a category the user has toggled OFF, `applyResourceDelta` still updates state — but the derived `visibleResources` does not include the new row, so the FlatList doesn't render it. No animation glitch.
- When the user toggles a chip ON, every row of that category that's already in state immediately becomes visible. No new fetch.

### AC-8: Empty-state when no resources match active filter

- When `visibleResources.length === 0` (filter combination has no matches OR feed is genuinely empty), the existing `EmptyState` component renders with two variants:
  - **Genuine empty** (`resources.length === 0`): existing copy (whatever HomeScreen already shows — Quinn doesn't override).
  - **Filter-empty** (`resources.length > 0 && visibleResources.length === 0`): new copy:
    - Title: `"No matches for your filters."`
    - Description: `"Try turning on more categories above."`
    - No CTA button (the chips ARE the CTA).
- The empty-state has `accessibilityLiveRegion="polite"` so screen readers announce the transition when the user toggles a chip and the list empties.

### AC-9: Admin UI is filter-free (admins see everything)

- The AdminVerificationScreen (Cycle 5 spec — `qa-reports/spec-cycle-5-admin-verification-ui.md`) is NOT modified by this spec. Admins are reviewing applicants, not browsing the marketplace; categories are irrelevant to that workflow.
- The AdminApplicantDetailScreen does NOT show the applicant's posted-resource categories (the 5-field Section 5 in the Cycle 5 spec is exhaustive; no addition).
- If a future admin tool inspects resources (out of scope today), it would query without category filters by default.

### AC-10: Category appears on ResourceCard as a `StatusPill`-styled tag

- The existing `src/components/StatusPill.tsx` component is reused (no new component) to render the category label inline on each `ResourceCard` in the feed and on the ResourceDetailScreen.
- Variant choice: `StatusPill` already supports a neutral/secondary variant; categories use that. (If StatusPill currently only supports status-flavor variants, Shamus extends with a `category` variant — small change.)
- Position: top-right of the card, mirroring how AccessMap's flag cards show category. Dani's call on exact placement; this AC just requires it be visible, accessible, and not crowd the title.
- The pill label is the user-facing category name (`Food`, `Hygiene`, `Baby`, `HRT`, `Other`). Capitalization in display only; storage stays lowercase except HRT (which stays uppercase in storage too — see DFS-1).

## Screens / layout

Two screens touched (AddResource + Home) + a small visual addition to ResourceCard. No new screens.

### State 1: AddResourceScreen — category picker added above pickup_text

```
┌──────────────────────────────────────────┐
│  Add a resource                          │
│                                          │
│  Name                                    │
│  ┌────────────────────────────────────┐  │
│  │ Hypoallergenic formula (Nutramigen)│  │
│  └────────────────────────────────────┘  │
│                                          │
│  Photo (optional)                        │
│  [ photo picker UI — unchanged ]         │
│                                          │
│  Category                                │  <- NEW SECTION
│  ┌──────┐┌────────┐┌──────┐┌─────┐┌─────┐│
│  │ Food ││Hygiene ││ Baby ││ HRT ││Other││  <- 5 chips; one selectable
│  └──────┘└────────┘└──────┘└─────┘└─────┘│
│                                          │
│  Pickup info                             │
│  [ TextField — unchanged ]               │
│                                          │
│  Contact handle                          │
│  [ TextField — unchanged ]               │
│                                          │
│  ┌─────────────┐                         │
│  │    Post     │  <- disabled until cat picked + existing fields filled
│  └─────────────┘                         │
└──────────────────────────────────────────┘
```

### State 2: HomeScreen — filter chip row added above FlatList

```
┌──────────────────────────────────────────┐
│  Home                                    │
│                                          │
│  ─── horizontally scrollable chip row ───│  <- NEW
│  ┌──────┐┌────────┐┌──────┐┌─────┐┌─────┐│
│  │✓ Food││✓Hygiene││✓ Baby││✓HRT ││✓Other││  <- toggleable; default all ON
│  └──────┘└────────┘└──────┘└─────┘└─────┘│
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ ResourceCard                  Food │  <- StatusPill-style category tag
│  │ Hypoallergenic formula             │  │
│  │ M5V · Toronto · 2 hrs ago          │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ResourceCard                   HRT │  │
│  │ ...                                │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### State 3: HomeScreen — filter-empty state

```
┌──────────────────────────────────────────┐
│  Home                                    │
│                                          │
│  ┌──────┐┌────────┐┌──────┐┌─────┐┌─────┐│
│  │  Food││ Hygiene││  Baby││✓HRT ││Other││  <- only HRT on
│  └──────┘└────────┘└──────┘└─────┘└─────┘│
│                                          │
│        No matches for your filters.      │
│   Try turning on more categories above.  │
│                                          │
└──────────────────────────────────────────┘
```

### Component reuse map (no new screens; one new tiny component)

| Used component            | Where                                                     |
| ------------------------- | --------------------------------------------------------- |
| `Button` (chip variant)   | Both AddResource picker chips and HomeScreen filter chips |
| `StatusPill` (extended)   | Category tag on `ResourceCard` + `ResourceDetailScreen`   |
| `EmptyState`              | Filter-empty state on HomeScreen                          |
| `Card`                    | ResourceCard, unchanged shape                             |
| `CategoryFilterRow` (NEW) | Small wrapper holding 5 toggle chips + persistence logic  |

The new `CategoryFilterRow` is small enough (~80 lines) that Shamus writes it directly; Dani signs off on visual treatment. If Dani is OOO, the chips reuse `Button` with the secondary variant.

## Data view (Jordan privacy gate — abbreviated)

This section is privacy-light. Categories are not PII, but flagging for Jordan per Constitution Art. 7.6 for completeness; expected outcome is a one-line sign-off.

### What the new column stores

| Column                      | Source                                   | Visibility                                         |
| --------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `public.resources.category` | User input at post time (5 fixed values) | All verified users (same as other resource fields) |

### What it does NOT introduce

- No new joins, no new tables, no new RPCs.
- No way to infer who-posted-what from category alone (posters' identities were already visible via `posted_by` → handle indirection on the existing card).
- No new realtime channel (the existing `resources-feed` channel covers all column changes).
- No new admin surface; admin queries `public.users`, not `public.resources` (per Cycle 5 spec).

### Mara/Keo persona impact check

- **Mara's anti-goal #4** ("anyone — even verification admins — knowing what she's claimed"): unaffected. Categories appear on posts, not on claims. Admins still don't see claim history.
- **Keo's anti-goal #3** ("a 'verified ✓' badge that becomes a target / makes them findable"): no badge is added by this spec. The category tag on the card is the resource's category, not the user's. A future feature that ties categories to users (e.g., "show me HRT-only posters") would be a separate cycle with a fresh Jordan review.
- **Keo's anti-goal — state-actor threat model:** the HRT category as a fixed enum value is more discoverable than free-text "HRT" in a description, because it's queryable. Mitigation: RLS still gates the whole `resources` table to verified peers only. A subpoena that reaches Supabase would already see all rows; categorization doesn't materially change the threat model. Document for Jordan; Jordan signs off or asks for HRT to be split into a separate-table-with-stricter-RLS (would be a much bigger spec — flag as DFS-3).

### Concrete migration shape (Dana writes; this is a sketch, not the deliverable)

```sql
-- 004_resource_categories.sql
-- Phase 2 #6 — add fixed-enum category to resources.
-- Rollback: ALTER TABLE public.resources DROP COLUMN category;

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('food','hygiene','baby','HRT','other'));

CREATE INDEX IF NOT EXISTS idx_resources_category_status
  ON public.resources (category, status, created_at DESC);

COMMENT ON COLUMN public.resources.category IS
  'Fixed 5-value enum: food|hygiene|baby|HRT|other. See spec-phase-2-resource-categories.md.';
```

Dana finalizes this. The above is illustrative.

## RPC contracts

**No new RPCs.** The existing `createResource()` helper in `src/lib/resources.ts` is the call-site; it gains a `category` parameter. The existing `claim_resource(resource_id)` RPC (schema.sql lines 395-422) is unmodified — categories don't affect the claim transaction.

`src/lib/resources.ts` `createResource()` signature update:

```ts
// Before:
export async function createResource(input: { name; description?; pickup_text; contact_handle; photo_url? }): Promise<...>;

// After (Phase 2 #6):
export async function createResource(input: { name; description?; category: Category; pickup_text; contact_handle; photo_url? }): Promise<...>;
//                                                       ^^^^^^^^^^^^^^^^^^^^^^ new required field
```

`Category` type lives in `src/types/database.ts`:

```ts
export type Category = 'food' | 'hygiene' | 'baby' | 'HRT' | 'other';
```

## Tests (Gary writes)

### Unit tests

- `src/lib/categoryFilter.test.ts` — new pure helper:
  - `filterResourcesByCategory(resources, activeSet)` returns the subset matching the active categories.
  - Tested with table-driven inputs (empty set, all set, single set, unknown-category-in-state defensive).
- `src/lib/categoryStorage.test.ts` — new pure helper:
  - `parseStoredFilter(jsonString)` returns a normalized `Set<Category>` or the "all ON" default.
  - `serializeFilter(set)` returns a stable JSON shape.
  - Edge cases: missing key, malformed JSON, unknown values, mixed valid+invalid keys.

### Component tests

- AddResourceScreen renders 5 category chips; the Post button is `disabled` until one is selected.
- AddResourceScreen submits the selected category through to `createResource()` (mock).
- HomeScreen renders `CategoryFilterRow` with all 5 chips defaulting to `selected: true`.
- Toggling a chip filters the FlatList in place (count of rendered cards decreases).
- Filter-empty state renders the new EmptyState copy when all chips are off OR no resources match.
- The category `StatusPill` renders on each ResourceCard with the right label.

### Integration tests (Steve/Dana review; Gary runs in CI)

- Apply migration 004 to a staging snapshot; verify:
  - All existing rows now have `category = 'other'`.
  - Inserting a row with `category = 'food'` succeeds.
  - Inserting a row with `category = 'banana'` is rejected by the CHECK constraint.
  - The new index appears in `pg_indexes` and is used by `EXPLAIN ANALYZE SELECT * FROM resources WHERE category = 'baby' AND status = 'available'`.

### Manual smoke test (Sky walks through on staging — Phase 2 sync point)

1. Apply migration 004 via Supabase dashboard; confirm existing 12 staging rows show `category = 'other'`.
2. Open AddResourceScreen on Expo Go; confirm 5 chips render; confirm Post is disabled until a chip is tapped.
3. Post a "food" item; confirm it appears in HomeScreen with a "Food" pill.
4. Toggle HomeScreen chips to leave only "baby" on; confirm food item disappears.
5. Kill and re-open the app; confirm the "baby only" filter persists.
6. Post an HRT item from a second test user; confirm it lands and the HRT chip count updates.
7. Run `SELECT category, count(*) FROM public.resources GROUP BY category` in dashboard; confirm distribution.

## A11y (Alex pre-audit notes)

- **Chips are radio buttons on AddResource, toggle buttons on HomeScreen.** Different semantics:
  - AddResource: `accessibilityRole="radio"`; `accessibilityState={{ selected }}`; the row is wrapped in `accessibilityRole="radiogroup"` with a label.
  - HomeScreen: `accessibilityRole="button"`; `accessibilityState={{ selected }}`; each chip's hint reads `"Filter: show <category>. Currently <on|off>. Double-tap to toggle."`.
- **Filter-row position:** at the top of HomeScreen, focus order is chips → first card → second card → etc. Screen reader users land on the chips first; reduce surprise.
- **Filter-empty announcement:** `accessibilityLiveRegion="polite"` on the EmptyState; announce once per filter change (mounted-ref guard so we don't fire on initial mount).
- **Color contrast:** chip selected vs unselected state must hit 4.5:1 against background. The chip outline ALSO changes on selected state (not just fill color) — never rely on color alone (WCAG 1.4.1). Alex audits the design tokens before Shamus wires.
- **Touch targets:** 44×44 minimum on each chip per WCAG 2.5.5. Horizontal scroll inside the row is fine; vertical scroll passes through to the FlatList.
- **Reduced motion:** chip toggle animation (if any) respects `useReducedMotion` from `src/lib/useReducedMotion.ts`. Default snap; with reduced motion, also snap (no behavior difference; flag for future-proofing).
- **Dynamic type:** chip labels scale with system text size; tested at 200% to confirm the row scrolls cleanly without truncation.

## Performance considerations (Peter pre-notes)

- The new `idx_resources_category_status` index supports both "filter by single category + status=available" and "filter by multi-category" via index-only scan when the planner picks it. At ≤500 rows (CLAUDE.md gotcha #6), index choice is not load-bearing; document for future.
- Client-side filter is O(N) over the in-memory `resources` array per render. At ≤500 rows, this is sub-millisecond; no memoization required. Document a `useMemo` on `visibleResources` as a future optimization if rows exceed 1000.
- Realtime cost is unchanged (one channel, all events). Filtering is purely on the consuming end.
- AsyncStorage write on every chip toggle is asynchronous; debounce is unnecessary at toggle frequencies <2/sec (human-tap rate). If the user spam-toggles, the last write wins and no race exists (sequential writes via AsyncStorage's queued operations).

## Privacy considerations (Jordan pre-audit — abbreviated review needed)

This is the section that gates merge. Jordan reviews and either signs off (expected: one-liner "no new PII; no new RLS surface; sign off") or sends back with notes.

1. **No new PII.** `category` is a fixed enum chosen by the user at post time. It does not identify the user.
2. **No new join.** Joining `resources.category` back to `users` does not reveal anything that wasn't already revealed via `posted_by`.
3. **HRT category — state-actor threat model.** The HRT enum value is more queryable than free-text "HRT" in `description`. RLS to verified-only mitigates external access; subpoena risk is unchanged. **DFS-3** asks Sky to confirm acceptance.
4. **Filter persistence in AsyncStorage** is fine per PRIVACY.md S7 (unencrypted; non-PII).
5. **The "(none — bypassed)" pattern from the admin UI** is irrelevant here — categories are never displayed in the admin queue.

## DECISIONS FOR SKY

> Each item below needs Sky's call before Phase 2 #6 lands. Default behavior in parentheses is what ships if Sky doesn't override.

### DFS-1: Storage casing — `HRT` uppercase or `hrt` lowercase

The 5-value enum has 4 lowercase values and 1 acronym. Postgres CHECK is case-sensitive. Options:

- (a) Store `HRT` uppercase as-is — display matches storage; minor inconsistency with other lowercase values.
- (b) Store `hrt` lowercase; display as `HRT` via a small format helper.

**Quinn's proposal:** **(a) Store `HRT` uppercase.** Reasoning: it's an acronym, not a noun; uppercase is the canonical form. Avoids a format helper layer. The CHECK constraint enumerates the value explicitly so there's no ambiguity. Lowercase variants would feel demeaning to the Keo persona's lived experience.

**Default if Sky says nothing:** ships uppercase HRT.

- [ ] Approve uppercase HRT (default)
- [ ] Edit — lowercase hrt with display-format helper

### DFS-2: Fixed enum vs user-defined tags

Today's spec uses a fixed 5-value enum. A future feature could let users define their own categories.

**Quinn's proposal:** **Fixed enum until v2.** Reasoning:

1. User-defined taxonomy creates a moderation surface (slurs, spam, doxxing in category names).
2. It would force category to be a separate `categories` table with FK and RLS, doubling the schema cost.
3. Casey's 90-day metrics need a stable category list; user-defined would scatter the data.
4. Adding values later is cheap (`CHECK (category IN ('food','hygiene','baby','HRT','other','newvalue'))` — one migration).

If Sky wants user-defined eventually, the path is: ship fixed enum now → re-evaluate at 90-day metrics review → propose a `categories` table with strict moderation rules if user-defined is justified.

- [ ] Approve fixed-enum-until-v2 (default)
- [ ] Push back — start with user-defined now

### DFS-3: HRT category — state-actor threat model

The HRT enum value is more queryable than free-text "HRT" in description. RLS still gates to verified users only, but the data shape is more legible to a hypothetical subpoena than free-text.

**Quinn's proposal:** **Accept the small increase in query-shape legibility.** Reasoning:

1. The threat model is unchanged in practice — a subpoena that reaches Supabase already accesses the full table.
2. Keo's stated need ("Resource categories must include HRT / medical supplies as a first-class category") makes the value to Keo direct and concrete.
3. Splitting HRT into its own table with stricter RLS would be a much larger spec, an extra realtime channel, and a confusing UX (why is HRT in a different list?). The risk-vs-value math doesn't favor it.
4. Jordan flags this for Sky's call; Quinn's recommendation is "ship the simple version, document the threat-model nuance in LEARNINGS.md, revisit only if a documented incident occurs."

**Default if Sky says nothing:** ships single-table with HRT as one of five enum values.

- [ ] Approve single-table HRT (default)
- [ ] Push back — HRT goes in a separate table with stricter RLS (significantly bigger scope; defer to v2)

### DFS-4: Default filter state on first launch

The spec defaults all 5 chips to ON. Alternative: a "smart default" that omits HRT for non-trans-identified users (we don't ask anyone to identify trans, so this is moot — included only for completeness).

**Quinn's proposal:** **All 5 chips ON.** Reasoning: any "smart default" would require us to ask the user about their identity at signup, violating Mara/Keo's anti-goals about identity collection.

- [ ] Approve all-ON default (default)
- [ ] Push back

### DFS-5: Category visibility on ResourceCard

AC-10 places a `StatusPill`-styled category tag on each card. Alternative: tag is only on the ResourceDetailScreen, not on the feed card.

**Quinn's proposal:** **Show on the card.** Reasoning: scan-ability — users with the chips configured can still see what category each item is at-a-glance. The visual cost (one pill per card) is minor and consistent with the existing StatusPill pattern.

- [ ] Approve "show on card" (default)
- [ ] Edit — show only on ResourceDetailScreen

## Out of scope for this cycle

Each deferred item has a follow-up cycle / phase named.

- **Multi-select on AddResource** ("this is both food and baby"): defer indefinitely. Reasoning: enforces user clarity at post time; ambiguous categorization undermines Casey's metrics. If Deb requests it explicitly after 90 days, revisit.
- **Subcategories** ("baby → formula", "baby → diapers"): defer to v2. Reasoning: the friction analysis (Riley) doesn't yet support the cognitive cost. Casey's metrics will reveal whether the top-level categories need subdivision.
- **Per-category RLS** ("HRT visible only to verified peers in HRT-flagged trust groups"): out of scope; would require a `users.categories_visible` column or a separate vouching layer; full Jordan review; v2 territory.
- **Per-category seed metrics dashboard**: out of scope of _this_ cycle; Casey runs ad-hoc SQL until a Casey-cockpit feature is built (post-Phase-3 if at all).
- **Push notification by category** ("notify me when new HRT posts": out of scope; sequenced after Phase 3 #16 (push) and #17 (map). Tied also to Mara's anti-goal #3 about resource names in push notifications.
- **Backfilling categories from existing free-text resource names** (e.g., "Nutramigen" → `baby`): out of scope. Backfill is "all → 'other'", users re-edit their own posts if they want. Cleaner; respects user agency.
- **Admin category filter in Cycle 5**: explicit non-goal (AC-9 above). Admins do not filter by category.
- **Lint rule on `select(` to lock the resources column list**: irrelevant for this spec (no privacy-load-bearing SELECT changes). Inherited from Cycle 5 DFS-3 only if Sky approves that one.

## Definition of done

- All 10 AC pass manually on staging.
- Migration 004 file lands in `supabase/migrations/`; Sky applies; backfill verified via SELECT GROUP BY.
- AddResource + HomeScreen + ResourceCard updated; `categoryFilter.test.ts` + `categoryStorage.test.ts` + component tests pass green.
- Jordan signs off on the (abbreviated) privacy review.
- Alex signs off on chip semantics, contrast, and dynamic-type scale.
- Steve signs off on "no new RLS surface; existing RLS unchanged."
- Gary's CI gate green: `npm run typecheck && npm test && npm run lint && npm run format:check`.
- Sky has resolved all 5 DECISIONS FOR SKY items (DFS-1 through DFS-5) before merge.
- Will updates `CLAUDE.md` with the new column in the Tables section.
- Morgan briefing in `qa-reports/phase-2-categories-YYYY-MM-DD.md` summarising what shipped + screenshots from staging.

---

**Quinn — 2026-05-24** — file-only spec, no code touched, no external side effects, no message to Sky (Morgan owns that channel).
