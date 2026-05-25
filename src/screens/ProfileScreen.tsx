import { useCallback, useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuth } from '@/lib/auth';
import { deleteMyAccount, listMyClaims, listMyPosts } from '@/lib/resources';
import { userFacingErrorMessage } from '@/lib/errors';
import {
  DEFAULT_OPT_IN as ERROR_REPORTING_DEFAULT_OPT_IN,
  getErrorReportingOptIn,
  OPT_IN_STORAGE_KEY,
  setErrorReportingOptIn,
} from '@/lib/errorReporting';
import { FILTER_STORAGE_KEY } from '@/lib/categoryStorage';
import { LOCALE_OVERRIDE_KEY } from '@/lib/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-local AsyncStorage keys cleared on account deletion (AC-6.5).
 * These hold per-user device preferences with no PII. Clearing them on
 * deletion prevents state bleed if a different account is created on the
 * same device later.
 */
const DEVICE_PREF_KEYS_TO_CLEAR = [
  FILTER_STORAGE_KEY,
  OPT_IN_STORAGE_KEY,
  LOCALE_OVERRIDE_KEY,
] as const;

/**
 * ProfileScreen — wired in L28 + L29.
 *
 * Shows the user's chosen handle + postal_prefix + city, counts of posted
 * resources and active claims, plus sign-out and delete-account actions.
 *
 * Delete account (AC-6.2 / D6 + S5):
 *   - ConfirmationModal with honest disclosure distinguishing:
 *       • Uploaded photos are deleted immediately and cannot be recovered
 *         (Storage is NOT covered by Postgres PITR — migration 003).
 *       • Account / posts / claims row data may persist in Supabase Postgres
 *         PITR backups for up to 7 days.
 *   - Calls delete_my_account RPC which atomically:
 *       cascade-deletes resources + Storage photos, NULLs claims,
 *       deletes auth.users → cascades to public.users.
 *   - On success: signOut() clears the local session, then AsyncStorage
 *     multiRemove clears stale device preferences (AC-6.5).
 */
export function ProfileScreen() {
  const { profile, signOut, user } = useAuth();
  const [postedCount, setPostedCount] = useState(0);
  const [claimedCount, setClaimedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 4 #22 — anonymous error-reporting opt-in. Default OFF
  // (PRIVACY.md D8). Persisted via src/lib/errorReporting.
  const [errorReportingOptIn, setErrorReportingOptInState] = useState<boolean>(
    ERROR_REPORTING_DEFAULT_OPT_IN,
  );
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
    // Load the persisted error-reporting opt-in flag once on mount. Read
    // failures fall back to DEFAULT_OPT_IN (false) inside the helper.
    void (async () => {
      const persisted = await getErrorReportingOptIn();
      if (!mountedRef.current) return;
      setErrorReportingOptInState(persisted);
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCounts]);

  const handleErrorReportingToggle = (next: boolean) => {
    // Optimistic UI: flip the switch immediately, then persist. Persistence
    // failures are silently swallowed by setErrorReportingOptIn — at worst
    // the user sees the toggle revert on next launch.
    setErrorReportingOptInState(next);
    void setErrorReportingOptIn(next);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      const { error: err } = await deleteMyAccount();
      if (err) throw err;
      // Clear local session — the auth.users row is gone server-side.
      await signOut();
      // AC-6.5 — clear stale device preferences after account deletion so
      // they don't bleed into a future account on this device. Best-effort:
      // swallow failures so a storage hiccup doesn't trap the user.
      try {
        await AsyncStorage.multiRemove([...DEVICE_PREF_KEYS_TO_CLEAR]);
      } catch {
        // Intentionally swallowed — device prefs are hygiene, not correctness.
      }
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

        <Card>
          <View className="gap-3">
            <Text
              accessibilityRole="header"
              className="text-base font-semibold text-light-text dark:text-dark-text"
            >
              Help improve Mutual Mesh
            </Text>
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-light-text dark:text-dark-text">
                  Send anonymous error reports
                </Text>
                <Text className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  No personal data — only crash counts.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Send anonymous error reports"
                accessibilityHint="No personal data — only crash counts."
                value={errorReportingOptIn}
                onValueChange={handleErrorReportingToggle}
              />
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
          'This will permanently delete your account, posts, and claims. ' +
          'Your uploaded photos are deleted immediately and cannot be recovered. ' +
          'Account and activity records may persist in database backups for up to 7 days.'
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
