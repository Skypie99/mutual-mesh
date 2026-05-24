import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { signInWithEmail, signUpWithEmail, verifyOtp, resendOtp, supabase } from '@/lib/supabase';
import { userFacingErrorMessage } from '@/lib/errors';

type SignInScreenProps = {
  /** Called after sign-in succeeds OR after OTP verification completes.
   *  The Gate (in App.tsx) re-reads the session and routes accordingly. */
  onAuthSuccess?: () => void;
};

type Mode =
  | { kind: 'sign-in' }
  | { kind: 'sign-up-credentials' }
  | { kind: 'sign-up-otp'; email: string; inviteCode: string };

/**
 * SignInScreen — handles BOTH sign-in and sign-up.
 *
 * **Sign-in flow:** email + password → supabase.auth.signInWithPassword → done.
 *
 * **Sign-up flow (multi-step):**
 *   1. credentials   — email + password + invite code → supabase.auth.signUp
 *                       (the invite code is held in component state; consumed
 *                        in step 2 once we have a session)
 *   2. otp           — 6-digit code from email → supabase.auth.verifyOtp →
 *                       call consume_invite_token RPC → done
 *
 * After sign-up completes, the user is signed in BUT their `public.users`
 * row has handle `'pending-XXXXXX'` (set by the handle_new_user trigger).
 * The Gate detects this and routes to CompleteProfileScreen for step 3
 * (handle + postal_prefix + city).
 */
export function SignInScreen({ onAuthSuccess }: SignInScreenProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'sign-in' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await signInWithEmail(email.trim(), password);
      if (err) throw err;
      onAuthSuccess?.();
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Sign in failed. Check your email and password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartSignUp = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Quick client-side checks
      if (!email.trim() || !password) throw new Error('Email and password are required.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      if (inviteCode.trim().length < 10) {
        throw new Error('Invite code looks too short. Double-check what you pasted.');
      }

      const { error: err } = await signUpWithEmail(email.trim(), password);
      if (err) throw err;

      setMode({ kind: 'sign-up-otp', email: email.trim(), inviteCode: inviteCode.trim() });
      setInfo('Check your email for a 6-digit code.');
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not start sign up.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (mode.kind !== 'sign-up-otp') return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const { error: verifyErr } = await verifyOtp(mode.email, otp.trim());
      if (verifyErr) throw verifyErr;

      // Now signed in — consume the invite token
      const { data: consumed, error: rpcErr } = await supabase.rpc('consume_invite_token', {
        plain_token: mode.inviteCode,
      });
      if (rpcErr) throw rpcErr;
      if (consumed !== true) {
        throw new Error(
          'That invite code is invalid or already used. Ask the person who gave it to you for a fresh one.',
        );
      }

      onAuthSuccess?.();
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not verify your code.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (mode.kind !== 'sign-up-otp') return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await resendOtp(mode.email);
      if (err) throw err;
      setInfo('Code re-sent. Check your email.');
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not re-send code.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (mode.kind === 'sign-up-otp') {
    return (
      <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
        <View className="flex-1 justify-center px-6">
          <Text
            accessibilityRole="header"
            className="mb-2 text-3xl font-semibold text-light-text dark:text-dark-text"
          >
            Check your email
          </Text>
          <Text className="mb-8 text-base text-light-text-secondary dark:text-dark-text-secondary">
            We sent a 6-digit code to {mode.email}.
          </Text>

          <TextField
            label="6-digit code"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            hint="If you don't see it, check your spam folder."
            error={error ?? undefined}
          />

          {info && (
            <Text
              accessibilityLiveRegion="polite"
              className="mt-2 text-sm text-light-text-secondary dark:text-dark-text-secondary"
            >
              {info}
            </Text>
          )}

          <View className="mt-6 gap-3">
            <Button
              label="Verify"
              onPress={handleVerifyOtp}
              disabled={submitting || otp.length < 6}
            />
            <Button
              label="Re-send code"
              variant="ghost"
              onPress={handleResendOtp}
              disabled={submitting}
            />
            <Button
              label="Back"
              variant="ghost"
              onPress={() => {
                setOtp('');
                setError(null);
                setInfo(null);
                setMode({ kind: 'sign-up-credentials' });
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isSignUp = mode.kind === 'sign-up-credentials';

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
          {isSignUp ? 'Create an account with your invite code.' : 'Sign in to continue.'}
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
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            hint={isSignUp ? 'At least 8 characters.' : undefined}
          />
          {isSignUp && (
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

        {error && (
          <Text
            accessibilityLiveRegion="polite"
            className="mt-4 text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        <View className="mt-6 gap-3">
          <Button
            label={isSignUp ? 'Continue' : 'Sign in'}
            onPress={isSignUp ? handleStartSignUp : handleSignIn}
            disabled={submitting}
          />
          <Button
            label={isSignUp ? 'Back to sign in' : 'I have an invite code — create account'}
            variant="ghost"
            onPress={() => {
              setError(null);
              setInfo(null);
              setMode(isSignUp ? { kind: 'sign-in' } : { kind: 'sign-up-credentials' });
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
