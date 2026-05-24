import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PRIVACY_POLICY_TEXT } from '@/lib/policyText';

/**
 * PrivacyPolicyScreen — read-only ScrollView rendering the privacy policy.
 *
 * Phase 4 — Will + Jordan. The text lives in src/lib/policyText.ts so it
 * can be unit-tested and updated without touching the screen.
 *
 * Linking: ProfileScreen should expose a "Privacy policy" link to this
 * screen. That wiring is a Shamus follow-on (Will does not add nav code).
 *
 * Accessibility:
 * - `accessibilityRole="header"` on the title so screen readers announce it
 *   as the page heading.
 * - The body Text inherits standard semantics; ScrollView is keyboard /
 *   swipe scrollable by default.
 *
 * The text starts with "NOT LEGAL ADVICE" — that disclaimer is asserted by
 * src/__tests__/policyText.test.ts to guard against accidental edits.
 */
export function PrivacyPolicyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 24 }}
      >
        <Text
          accessibilityRole="header"
          className="mb-4 text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Privacy policy
        </Text>
        <View>
          <Text className="text-base leading-6 text-light-text dark:text-dark-text">
            {PRIVACY_POLICY_TEXT}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
