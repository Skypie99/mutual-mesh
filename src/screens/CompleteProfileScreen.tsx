import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { userFacingErrorMessage } from '@/lib/errors';
import { generateHandleSuggestions } from '@/lib/handleGenerator';
import {
  validateHandle,
  handleFailureMessage,
  realNameWarningMessage,
} from '@/lib/handleValidator';

/**
 * CompleteProfileScreen — signup step 3.
 *
 * Shown when the user is signed in but their public.users.handle still
 * starts with `'pending-'` (set by the handle_new_user trigger). User
 * fills in handle + postal_prefix + city; we UPDATE the row, AuthProvider
 * picks up the change via realtime, Gate routes to WaitingRoom.
 *
 * Per PRIVACY.md D1/D2 EDITED + DFS-C1.1:
 *   - Handle defaults to a random adjective-noun-4digit suggestion.
 *   - 3 suggestions offered; user can pick or type their own.
 *   - Soft warning when their custom handle looks like a real name.
 *   - "Re-roll" button generates 3 fresh suggestions.
 *
 * Per Q2 + DFS-C1.2:
 *   - City is an explicit dropdown (we render as buttons here — no native
 *     dropdown primitive yet; Cycle 1.5 can introduce a Picker).
 */

// DFS-C1.2 — active cities (Sky-approved 2026-05-23). "Other" stays open so
// users near city borders can proceed; Casey flags admin review at onboarding.
// Deferred cities re-activate once a local admin pool exists (Casey approves).
const CITY_OPTIONS = [
  'Nelson',
  'Kelowna',
  // 'Toronto',   // DFS-C1.2: deferred until partner network exists in this city
  // 'Hamilton',  // DFS-C1.2: deferred until partner network exists in this city
  // 'Vancouver', // DFS-C1.2: deferred until partner network exists in this city
  // 'Montréal',  // DFS-C1.2: deferred until partner network exists in this city
  // 'Ottawa',    // DFS-C1.2: deferred until partner network exists in this city
  'Other',
] as const;

const FSA_REGEX = /^[A-Z][0-9][A-Z]$/;

export function CompleteProfileScreen() {
  const { user, reloadProfile, signOut } = useAuth();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [handle, setHandle] = useState('');
  const [postalPrefix, setPostalPrefix] = useState('');
  const [city, setCity] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial = generateHandleSuggestions(3);
    setSuggestions(initial);
    if (initial[0]) setHandle(initial[0]);
  }, []);

  const handleValidation = handle.length > 0 ? validateHandle(handle) : null;
  const handleError =
    handleValidation && !handleValidation.ok
      ? handleFailureMessage(handleValidation.reason)
      : undefined;
  const handleWarning =
    handleValidation?.ok && handleValidation.warning === 'looks-like-real-name'
      ? realNameWarningMessage()
      : undefined;

  const normalizedPostal = postalPrefix.trim().toUpperCase();
  const postalValid = normalizedPostal === '' || FSA_REGEX.test(normalizedPostal);
  const postalError = !postalValid
    ? 'Postal prefix must be 3 characters in the form A1A (a letter, a digit, a letter).'
    : undefined;

  const canSubmit =
    !!user &&
    handle.length > 0 &&
    handleValidation?.ok === true &&
    normalizedPostal !== '' &&
    postalValid &&
    city !== '';

  const rerollSuggestions = () => {
    const fresh = generateHandleSuggestions(3);
    setSuggestions(fresh);
    if (fresh[0]) setHandle(fresh[0]);
  };

  const submit = async () => {
    if (!user) return;
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase
        .from('users')
        .update({
          handle: handle.trim().toLowerCase(),
          postal_prefix: normalizedPostal,
          city,
        })
        .eq('id', user.id);
      if (err) {
        // Most likely: unique-handle collision. Re-roll and prompt.
        if (err.code === '23505' || err.message?.toLowerCase().includes('duplicate')) {
          rerollSuggestions();
          throw new Error('That handle is already taken — we picked a few fresh ones.');
        }
        throw err;
      }
      await reloadProfile();
      // Gate will now re-route us to WaitingRoom.
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not save your profile.'));
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
          className="text-3xl font-semibold text-light-text dark:text-dark-text"
        >
          Set up your profile
        </Text>
        <Text className="text-base text-light-text-secondary dark:text-dark-text-secondary">
          Just a handle, your neighborhood, and your city. No real names — that&apos;s on purpose.
        </Text>

        {/* Handle picker */}
        <View>
          <Text className="mb-2 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
            Pick a suggestion
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button
                key={s}
                label={s}
                variant={handle === s ? 'primary' : 'secondary'}
                onPress={() => setHandle(s)}
                hint="Use this suggested handle"
              />
            ))}
          </View>
          <View className="mt-2">
            <Button
              label="Re-roll suggestions"
              variant="ghost"
              onPress={rerollSuggestions}
              hint="Generate three new random handles"
            />
          </View>
        </View>

        <TextField
          label="Your handle"
          hint="Lowercase letters, digits, and hyphens. 3–32 chars."
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          autoCorrect={false}
          error={handleError}
        />
        {handleWarning && (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-light-warning dark:text-dark-warning"
          >
            {handleWarning}
          </Text>
        )}

        <TextField
          label="Postal prefix (first 3 chars)"
          hint="For Canadian postal codes — e.g., M5V from M5V 2J9. Neighborhood-level only."
          value={postalPrefix}
          onChangeText={(t) => setPostalPrefix(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          error={postalError}
        />

        {/* City picker */}
        <View>
          <Text className="mb-2 text-xs font-semibold uppercase text-light-text-muted dark:text-dark-text-muted">
            City
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CITY_OPTIONS.map((c) => (
              <Button
                key={c}
                label={c}
                variant={city === c ? 'primary' : 'secondary'}
                onPress={() => setCity(c)}
                hint={`Select ${c}`}
              />
            ))}
          </View>
        </View>

        {error && (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        <View className="mt-4 gap-3">
          <Button
            label={submitting ? 'Saving…' : 'Save and continue'}
            onPress={submit}
            disabled={!canSubmit || submitting}
          />
          <Button label="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
