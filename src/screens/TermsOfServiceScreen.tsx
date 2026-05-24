import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TERMS_OF_SERVICE_TEXT } from '@/lib/policyText';

/**
 * TermsOfServiceScreen — read-only ScrollView rendering the Terms of Service.
 *
 * Phase 4 — Will + Jordan. Mirrors PrivacyPolicyScreen exactly; text lives
 * in src/lib/policyText.ts.
 *
 * Linking: ProfileScreen should expose a "Terms of service" link to this
 * screen. That wiring is a Shamus follow-on (Will does not add nav code).
 *
 * The text starts with "NOT LEGAL ADVICE" — that disclaimer is asserted by
 * src/__tests__/policyText.test.ts to guard against accidental edits.
 */
export function TermsOfServiceScreen() {
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
          Terms of service
        </Text>
        <View>
          <Text className="text-base leading-6 text-light-text dark:text-dark-text">
            {TERMS_OF_SERVICE_TEXT}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
