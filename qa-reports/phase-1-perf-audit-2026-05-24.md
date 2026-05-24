# Peter — Phase 1 Performance Audit — 2026-05-24

## 1. DECISIONS FOR SKY

> Each item below is a perf/feature tradeoff that needs your call. None are launch blockers in the absolute sense — but each shifts what "perf-ready" means.

- [ ] **Approve: ship Phase 1 launch without `getItemLayout` on the feed FlatList.**
  - **Action:** Acknowledge; no code change. We accept slightly slower scroll-to-index on low-end Android in exchange for variable-height resource cards (1-line vs 2-line names + optional description + optional postal_prefix).
  - **Rollback:** If a Tier-1 community reports feed jank, Peter writes a fixed-row-height variant (drops `description` from the list-item card; moves it to detail) and adds `getItemLayout`.
  - **Why deferred:** Reversible mid-Phase-2 with a single PR; not safety/privacy.
  - **Owner:** Peter.

- [ ] **Approve: keep `listMyPosts` / `listMyClaims` fetching full rows for the Profile count display.**
  - **Action:** Acknowledge; no code change for Phase 1. Profile shows posted/claimed counts; today we fetch up to 500 rows just to call `.length`. For a launch-window user with <50 posts/claims it's <50ms over the wire — fine. The fix (use a Postgres `count='exact', head: true`) is a Phase 2 Stream-A polish item.
  - **Rollback:** N/A — purely additive change when we replace it.
  - **Why deferred:** Reversible; not load-bearing. But it's the single highest-likelihood future regression as users accumulate posts.
  - **Owner:** Peter.

- [ ] **Approve: defer cursor pagination on the marketplace feed to Phase 2.**
  - **Action:** Acknowledge; no code change. The `.limit(500)` cap is correct for launch (Tier-1 communities run ≤30 users, ≤300 listings). When listings clear 200 in a single community, Phase 2 Stream-E (search/filter) is the natural carrier for cursor pagination.
  - **Rollback:** N/A — change is purely additive.
  - **Why deferred:** Const. Art. 5.3 — major surface-area change to a privacy-load-bearing query path; do it once, with Steve + Dana + Jordan reviewing the new RLS implications at the same time.
  - **Owner:** Peter.

## 2. BLOCKERS / FAIL_FAST

None. Audit ran clean. No code touched (read-only per role contract).

## 3. Summary

The marketplace feed + realtime + photo pipeline are **perf-ready for Phase 1 launch to Tier-1 invited communities (≤30 users / ≤300 listings per community)**. The pure-helper realtime merge correctly returns the same array reference on no-op deltas (verified in `src/__tests__/resourcesRealtime.test.ts` lines 23, 46, 65 — three reference-equality assertions), so React skips unnecessary re-renders of the feed. The schema already has the three indexes the audit checks for (`status, created_at DESC`; `posted_by`; `claimed_by`) — Dana shipped them on day one.

**Two findings are worth fixing before Tier-1 user count clears ~50:** (a) the `renderItem` closure in `HomeScreen` is recreated on every parent render and the extracted `ResourceCard` is **not** wrapped in `React.memo` despite a code comment that claims it was (HomeScreen.tsx:94 says "extracted for React.memo + a11y consistency" — but `React.memo()` is never actually applied); (b) ProfileScreen fetches up to 500 full resource rows just to display a count.

Launch-blocker count: **0**. Optimize-soon count: **3**. Future-cycle count: **5**.

## 4. What Shipped (Checkpoints)

Nothing shipped — read-only audit. Findings + recommendations only.

## 5. What's Proposed (Not Applied)

| Proposal                                                                     | File path                                                         | What it does                                                                                 | Impact                                 | Rollback documented? |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------- |
| Wrap `ResourceCard` in `React.memo` + memoize `renderItem` via `useCallback` | `src/screens/HomeScreen.tsx`                                      | Skips re-render of unchanged cards when feed re-renders for a different row's realtime delta | Modest at 30 cards; meaningful at 100+ | N/A — additive       |
| Add `getItemLayout` + bounded text rows (or accept variable height)          | `src/screens/HomeScreen.tsx`                                      | Faster scroll-to-index on low-end Android; fewer measurement passes                          | Modest; reversible                     | N/A — additive       |
| `listMyPosts` / `listMyClaims` → use Postgres count for ProfileScreen        | `src/lib/resources.ts`, `src/screens/ProfileScreen.tsx`           | Single integer per query instead of 500-row payload                                          | Significant for heavy posters          | N/A — additive       |
| `createSignedResourcePhotoUrl` cache (per-resource, ~50 min TTL)             | `src/lib/photos.ts` (new), `src/screens/ResourceDetailScreen.tsx` | Avoid regen on every refetch                                                                 | Modest; saves 1 round-trip per claim   | N/A — additive       |
| Add cursor-pagination TODO marker pointing to gotcha #6                      | `src/hooks/useResources.ts`                                       | Documents the future load-more pattern at the call site                                      | None until invoked                     | N/A                  |

