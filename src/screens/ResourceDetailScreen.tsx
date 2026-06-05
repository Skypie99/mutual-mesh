import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { StatusPill } from '@/components/StatusPill';
import { getClaimantHandle, getResourceDetail } from '@/lib/resources';
import { supabase } from '@/lib/supabase';
import { createSignedResourcePhotoUrl } from '@/lib/photos';
import { userFacingErrorMessage } from '@/lib/errors';
import { radii } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { useDemo } from '@/lib/demo/DemoContext';
import { findDemoResource } from '@/lib/demo/fixtures';
import type { ResourceRow } from '@/types/database';

type ResourceDetailScreenProps = {
  /** Passed from RootNavigator via route.params.resourceId. */
  resourceId?: string;
  /** Optional navigation callback to go back to feed. Used on race-condition error. */
  onNavigateBack?: () => void;
};

/**
 * ResourceDetailScreen — fetches via the get_resource_detail SECURITY DEFINER
 * RPC, renders all resource fields, and handles the atomic claim flow.
 *
 * === Privacy (Jordan Conditions B + C) ===
 *
 * Condition B: contact_handle is typed string | null throughout. The RPC
 * returns NULL unless the caller is the poster or claimant — server-enforced,
 * not just a render gate. We show the handle section ONLY when non-null.
 *
 * Condition C: ConfirmationModal body contains NO "they'll see your handle"
 * copy. Casey fixed this in 5 files (2026-05-25). Scan of src/ confirmed
 * no remaining hardcoded instances. ConfirmationModal is a generic component
 * whose body prop comes from here — the copy below is the source of truth.
 *
 * === Claim flow ===
 *
 * 1. User taps "Claim this resource" (Riley P4: label must be full phrase,
 *    not bare "Claim") → ConfirmationModal opens with 2-sentence body.
 * 2. Confirm → call claim_resource RPC (atomic row-lock per PRD §3 + S5).
 * 3. On success: refetch via getResourceDetail — handle is now visible.
 * 4. Race condition ("already claimed"): plain English, route to feed.
 *
 * === Riley UX research key findings ===
 *
 * F1: Claim button label = "Claim this resource" (not bare "Claim")
 * F2: Handle reveal = plain inline text, no celebratory animation
 * F3: Post-RPC state = "Reserving…" during in-flight
 * F4: Race condition = name the outcome, never say "try again"
 * Status badge = visually dominant (large, top area)
 *
 * === Mounted-ref pattern ===
 *
 * Every await → setState checks mountedRef.current (CLAUDE.md gotcha #5).
 * useFocusEffect drives fetch so navigation-back-and-return refreshes the
 * screen (same pattern as ProfileScreen).
 */
