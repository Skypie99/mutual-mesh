import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuth } from '@/lib/auth';
import { deleteMyAccount, listMyClaims, listMyPosts } from '@/lib/resources';
import { userFacingErrorMessage } from '@/lib/errors';

/**
 * ProfileScreen — wired in L28 + L29.
 *
 * Shows the user's chosen handle + postal_prefix + city, counts of posted
 * resources and active claims, plus sign-out and delete-account actions.
 *
 * Delete account (D6 + S5):
 *   - ConfirmationModal with HONEST backup disclosure (Supabase keeps
 *     point-in-time-recovery for 7 days; we cannot scrub backups)
 *   - calls delete_my_account RPC which atomically:
 *       cascade-deletes resources, NULLs claims, deletes auth.users
 *   - on success, signOut() runs to clear the local session
 */
export function ProfileScreen() {
  const { profile, signOut, user } = useAuth();
  const [postedCount, setPostedCount] = useState(0);
  const [claimedCount, setClaimedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadCounts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const [posts, claims] = await Promise.all([listMyPosts(user.id), listMyClaims(user.id)]);
    if (!mountedRef.current) return;
    setPostedCount(posts.data?.length ?? 0);
    setClaimedCount(claims.data?.length ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCounts();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCounts]);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      const { error: err } = await deleteMyAccount();
      if (err) throw err;
      // Clear local session — the auth.users row is gone server-side.
      await signOut();
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not delete your account.'));
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
    }
  };

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
              <Text className="mt-1 text-lg text-light-text dark:text-dark-text">
                {profile?.handle ?? '—'}
              </Text>
            </View>
            <View>
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Neighborhood
              </Text>
              <Text className="mt-1 text-lg text-light-text dark:text-dark-text">
                {profile?.postal_prefix ?? '—'}
              </Text>
            </View>
            <View>
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                City
              </Text>
              <Text className="mt-1 text-lg text-light-text dark:text-dark-text">
                {profile?.city ?? '—'}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <View className="flex-row gap-6">
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Posted
              </Text>
              <Text className="mt-1 text-2xl font-semibold text-light-text dark:text-dark-text">
                {loading ? '…' : postedCount}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Active claims
              </Text>
              <Text className="mt-1 text-2xl font-semibold text-light-text dark:text-dark-text">
                {loading ? '…' : claimedCount}
              </Text>
            </View>
          </View>
        </Card>

        {error && (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        <View className="mt-4 gap-3">
          <Button label="Sign out" variant="secondary" onPress={signOut} />
          <Button
            label="Delete my account"
            variant="danger"
            onPress={() => setDeleteModalOpen(true)}
            hint="Permanently deletes your account, posts, and active claims."
          />
        </View>
      </View>

      <ConfirmationModal
        visible={deleteModalOpen}
        title="Delete your account?"
        body={
          'This removes your account, your posts, and your claims from Mutual Mesh immediately. ' +
          'Honest disclosure: Supabase keeps automatic backups for ~7 days, so the data is technically ' +
          "recoverable from a backup during that window. We cannot scrub backups — that's a platform limit. " +
          'You can sign up again with the same email later if you want.'
        }
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        destructive
        busy={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModalOpen(false)}
      />
    </SafeAreaView>
  );
}
