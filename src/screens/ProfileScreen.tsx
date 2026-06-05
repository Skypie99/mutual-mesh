import { useCallback, useEffect, useRef, useState } from 'react';
import { Clipboard, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { FlashBanner } from '@/components/FlashBanner';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/lib/auth';
import { deleteMyAccount, listMyClaims, listMyPosts, updateMyProfile } from '@/lib/resources';
import { userFacingErrorMessage } from '@/lib/errors';
import {
  handleFailureMessage,
  realNameWarningMessage,
  validateHandle,
} from '@/lib/handleValidator';
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
 * AC-6.1 — inline handle edit:
 *   - Tap the Handle row to reveal an inline TextField (no modal).
 *   - Validates with validateHandle() (DFS-C1.1: real-name = soft warn, not block).
 *   - Calls updateMyProfile() on save; reloads AuthContext profile on success.
 *   - Mounted-ref guard on the async save (LEARNINGS:2026-05-23).
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
 *
 * AC-6.3 — profile stats refresh on focus:
 *   - useFocusEffect reloads counts each time the Profile tab comes into focus
 *     so that a claim placed in the Feed tab is immediately reflected here without
 *     requiring the user to navigate away and back twice (full unmount cycle).
 */
export function ProfileScreen() {
  const { profile, signOut, user, reloadProfile } = useAuth();
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

  // AC-6.1 — inline handle edit state
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('');
  const [handleFieldError, setHandleFieldError] = useState<string | undefined>(undefined);
  const [handleWarning, setHandleWarning] = useState<string | undefined>(undefined);
  const [savingHandle, setSavingHandle] = useState(false);
  const [flash, setFlash] = useState<{ message: string; variant: 'success' | 'danger' } | null>(
    null,
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

  // AC-6.3 — refresh counts every time the Profile tab comes into focus so
  // that a claim placed in the Feed tab is immediately reflected here without
  // requiring the user to navigate away and back twice (full unmount cycle).
  // useFocusEffect fires on initial render AND on every subsequent focus event,
  // so this is a superset of the mount-only useEffect above. The mounted-ref
  // guard in loadCounts prevents setState on unmounted components.
  useFocusEffect(
    useCallback(() => {
      void loadCounts();
    }, [loadCounts]),
  );

  const handleErrorReportingToggle = (next: boolean) => {
    // Optimistic UI: flip the switch immediately, then persist. Persistence
    // failures are silently swallowed by setErrorReportingOptIn — at worst
    // the user sees the toggle revert on next launch.
    setErrorReportingOptInState(next);
    void setErrorReportingOptIn(next);
  };

  // ── AC-6.1: handle edit handlers ──────────────────────────────────────────

  const startEditingHandle = () => {
    setHandleDraft(profile?.handle ?? '');
    setHandleFieldError(undefined);
    setHandleWarning(undefined);
    setEditingHandle(true);
  };

  const cancelEditingHandle = () => {
    setEditingHandle(false);
    setHandleFieldError(undefined);
    setHandleWarning(undefined);
  };

  const onHandleChange = (text: string) => {
    setHandleDraft(text);
    // Clear inline error as user types so feedback is immediate.
    setHandleFieldError(undefined);
    setHandleWarning(undefined);
  };

  const saveHandle = async () => {
    const result = validateHandle(handleDraft);
    if (!result.ok) {
      setHandleFieldError(handleFailureMessage(result.reason));
      return;
    }
    if (result.warning === 'looks-like-real-name') {
      // Soft-warn per DFS-C1.1: show the message but don't block.
      // If the warning is already visible, let the second tap proceed.
      if (!handleWarning) {
        setHandleWarning(realNameWarningMessage());
        return;
      }
    }

    setSavingHandle(true);
    setHandleFieldError(undefined);
    const { error: saveErr } = await updateMyProfile({ handle: handleDraft.trim().toLowerCase() });
    if (!mountedRef.current) return;
    setSavingHandle(false);

    if (saveErr) {
      setFlash({ message: saveErr, variant: 'danger' });
    } else {
      setEditingHandle(false);
      setHandleWarning(undefined);
      // Reload profile in AuthContext so the rest of the app sees the new handle.
      await reloadProfile();
      if (!mountedRef.current) return;
      setFlash({ message: 'Handle updated!', variant: 'success' });
    }
  };

  // ── Delete account ─────────────────────────────────────────────────────────

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
            {/* Handle row — tappable to open inline edit (AC-6.1) */}
            <View>
              <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
                Handle
              </Text>
              {editingHandle ? (
                <View className="mt-2 gap-2">
                  <TextField
                    label="New handle"
                    value={handleDraft}
                    onChangeText={onHandleChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={handleFieldError}
                    hint="Lowercase letters, digits, and hyphens only."
                    returnKeyType="done"
                    onSubmitEditing={saveHandle}
                  />
                  {handleWarning && !handleFieldError && (
                    <Text
                      accessibilityLiveRegion="polite"
                      className="text-xs text-light-warning dark:text-dark-warning"
                    >
                      {handleWarning}
                    </Text>
                  )}
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        label={savingHandle ? 'Saving…' : 'Save'}
                        variant="primary"
                        disabled={savingHandle}
                        onPress={saveHandle}
                      />
                    </View>
                    <View className="flex-1">
                      <Button
                        label="Cancel"
                        variant="secondary"
                        disabled={savingHandle}
                        onPress={cancelEditingHandle}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <Button
                  label={profile?.handle ?? '—'}
                  variant="ghost"
                  onPress={startEditingHandle}
                  onLongPress={() => {
                    if (!profile?.handle) return;
                    Clipboard.setString(profile.handle);
                    setFlash({ message: 'Handle copied!', variant: 'success' });
                  }}
                  hint="Tap to edit · Long press to copy"
                />
              )}
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

      {flash && (
        <FlashBanner
          message={flash.message}
          variant={flash.variant}
          onDismiss={() => setFlash(null)}
        />
      )}

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