## 6. Findings by Audit Area

### Area 1: FlatList recycling in `HomeScreen`

File: `src/screens/HomeScreen.tsx`

| #   | Finding                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                                                                                           | Category                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1.1 | `keyExtractor` is stable and uses the row id.                                                                                                                                                         | HomeScreen.tsx:73 — `keyExtractor={(item) => item.id}`. Resource rows have UUID `id` from `gen_random_uuid()` (schema.sql:126), so the key never changes across re-renders. **OK.**                                                                                                                                | OK                                                                             |
| 1.2 | `renderItem` closure is recreated on every parent render.                                                                                                                                             | HomeScreen.tsx:75 — `renderItem={({ item }) => <ResourceCard item={item} onPress={onOpenResource} />}` is an inline arrow that allocates a new function reference each render. Combined with no `React.memo` wrapper on `ResourceCard` (see 1.3), every parent render walks every visible card.                    | **Optimize-soon**                                                              |
| 1.3 | `ResourceCard` is **not** wrapped in `React.memo` despite a comment claiming it was.                                                                                                                  | HomeScreen.tsx:94 — comment reads: `// Sub-components (extracted for React.memo + a11y consistency — Peter pre-empt)`. But the `ResourceCard` function declaration at line 106 has no `memo()` call. Same for `Separator` at line 97. The intent was clearly to enable memo; the wrapper was just never added.     | **Optimize-soon**                                                              |
| 1.4 | Item heights are **not** consistent (no `getItemLayout` possible without changes).                                                                                                                    | HomeScreen.tsx:114-132 — card height varies with: (a) `numberOfLines={2}` on `name` (1 or 2 lines), (b) optional `description` block (0 or up to 2 lines), (c) optional `postal_prefix` row. A card with no description + no postal_prefix is ~64px; a card with both is ~120px. `getItemLayout` would mis-render. | Tradeoff — see DECISIONS FOR SKY #1                                            |
| 1.5 | `windowSize` defaults to 21 (RN default = 21 viewports). For low-end Android, dropping to `windowSize={11}` and `maxToRenderPerBatch={5}` halves the mount cost on initial render. Not applied today. | HomeScreen.tsx:71-85 — no FlatList tuning props passed. Default RN behavior is fine for iOS / mid-range Android.                                                                                                                                                                                                   | **Future-cycle** (revisit after Phase 4 Android internal-track perf telemetry) |
| 1.6 | `removeClippedSubviews` not set. Defaults to `true` on Android, `false` on iOS. For privacy-tagged content (postal_prefix), clipping is fine; no action needed.                                       | Default behavior; no override.                                                                                                                                                                                                                                                                                     | OK                                                                             |

### Area 2: `useResources` hook

