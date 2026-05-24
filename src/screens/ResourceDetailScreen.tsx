import { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StatusPill, type ResourceStatus } from '@/components/StatusPill';

type ResourceDetail = {
  id: string;
  name: string;
  description: string;
  status: ResourceStatus;
  postal_prefix: string;
  pickup_text: string;
  photo_url?: string;
  contact_handle?: string;
};

type ResourceDetailScreenProps = {
  resource?: ResourceDetail;
  /** Phase 0b wires the atomic claim RPC (PRD §3 "State Mutation Security"). */
  onClaim?: (resourceId: string) => Promise<void> | void;
};

/**
 * Resource Detail — shown when a feed card is tapped. Includes the Claim CTA.
 *
 * UI ONLY in Loop 7. The Claim button calls a stub. Real flow in Phase 0b:
 *   supabase.rpc('claim_resource', { resource_id }) — atomic, row-locked.
 *
 * `contact_handle` is shown ONLY after the user successfully claims (see
 * PRIVACY.md D2 and Steve S3 — the handle is treated as user-supplied
 * untrusted text; rendered as plain <Text>, no auto-linking).
 */
export function ResourceDetailScreen({ resource, onClaim }: ResourceDetailScreenProps) {
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  if (!resource) {
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-light-text-muted dark:text-dark-text-muted">
            Resource not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await onClaim?.(resource.id);
      setClaimed(true);
    } finally {
      setClaiming(false);
    }
  };

  const canClaim = resource.status === 'available' && !claimed;

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {resource.photo_url && (
          <Image
            source={{ uri: resource.photo_url }}
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
            <Text className="text-xs text-light-text-muted dark:text-dark-text-muted">
              {resource.postal_prefix}
            </Text>
          </View>
        </View>

        <Card>
          <Text className="mb-1 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
            Description
          </Text>
          <Text className="text-base leading-6 text-light-text dark:text-dark-text">
            {resource.description}
          </Text>
        </Card>

        <Card>
          <Text className="mb-1 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
            Pickup
          </Text>
          <Text className="text-base leading-6 text-light-text dark:text-dark-text">
            {resource.pickup_text}
          </Text>
        </Card>

        {claimed && resource.contact_handle && (
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

        {canClaim ? (
          <Button
            label={claiming ? 'Claiming…' : 'Claim this item'}
            onPress={handleClaim}
            disabled={claiming}
            hint="Reserves this item for you and reveals the poster's contact handle."
          />
        ) : (
          <Text className="text-center text-sm text-light-text-muted dark:text-dark-text-muted">
            {claimed ? 'You claimed this item.' : 'This item is reserved.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
