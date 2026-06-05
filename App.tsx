import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DemoProvider, useDemo } from '@/lib/demo/DemoContext';
import { decideGateRoute } from '@/lib/verification';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RootNavigator } from '@/navigation/RootNavigator';
import { DemoRootNavigator } from '@/navigation/DemoRootNavigator';
import { SignInScreen } from '@/screens/SignInScreen';
import { CompleteProfileScreen } from '@/screens/CompleteProfileScreen';
import { WaitingRoomScreen } from '@/screens/WaitingRoomScreen';
import { SplashScreen } from '@/screens/SplashScreen';
import './global.css';

/**
 * Mutual Mesh — App root.
 *
 * Gate routing is delegated to `decideGateRoute` in src/lib/verification.ts
 * (pure, fully unit-tested). Five logical states map to five components:
 *
 *   splash               → SplashScreen
 *   sign-in              → SignInScreen
 *   complete-profile     → CompleteProfileScreen  (signup step 3)
 *   wait                 → WaitingRoomScreen
 *   home                 → RootNavigator
 *
 * The Gate component adds ONE piece of local UI state on top: a
 * "splashDismissed" flag so a fast boot still honors MIN_DISPLAY_MS in
 * SplashScreen without re-mounting (DFS-C1.4).
 *
 * Three-layer enforcement: UI Gate here is layer 1. RLS in `schema.sql` is
 * layer 2. Storage RLS is layer 3. If the UI is bypassed (deep link, hacked
 * client), the other two layers still block reads.
 *
 * ErrorBoundary wraps the Gate so any render-time crash shows a friendly
 * fallback instead of a blank screen.
 */
function Gate() {
  const { loading, session, profile } = useAuth();
  const { isDemo } = useDemo();
  const [splashDismissed, setSplashDismissed] = useState(false);

  const route = decideGateRoute({ loading, session, profile, demo: isDemo });

  // Anonymous guest demo (WEB-4): short-circuit BEFORE the splash block. The
  // demo has no async boot (no getSession, no profile fetch), so there's
  // nothing to wait on — go straight to the synthetic read-only navigator.
  if (route === 'demo-home') {
    return <DemoRootNavigator />;
  }

  // Splash UX wrapper: even when the route resolves to a non-splash screen,
  // we keep showing the Splash until MIN_DISPLAY_MS has elapsed (avoids flash).
  if (route === 'splash' || !splashDismissed) {
    return <SplashScreen ready={route !== 'splash'} onDismiss={() => setSplashDismissed(true)} />;
  }

  switch (route) {
    case 'sign-in':
      return <SignInScreen />;
    case 'complete-profile':
      return <CompleteProfileScreen />;
    case 'wait':
      return <WaitingRoomScreen />;
    case 'home':
      return <RootNavigator />;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* DemoProvider is OUTSIDE AuthProvider: a guest has no auth/session. */}
        <DemoProvider>
          <AuthProvider>
            <ErrorBoundary>
              <Gate />
            </ErrorBoundary>
          </AuthProvider>
        </DemoProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