File: `src/hooks/useResources.ts`

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                                                                                                                    | Category          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2.1 | Mounted-ref guards in place per CLAUDE.md gotcha #5.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | useResources.ts:42-71 — `mountedRef = useRef(true)`, set false in cleanup (line 69), every async setState gates on `mountedRef.current` (lines 45, 48, 78). **OK.**                                                                                         | OK                |
| 2.2 | Realtime channel cleanup is correct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | useResources.ts:88-90 — `return () => { void supabase.removeChannel(channel); };`. Channel name is the constant `'resources-feed'` (line 76), so the hook subscribes once on mount and tears down on unmount. **OK.**                                       | OK                |
| 2.3 | No churn on profile changes — the realtime `useEffect` has an empty dep array (line 91), so it does NOT re-subscribe when the user's profile changes. The user-row channel (in AuthProvider) re-subscribes on `session.user.id` change, which is the right scope. **OK.**                                                                                                                                                                                                                                        | useResources.ts:74-91.                                                                                                                                                                                                                                      | OK                |
| 2.4 | `applyResourceDelta` returns same array reference on no-op deltas. Verified by tests.                                                                                                                                                                                                                                                                                                                                                                                                                            | resourcesRealtime.ts:47 (INSERT-already-present → `return state`), :58 (UPDATE-no-match → `return state`), :62 (DELETE-no-match → `return state`). Tests at `src/__tests__/resourcesRealtime.test.ts:23,46,65` assert `expect(result).toBe(state)`. **OK.** | OK                |
| 2.5 | **However:** the inline `setResources((current) => ...)` callback in useResources.ts:80-84 calls `.filter()` **even when the merged array is reference-identical to `current`**. The filter is a no-op (it just confirms `status === 'available'`), but `.filter()` ALWAYS allocates a new array. So even on a no-op delta, React sees a NEW state reference and re-renders the consumer. The reference-equality optimization in `applyResourceDelta` is **defeated** by the post-merge filter at the call site. | useResources.ts:82-83 — `return (merged as ResourceRow[]).filter((r) => r.status === 'available');` runs unconditionally.                                                                                                                                   | **Optimize-soon** |
| 2.6 | Initial fetch is a single `.limit(500)` call. No joins. `select('*')` on `public.resources` returns scalar columns only (schema.sql:125-139 — no joined `users` columns). No N+1. **OK.**                                                                                                                                                                                                                                                                                                                        | resources.ts:32-39.                                                                                                                                                                                                                                         | OK                |
| 2.7 | The `load` callback is recreated only when its `[]` deps change → never. The `useEffect` at line 65-71 fires once on mount. But because `load` is in the dep list of the effect and is itself stable (empty deps on its useCallback at line 56), the effect runs exactly once. **OK.**                                                                                                                                                                                                                           | useResources.ts:44-71.                                                                                                                                                                                                                                      | OK                |
| 2.8 | `setLoading(true)` in `reload` is fine — refresh UX needs the spinner. No issue.                                                                                                                                                                                                                                                                                                                                                                                                                                 | useResources.ts:58-62.                                                                                                                                                                                                                                      | OK                |

### Area 3: Photo pipeline

Files: `src/lib/photos.ts`, `src/screens/ResourceDetailScreen.tsx`, `src/screens/AddResourceScreen.tsx`

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                | Category          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 3.1 | `createSignedResourcePhotoUrl` is **not** cached. Called once per `fetchResource` cycle in ResourceDetailScreen.                                                                                                                                                                                                                                                                                                                              | ResourceDetailScreen.tsx:62 — `const signed = await createSignedResourcePhotoUrl(data.photo_url);` runs inside `fetchResource`, which is called on mount AND after every claim attempt (line 85). For a user who claims an item, that's 2 signed-URL round-trips for the same photo, even though the first one has 3600s TTL remaining. | **Optimize-soon** |
| 3.2 | The signed URL itself has 1h TTL (photos.ts:19 — `SIGNED_URL_TTL_SECONDS = 3600`). For a typical detail-screen session of <10 min, this is way overprovisioned — but that's the safety side. The perf side is: regenerating it costs a Storage round-trip + a CPU sign on the Storage edge. A simple in-memory map `path → { url, expiresAt }` with a 50-minute soft expiry would skip the round-trip on revisits.                            | photos.ts:95-105.                                                                                                                                                                                                                                                                                                                       | **Optimize-soon** |
| 3.3 | Compression settings: `MAX_DIMENSION = 2048`, `COMPRESS_QUALITY = 0.75`, `format: JPEG`. For a typical phone photo (4032×3024 from an iPhone 13), the output is ~600–900 KB. Well under 1 MB. **OK.**                                                                                                                                                                                                                                         | photos.ts:20-21, 39-46.                                                                                                                                                                                                                                                                                                                 | OK                |
| 3.4 | `ImagePicker.launchImageLibraryAsync` is called with `quality: 1` (AddResourceScreen.tsx:64) — full quality. The pipeline then re-compresses to 0.75. This is correct (avoids double-compression artifacts), but worth noting: on devices with limited RAM, holding a full-quality 4032×3024 RGB bitmap in memory briefly before manipulation can spike memory. RN's image picker usually streams from disk so it's fine in practice. **OK.** | AddResourceScreen.tsx:61-65, photos.ts:39-46.                                                                                                                                                                                                                                                                                           | OK                |
| 3.5 | Images are NOT lazy-loaded in the HomeScreen feed — but there ARE no images in the feed at all. `ResourceCard` (HomeScreen.tsx:106-138) renders text only; the photo only appears on the detail screen. So there is no image-list perf problem to optimize. **OK and intentional** — Phase 2 multi-photo feature (Stream D) will need to revisit this when thumbnails enter the feed.                                                         | HomeScreen.tsx:106-138 — no `<Image>` component in feed.                                                                                                                                                                                                                                                                                | OK                |
| 3.6 | EXIF strip is correct per CLAUDE.md gotcha #7 — `expo-image-manipulator` re-encodes; new file has no EXIF. Perf-wise: re-encode is the cost-dominant step (single-pass on the device GPU/CPU). For a 2048-wide JPEG this is <500ms on an iPhone X-class device. **OK.**                                                                                                                                                                       | photos.ts:34-48.                                                                                                                                                                                                                                                                                                                        | OK                |
| 3.7 | `fetch(cleanUri).blob()` (photos.ts:65-66) is the file→blob conversion. On modern RN this is fine. An expo-file-system route would be marginally faster but adds a dependency. No action.                                                                                                                                                                                                                                                     | photos.ts:65-67.                                                                                                                                                                                                                                                                                                                        | OK                |

