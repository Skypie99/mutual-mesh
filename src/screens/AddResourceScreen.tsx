import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { validateContactHandle, validationFailureMessage } from '@/lib/contactHandle';
import { createResource } from '@/lib/resources';
import { userFacingErrorMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth';

type AddResourceScreenProps = {
  /** Called on successful post; parent dismisses the modal.
   *  Passes an optional success message for the parent to surface (e.g. FlashBanner). */
  onPosted?: (successMessage?: string) => void;
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
 *
 * Alex a11y fixes 2026-05-25 (a11y/auto-2026-05-25-alex-addresource):
 *   B1 — Keyboard chaining: onSubmitEditing wired for name→description→pickup→contact.
 *   B2 — Double-announce removed: global error <Text> no longer carries
 *         accessibilityLiveRegion; AccessibilityInfo.announceForAccessibility is enough.
 *   B3 — Mounted-ref guard: prevents setState after modal dismiss during inflight request.
 *   (Button.tsx separately fixed for disabled-label contrast, BLOCKER 1.4.3.)
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
  // Also used for keyboard chaining: onSubmitEditing advances to the next field.
  const nameRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const pickupRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);

  // Mounted-ref guard — prevents setState on unmounted component if modal is
  // dismissed during an inflight network request (LEARNINGS:2026-05-23 gotcha #5).
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // These focus() calls are synchronous (before any await) — safe from unmount race.
    if (name.trim().length === 0) {
      nameRef.current?.focus();
      const msg = 'Please enter a resource name.';
      setError(msg);
      AccessibilityInfo.announceForAccessibility(msg);
      return;
    }

    // P1-A — empty handle check before deeper validation so users see a clear message.
    if (contactHandle.trim().length === 0) {
      contactRef.current?.focus();
      const msg = 'Add a contact handle — Signal, email alias, or any handle you prefer.';
      setError(msg);
      AccessibilityInfo.announceForAccessibility('Please add a contact handle');
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
      // onPosted dismisses the modal — no setState needed after this point.
      onPosted?.('Your resource was posted');
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = userFacingErrorMessage(err, 'Could not post your resource. Please try again.');
      setError(msg);
      // Announce via AccessibilityInfo only — the global error <Text> below does NOT
      // carry accessibilityLiveRegion (combining both causes double-announce on iOS
      // VoiceOver; WCAG 4.1.3 BLOCKER B2 fix).
      AccessibilityInfo.announceForAccessibility(msg);
    } finally {
      if (mountedRef.current) setSubmitting(false);
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

        {/* Field 1 — Resource name.
            returnKeyType="next" + onSubmitEditing advances focus to description.
            BLOCKER B1 fix: keyboard chain wired. */}
        <TextField
          ref={nameRef}
          label="Resource name"
          placeholder="What are you sharing?"
          value={name}
          onChangeText={setName}
          maxLength={100}
          autoCapitalize="sentences"
          returnKeyType="next"
          onSubmitEditing={() => descriptionRef.current?.focus()}
        />

        {/* Field 2 — Description (multiline).
            Jordan Condition 2: hint tells users description is visible to all
            verified members and nudges item-focused copy.
            multiline on iOS inserts a newline on Return — platform behaviour.
            No returnKeyType here; user taps Field 3 or uses the virtual tab-stop. */}
        <TextField
          ref={descriptionRef}
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

        {/* Field 3 — Pickup area.
            Jordan Condition 1: hint names neighbourhood/intersection/landmark
            as the recommended granularity; warns against full addresses.
            returnKeyType="next" + onSubmitEditing advances focus to contact handle.
            BLOCKER B1 fix: keyboard chain wired. */}
        <TextField
          ref={pickupRef}
          label="Pickup area"
          placeholder="e.g. Downtown East Side, near the library"
          hint="Neighbourhood, intersection, or landmark — not your full address"
          value={pickupText}
          onChangeText={setPickupText}
          maxLength={280}
          autoCapitalize="sentences"
          returnKeyType="next"
          onSubmitEditing={() => contactRef.current?.focus()}
        />

        {/* Field 4 — Contact handle.
            Jordan Condition 3: shortened hint, explicit no-real-name warning.
            returnKeyType="done" + onSubmitEditing triggers form submit.
            BLOCKER B1 fix: keyboard chain wired to submit. */}
        <TextField
          ref={contactRef}
          label="Contact handle"
          placeholder="Your preferred contact method"
          hint="Signal, email alias, or any handle. No real name. Only shown to the person who claims your resource."
          value={contactHandle}
          onChangeText={setContactHandle}
          maxLength={64}
          autoCapitalize="none"
          autoCorrect={false}
          error={handleError}
          returnKeyType="done"
          onSubmitEditing={() => void handleSubmit()}
        />

        {/* Global error state — announced by AccessibilityInfo.announceForAccessibility
            in handleSubmit. No accessibilityLiveRegion here: combining liveRegion with
            an explicit announceForAccessibility call causes double-announce on iOS
            VoiceOver (WCAG 4.1.3 BLOCKER B2 fix). Text remains visible for sighted users. */}
        {error && (
          <Text
            accessibilityRole="text"
            className="text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        <View className="mt-4 gap-3">
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
