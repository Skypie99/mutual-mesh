import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  const message =
    'Supabase env vars are missing. Set EXPO_PUBLIC_SUPABASE_URL and ' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.';
  console.warn(message);
  // Dev: fail loudly so the very first screen tells you exactly what's wrong
  // instead of every query silently 401-ing.
  // Prod: warn-and-continue so a missing env doesn't crash a shipped app.
  if (__DEV__) {
    throw new Error(message);
  }
}

/**
 * Typed Supabase client. Importing `Database` is what gives us .from('users')
 * autocomplete and .insert()/.update() type-safety.
 *
 * AsyncStorage is intentionally unencrypted (matches AccessMap). PRIVACY.md S7
 * disclosure: a stolen/unlocked phone exposes the session. Phase 0b's "Sign
 * out" button is prominent for this reason. v2 may swap for SecureStore.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ============================================================================
// Auth surface — thin wrappers around supabase.auth so screens import a
// single named helper instead of reaching into the SDK directly.
// ============================================================================

/**
 * Sign in with email + password. The user must have already gone through the
 * signup OTP step on a prior session, or this returns an "email not confirmed"
 * error (Supabase project must have email confirmation enabled per Q1).
 */
export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Sign up with email + password. Supabase sends an OTP / magic link to the
 * email (Q1 — required). User must verify before signInWithEmail will work.
 *
 * Note: signUp creates the auth.users row, which triggers handle_new_user(),
 * which creates the public.users row with a placeholder handle. The app must
 * follow up with consume_invite_token() + UPDATE on public.users (handle,
 * postal_prefix, city).
 */
export async function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

/**
 * Re-send OTP to a signed-up-but-unconfirmed user. Useful for the OTP step
 * when the original email was lost.
 */
export async function resendOtp(email: string) {
  return supabase.auth.resend({ type: 'signup', email });
}

/**
 * Verify the 6-digit OTP the user received via email.
 */
export async function verifyOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({ email, token, type: 'email' });
}

export async function signOut() {
  return supabase.auth.signOut();
}
