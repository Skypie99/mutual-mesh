import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { UserRow } from '@/types/database';

/**
 * Profile is the slice of public.users we surface in the AuthContext.
 * Excludes server-only fields (referrer_token_hash, created_at).
 */
export type AuthProfile = Pick<
  UserRow,
  'id' | 'handle' | 'postal_prefix' | 'city' | 'is_verified' | 'is_admin' | 'last_active_at'
>;

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** null until the public.users row is loaded; null again if row is missing. */
  profile: AuthProfile | null;
  loading: boolean;
  /** Re-fetch the public.users row. Called when verification flips. */
  reloadProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  reloadProfile: async () => {},
  signOut: async () => {},
});

/**
 * AuthProvider — wraps the app with session + profile state.
 *
 * Responsibilities:
 *
 * 1. Bootstrap: `getSession()` on mount; `loading=false` regardless of result
 *    so the Gate doesn't hang (AccessMap pattern).
 * 2. Subscribe to `supabase.auth.onAuthStateChange` for sign-in/out events.
 * 3. Once we have a session, fetch the matching `public.users` row.
 * 4. Subscribe to the user's own row via Supabase Realtime so an admin's
 *    `is_verified=true` flip auto-routes them from Waiting Room to Home
 *    without a refresh. Filter is `id=eq.{auth.uid()}` (defense-in-depth
 *    against STRIDE I3; RLS would block cross-user leakage anyway).
 * 5. Touch `last_active_at` on mount (for Q4 inactive-admin auto-suspend).
 *
 * Mounted-ref pattern (LEARNINGS): all async setState calls check
 * `mountedRef.current` first so navigation mid-fetch doesn't setState on an
 * unmounted component.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // ─────────────────────────────────────────────────────────────────────────
  // Profile fetch
  // ─────────────────────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async (uid: string): Promise<AuthProfile | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('id, handle, postal_prefix, city, is_verified, is_admin, last_active_at')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.warn('[auth] fetchProfile failed:', error.message);
      return null;
    }
    return data;
  }, []);

  const reloadProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      if (mountedRef.current) setProfile(null);
      return;
    }
    const next = await fetchProfile(uid);
    if (mountedRef.current) setProfile(next);
  }, [session?.user?.id, fetchProfile]);

  // ─────────────────────────────────────────────────────────────────────────
  // Bootstrap session
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mountedRef.current) setSession(data.session);
      } catch (err) {
        console.warn('[auth] getSession failed:', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mountedRef.current) setSession(next);
    });

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch profile whenever session.user.id changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const next = await fetchProfile(uid);
      if (!cancelled && mountedRef.current) setProfile(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, fetchProfile]);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime subscription on the user's own row (for is_verified flips)
  // STRIDE I3: filter is required defense-in-depth; RLS already blocks
  // cross-user leakage.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    const channel = supabase
      .channel(`user-row-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${uid}`,
        },
        (_payload) => {
          if (!mountedRef.current) return;
          // Re-fetch the full row to update profile state. The realtime
          // _payload's `new` is also the new row, but re-fetch is simpler
          // than narrowing the postgres_changes union type for one consumer.
          void reloadProfile();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id, reloadProfile]);

  // ─────────────────────────────────────────────────────────────────────────
  // Touch last_active_at on session arrival (Q4 admin auto-suspend signal)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user?.id) return;
    void supabase.rpc('touch_my_last_active').then(({ error }) => {
      if (error) console.warn('[auth] touch_my_last_active failed:', error.message);
    });
  }, [session?.user?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Sign out helper
  // ─────────────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[auth] signOut failed:', err);
    }
    if (mountedRef.current) {
      setSession(null);
      setProfile(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        reloadProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
