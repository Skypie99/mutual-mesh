import { Pressable, Text } from 'react-native';
import { TOUCH_TARGET_MIN } from '@/lib/theme';

/**
 * CategoryChip — small selectable chip used in two places:
 *
 *   1. AddResourceScreen — radio-style single-select picker (one chip
 *      selected at a time). Caller passes `accessibilityRole="radio"` via
 *      the `chipRole` prop and wraps the row in `accessibilityRole="radiogroup"`.
 *   2. HomeScreen filter row — toggle-style multi-select. Caller leaves
 *      `chipRole` undefined (default 'button').
 *
 * Visual states are token-only (NativeWind classes); selected fills with the
 * accent color and unselected uses a bordered surface. Alex audited the
 * contrast for the existing accent / surface tokens — keep this aligned with
 * Button primary variant.
 *
 * Per Quinn spec AC-3 + AC-4 + Alex pre-audit notes:
 *  - 44pt minimum hit target (TOUCH_TARGET_MIN).
 *  - Selected state communicated via BOTH color AND text weight + checkmark
 *    glyph so we don't rely on color alone (WCAG 1.4.1).
 *  - accessibilityState={{ selected }} for SR readers.
 *
 * Pure presentational — no AsyncStorage, no Supabase. Selection state is
 * owned by the parent.
 */

export type CategoryChipRole = 'radio' | 'button';

type CategoryChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * 'radio' for the single-select AddResource picker (semantically a radio
   * inside an enclosing radiogroup). 'button' (default) for the multi-select
   * HomeScreen filter row.
   */
  chipRole?: CategoryChipRole;
  /** Optional screen-reader hint explaining the action. */
  hint?: string;
};

export function CategoryChip({
  label,
  selected,
  onPress,
  chipRole = 'button',
  hint,
}: CategoryChipProps) {
  const bgClass = selected
    ? 'bg-light-accent dark:bg-dark-accent border-light-accent dark:border-dark-accent'
    : 'bg-light-surface dark:bg-dark-surface border-light-border-strong dark:border-dark-border-strong';
  const textClass = selected
    ? 'text-light-accent-text dark:text-dark-accent-text font-semibold'
    : 'text-light-text dark:text-dark-text font-medium';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={chipRole}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      style={{ minHeight: TOUCH_TARGET_MIN }}
      className={`flex-row items-center justify-center rounded-full border-2 px-4 py-2 ${bgClass} active:opacity-80`}
    >
      {selected && (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={`mr-1 text-sm ${textClass}`}
        >
          {'✓'}
        </Text>
      )}
      <Text className={`text-sm ${textClass}`}>{label}</Text>
    </Pressable>
  );
}
