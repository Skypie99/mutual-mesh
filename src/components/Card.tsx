import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';
import { TOUCH_TARGET_MIN } from '@/lib/theme';

type CardProps = ViewProps & {
  /** If provided, the card becomes pressable. */
  onPress?: PressableProps['onPress'];
  /** Accessibility label when onPress is set. */
  accessibilityLabel?: string;
};

/**
 * Card primitive — `surface` bg, `border` 1pt edge, 12pt corner radius, 16pt
 * padding. Pressable when onPress is supplied.
 *
 * Pressable cards enforce minimum 44pt height (Alex loop-8: WCAG 2.5.5 hit
 * target). Non-pressable cards have no minimum since they're not targets.
 */
export function Card({ children, onPress, accessibilityLabel, ...rest }: CardProps) {
  const base =
    'rounded-card border border-light-border bg-light-surface p-4 dark:border-dark-border dark:bg-dark-surface';
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={{ minHeight: TOUCH_TARGET_MIN }}
        className={`${base} active:opacity-70`}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View className={base} {...rest}>
      {children}
    </View>
  );
}