### Area 4: Database indexes

File: `supabase/schema.sql`

All three indexes the marketplace feed + ProfileScreen needs are already present:

| Index needed                                                                                                                          | Already present? | Evidence                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `resources(status, created_at DESC)` — drives `listResources()` (the feed query: `WHERE status='available' ORDER BY created_at DESC`) | **YES**          | schema.sql:141 — `CREATE INDEX IF NOT EXISTS idx_resources_status_created ON public.resources (status, created_at DESC);` |
| `resources(posted_by)` — drives `listMyPosts(userId)` and the `protect_admin_flags`-side ownership check                              | **YES**          | schema.sql:142 — `CREATE INDEX IF NOT EXISTS idx_resources_posted_by ON public.resources (posted_by);`                    |
| `resources(claimed_by)` — drives `listMyClaims(userId)` (`WHERE claimed_by=$1 AND status='reserved'`)                                 | **YES**          | schema.sql:143 — `CREATE INDEX IF NOT EXISTS idx_resources_claimed_by ON public.resources (claimed_by);`                  |

**No missing indexes to propose.** Dana shipped a clean index set on day one.

**One minor recommendation (future-cycle, not for Dana now):** the `listMyClaims` query (resources.ts:57-64) filters on `claimed_by` AND `status='reserved'`. A two-column index `(claimed_by, status)` would be slightly tighter than the current single-column index, but for users with <20 claims the single-col index + status filter is already <5ms. Defer to a real-world telemetry signal.

### Area 5: Realtime channel count

Both subscriptions confirmed as designed:

| Channel                                  | Owner                                  | Lifecycle                                                                                                                                     | Verified                    |
| ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `user-row-${uid}` (1 per logged-in user) | `AuthProvider` (auth.tsx:141-159)      | Created on session → removed on session change / unmount. Filter: `id=eq.${uid}` (defense in depth per STRIDE I3; RLS holds primary).         | YES — auth.tsx:141-164      |
| `resources-feed` (1 per session)         | `useResources` (useResources.ts:75-86) | Created on hook mount → removed on unmount. No filter (the feed wants all delta events; the post-merge filter narrows to status='available'). | YES — useResources.ts:74-91 |

**Total active channels per client at steady state: 2.** Reasonable; well under any Supabase per-project realtime cap. The plan-risk note in goofy-singing-steele.md (Section 5, "Realtime channel limits at scale") about chat + group accounts adding more channels stays current — but Phase 1 is fine.

**One small note:** the user-row channel name uses the UID directly (`user-row-${uid}`). If the user signs out + signs in as a different user without a full app reload, the old channel is correctly removed via the effect cleanup (auth.tsx:161-163). Verified.

### Area 6: Pagination tail (CLAUDE.md gotcha #6)

| Finding                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                | Category                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 6.1: `.limit(500)` cap is enforced everywhere.                                                                                                                                                                                                                                                                                                                               | resources.ts:22 — `const LIST_LIMIT = 500;` used on lines 38, 53, 64. **OK.**                                                                           | OK                                          |
| 6.2: There IS a JSDoc TODO pointing to cursor pagination — but only in `resources.ts:16-17`, not at the consumer site (`useResources.ts`).                                                                                                                                                                                                                                   | `resources.ts:16` — `**Hard cap:** every list query uses .limit(500). Cursor pagination is Cycle 7 work — see CLAUDE.md gotcha #6`. **OK but partial.** | **Future-cycle**                            |
| 6.3: No load-more pattern is implemented. The feed silently caps at 500. For a Tier-1 community of 30 users posting at the high end (~3 listings/day each), 500 fills in ~5 days. The 30-day retention cron (`prune_expired_resources`, schema.sql:430-456) clears stale listings nightly, so steady-state should stay well under 500. **OK for launch; revisit at growth.** | resources.ts:32-39, schema.sql:441-444.                                                                                                                 | **Future-cycle** — see DECISIONS FOR SKY #3 |
| 6.4: `useResources` does not surface "the feed was truncated" UI. If we ever hit 500 in production, the user sees no indication. A trivial fix is a sentinel: when `data.length === LIST_LIMIT`, show a footer "Showing 500 most recent. Pull to refresh or claim items to see more."                                                                                        | useResources.ts:44-56.                                                                                                                                  | **Future-cycle**                            |

