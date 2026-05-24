import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

type WaitingRoomScreenProps = {
  onSignOut?: () => void | Promise<void>;
};

/**
 * Waiting Room — the screen for signed-in users whose `is_verified` is still
 * `false`. Tells them what to expect; does NOT show any marketplace data.
 *
 * PRD Flow A: "A static page instructing unverified users that their profile
 * is being manually reviewed by community admins (usually takes 24 hours).
 * No access to data is provided on this screen."
 */
export function WaitingRoomScreen({ onSignOut }: WaitingRoomScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <View className="flex-1 justify-center gap-6 px-6">
        <Text
          accessibilityRole="header"
          className="text-3xl font-semibold text-light-text dark:text-dark-text"
        >
          You&apos;re in the queue
        </Text>

        <Card>
          <Text className="text-base leading-6 text-light-text dark:text-dark-text">
            A community admin is reviewing your account. This usually takes about{' '}
            <Text className="font-semibold">24 hours</Text>. You&apos;ll get access to the
            marketplace as soon as you&apos;re approved.
          </Text>
        </Card>

        <Card>
          <Text className="mb-2 text-sm font-semibold text-light-text dark:text-dark-text">
            While you wait
          </Text>
          <Text className="text-sm leading-5 text-light-text-secondary dark:text-dark-text-secondary">
            We don&apos;t collect more from you than what&apos;s in front of you. We&apos;re not
            watching what you do here. Close the app and check back in a day.
          </Text>
        </Card>

        <View className="mt-2">
          <Button label="Sign out" variant="ghost" onPress={onSignOut} />
        </View>
      </View>
    </SafeAreaView>
  );
}
