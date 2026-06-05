import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * DemoContext — anonymous guest "demo mode" state (WEB-4, 2026-06-05).
 *
 * A portfolio visitor opens `mutual-mesh.vercel.app/?demo=1` (or taps
 * "Explore the demo" on the sign-in screen) and browses a read-only fake
 * marketplace rendered entirely from bundled synthetic fixtures — NO account,
 * NO Supabase call of any kind.
 *
 * === Privacy posture (Jordan gate, 2026-06-05) ===
 *
 * This provider is mounted OUTSIDE AuthProvider (guest = no auth, no session).
 * It only holds two booleans:
 *   - `isDemo`        — are we in the synthetic demo right now?
 *   - `signUpVisible` — is the "Sign up to participate" sheet open?
 *
 * It issues NO network request itself. The zero-network invariant is enforced
 * downstream: every data-fetching surface reads `useDemo().isDemo` and
 * early-returns from synthetic fixtures BEFORE touching `supabase.*`.
 * (qa-reports/2026-06-05_Jordan_DemoMode_Privacy_Gate.md, conditions 1–7.)
 *
 * === URL entry (web) ===
 *
 * `isDemo` is seeded once at mount from `?demo=1`. We use the `demo` param
 * specifically so it never collides with Supabase's `detectSessionInUrl`
 * (which consumes `access_token` / `code` / `error` params, not `demo`).
 *
 * `exitDemo()` flips `isDemo` to false and, on web, strips the `demo` param
 * via `history.replaceState` so a refresh doesn't silently re-enter the demo.
 * With `isDemo` false and no session, `decideGateRoute` naturally returns
 * 'sign-in'.
 */

export type DemoContextValue = {
  /** True while the anonymous synthetic demo is active. */
  isDemo: boolean;
  /** Enter the demo (from the "Explore the demo" button). */
  enterDemo: () => void;
  /** Leave the demo and return to the sign-in screen. Strips `?demo=1` on web. */
  exitDemo: () => void;
  /** Open the "Sign up to participate" sheet (any write-intent in demo). */
  promptSignUp: () => void;
  /** Whether the sign-up sheet is currently visible. */
  signUpVisible: boolean;
  /** Dismiss the sign-up sheet ("Keep exploring"). */
  dismissSignUp: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

/**
 * Read the `?demo=1` flag from the current URL on web. Returns false on native
 * (no `window`) and false on any parse hiccup — fail closed, never auto-enter.
 */
function readDemoParamFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
}

/**
 * Strip the `demo` query param from the URL without a reload (web only).
 * Best-effort: any failure is swallowed so leaving the demo never crashes.
 */
function stripDemoParamFromUrl(): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // No-op — URL housekeeping is non-critical.
  }
}

export function DemoProvider({ children }: { children: ReactNode }) {
  // Seed once from the URL (lazy initializer — runs a single time at mount).
  const [isDemo, setIsDemo] = useState<boolean>(() => readDemoParamFromUrl());
  const [signUpVisible, setSignUpVisible] = useState(false);

  const enterDemo = useCallback(() => {
    setIsDemo(true);
  }, []);

  const exitDemo = useCallback(() => {
    setSignUpVisible(false);
    setIsDemo(false);
    stripDemoParamFromUrl();
  }, []);

  const promptSignUp = useCallback(() => {
    setSignUpVisible(true);
  }, []);

  const dismissSignUp = useCallback(() => {
    setSignUpVisible(false);
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({ isDemo, enterDemo, exitDemo, promptSignUp, signUpVisible, dismissSignUp }),
    [isDemo, enterDemo, exitDemo, promptSignUp, signUpVisible, dismissSignUp],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/**
 * useDemo — read the demo context.
 *
 * Returns a safe inert default when called outside a <DemoProvider> so that
 * components rendered in non-demo trees (or in unit tests) never crash. In a
 * default (no-provider) tree this always reports `isDemo: false`, which keeps
 * the existing auth-gated behavior exactly as-is.
 */
export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    return {
      isDemo: false,
      enterDemo: () => {},
      exitDemo: () => {},
      promptSignUp: () => {},
      signUpVisible: false,
      dismissSignUp: () => {},
    };
  }
  return ctx;
}
