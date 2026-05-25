import { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { validateContactHandle, validationFailureMessage } from '@/lib/contactHandle';
import { uploadResourcePhoto } from '@/lib/photos';
import { createResource } from '@/lib/resources';
import { userFacingErrorMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth';

type AddResourceScreenProps = {
  /** Called on successful post; parent dismisses the modal. */
  onPosted?: () => void;
  onCancel?: () => void;
};

/**
 * Add Resource — real submit wired in L26.
 *
 * Flow:
 *   1. User fills form (name, description, pickup, contact-handle), optionally picks photo
 *   2. On submit:
 *      a. If photo: stripExifAndCompress → upload to resource-photos/<userId>/<ts>.jpg
 *      b. createResource with photo_url=path (server-side createSignedUrl renders later)
 *      c. Trigger sets created_at + status_changed_at; defaults status='available'
 *   3. Realtime delivers the INSERT to all subscribed clients; HomeScreen updates without re-fetch
 *
 * Per Deb persona + Casey advisory: photo is OPTIONAL with prominent "Photo optional" hint.
 */
export function AddResourceScreen({ onPosted, onCancel }: AddResourceScreenProps) {
  const { user, profile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pickupText, setPickupText] = useState('');
  const [contactHandle, setContactHandle] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission denied. You can post without a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1, // We compress later in stripExifAndCompress; pick full quality here.
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setError(null);
    setSubmitting(true);
    try {
      let photoPath: string | null = null;
      if (photoUri) {
        photoPath = await uploadResourcePhoto(user.id, photoUri);
      }
      const { error: err } = await createResource(
        {
          name: name.trim(),
          description: description.trim() || null,
          pickup_text: pickupText.trim(),
          contact_handle: contactHandle.trim(),
          postal_prefix: profile?.postal_prefix ?? null,
          city: profile?.city ?? null,
          photo_url: photoPath,
        },
        user.id,
      );
      if (err) throw err;
      onPosted?.();
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not post your resource.'));
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

        {/* Photo picker -- disabled on web.
            expo-image-manipulator is native-only; web photo upload without
            EXIF strip violates PRIVACY.md D5. Jordan advisory condition,
            2026-05-25-jordan-web-gate.md. */}
        {Platform.OS === 'web' ? (
          <View>
            <Text className="mb-1 text-sm font-semibold text-light-text dark:text-dark-text">
              Photo (optional)
            </Text>
            <Text className="text-xs text-light-text-muted dark:text-dark-text-muted">
              Photo upload is not available on web. Use the mobile app to add a photo.
            </Text>
          </View>
        ) : (
          <View>
            <Text className="mb-1 text-sm font-semibold text-light-text dark:text-dark-text">
              Photo (optional)
            </Text>
            <Text className="mb-2 text-xs text-light-text-muted dark:text-dark-text-muted">
              All metadata (location, device, time) is stripped before upload.
            </Text>
            {photoUri ? (
              <View className="gap-2">
                <Pressable
                  onPress={pickPhoto}
                  accessibilityLabel="Change photo"
                  className="overflow-hidden rounded-card"
                >
                  <Image
                    source={{ uri: photoUri }}
                    style={{ width: '100%', aspectRatio: 1 }}
                    resizeMode="cover"
                    accessibilityLabel="Photo preview"
                  />
                </Pressable>
                <Button label="Remove photo" variant="ghost" onPress={() => setPhotoUri(null)} />
              </View>
            ) : (
              <Button label="Add a photo" variant="secondary" onPress={pickPhoto} />
            )}
          </View>
        )}

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
            onPress={handleSubmit}
            disabled={!canSubmit}
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={submitting} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
