import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { StatusPill } from '@/components/StatusPill';
import { claimResource, getResourceById } from '@/lib/resources';
import { createSignedResourcePhotoUrl } from '@/lib/photos';
import { userFacingErrorMessage } from '@/lib/errors';
import type { ResourceRow } from '@/types/database';

type ResourceDetailScreenProps = {
  /** Passed from RootNavigator via route.params.resourceId. */
  resourceId?: string;
};

/**
 * Resource Detail — fetches by id, renders, and supports atomic claim.
 *
 * Claim flow:
 *   1. User taps Claim → ConfirmationModal opens
 *   2. Confirm → claim_resource RPC (atomic per PRD §3 + S5)
 *   3. On success: refetch resource (status now 'reserved' + claimed_by set),
 *      reveal the poster's contact_handle.
 *
 * Photo flow:
 *   1. On mount, if resource has photo_url (which is a Storage path, not a URL),
 *      generate a signed URL with 1h TTL (S4).
 *   2. If signed URL generation fails (RLS, expired, etc.), fall back to no photo.
 *
 * Mounted-ref pattern guards all async setState (AccessMap LEARNINGS).
 */
export function ResourceDetailScreen({ resourceId }: ResourceDetailScreenProps) {
  const [resource, setResource] = useState<ResourceRow | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const mountedRef = useRef(true);

  // Fetch (and refetch) the resource by id
  const fetchResource = useCallback(async () => {
    if (!resourceId) {
      setError('Missing resource id.');
      setLoading(false);
      return;
    }
    const { data, error: err } = await getResourceById(resourceId);
    if (!mountedRef.current) return;
    if (err) {
      setError(userFacingErrorMessage(err, 'Could not load this resource.'));
      setLoading(false);
      return;
    }
    setResource(data);
    setLoading(false);

    // Refresh the signed URL whenever we (re)fetch the resource
    if (data?.photo_url) {
      const signed = await createSignedResourcePhotoUrl(data.photo_url);
      if (mountedRef.current) setPhotoUrl(signed);
    } else {
      if (mountedRef.current) setPhotoUrl(null);
    }
  }, [resourceId]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchResource();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchResource]);

  const handleClaimConfirm = async () => {
    if (!resourceId) return;
    setClaiming(true);
    try {
      const { error: err } = await claimResource(resourceId);
      if (err) throw err;
      setClaimModalOpen(false);
      // Refetch to pick up the new status + claimed_by + reveal contact_handle
      await fetchResource();
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not claim this resource.'));
      setClaimModalOpen(false);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-light-text-muted dark:text-dark-text-muted">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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

  const canClaim = resource.status === 'available';
  const showsContactHandle = resource.status === 'reserved' && resource.contact_handle;

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {photoUrl && (
          <Image
            source={{ uri: photoUrl }}
            accessibilityLabel={`Photo of ${resource.name}`}
            style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }}
            resizeMode="cover"
          />
        )}

        <View>
          <Text
            accessibilityRole="header"
            className="text-2xl font-semibold text-light-text dark:text-dark-text"
          >
            {resource.name}
          </Text>
          <View className="mt-2 flex-row items-center gap-2">
            <StatusPill status={resource.status} />
            {resource.postal_prefix && (
              <Text className="text-xs text-light-text-muted dark:text-dark-text-muted">
                {resource.postal_prefix}
              </Text>
            )}
            {resource.city && (
              <Text className="text-xs text-light-text-muted dark:text-dark-text-muted">
                · {resource.city}
              </Text>
            )}
          </View>
        </View>

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

        <Card>
          <Text className="mb-1 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
            Pickup
          </Text>
          <Text className="text-base leading-6 text-light-text dark:text-dark-text">
            {resource.pickup_text}
          </Text>
        </Card>

        {showsContactHandle && (
          <Card>
            <Text className="mb-1 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
              Contact the poster
            </Text>
            <Text className="mb-1 text-base font-semibold text-light-text dark:text-dark-text">
              {resource.contact_handle}
            </Text>
            <Text className="text-xs text-light-text-muted dark:text-dark-text-muted">
              This handle is provided by the poster. Verify before sharing personal details.
            </Text>
          </Card>
        )}

        {error && (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        {canClaim ? (
          <Button
            label="Claim this item"
            onPress={() => setClaimModalOpen(true)}
            hint="Reserves this item for you and reveals the poster's contact handle."
          />
        ) : (
          <Text className="text-center text-sm text-light-text-muted dark:text-dark-text-muted">
            This item is reserved.
          </Text>
        )}
      </ScrollView>

      <ConfirmationModal
        visible={claimModalOpen}
        title="Claim this item?"
        body="Once you claim, the poster's contact handle is revealed to you. They'll see your handle too. Other users can't claim it after that."
        confirmLabel="Yes, claim"
        cancelLabel="Not yet"
        busy={claiming}
        onConfirm={handleClaimConfirm}
        onCancel={() => setClaimModalOpen(false)}
      />
    </SafeAreaView>
  );
}
