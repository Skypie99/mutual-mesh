import { Pressable, Text, View } from 'react-native';
import { TOUCH_TARGET_MIN } from '@/lib/theme';

/**
 * EmptyFeedState — two-case empty state for the HomeScreen resource feed.
 *
 * Case A (filtersActive=false): no resources exist at all.
 *   Warm, encouraging framing — the community is new, not broken.
 *   CTA: "Share a resource" → navigates to AddResourceScreen.
 *
 * Case B (filtersActive=true): filters return zero matches.
 *   Honest, non-blaming framing — the filter is just narrow right now.
 *   CTA: "Clear filters" → resets active filter set.
 *
 * Design decisions:
 *   - All text is NativeWind token classes — no raw hex.
 *   - No sad icons, no red, no apologetic copy (Riley friction analysis).
 *   - CTA uses the ghost variant style so it reads as a secondary action
 *     (the primary FAB "Post a resource" is the real conversion target).
 *   - Visual divider (short horizontal bar) is a warm placeholder — avoids
 *     the blank void without adding an external icon dependency.
 *
 * A11y (Alex pre-audit):
 *   - Outer container: accessible={true} + accessibilityLabel summarising
 *     the state so VoiceOver/TalkBack reads context before the headline.
 *   - CTA Pressable: accessibilityRole="button" + 44pt minimum hit target.
 *   - No information conveyed by color alone (WCAG 1.4.1).
 *
 * Jordan trigger check:
 *   - No user PII, no location data, no category filtering logic.
 *   - "Clear filters" is a UI-only state reset — no Supabase write.
 *   - NOT a Jordan trigger.
 */

export type EmptyFeedStateProps = {
  /** True when one or more category chips are selected on the feed. */
  filtersActive: boolean;
  /** Navigate to AddResourceScreen — called from the CTA in case A. */
  onAddResource: () => void;
  /** Reset the active filter set to [] — called from the CTA in case B. */
  onClearFilters: () => void;
};

export function EmptyFeedState({
  filtersActive,
  onAddResource,
  onClearFilters,
}: EmptyFeedStateProps) {
  if (filtersActive) {
    return (
      <View
        accessible
        accessibilityLabel="No resources match the active filters. Try adjusting or clearing your filters."
        className="flex-1 items-center justify-center px-8 py-12"
      >
        {/* Warm divider bar — warm-border colour, no sad icon */}
        <View className="mb-6 h-1 w-12 rounded-full bg-light-border dark:bg-dark-border" />

        <Text className="text-center text-xl font-semibold text-light-text dark:text-dark-text">
          No resources match your filters
        </Text>
        <Text className="mt-2 text-center text-base text-light-text-secondary dark:text-dark-text-secondary">
          Try adjusting or clearing your filters.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear filters"
          onPress={onClearFilters}
          style={{ minHeight: TOUCH_TARGET_MIN }}
          className="mt-6 flex-row items-center justify-center rounded-button px-6 py-3 active:opacity-70"
        >
          <Text className="text-base font-semibold text-light-accent dark:text-dark-accent">
            Clear filters
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel="Nothing here yet. Be the first to share a resource with your community."
      className="flex-1 items-center justify-center px-8 py-12"
    >
      {/* Warm divider bar */}
      <View className="mb-6 h-1 w-12 rounded-full bg-light-border dark:bg-dark-border" />

      <Text className="text-center text-xl font-semibold text-light-text dark:text-dark-text">
        Nothing here yet
      </Text>
      <Text className="mt-2 text-center text-base text-light-text-secondary dark:text-dark-text-secondary">
        Be the first to share a resource with your community.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share a resource"
        onPress={onAddResource}
        style={{ minHeight: TOUCH_TARGET_MIN }}
        className="mt-6 flex-row items-center justify-center rounded-button border border-light-border-strong dark:border-dark-border-strong px-6 py-3 active:opacity-70"
      >
        <Text className="text-base font-semibold text-light-text dark:text-dark-text">
          Share a resource
        </Text>
      </Pressable>
    </View>
  );
}
