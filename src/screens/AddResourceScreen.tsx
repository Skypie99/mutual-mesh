import { useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { validateContactHandle, validationFailureMessage } from '@/lib/contactHandle';
import { createResource } from '@/lib/resources';
import { userFacingErrorMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth';

type AddResourceScreenProps = {
  /** Called on successful post; parent dismisses the modal. */
  onPosted?: () => void;
  onCancel?: () => void;
};

/**
 * AddResourceScreen — text-only resource creation form.
 *
 * Jordan APPROVED WITH CONDITIONS 2026-05-25 (jordan-add-resource-review.md):
 *   Condition 1 — Pickup location hint must NOT suggest full addresses.
 *   Condition 2 — Description hint must note visibility to all verified members.
 *   Condition 3 — Contact handle hint must warn against real names.
 *
 * No photo upload in this screen. Photo upload requires a separate Jordan
 * approval for the EXIF pipeline and will ship in a future cycle.
 *
 * Category is posted as 'other' per Quinn spec gap (acceptable for MVP).
 *
 * Accessibility: WCAG 2.2 AA throughout — all fields have accessibilityLabel,
 * errors announced via AccessibilityInfo, focus moved to first errored field.
 */
export function AddResourceScreen({ onPosted, onCancel }: AddResourceScreenProps) {
  const { user, profile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pickupText, setPickupText] = useState('');
  const [contactHandle, setContactHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for focus management — move focus to first errored field on submit failure.
  const nameRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);

  const handleValidation = validateContactHandle(contactHandle);
  const handleError =
    !handleValidation.ok && contactHandle.length > 0
      ? validationFailureMessage(handleValidation.reason)
      : undefined;

  const canSubmit =
    !!user &&
    name.trim().length > 0 &&
    pickupText.trim().length > 0 &&
    handleValidation.ok &&
    !submitting;

  const handleSubmit = async () => {
    if (!user) return;

    // Inline validation before submit — focus first errored field.
    if (name.trim().length === 0) {
      nameRef.current?.focus();
      const msg = 'Please enter a resource name.';
      setError(msg);
      AccessibilityInfo.announceForAccessibility(msg);
      return;
    }

    if (!handleValidation.ok) {
      contactRef.current?.focus();
      const msg = validationFailureMessage(handleValidation.reason);
      setError(msg);
      AccessibilityInfo.announceForAccessibility(msg);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const { error: err } = await createResource(
        {
          name: name.trim(),
          description: description.trim() || null,
          pickup_text: pickupText.trim(),
          contact_handle: contactHandle.trim(),
          postal_prefix: profile?.postal_prefix ?? null,
          city: profile?.city ?? null,
          photo_url: null,
          category: 'other',
        },
        user.id,
      );
      if (err) throw err;
      onPosted?.();
    } catch (err) {
      const msg = userFacingErrorMessage(err, 'Could not post your resource. Please try again.');
      setError(msg);
      AccessibilityInfo.announceForAccessibility(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-light-text dark:text-dark-text"
        >
          Post a resource
        </Text>

        {/* Field 1 — Resource name */}
        <TextField
          ref={nameRef}
          label="Resource name"
          placeholder="What are you sharing?"
          value={name}
          onChangeText={setName}
          maxLength={100}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        {/* Field 2 — Description
            Jordan Condition 2: hint tells users description is visible to all
            verified members and nudges item-focused copy. */}
        <TextField
          label="Description"
          placeholder="Describe the item"
          hint="Describe the item. Visible to all verified members — avoid personal details."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={2000}
          autoCapitalize="sentences"
        />

        {/* Field 3 — Pickup area
            Jordan Condition 1: hint names neighbourhood/intersection/landmark
            as the recommended granularity; warns against full addresses. */}
        <TextField
          label="Pickup area"
          placeholder="e.g. Downtown East Side, near the library"
          hint="Neighbourhood, intersection, or landmark — not your full address"
          value={pickupText}
          onChangeText={setPickupText}
          maxLength={280}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        {/* Field 4 — Contact handle
            Jordan Condition 3: shortened hint, explicit no-real-name warning. */}
        <TextField
          ref={contactRef}
          label="Contact handle"
          placeholder="Your preferred contact method"
          hint="Signal, email alias, or any handle. No real name."
          value={contactHandle}
          onChangeText={setContactHandle}
          maxLength={100}
          autoCapitalize="none"
          autoCorrect={false}
          error={handleError}
          returnKeyType="done"
        />

        {/* Global error state */}
        {error && (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        <View className="mt-2 gap-3">
          <Button
            label={submitting ? 'Posting…' : 'Post resource'}
            hint="Submits your resource listing to the community feed"
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
          />
          <Button
            label="Cancel"
            variant="ghost"
            hint="Discards this form and goes back"
            onPress={onCancel}
            disabled={submitting}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
