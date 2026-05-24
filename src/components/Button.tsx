import { Pressable, Text, type PressableProps } from 'react-native';
import { TOUCH_TARGET_MIN } from '@/lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  /** Optional aria/accessibility hint for screen readers. */
  hint?: string;
};

/**
 * Button primitive — meets 44pt hit target, NativeWind tokens, four variants.
 * Pressed/disabled states via NativeWind `active:` and `disabled:` variants.
 *
 * Per DESIGN.md, the `primary` variant uses `accent` bg + `accentText` fg.
 */
export function Button({ label, variant = 'primary', disabled, hint, ...rest }: ButtonProps) {
  const variantClasses = variantToClasses(variant, !!disabled);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={{ minHeight: TOUCH_TARGET_MIN }}
      className={`flex-row items-center justify-center rounded-button px-4 py-3 ${variantClasses}`}
      {...rest}
    >
      <Text className={`text-base font-semibold ${labelClass(variant, !!disabled)}`}>{label}</Text>
    </Pressable>
  );
}

function variantToClasses(variant: ButtonVariant, disabled: boolean): string {
  if (disabled) return 'bg-light-border dark:bg-dark-border';
  switch (variant) {
    case 'primary':
      return 'bg-light-accent dark:bg-dark-accent active:opacity-80';
    case 'secondary':
      return 'border border-light-border-strong dark:border-dark-border-strong active:opacity-70';
    case 'ghost':
      return 'active:opacity-60';
    case 'danger':
      return 'bg-light-danger dark:bg-dark-danger active:opacity-80';
  }
}

function labelClass(variant: ButtonVariant, disabled: boolean): string {
  if (disabled) return 'text-light-text-muted dark:text-dark-text-muted';
  switch (variant) {
    case 'primary':
      return 'text-light-accent-text dark:text-dark-accent-text';
    case 'secondary':
      return 'text-light-text dark:text-dark-text';
    case 'ghost':
      return 'text-light-accent dark:text-dark-accent';
    case 'danger':
      return 'text-light-accent-text dark:text-dark-accent-text';
  }
}
