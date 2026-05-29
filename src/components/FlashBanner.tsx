import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text } from 'react-native';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { motion } from '@/lib/theme';

export type FlashVariant = 'success' | 'warning' | 'danger' | 'info';

type FlashBannerProps = {
  message: string;
  variant?: FlashVariant;
  /** Auto-dismiss after this many ms. 0 = no auto-dismiss. Default 4000. */
  autoDismissMs?: number;
  /** Callback when banner dismisses (auto or tap). */
  onDismiss?: () => void;
};

/**
 * FlashBanner — top-anchored notification.
 *
 * Per AccessMap LEARNINGS, announces via `AccessibilityInfo.announceForAccessibility`
 * exactly once per appearance (mounted-ref edge-detector). NOT on every render.
 *
 * Animation gated on `useReducedMotion`: if reduce-motion is enabled, the
 * banner appears instantly rather than sliding in.
 */
export function FlashBanner({
  message,
  variant = 'info',
  autoDismissMs = 4000,
  onDismiss,
}: FlashBannerProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const announcedRef = useRef(false);

  useEffect(() => {
    // Announce exactly once on mount (edge-detection — not every render).
    if (!announcedRef.current) {
      AccessibilityInfo.announceForAccessibility(message);
      announcedRef.current = true;
    }

    if (!reducedMotion) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.base,
        useNativeDriver: true,
      }).start();
    }

    if (autoDismissMs > 0) {
      const timeout = setTimeout(() => {
        if (!reducedMotion) {
          Animated.timing(opacity, {
            toValue: 0,
            duration: motion.fast,
            useNativeDriver: true,
          }).start(() => onDismiss?.());
        } else {
          onDismiss?.();
        }
      }, autoDismissMs);
      return () => clearTimeout(timeout);
    }
  }, [message, autoDismissMs, opacity, reducedMotion, onDismiss]);

  return (
    <Animated.View
      accessibilityRole="alert"
      style={{ opacity }}
      className={`absolute left-4 right-4 top-12 z-50 rounded-card border p-3 ${variantClasses(variant)}`}
    >
      <Pressable onPress={() => onDismiss?.()} accessibilityLabel="Dismiss notification">
        <Text className={`text-sm font-semibold ${variantTextClasses(variant)}`}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

function variantClasses(v: FlashVariant): string {
  switch (v) {
    case 'success':
      return 'border-light-success bg-light-success dark:border-dark-success dark:bg-dark-success';
    case 'warning':
      return 'border-light-warning bg-light-warning dark:border-dark-warning dark:bg-dark-warning';
    case 'danger':
      return 'border-light-danger bg-light-danger dark:border-dark-danger dark:bg-dark-danger';
    case 'info':
      return 'border-light-accent bg-light-accent dark:border-dark-accent dark:bg-dark-accent';
  }
}

function variantTextClasses(v: FlashVariant): string {
  // Light mode: all dark-coloured banner backgrounds → white text passes 4.5:1 AA. ✓
  // Dark mode: all four variants use bright/pastel banner backgrounds where white text
  // only achieves ~2.1–2.9:1. Switch to dark-mode text (#1A1916, light.text token)
  // which achieves ≥5.6:1 on every dark-mode banner background. WCAG 1.4.3 AA fix.
  // (Alex, 2026-05-25 — qa-reports/2026-05-25-alex-flashbanner-contrast.md)
  void v;
  return 'text-white dark:text-light-text';
}
