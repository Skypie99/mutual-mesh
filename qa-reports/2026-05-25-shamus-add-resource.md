# AddResourceScreen — Shamus Build Report
**Date:** 2026-05-25
**Branch:** `feat/mutualmesh-2026-05-25-shamus-add-resource`
**Author:** Shamus (Feature Engineer)
**Jordan review:** APPROVED WITH CONDITIONS (2026-05-25-jordan-addresource-review.md)

---

## Summary

Built `src/screens/AddResourceScreen.tsx` — the text-only form that lets verified users post mutual-aid resources to the marketplace feed.

All three of Jordan's blocking conditions are implemented. No photo upload (deferred to a future cycle pending EXIF pipeline approval). Category defaults to `'other'` per Quinn's spec gap note.

---

## Jordan's 3 Blocking Conditions — Status

| # | Condition | Implementation |
|---|-----------|---------------|
| 1 | Pickup location must NOT suggest full addresses; hint must name neighbourhood/intersection/landmark | Field 3 hint: `"Neighbourhood, intersection, or landmark — not your full address"` |
| 2 | Description visible to all verified members; nudge item-focused copy | Field 2 hint: `"Describe the item. Visible to all verified members — avoid personal details."` |
| 3 | Contact handle must warn against real names (PRIVACY.md D2) | Field 4 hint: `"Signal, email alias, or any handle. No real name."` |

All three implemented exactly per Jordan's example text.

---

## Files Changed

### `src/screens/AddResourceScreen.tsx` (rewritten)

Full rewrite from the previous partial implementation. Key changes:
- Removed photo upload entirely (was in previous draft; no Jordan EXIF approval yet)
- Applied all 3 Jordan conditions as field hints
- Field names match spec: Resource name (maxLength=100), Description (multiline, maxLength=2000), Pickup area (maxLength=280), Contact handle (maxLength=100)
- Placeholder text per spec
- `createResource()` called with `category: 'other'`, `photo_url: null`
- On success: calls `onPosted?.()` (parent navigates back)
- On error: `userFacingErrorMessage()` + `AccessibilityInfo.announceForAccessibility()`
- Inline validation before submit: focus moves to first errored field (name → contact)
- Loading state: button label changes to `'Posting…'` and `disabled={!canSubmit}` blocks double-submit

### `src/components/TextField.tsx` (updated)

Added `forwardRef` so callers can hold a `TextInput` ref for focus management on error. Backward-compatible: all existing usages still compile and work because `forwardRef` is transparent when no ref is passed.

---

## Accessibility (WCAG 2.2 AA)

- All `TextField` instances inherit `accessibilityLabel={label}` from the component
- Hints render as `accessibilityHint` on the underlying `TextInput`
- Error text has `accessibilityLiveRegion="polite"` (existing TextField pattern)
- Submit errors announced via `AccessibilityInfo.announceForAccessibility(msg)`
- On inline validation failure: focus moves to the errored field via `ref.current?.focus()`
- Submit button label reflects loading state (`'Posting…'` vs `'Post resource'`)
- `accessibilityHint` on both buttons (`hint` prop — routed through Button component)
- `accessibilityState={{ disabled }}` on buttons via Button component

---

## What is NOT in this screen (intentional)

- **No photo upload** — needs separate Jordan EXIF pipeline approval
- **No category picker** — Quinn spec gap; all resources posted as `category: 'other'` for MVP
- **No postal_prefix / city fields** — pre-filled from `profile` (from `useAuth()`) automatically

---

## Build verification

```
npm run typecheck   → 0 errors
npm test            → 390 tests passed, 0 failures (21 suites)
```

---

## DECISIONS FOR SKY

None. This screen uses only existing patterns + Jordan-approved fields. No new Supabase columns, no new RPCs, no privacy-sensitive additions beyond what Jordan already reviewed.

---

## Next steps (suggestions for Morgan to route)

1. **Gary** — test coverage for `AddResourceScreen` submit / validation / error paths
2. **Alex** — a11y audit of the form (contrast on hint text, focus order)
3. **Design Compiler** — run 7-layer compile gate per Const. Art. 2.4 before UI marked DONE
4. **Navigation wiring** — confirm `onPosted` / `onCancel` props are wired in `RootNavigator` (may already be from Phase 2 work)
