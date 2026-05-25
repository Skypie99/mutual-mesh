import { forwardRef, useState } from 'react';
import { Text, TextInput, View, useColorScheme, type TextInputProps } from 'react-native';
import { TOUCH_TARGET_MIN, colors } from '@/lib/theme';

type TextFieldProps = TextInputProps & {
  /** Always-visible label. We do NOT use placeholder-as-label (a11y anti-pattern). */
  label: string;
  /** Optional helper text (rendered below). */
  hint?: string;
  /** Optional error message (rendered below in danger color). */
  error?: string;
};

/**
 * TextField primitive — always-visible label, focus state thickens border to
 * `accent`. Meets 44pt hit target. Mirrors DESIGN.md "Input" spec.
 *
 * Alex loop-8: placeholderTextColor pulled from theme tokens (was hardcoded
 * hex); multiline fields use textAlignVertical='top' on Android so caret
 * starts top-left, not center.
 *
 * forwardRef added so callers can call .focus() on the underlying TextInput
 * for a11y focus-management on error (WCAG 2.2 AA — Shamus 2026-05-25).
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const borderClass = error
    ? 'border-light-danger dark:border-dark-danger'
    : focused
      ? 'border-light-accent dark:border-dark-accent'
      : 'border-light-border-strong dark:border-dark-border-strong';

  return (
    <View className="w-full">
      <Text className="mb-1 text-sm font-semibold text-light-text dark:text-dark-text">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        style={{
          minHeight: TOUCH_TARGET_MIN,
          ...(multiline ? { textAlignVertical: 'top' as const } : {}),
        }}
        placeholderTextColor={palette.textMuted}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={`rounded-button border-2 px-3 py-2 text-base text-light-text dark:text-dark-text ${borderClass}`}
        {...rest}
      />
      {hint && !error && (
        <Text className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted">{hint}</Text>
      )}
      {error && (
        <Text
          accessibilityLiveRegion="polite"
          className="mt-1 text-xs text-light-danger dark:text-dark-danger"
        >
          {error}
        </Text>
      )}
    </View>
  );
});
