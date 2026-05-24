import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';

/**
 * Waiting Room — shown to signed-in users whose `is_verified` is still
 * `false` and whose profile is complete (handle no longer 'pending-').
 *
 * PRD Flow A: "A static page instructing unverified users that their
 * profile is being manually reviewed by community admins (usually takes 24
 * hours). No access to data is provided on this screen."
 *
 * Auto-route on verification:
 *   AuthProvider subscribes to the user's own public.users row via realtime
 *   (filter id=eq.auth.uid()). When `is_verified` flips true, the profile
 *   in context updates; the Gate (App.tsx) sees `is_verified=true` and
 *   routes to RootNavigator. This screen unmounts.
 *
 * Announce-once on transition:
 *   The "Welcome — loading the feed" announcement fires exactly once when
 *   `is_verified` flips false → true. Mounted-ref edge detector (AccessMap
 *   LEARNINGS pattern). We can't announce AFTER unmount, so we announce
 *   here in the effect just before the Gate routes us away.
 */
export function WaitingRoomScreen() {
  const { profile, signOut } = useAuth();
  const announcedRef = useRef(false);

  // Edge-detect false → true transition. The Gate will unmount us as soon
  // as the new profile arrives, but the announcement gets in just before.
  useEffect(() => {
    if (profile?.is_verified === true && !announcedRef.current) {
      announcedRef.current = true;
      AccessibilityInfo.announceForAccessibility("You're verified. Loading the feed.");
    }
  }, [profile?.is_verified]);

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
            marketplace as soon as you&apos;re approved — this screen will update on its own.
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

        {profile?.handle && (
          <Card>
            <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
              Signed in as
            </Text>
            <Text className="mt-1 text-base font-semibold text-light-text dark:text-dark-text">
              {profile.handle}
            </Text>
          </Card>
        )}

        <View className="mt-2">
          <Button label="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </View>
    </SafeAreaView>
  );
}
