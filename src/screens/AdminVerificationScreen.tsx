import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  Text,
  View,
  findNodeHandle,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { EmptyState } from '@/components/EmptyState';
import { FeedSkeleton } from '@/components/LoadingSkeleton';
import { FlashBanner } from '@/components/FlashBanner';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { userFacingErrorMessage } from '@/lib/errors';
import { colors } from '@/lib/theme';
import {
  ADMIN_VIEWABLE_USER_FIELDS,
  applyVerificationDelta,
  filterQueueEligible,
  formatApplicantRow,
  formatRelativeAge,
  type AdminApplicantRow,
  type QueueEvent,
  type QueueResource,
} from '@/lib/verificationQueue';

/**
 * AdminVerificationScreen — Cycle 5 admin queue.
 *
 * Two internal states:
 *
 *   - "list"   (default): paginated queue of unverified applicants
 *   - "detail" (after tap): one applicant + Approve / Reject actions
 *
 * Spec source of truth: qa-reports/spec-cycle-5-admin-verification-ui.md.
 *
 * Privacy:
 *   - The SELECT column list (ADMIN_VIEWABLE_USER_FIELDS) is load-bearing.
 *     Quinn DFS-1 default = NO email. Changing the list requires Jordan + Sky.
 *   - Realtime channel name is `admin-verification-queue` — deliberately
 *     generic, never per-applicant (Section 9 Jordan note #5).
 *
 * Three-layer enforcement (mirrors CLAUDE.md gotcha #8):
 *   - UI:   only callers with profile.is_admin === true reach this screen
 *           (RootNavigator hides the tab).
 *   - RLS:  `users_admin_read_unverified` policy returns zero rows to
 *           non-admins regardless of UI bypass.
 *   - RPC:  `approve_user` / `reject_user` raise 'Forbidden' on non-admin
 *           callers regardless of UI / RLS bypass.
 */

const REJECT_REASON_MAX = 280;
const REALTIME_CHANNEL = 'admin-verification-queue';

type ScreenState = { mode: 'list' } | { mode: 'detail'; applicant: AdminApplicantRow };

type FlashState = { message: string; variant: 'success' | 'danger' } | null;

