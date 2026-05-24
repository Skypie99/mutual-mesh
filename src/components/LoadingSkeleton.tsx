import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { motion } from '@/lib/theme';

type LoadingSkeletonProps = {
  /** Total height of the skeleton block. Default 80. */
  height?: number;
  /** Width as a percentage string ('100%') or fixed number. */
  width?: number | string;
  /** Border radius — defaults to card-shaped. */
  borderRadius?: number;
};

/**
 * LoadingSkeleton — a pulsing placeholder block.
 *
 * Pulse animation gated on `useReducedMotion`. When reduce-motion is on,
 * the skeleton stays at a fixed mid-opacity (clearly visible but not
 * animating).
 *
 * Marked `accessibilityElementsHidden` so screen readers don't enumerate
 * a dozen empty "loading" blocks. The parent container should provide
 * a single `accessibilityLabel` like "Loading listings" + role="alert".
 */
export function LoadingSkeleton({
  height = 80,
  width = '100%',
  borderRadius = 12,
}: LoadingSkeletonProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.4);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: motion.slow * 2,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: motion.slow * 2,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        width: width as number | undefined,
        opacity,
        borderRadius,
      }}
      className="bg-light-border dark:bg-dark-border"
    />
  );
}

/**
 * FeedSkeleton — three card-shaped skeletons stacked. Convenience export
 * for the HomeScreen feed loading state.
 */
export function FeedSkeleton() {
  return (
    <View accessibilityRole="alert" accessibilityLabel="Loading listings" className="gap-3 px-4">
      <LoadingSkeleton height={120} />
      <LoadingSkeleton height={120} />
      <LoadingSkeleton height={120} />
    </View>
  );
}