## 7. Index Recommendations (SQL Snippets for Dana, if Sky approves)

**No new indexes needed for Phase 1.** All three indexes the audit checks for are present in `supabase/schema.sql` (lines 141-143).

If, in a future cycle, telemetry shows `listMyClaims` getting slow for users with many claims, the proposed migration would be:

```sql
-- /supabase/migrations/00X_resources_claimed_by_status.sql
-- Optional: tighter index for listMyClaims. Defer until a real signal.
CREATE INDEX IF NOT EXISTS idx_resources_claimed_by_status
  ON public.resources (claimed_by, status)
  WHERE status = 'reserved';
-- Partial index (only 'reserved' rows) — the common query is
--   WHERE claimed_by=$1 AND status='reserved'
-- so the partial form keeps the index small.

-- Rollback:
-- DROP INDEX IF EXISTS public.idx_resources_claimed_by_status;
```

This is **not** a recommendation to apply now. It's a future-cycle option Dana can pick up if profile load times degrade.

## 8. Bench Targets ("fast enough" definitions)

These targets become the launch acceptance gate. If any are missed during real-device smoke-testing on staging, Phase 1 closeout pauses.

| Surface                                                            | Target (P50)        | Target (P95)             | Measured at                                                     | Notes                                                                                                         |
| ------------------------------------------------------------------ | ------------------- | ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Marketplace feed first render (cold) — splash → first card visible | **< 1500ms**        | < 2500ms                 | iOS Expo Go on iPhone 13-class device, Wi-Fi, 30 listings in DB | Includes auth bootstrap + listResources + first FlatList render                                               |
| Marketplace feed scroll — sustained scroll over 30 cards           | **60fps** sustained | no dropped frame > 200ms | Same device                                                     | Tested by Peter manually + Gary in instrumented run                                                           |
| Realtime delta apply — INSERT event → card appears in feed         | **< 400ms**         | < 800ms                  | Same device, Tier-1 staging Supabase                            | End-to-end: server publishes → channel receives → applyResourceDelta → React commit                           |
| `claim_resource` RPC roundtrip                                     | **< 200ms**         | < 500ms                  | Same device, Tier-1 staging                                     | Server-side: SELECT FOR UPDATE + UPDATE in single txn                                                         |
| Photo upload (single 2048×2048 JPEG, ~700 KB)                      | **< 3000ms**        | < 6000ms                 | Same device, Wi-Fi                                              | EXIF strip (~500ms) + Storage upload (~1500ms typ)                                                            |
| ResourceDetail signed-URL generation                               | **< 300ms**         | < 600ms                  | Same device                                                     | Single Storage `createSignedUrl` call                                                                         |
| ProfileScreen counts load                                          | **< 500ms**         | < 1000ms                 | Same device                                                     | Two parallel queries (listMyPosts + listMyClaims). Will improve to < 100ms when migrated to Postgres `count`. |

**Methodology for measuring** (Phase 1 closeout):

- Cold-start: kill app → relaunch → stopwatch from launch to first card.
- Sustained-scroll: enable Expo Dev Menu → Performance Monitor → scroll 30 cards continuously → record min fps.
- Realtime delta: use staging dashboard SQL editor to INSERT a row, stopwatch from "submit" to "card appears in feed".
- Photo upload: pick a 4032×3024 photo from camera roll → tap submit → stopwatch.

These are Gary's instrumented-test targets too. Gary's CI can't measure device-level fps but can measure RPC roundtrip time on a known dataset.

## 9. Findings Summary

| Category                                                         | Count                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Block-launch**                                                 | **0**                                                                |
| **Optimize-soon** (Phase 2, before Tier-1 user count clears ~50) | **3** (findings 1.2/1.3 are paired; 2.5; 3.1/3.2 are paired)         |
| **Future-cycle** (Phase 3+ or telemetry-driven)                  | **5** (findings 1.5, 6.2, 6.3, 6.4, plus the optional partial index) |
| **OK / no action**                                               | **18**                                                               |

## 10. Read-only confirmation

Per Peter's role contract and CLAUDE.md / CONSTITUTION:

- No code was modified during this audit.
- No DB migrations were applied (all index recommendations are SQL files only; Sky applies via dashboard).
- No external side effects (no email, no notifications, no commits to main).
- Findings written here in `qa-reports/` for Morgan to pick up and brief Sky.

---

**Sign-off:** Peter the Performance Engineer, 2026-05-24.