export function ResourceDetailScreen({ resourceId, onNavigateBack }: ResourceDetailScreenProps) {
  const { user } = useAuth();
  const { isDemo, promptSignUp } = useDemo();
  const [resource, setResource] = useState<ResourceRow | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimantHandle, setClaimantHandle] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Fetch (and refetch) the resource via the privacy-safe RPC.
  // useFocusEffect re-runs on every screen focus so returning from
  // another screen picks up any status changes.
  const fetchResource = useCallback(async () => {
    if (!resourceId) {
      if (mountedRef.current) {
        setError('Missing resource id.');
        setLoading(false);
      }
      return;
    }

    // DEMO MODE (WEB-4): resolve from bundled synthetic fixtures — NO RPC, NO
    // network. The fixture's contact_handle is already null (no handle reveal)
    // and photo_url is already null (no Storage signed-URL call). Jordan gate
    // conditions 1 + 2.
    if (isDemo) {
      const demoRow = findDemoResource(resourceId);
      if (!mountedRef.current) return;
      setResource(demoRow);
      setPhotoUrl(null);
      setLoading(false);
      setError(demoRow ? null : 'Resource not found.');
      return;
    }

    const { data, error: err } = await getResourceDetail(resourceId);
    if (!mountedRef.current) return;

    if (err) {
      setError(userFacingErrorMessage(err, 'Could not load this resource.'));
      setLoading(false);
      return;
    }

    setResource(data);
    setLoading(false);
    setError(null);

    // Refresh the signed URL whenever we (re)fetch the resource.
    // photo_url is a Storage path; generate 1h signed URL (S4).
    if (data?.photo_url) {
      const signed = await createSignedResourcePhotoUrl(data.photo_url);
      if (mountedRef.current) setPhotoUrl(signed);
    } else {
      if (mountedRef.current) setPhotoUrl(null);
    }
  }, [resourceId, isDemo]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      setLoading(true);
      void fetchResource();
      return () => {
        mountedRef.current = false;
      };
    }, [fetchResource]),
  );

  // Fetch claimant handle when the poster views a reserved resource.
  // Only runs when: status is 'reserved', current user is the poster, and
  // claimed_by is set. RLS (users_verified_read_others) permits this read
  // because the claimant is verified (gate-enforced) and so is the poster.
  // Distinct from contact_handle — this is the claimant's own profile handle.
  useEffect(() => {
    if (
      resource?.status !== 'reserved' ||
      !resource.claimed_by ||
      !user ||
      resource.posted_by !== user.id
    ) {
      setClaimantHandle(null);
      return;
    }
    const claimantId = resource.claimed_by;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await getClaimantHandle(claimantId);
      if (cancelled || !mountedRef.current) return;
      if (err) {
        console.warn('[ResourceDetail] getClaimantHandle failed:', err.message);
        setClaimantHandle(null);
        return;
      }
      setClaimantHandle(data?.handle ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [resource?.status, resource?.claimed_by, resource?.posted_by, user]);

  // Tapping "Claim this resource". In demo this is a read-only no-op that opens
  // the sign-up sheet (Jordan condition 3 — never execute claim_resource). In
  // the real app it opens the claim confirmation modal as before.
  const handleClaimPress = () => {
    if (isDemo) {
      promptSignUp();
      return;
    }
    setClaimModalOpen(true);
  };

  const handleClaimConfirm = async () => {
    if (!resourceId) return;
    setClaiming(true);

    try {
      const { error: rpcError } = await supabase.rpc('claim_resource', {
        resource_id: resourceId,
      });

      if (rpcError) throw rpcError;

      setClaimModalOpen(false);

      // Refetch so the handle reveal appears immediately on success.
      await fetchResource();
    } catch (err: unknown) {
      setClaimModalOpen(false);

      const msg = err instanceof Error ? err.message : String(err);
      const isRaceCondition =
        msg.toLowerCase().includes('already claimed') ||
        msg.toLowerCase().includes('already reserved');

      if (isRaceCondition) {
        // Riley F4: name the outcome in plain English; never say "try again".
        // Route back to feed so the user can find something else.
        const raceMsg = "Someone else just claimed this. It's no longer available.";
        setError(raceMsg);
        AccessibilityInfo.announceForAccessibility(raceMsg);
        // Give the user a moment to read the error before navigating back.
        if (onNavigateBack) {
          setTimeout(() => {
            if (mountedRef.current) onNavigateBack();
          }, 2500);
        }
      } else {
        const friendlyMsg = userFacingErrorMessage(err, 'Could not claim this resource.');
        setError(friendlyMsg);
        AccessibilityInfo.announceForAccessibility(friendlyMsg);
      }
    } finally {
      if (mountedRef.current) setClaiming(false);
    }
  };

  const handleCopyHandle = async (handle: string) => {
    // Use Share as the fallback — @react-native-clipboard/clipboard is
    // not in the current package.json. Share works on both iOS + Android.
    try {
      await Share.share({ message: handle });
    } catch {
      // Share dismissed or not supported — no-op.
    }
  };

  // ─── Derived render flags ────────────────────────────────────────────────

  const isMyPost = !!user && resource?.posted_by === user.id;

  /**
   * Show "Claim this resource" when:
   *   - resource is available
   *   - current user did NOT post it (can't self-claim; RPC also enforces)
   *
   * Riley F1: button label must be "Claim this resource" not bare "Claim".
   *
   * DEMO MODE (WEB-4): there is no signed-in user, so show the claim CTA for any
   * available resource. Tapping it is intercepted into the "Sign up to
   * participate" sheet (handleClaimPress) rather than executing a claim — the
   * demo is strictly read-only. Jordan gate condition 3.
   */
  const canClaim = resource?.status === 'available' && (isDemo || (!!user && !isMyPost));

  /**
   * Show the contact handle section when contact_handle is non-null.
   *
   * Jordan Condition B: contact_handle is string | null. The RPC guarantees
   * non-null ONLY for the poster or claimant — so non-null here means the
   * caller is authorised. No additional claim-status check needed on the
   * client; the server already enforced it.
   *
   * Riley F2: handle reveal is inline, plain text, no animation.
   */
  const showContactHandle = resource?.contact_handle != null;
  // Show claimant's profile handle ONLY to the poster when reserved.
  // Jordan-approved: handle only, no other PII. (2026-05-25-jordan-admin-tab-ack.md)
  const showsClaimantHandle =
    isMyPost && resource?.status === 'reserved' && claimantHandle !== null;

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        <View className="flex-1 items-center justify-center px-6">
          <Text
            accessibilityLiveRegion="polite"
            className="text-base text-light-text-muted dark:text-dark-text-muted"
          >
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Not found / error ───────────────────────────────────────────────────

  if (!resource) {
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-light-text-muted dark:text-dark-text-muted">
            {error ?? 'Resource not found.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Full detail view ────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Photo — only when available */}
        {photoUrl && (
          <Image
            source={{ uri: photoUrl }}
            accessibilityLabel={`Photo of ${resource.name}`}
            style={{ width: '100%', aspectRatio: 1.5, borderRadius: radii.card }}
            resizeMode="cover"
          />
        )}

        {/* Title + status badge (visually dominant per Riley) */}
        <View>
          <Text
            accessibilityRole="header"
            className="text-2xl font-semibold text-light-text dark:text-dark-text"
          >
            {resource.name}
          </Text>

          {/* Status badge — load-bearing, shown immediately below name */}
          <View className="mt-3 flex-row items-center gap-2">
            <StatusPill status={resource.status} />
            {resource.category && resource.category !== 'other' && (
              <Text className="text-xs capitalize text-light-text-muted dark:text-dark-text-muted">
                {resource.category}
              </Text>
            )}
          </View>

          {/* Pickup area */}
          {(resource.postal_prefix ?? resource.city) && (
            <Text className="mt-2 text-sm text-light-text-muted dark:text-dark-text-muted">
              {[resource.postal_prefix, resource.city].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>

        {/* Description */}
        {resource.description && (
          <Card>
            <Text className="mb-1 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
              Description
            </Text>
            <Text className="text-base leading-6 text-light-text dark:text-dark-text">
              {resource.description}
            </Text>
          </Card>
        )}

        {/* Pickup details */}
        <Card>
          <Text className="mb-1 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
            Pickup
          </Text>
          <Text className="text-base leading-6 text-light-text dark:text-dark-text">
            {resource.pickup_text}
          </Text>
        </Card>

        {/*
          Contact handle — ONLY shown when contact_handle is non-null.

          Jordan Condition B: this check is the client-side expression of the
          server-side privacy gate. contact_handle is null when the caller is
          not the poster or claimant (enforced by get_resource_detail RPC).

          Riley F2: plain inline text, long-press to copy, no animation.
          No celebration, no confetti. Functional and clear.
        */}
        {showContactHandle && (
          <Card>
            <Text className="mb-2 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
              Contact handle
            </Text>
            <Pressable
              onLongPress={() => void handleCopyHandle(resource.contact_handle!)}
              accessibilityLabel={`Contact handle: ${resource.contact_handle}`}
              accessibilityHint="Long press to copy this handle"
            >
              <Text className="text-lg font-semibold text-light-text dark:text-dark-text">
                {resource.contact_handle}
              </Text>
            </Pressable>
            <Text className="mt-2 text-sm leading-5 text-light-text-muted dark:text-dark-text-muted">
              Contact them to arrange pickup. Pickup happens off-app.
            </Text>
          </Card>
        )}

        {/*
          Claimant handle — shown ONLY to the poster when reserved.
          Jordan-approved handle-only reveal (PRD §6, D1/D2).
          Long-press shares handle via system Share sheet.
        */}
        {showsClaimantHandle && (
          <Card>
            <Text className="mb-2 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
              Claimed by
            </Text>
            <Pressable
              onLongPress={() => void handleCopyHandle(claimantHandle!)}
              accessibilityLabel={`Claimed by ${claimantHandle}`}
              accessibilityHint="Long press to share this handle"
            >
              <Text className="text-lg font-semibold text-light-text dark:text-dark-text">
                {claimantHandle}
              </Text>
            </Pressable>
            <Text className="mt-2 text-sm leading-5 text-light-text-muted dark:text-dark-text-muted">
              This is the handle of the person who claimed your resource.
            </Text>
          </Card>
        )}

        {/* Error feedback — polite live region for screen readers */}
        {error && (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        {/* Claim button — Riley F1: full phrase, not bare "Claim" */}
        {canClaim ? (
          <Button
            label={claiming ? 'Reserving…' : 'Claim this resource'}
            hint={
              isDemo
                ? 'This is a demo with sample data. Claiming needs an account — opens a sign-up prompt.'
                : "Reserves this resource for you and reveals the poster's contact handle."
            }
            onPress={handleClaimPress}
            disabled={claiming}
          />
        ) : (
          !isMyPost &&
          resource.status !== 'available' && (
            <Text className="text-center text-sm text-light-text-muted dark:text-dark-text-muted">
              {resource.status === 'reserved'
                ? 'This resource has been claimed.'
                : 'This resource is no longer available.'}
            </Text>
          )
        )}
      </ScrollView>

      {/*
        Claim confirmation modal.

        Jordan Condition C: NO "They'll see your handle too" copy anywhere in
        this modal body. Casey confirmed the fix is in the 5 source files;
        this body is independently verified below.

        Two sentences max (Riley UX spec):
          1. What the claimant gets (handle to arrange pickup).
          2. What this means for others (can't claim after you do).

        Buttons: Cancel / "Claim this resource" (full label, matches button).
      */}
      <ConfirmationModal
        visible={claimModalOpen}
        title="Claim this resource?"
        body="After claiming, you'll see the poster's contact handle to arrange pickup. Other users won't be able to claim this after you do."
        confirmLabel={claiming ? 'Reserving…' : 'Claim this resource'}
        cancelLabel="Cancel"
        busy={claiming}
        onConfirm={handleClaimConfirm}
        onCancel={() => setClaimModalOpen(false)}
      />
    </SafeAreaView>
  );
}
