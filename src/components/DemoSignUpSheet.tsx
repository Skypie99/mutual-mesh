import { Modal, Pressable, Text, View } from 'react-native';
import { Button } from './Button';
import { useDemo } from '@/lib/demo/DemoContext';

/**
 * DemoSignUpSheet — "Sign up to participate" prompt shown in the guest demo
 * whenever the visitor tries a write action (Claim / Add Resource).
 *
 * Reads visibility from DemoContext (`signUpVisible`), so any surface can open
 * it by calling `promptSignUp()`. "Get an invite" leaves the demo entirely
 * (`exitDemo()` → strips `?demo=1` → Gate routes to the sign-in screen);
 * "Keep exploring" just dismisses the sheet.
 *
 * A11y (Alex handoff, Jordan condition 5 + WCAG 4.1.3):
 *   - accessibilityViewIsModal traps screen-reader focus inside.
 *   - accessibilityRole="alert" on the header announces the prompt on open.
 *   - The body is a polite live region so the explanation is read out.
 *   - Both actions are full-width 44pt Button primitives (Button enforces the
 *     TOUCH_TARGET_MIN floor).
 *   - Android back + backdrop tap both dismiss (matches ConfirmationModal).
 *
 * Mirrors ConfirmationModal's visual structure (backdrop + centered card,
 * NativeWind tokens, light/dark aware). Casey-style warm, supportive copy.
 */
export function DemoSignUpSheet() {
  const { signUpVisible, dismissSignUp, exitDemo } = useDemo();

  return (
    <Modal
      visible={signUpVisible}
      transparent
      animationType="fade"
      onRequestClose={dismissSignUp}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      {/* Backdrop — tap to dismiss */}
      <Pressable
        onPress={dismissSignUp}
        accessibilityLabel="Dismiss"
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        {/* Stop propagation so taps on the card don't dismiss */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full max-w-md rounded-card border border-light-border bg-light-surface p-5 dark:border-dark-border dark:bg-dark-surface"
        >
          <View accessibilityRole="alert">
            <Text className="text-lg font-semibold text-light-text dark:text-dark-text">
              Sign up to participate
            </Text>
          </View>

          <Text
            accessibilityLiveRegion="polite"
            className="mt-2 text-sm leading-5 text-light-text-secondary dark:text-dark-text-secondary"
          >
            You&rsquo;re browsing a demo with sample data, so everything here is just for show.
            Claiming a resource, posting your own, or messaging a neighbor all need a real account —
            that&rsquo;s how we keep the community safe and trusted. Mutual Mesh is invite-only;
            grab an invite to join for real.
          </Text>

          <View className="mt-5 gap-2">
            <Button label="Get an invite" variant="primary" onPress={exitDemo} />
            <Button label="Keep exploring" variant="ghost" onPress={dismissSignUp} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
