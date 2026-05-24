import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { validateContactHandle, validationFailureMessage } from '@/lib/contactHandle';

type AddResourceForm = {
  name: string;
  description: string;
  pickupText: string;
  contactHandle: string;
  photoUri?: string;
};

type AddResourceScreenProps = {
  onSubmit?: (form: AddResourceForm) => Promise<void> | void;
  onCancel?: () => void;
};

/**
 * Add Resource — the form for posting a new listing.
 *
 * UI ONLY in Loop 7. Photo picker + EXIF strip + Supabase upload land in
 * Phase 0b. The contact-handle field uses `validateContactHandle` from the
 * already-tested helper.
 */
export function AddResourceScreen({ onSubmit, onCancel }: AddResourceScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pickupText, setPickupText] = useState('');
  const [contactHandle, setContactHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleValidation = validateContactHandle(contactHandle);
  const handleError =
    !handleValidation.ok && contactHandle.length > 0
      ? validationFailureMessage(handleValidation.reason)
      : undefined;

  const canSubmit = name.trim().length > 0 && pickupText.trim().length > 0 && handleValidation.ok;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit?.({ name, description, pickupText, contactHandle });
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
        <Text className="text-sm text-light-text-muted dark:text-dark-text-muted">
          Photos uploaded here have all metadata removed automatically.
        </Text>

        <TextField
          label="What is it?"
          hint="e.g., 'Sensitive baby formula, unopened'"
          value={name}
          onChangeText={setName}
          autoCapitalize="sentences"
        />

        <TextField
          label="Details"
          hint="Quantity, expiry, allergens, anything a recipient should know."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          autoCapitalize="sentences"
        />

        <TextField
          label="Pickup info"
          hint="Where and when. Be as specific or vague as you want."
          value={pickupText}
          onChangeText={setPickupText}
          autoCapitalize="sentences"
        />

        <TextField
          label="Contact handle (revealed only on claim)"
          hint="Signal handle, Proton email, or any handle you trust. No links."
          value={contactHandle}
          onChangeText={setContactHandle}
          autoCapitalize="none"
          autoCorrect={false}
          error={handleError}
        />

        <View className="mt-2 gap-3">
          <Button
            label={submitting ? 'Posting…' : 'Post resource'}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
