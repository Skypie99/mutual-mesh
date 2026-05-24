import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';

type SignInScreenProps = {
  /** Phase 0b wires real auth. For now, parent supplies handlers. */
  onSignIn?: (email: string, password: string) => Promise<void> | void;
  onSignUp?: (email: string, password: string, inviteCode: string) => Promise<void> | void;
};

/**
 * SignIn / Sign-up screen.
 *
 * UI ONLY in Loop 7. Real auth wiring lands in Phase 0b after Sky approves
 * PRIVACY.md. The form does NOT call Supabase here — handlers come from
 * props.
 *
 * Two tabs: Sign in and Create account. Create account requires an invite
 * code (per PRIVACY.md D4 + Steve S1).
 */
export function SignInScreen({ onSignIn, onSignUp }: SignInScreenProps) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (mode === 'in') {
        await onSignIn?.(email, password);
      } else {
        await onSignUp?.(email, password, inviteCode);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <View className="flex-1 justify-center px-6">
        <Text
          accessibilityRole="header"
          className="mb-2 text-3xl font-semibold text-light-text dark:text-dark-text"
        >
          Mutual Mesh
        </Text>
        <Text className="mb-8 text-base text-light-text-secondary dark:text-dark-text-secondary">
          {mode === 'in' ? 'Sign in to continue.' : 'Create an account with your invite code.'}
        </Text>

        <View className="gap-4">
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            textContentType={mode === 'in' ? 'password' : 'newPassword'}
          />
          {mode === 'up' && (
            <TextField
              label="Invite code"
              hint="From someone already on Mutual Mesh."
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
        </View>

        <View className="mt-6 gap-3">
          <Button
            label={mode === 'in' ? 'Sign in' : 'Create account'}
            onPress={handleSubmit}
            disabled={submitting}
          />
          <Button
            label={mode === 'in' ? 'I have an invite code — create account' : 'Back to sign in'}
            variant="ghost"
            onPress={() => setMode(mode === 'in' ? 'up' : 'in')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
