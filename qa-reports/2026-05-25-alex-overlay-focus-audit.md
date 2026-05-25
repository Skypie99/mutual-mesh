# Alex — Overlay Focus Audit: ResourceMapScreen Empty State
**Date:** 2026-05-25  
**Role:** Alex (Accessibility Engineer)  
**Triggered by:** Design Compiler escalation — overlay focus isolation concern  
**Files audited:**  
- `/Users/skypie/MutualMesh/src/screens/ResourceMapScreen.tsx` (lines 369–387, 384–440)  
- `/Users/skypie/MutualMesh/src/components/EmptyState.tsx`

---

## Summary

The map-installed path of `ResourceMapScreen` renders an `EmptyState` overlay absolutely positioned on top of a `MapView` when `descriptors.length === 0 && !loading`. The overlay wrapper sets `accessibilityViewIsModal` and `accessibilityLiveRegion="polite"`, which handles iOS VoiceOver isolation correctly. Critically, the `MapView` wrapper `<View>` already sets `importantForAccessibility={descriptors.length === 0 ? 'no-hide-descendants' : 'auto'}` — meaning Android TalkBack is explicitly instructed to hide all descendants of the map container whenever the overlay is visible. The `EmptyState` component itself is a plain unstyled `View` with no focus-isolation attributes, which is correct here because isolation is the parent's responsibility. The implementation is well-constructed and the Design Compiler concern is addressed in the existing code.

---

## Finding

**Location:** `ResourceMapScreen.tsx`, lines 369–440 (map-installed path)

### Overlay wrapper (lines 369–382):
```tsx
{descriptors.length === 0 && !loading && (
  <View
    className="absolute inset-0 z-10 items-center justify-center bg-light-bg/80 dark:bg-dark-bg/80"
    accessibilityViewIsModal        // ✅ iOS VoiceOver: confines focus within this View
    accessibilityLiveRegion="polite" // ✅ announces on mount without interrupting
  >
    <EmptyState ... />
  </View>
)}
```

### MapView wrapper (lines 384–440):
```tsx
<View
  className="flex-1"
  importantForAccessibility={descriptors.length === 0 ? 'no-hide-descendants' : 'auto'}
  // ✅ Android TalkBack: hides ALL descendants (MapView, FAB, FSA chips)
  //    when the empty overlay is active
>
  <MapView ... />
  {/* Center-on-me FAB */}
  {/* FSA overlay list (bottom sheet) */}
</View>
```

### EmptyState component (lines 19–37 of EmptyState.tsx):
The component renders a plain `<View>` with text and an optional `<Button>`. It does **not** set any `importantForAccessibility` or `accessibilityViewIsModal` — this is **correct**: those are caller responsibilities, and the caller (`ResourceMapScreen`) handles them properly.

**Assessment:** No focus trap issue exists. The two-layer isolation strategy (iOS via `accessibilityViewIsModal`, Android via `importantForAccessibility="no-hide-descendants"` on the map container) is exactly the WCAG 2.2 / RN a11y-recommended pattern.

---

## Proposed fix

**None required.** The existing implementation is correct.

For completeness, the pattern that would have been needed if the fix were missing:

```tsx
// On the overlay wrapper — already present:
accessibilityViewIsModal   // iOS isolation

// On the MapView wrapper — already present:
importantForAccessibility={descriptors.length === 0 ? 'no-hide-descendants' : 'auto'}  // Android isolation
```

Both are already in place. No code change is warranted.

---

## Severity + Rationale

**Severity: N/A — no issue found.**

The Design Compiler flagged this as a potential gap based on the pattern of `EmptyState` rendered over `MapView`. Upon direct inspection:

- `accessibilityViewIsModal` on the overlay wrapper is sufficient for VoiceOver (iOS) — focus is confined to the modal View's subtree.
- `importantForAccessibility="no-hide-descendants"` on the `MapView`'s wrapping `View` is the correct Android TalkBack mechanism — it hides the `MapView`, its tiles, the Center-on-me FAB, and the FSA chip list from the accessibility tree whenever the overlay is active.
- The conditional ties the hiding to the same predicate (`descriptors.length === 0`) as the overlay render, so there is no state where the overlay is visible but the map remains accessible, nor where the map is hidden from TalkBack when there is valid data to display.
- `accessibilityLiveRegion="polite"` on the overlay ensures Android announces the empty state content without interrupt, which is the correct register for a non-urgent state change.

WCAG 2.2 success criterion 4.1.3 (Status Messages) and 1.3.1 (Info and Relationships) are both satisfied.

---

## Verdict

**PASS — no action needed.**

The overlay focus isolation is correctly implemented using both platform-specific mechanisms. The Design Compiler escalation is resolved with no code change required. This finding can be recorded as a confirmed PASS in the Design Compiler's compile log for the `resourcemap-polish` feature.
