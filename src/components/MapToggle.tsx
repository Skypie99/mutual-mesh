import { Pressable, Text, View } from 'react-native';
import { TOUCH_TARGET_MIN } from '@/lib/theme';

/**
 * MapToggle — segmented control switching the HomeScreen feed between
 * the canonical list view and the privacy-safe FSA-aggregated map view.
 *
 * Quinn AC-5: the list is the default and the canonical content; the map
 * is an alternative visualization. This component is the surface that
 * advertises both views and lets users move between them without losing
 * filter state.
 *
 * A11y posture (Alex pre-audit notes — spec-phase-3-map-view.md):
 *   - Wrapping `View` is `accessibilityRole="tablist"`.
 *   - Each option is `accessibilityRole="tab"` with
 *     `accessibilityState={{ selected }}`.
 *   - 44pt minimum hit target (TOUCH_TARGET_MIN).
 *   - Tokens only — no raw hex (CLAUDE.md #2).
 */

export type MapToggleValue = 'list' | 'map';

type MapToggleProps = {
  /** Current view mode. Controlled component. */
  value: MapToggleValue;
  /** Called when the user picks a new view. Receives the new value. */
  onChange: (next: MapToggleValue) => void;
};

export function MapToggle({ value, onChange }: MapToggleProps) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel="View mode" className="flex-row gap-2">
      <SegmentButton
        label="List"
        selected={value === 'list'}
        onPress={() => onChange('list')}
        accessibilityHint="Shows resources in a scrollable list. Default view."
      />
      <SegmentButton
        label="Map"
        selected={value === 'map'}
        onPress={() => onChange('map')}
        accessibilityHint="Shows resources grouped by neighborhood on a map. Tap a region to filter the list."
      />
    </View>
  );
}

type SegmentButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityHint: string;
};

function SegmentButton({ label, selected, onPress, accessibilityHint }: SegmentButtonProps) {
  const bgClass = selected
    ? 'bg-light-accent dark:bg-dark-accent border-light-accent dark:border-dark-accent'
    : 'bg-light-surface dark:bg-dark-surface border-light-border-strong dark:border-dark-border-strong';
  const textClass = selected
    ? 'text-light-accent-text dark:text-dark-accent-text font-semibold'
    : 'text-light-text dark:text-dark-text font-medium';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      style={{ minHeight: TOUCH_TARGET_MIN }}
      className={`flex-1 flex-row items-center justify-center rounded-button border px-4 py-2 ${bgClass} active:opacity-80`}
    >
      <Text className={`text-sm ${textClass}`}>{label}</Text>
    </Pressable>
  );
}