export function AdminVerificationScreen() {
  const { profile } = useAuth();
  const scheme = useColorScheme();
  const accent = scheme === 'dark' ? colors.dark.accent : colors.light.accent;

  const [applicants, setApplicants] = useState<AdminApplicantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [screen, setScreen] = useState<ScreenState>({ mode: 'list' });

  const mountedRef = useRef(true);

  // ─────────────────────────────────────────────────────────────────────────
  // Initial fetch + reload
  // ─────────────────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('users')
      .select(ADMIN_VIEWABLE_USER_FIELDS.join(', '))
      .eq('is_verified', false)
      .not('handle', 'ilike', 'pending-%')
      .order('created_at', { ascending: true })
      .limit(500);

    if (!mountedRef.current) return;
    if (err) {
      setError(userFacingErrorMessage(err, "Couldn't load the queue. Pull to refresh."));
      setApplicants([]);
    } else {
      // Defensive filter — drop any pending-* rows that slipped past the query.
      // The runtime shape matches AdminApplicantRow because the SELECT column
      // list is the same; postgrest-js can't infer that from a joined string,
      // so we cast through unknown.
      const rows = (data as unknown as AdminApplicantRow[] | null) ?? [];
      setApplicants(filterQueueEligible(rows));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchQueue();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchQueue]);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime subscription (Section 9 Jordan note #5 — generic channel name)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(REALTIME_CHANNEL)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        if (!mountedRef.current) return;
        const event = payload as unknown as QueueEvent<QueueResource>;

        // Snapshot whether THIS admin had already removed the row locally
        // (optimistic removal in approve/reject). If yes, the realtime event
        // is just echoing back our own action — don't announce "another
        // admin handled this".
        const affectedId = event.type === 'DELETE' ? event.old.id : event.new.id;
        let weAlreadyRemovedIt = true;
        setApplicants((current) => {
          weAlreadyRemovedIt = !current.some((r) => r.id === affectedId);
          const merged = applyVerificationDelta(current as QueueResource[], event);
          return merged as AdminApplicantRow[];
        });

        // Announce only when ANOTHER admin removed a row we still had.
        const rowLeftQueue =
          event.type === 'DELETE' || (event.type === 'UPDATE' && event.new?.is_verified === true);
        if (rowLeftQueue && !weAlreadyRemovedIt) {
          AccessibilityInfo.announceForAccessibility(
            'An applicant was handled by another admin and removed from the list.',
          );
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Pull-to-refresh
  // ─────────────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchQueue();
    if (mountedRef.current) setRefreshing(false);
  }, [fetchQueue]);

  // ─────────────────────────────────────────────────────────────────────────
  // Optimistic removal helper — called from approve/reject success paths
  // ─────────────────────────────────────────────────────────────────────────
  const removeLocally = useCallback((id: string) => {
    setApplicants((current) => current.filter((row) => row.id !== id));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  // Defense in depth: if a non-admin somehow renders this screen, render an
  // empty-but-safe state. The real gate is in RootNavigator + DB RLS.
  if (!profile?.is_admin) {
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-light-text-muted dark:text-dark-text-muted">
            Admin access is required.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen.mode === 'detail') {
    // Detect "another admin handled this" by id-presence
    const stillInQueue = applicants.some((row) => row.id === screen.applicant.id);
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        {flash && (
          <FlashBanner
            message={flash.message}
            variant={flash.variant}
            onDismiss={() => setFlash(null)}
          />
        )}
        <ApplicantDetail
          applicant={screen.applicant}
          stillInQueue={stillInQueue}
          onBack={() => setScreen({ mode: 'list' })}
          onApproved={(id, handle) => {
            removeLocally(id);
            setFlash({ message: `Approved ${handle}.`, variant: 'success' });
            setScreen({ mode: 'list' });
          }}
          onRejected={(id) => {
            removeLocally(id);
            setFlash({ message: 'Rejected. Account deleted.', variant: 'success' });
            setScreen({ mode: 'list' });
          }}
          onError={(msg) => setFlash({ message: msg, variant: 'danger' })}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      {flash && (
        <FlashBanner
          message={flash.message}
          variant={flash.variant}
          onDismiss={() => setFlash(null)}
        />
      )}
      <View className="flex-1 px-4 pt-4">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Verify
        </Text>
        {applicants.length > 0 && (
          <Text
            accessibilityLiveRegion="polite"
            className="mb-3 mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary"
          >
            {applicants.length} {applicants.length === 1 ? 'person' : 'people'} waiting
          </Text>
        )}

        {loading && applicants.length === 0 ? (
          <FeedSkeleton />
        ) : error && applicants.length === 0 ? (
          <EmptyState
            title="Couldn't load the queue"
            description={error}
            ctaLabel="Try again"
            onCta={() => void fetchQueue()}
          />
        ) : applicants.length === 0 ? (
          <View accessibilityLiveRegion="polite" className="flex-1">
            <EmptyState
              title="No one is waiting."
              description="When a new person signs up, they'll appear here for you to verify."
            />
          </View>
        ) : (
          <FlatList
            data={applicants}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={Separator}
            renderItem={({ item }) => (
              <ApplicantCard
                applicant={item}
                onPress={() => setScreen({ mode: 'detail', applicant: item })}
              />
            )}
            contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={accent}
                accessibilityLabel="Pull to refresh the queue"
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// Queue list — Card per applicant
// ============================================================================

function Separator() {
  return <View className="h-3" />;
}

type ApplicantCardProps = {
  applicant: AdminApplicantRow;
  onPress: () => void;
};

function ApplicantCard({ applicant, onPress }: ApplicantCardProps) {
  const f = useMemo(() => formatApplicantRow(applicant), [applicant]);
  const age = formatRelativeAge(f.createdAt);
  const a11yLabel = `${f.handle}, ${f.postalPrefix}, ${f.city}, signed up ${age}. Tap to open.`;

  return (
    <Card onPress={onPress} accessibilityLabel={a11yLabel}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-light-text dark:text-dark-text">
            {f.handle}
          </Text>
          <Text className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            {f.postalPrefix} · {f.city} · {f.referredByLabel}
          </Text>
          <Text className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted">
            Signed up {age}
          </Text>
        </View>
        <Text
          accessibilityElementsHidden
          className="text-base text-light-text-muted dark:text-dark-text-muted"
        >
          →
        </Text>
      </View>
    </Card>
  );
}

// ============================================================================
// Detail view — Approve / Reject
// ============================================================================

type ApplicantDetailProps = {
  applicant: AdminApplicantRow;
  /** False once a co-admin has handled this row mid-detail-view. */
  stillInQueue: boolean;
  onBack: () => void;
  onApproved: (id: string, handle: string) => void;
  onRejected: (id: string) => void;
  onError: (message: string) => void;
};

function ApplicantDetail({
  applicant,
  stillInQueue,
  onBack,
  onApproved,
  onRejected,
  onError,
}: ApplicantDetailProps) {
  const f = useMemo(() => formatApplicantRow(applicant), [applicant]);
  const age = formatRelativeAge(f.createdAt);

  const [approveModal, setApproveModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectFormOpen, setRejectFormOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  const detailHeaderRef = useRef<Text>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // FIX 1 (BLOCKER) — WCAG 2.4.3: move screen-reader focus to the detail
  // header when this view mounts so VoiceOver/TalkBack announces the applicant
  // handle instead of leaving focus on the now-gone list card.
  useEffect(() => {
    const node = findNodeHandle(detailHeaderRef.current);
    if (node) {
      AccessibilityInfo.setAccessibilityFocus(node);
    }
  }, []);

  const handleApprove = async () => {
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc('approve_user', {
        applicant_id: applicant.id,
      });
      if (err) throw err;
      if (!mountedRef.current) return;
      setApproveModal(false);
      onApproved(applicant.id, applicant.handle);
    } catch (err) {
      if (!mountedRef.current) return;
      setApproveModal(false);
      onError(userFacingErrorMessage(err, "Couldn't approve. Please try again."));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleReject = async () => {
    const trimmed = reason.trim();
    if (trimmed.length === 0) return; // disabled state should prevent this
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc('reject_user', {
        applicant_id: applicant.id,
        reason: trimmed.slice(0, REJECT_REASON_MAX),
      });
      if (err) throw err;
      if (!mountedRef.current) return;
      setRejectModal(false);
      onRejected(applicant.id);
    } catch (err) {
      if (!mountedRef.current) return;
      setRejectModal(false);
      onError(userFacingErrorMessage(err, "Couldn't reject. Please try again."));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // Co-admin already handled this row — show stub
  if (!stillInQueue) {
    return (
      <View className="flex-1 px-4 pt-4">
        <Text
          accessibilityRole="header"
          className="mb-2 text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Verify
        </Text>
        <Card>
          <Text accessibilityRole="alert" className="text-base text-light-text dark:text-dark-text">
            Another admin handled this person.
          </Text>
          <Text className="mt-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            The queue has been updated.
          </Text>
        </Card>
        <View className="mt-4">
          <Button label="Back to queue" onPress={onBack} variant="primary" />
        </View>
      </View>
    );
  }

  const reasonValid = reason.trim().length >= 1;
  const reasonCounter = `${reason.length}/${REJECT_REASON_MAX}`;

  return (
    <View className="flex-1 px-4 pt-4">
      <Button label="← Back" variant="ghost" onPress={onBack} hint="Returns to the queue list." />
      <Text
        ref={detailHeaderRef}
        accessibilityRole="header"
        className="mt-3 text-2xl font-semibold text-light-text dark:text-dark-text"
      >
        {f.handle}
      </Text>

      <Card>
        <DetailRow label="Postal prefix" value={f.postalPrefix} />
        <DetailRow label="City" value={f.city} />
        <DetailRow label="Invite status" value={f.referredByLabel} />
        <DetailRow label="Signed up" value={age} />
        <DetailRow label="Referred by" value="(anonymous)" />
      </Card>

      {!rejectFormOpen ? (
        <View className="mt-4 gap-3">
          <Button
            label="Approve"
            accessibilityLabel={`Approve ${f.handle}`}
            variant="primary"
            disabled={busy}
            onPress={() => setApproveModal(true)}
            hint="Approves this person. They will be able to use the marketplace."
          />
          <Button
            label="Reject"
            accessibilityLabel={`Reject ${f.handle}`}
            variant="danger"
            disabled={busy}
            onPress={() => setRejectFormOpen(true)}
            hint="Rejects this person. Their account will be deleted."
          />
        </View>
      ) : (
        <View className="mt-4 gap-3">
          <Text
            accessibilityRole="header"
            className="text-base font-semibold text-light-text dark:text-dark-text"
          >
            Reject this person
          </Text>
          <TextField
            label="Reason (required)"
            value={reason}
            onChangeText={(v) => setReason(v.slice(0, REJECT_REASON_MAX))}
            multiline
            numberOfLines={3}
            maxLength={REJECT_REASON_MAX}
            hint={reasonCounter}
            accessibilityHint="Required. Stored in the audit log; not shown to the applicant."
          />
          {/* FIX 4 — screen-reader-only live region so VoiceOver/TalkBack
              announces the running character count on each keystroke.
              The visual counter is rendered inside TextField via the hint prop. */}
          <Text
            accessibilityLiveRegion="polite"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}
          >
            {reasonCounter}
          </Text>
          <Text
            accessibilityRole="alert"
            className="text-xs text-light-text-secondary dark:text-dark-text-secondary"
          >
            This will permanently delete the account. The person will not be told the reason.
          </Text>
          <View className="gap-2">
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setRejectFormOpen(false);
                setReason('');
              }}
            />
            <Button
              label="Reject"
              variant="danger"
              disabled={!reasonValid}
              onPress={() => setRejectModal(true)}
              hint="Opens a final confirmation before deleting the account."
            />
          </View>
        </View>
      )}

      <ConfirmationModal
        visible={approveModal}
        title="Approve this person?"
        body="They will gain access to the marketplace."
        confirmLabel="Yes, approve"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={handleApprove}
        onCancel={() => setApproveModal(false)}
      />

      <ConfirmationModal
        visible={rejectModal}
        title="Reject and delete?"
        body="This permanently deletes the account. The 7-day Supabase backup window is the only recovery path."
        confirmLabel="Yes, reject"
        cancelLabel="Cancel"
        destructive
        busy={busy}
        onConfirm={handleReject}
        onCancel={() => setRejectModal(false)}
      />
    </View>
  );
}

type DetailRowProps = { label: string; value: string };

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      className="flex-row justify-between gap-3 py-1"
    >
      <Text className="text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
        {label}
      </Text>
      <Text className="text-base text-light-text dark:text-dark-text">{value}</Text>
    </View>
  );
}
