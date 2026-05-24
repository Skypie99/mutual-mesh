import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

type ProfileScreenProps = {
  handle?: string;
  postalPrefix?: string;
  postedCount?: number;
  claimedCount?: number;
  onEditHandle?: () => void;
  onSignOut?: () => void | Promise<void>;
  onDeleteAccount?: () => void | Promise<void>;
};

/**
 * Profile screen. Shows the user's chosen handle + postal prefix, counts of
 * posted/claimed resources, and the destructive Delete account action.
 *
 * "Delete account" is the load-bearing trust action (PRIVACY.md D6). The
 * confirmation modal (Phase 0b) must say in plain language: "this deletes
 * all your posts and removes your account immediately. Supabase keeps
 * backups for up to 7 days."
 */
export function ProfileScreen({
  handle = '—',
  postalPrefix = '—',
  postedCount = 0,
  claimedCount = 0,
  onEditHandle,
  onSignOut,
  onDeleteAccount,
}: ProfileScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <View className="flex-1 gap-4 px-4 pt-4">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Your profile
        </Text>

        <Card>
          <View className="gap-3">
            <View>
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Handle
              </Text>
              <Text className="mt-1 text-lg text-light-text dark:text-dark-text">{handle}</Text>
            </View>
            <View>
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Neighborhood
              </Text>
              <Text className="mt-1 text-lg text-light-text dark:text-dark-text">
                {postalPrefix}
              </Text>
            </View>
            <Button label="Edit handle" variant="ghost" onPress={onEditHandle} />
          </View>
        </Card>

        <Card>
          <View className="flex-row gap-6">
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Posted
              </Text>
              <Text className="mt-1 text-2xl font-semibold text-light-text dark:text-dark-text">
                {postedCount}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Claimed
              </Text>
              <Text className="mt-1 text-2xl font-semibold text-light-text dark:text-dark-text">
                {claimedCount}
              </Text>
            </View>
          </View>
        </Card>

        <View className="mt-4 gap-3">
          <Button label="Sign out" variant="secondary" onPress={onSignOut} />
          <Button
            label="Delete my account"
            variant="danger"
            onPress={onDeleteAccount}
            hint="Permanently deletes your account and all your posts. This cannot be undone in-app."
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
