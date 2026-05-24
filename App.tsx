import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './global.css';

/**
 * Mutual Mesh — App root.
 *
 * **Day-0 scaffold.** The Root Navigator is wired in so `npm start`
 * boots straight into the marketplace feed (mock data). This lets the team
 * visually verify every screen and the navigation flow without needing
 * Supabase wired up.
 *
 * **Phase 0b** replaces RootNavigator's direct mount with the real Gate:
 *
 *   const { session, profile, loading, signOut } = useAuth();
 *   if (loading) return <SplashScreen />;
 *   const route = routeForGate({ session, isVerified: profile?.is_verified ?? null });
 *   if (route === 'sign-in') return <SignInScreen onSignIn={...} onSignUp={...} />;
 *   if (route === 'wait')    return <WaitingRoomScreen onSignOut={signOut} />;
 *   return <RootNavigator />;
 *
 * The auth + is_verified logic must be implemented after Jordan's PRIVACY.md
 * redesign is approved by Sky (Constitution Art. 7.6).
 *
 * ErrorBoundary wraps everything below so a render-time crash anywhere shows
 * a friendly fallback instead of a blank screen.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
