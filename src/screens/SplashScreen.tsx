import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MIN_DISPLAY_MS = 400; // DFS-C1.4 — avoid flash; feels intentional.

type SplashScreenProps = {
  /** When the auth/profile load completes, parent flips this; we keep
   *  rendering until BOTH conditions hold: minimum time elapsed AND parent
   *  is ready. */
  ready: boolean;
  /** Called once `ready` is true AND `MIN_DISPLAY_MS` has elapsed. The
   *  parent uses this to advance to the next screen. */
  onDismiss?: () => void;
};

/**
 * SplashScreen — brief boot screen shown while AuthProvider hydrates the
 * session and fetches the public.users profile row.
 *
 * Design notes:
 * - Min display 400ms (DFS-C1.4) so a fast boot doesn't flash.
 * - Cap at no max — if AuthProvider's getSession hangs, we sit on this
 *   screen indefinitely rather than flashing through to SignIn with a
 *   half-loaded state. AuthProvider's `loading` flag has a `finally` that
 *   guarantees it flips off; this is belt-and-braces.
 * - `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` so
 *   screen readers announce the loading state.
 * - Respects `prefers-reduced-motion`: the ActivityIndicator on React
 *   Native already does this automatically; no extra animation here.
 */
export function SplashScreen({ ready, onDismiss }: SplashScreenProps) {
  const [minElapsed, setMinElapsed] = useState(false);
  const dismissedRef = useRef(false);

  // Min-display timer
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Dismiss exactly once when both conditions hold (mounted-ref edge detector)
  useEffect(() => {
    if (ready && minElapsed && !dismissedRef.current) {
      dismissedRef.current = true;
      onDismiss?.();
    }
  }, [ready, minElapsed, onDismiss]);

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="flex-1 items-center justify-center px-6"
      >
        <Text
          accessibilityRole="header"
          className="mb-3 text-3xl font-semibold text-light-text dark:text-dark-text"
        >
          Mutual Mesh
        </Text>
        <Text className="mb-8 text-center text-base text-light-text-secondary dark:text-dark-text-secondary">
          Loading…
        </Text>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    </SafeAreaView>
  );
}
