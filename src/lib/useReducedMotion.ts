import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns true if the user has enabled "Reduce Motion" in OS accessibility
 * settings (iOS: Settings → Accessibility → Motion; Android: Settings →
 * Accessibility → Remove animations; web: `prefers-reduced-motion: reduce`).
 *
 * Components MUST gate animations on this. Default behavior: skip the
 * animation when this returns true. Don't try to provide a "lighter"
 * animation — respect the explicit user signal.
 *
 * Pattern from AccessMap LEARNINGS. Subscribes on mount, unsubscribes
 * cleanly on unmount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      if (mounted) setReduced(v);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
