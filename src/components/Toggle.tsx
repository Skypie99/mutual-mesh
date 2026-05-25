import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { TOUCH_TARGET_MIN } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

type ToggleProps = {
  /** Current on/off state. Controlled component. */
  value: boolean;
  /** Called when the user taps to toggle. Receives the NEXT value. */
  onChange: (next: boolean) => void;
  /** Accessible label for screen readers — includes the trigger name. */
  accessibilityLabel: string;
  /** Optional hint shown by screen readers after the label. */
  accessibilityHint?: string;
  /** Disables interaction (e.g., while a write is in flight). */
  disabled?: boolean;
};

/**
 * Toggle — Switch-style preference control. Used by the Profile screen's
 * push-notification section (Phase 3.1) and the language radio group
 * (Phase 3.4 actually uses Buttons, not Toggles).
 *
 * **A11y posture (Alex pre-audit, push spec):**
 *   - `accessibilityRole="switch"` so VoiceOver/TalkBack reads "switch, on/off".
 *   - `accessibilityState={{ checked: value, disabled }}` for the same.
 *   - Reduce-motion guarded: the indicator snap-positions instead of
 *     animating when the user has reduce-motion enabled.
 *   - Touch target ≥ TOUCH_TARGET_MIN (44pt) per WCAG 2.5.5.
 *
 * Tokens only — no raw hex (CLAUDE.md #2).
 */
export function Toggle({
  value,
  onChange,
  accessibilityLabel,
  accessibilityHint,
  disabled,
}: ToggleProps) {
  const reduceMotion = useReducedMotion();
  // 0 = off, 1 = on. Animated for the marker slide; opacity stays at 1.
  const offset = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    const target = value ? 1 : 0;
    if (reduceMotion) {
      offset.setValue(target);
      return;
    }
    Animated.timing(offset, {
      toValue: target,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [offset, reduceMotion, value]);

  // Marker translates between two known positions; width is fixed so we
  // can compute the slide without measuring layout.
  const trackWidth = 48;
  const markerSize = 22;
  const padding = 2;
  const markerX = offset.interpolate({
    inputRange: [0, 1],
    outputRange: [padding, trackWidth - markerSize - padding],
  });

  const trackClass = value
    ? 'bg-light-accent dark:bg-dark-accent'
    : 'bg-light-border dark:bg-dark-border';

  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN }}
      className="items-end justify-center"
    >
      <View
        style={{ width: trackWidth, height: 26 }}
        className={`relative rounded-pill ${trackClass} ${disabled ? 'opacity-50' : ''}`}
      >
        <Animated.View
          style={{
            width: markerSize,
            height: markerSize,
            transform: [{ translateX: markerX }],
            top: padding,
          }}
          className="absolute rounded-pill bg-light-surface dark:bg-dark-surface"
        />
      </View>
    </Pressable>
  );
}
