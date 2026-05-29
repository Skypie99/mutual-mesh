import { useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, useColorScheme } from 'react-native';
import { colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import type { HomeStackParamList, MainTabParamList } from '@/types/navigation';
import { ResourcesProvider } from '@/contexts/ResourcesContext';

import { HomeScreen } from '@/screens/HomeScreen';
import { ResourceDetailScreen } from '@/screens/ResourceDetailScreen';
import { ResourceMapScreen } from '@/screens/ResourceMapScreen';
import { AddResourceScreen } from '@/screens/AddResourceScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { AdminVerificationScreen } from '@/screens/AdminVerificationScreen';

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

/**
 * Home stack — Feed → Detail (push) → AddResource (push).
 *
 * The HomeScreen receives navigation handlers from this stack; the real
 * `onOpenResource` / `onAddResource` callbacks wire up here.
 *
 * <ResourcesProvider> wraps the entire stack so HomeScreen and ResourceMapScreen
 * share a single Supabase Realtime subscription and a single fetch call.
 * Without this wrapper, each screen that calls useResources() creates its own
 * channel on 'resources-feed', causing duplicate subscriptions and wasted
 * fetches (Peter perf audit wave-6, 2026-05-25).
 */
function HomeStackNavigator() {
  const [postSuccessMessage, setPostSuccessMessage] = useState<string | null>(null);

  return (
    <ResourcesProvider>
    <HomeStack.Navigator>
      <HomeStack.Screen name="Feed" options={{ headerShown: false }}>
        {({ navigation }) => (
          <HomeScreen
            onOpenResource={(id) => navigation.navigate('Detail', { resourceId: id })}
            onAddResource={() => navigation.navigate('AddResource')}
            onOpenMap={() => navigation.navigate('ResourceMap')}
            successMessage={postSuccessMessage}
            onSuccessDismiss={() => setPostSuccessMessage(null)}
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen name="Detail" options={{ title: '' }}>
        {({ route }) => <ResourceDetailScreen resourceId={route.params.resourceId} />}
      </HomeStack.Screen>
      <HomeStack.Screen name="ResourceMap" options={{ title: 'Map', headerShown: false }}>
        {({ navigation }) => (
          <ResourceMapScreen
            onOpenResource={(id) => navigation.navigate('Detail', { resourceId: id })}
            onSelectFsa={() => navigation.navigate('Feed')}
            onSwitchToList={() => navigation.navigate('Feed')}
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen
        name="AddResource"
        options={{ title: 'Post a resource', presentation: 'modal' }}
      >
        {({ navigation }) => (
          <AddResourceScreen
            onCancel={() => navigation.goBack()}
            onPosted={(msg) => {
              if (msg) setPostSuccessMessage(msg);
              navigation.goBack();
            }}
          />
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
    </ResourcesProvider>
  );
}

/**
 * Main tab navigator — Home + (admin-only) Verify + Profile.
 *
 * Tab icons are plain text glyphs in Day-0 (no icon-font dep yet). Dani's
 * icon system lands in a later cycle.
 *
 * The "Verify" tab is conditionally rendered only when
 * `profile.is_admin === true` (AC-1 from spec-cycle-5-admin-verification-ui.md).
 * Three-layer enforcement: this hides the tab in the UI; RLS and RPC layers
 * enforce the gate server-side regardless of UI bypass.
 */
function MainTabNavigator() {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin === true;

  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <MainTab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }} accessibilityElementsHidden>
              ◧
            </Text>
          ),
        }}
      />
      {isAdmin && (
        <MainTab.Screen
          name="VerifyTab"
          component={AdminVerificationScreen}
          options={{
            title: 'Verify',
            tabBarIcon: ({ color, size }) => (
              <Text style={{ color, fontSize: size }} accessibilityElementsHidden>
                ✓
              </Text>
            ),
          }}
        />
      )}
      <MainTab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }} accessibilityElementsHidden>
              ◉
            </Text>
          ),
        }}
      />
    </MainTab.Navigator>
  );
}

/**
 * Root navigator — wrap in NavigationContainer with a react-navigation theme
 * that mirrors our NativeWind tokens. Mode-aware via `useColorScheme`.
 *
 * **Phase 0b** wraps this in a Gate component (per `verification.ts`):
 *   if (route === 'sign-in') return <SignInScreen />;
 *   if (route === 'wait')    return <WaitingRoomScreen />;
 *   return <RootNavigator />;
 *
 * For Day-0, App.tsx renders RootNavigator directly; the Gate logic is
 * stubbed.
 */
export function RootNavigator() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: palette.bg,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      primary: palette.accent,
      notification: palette.danger,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <MainTabNavigator />
    </NavigationContainer>
  );
}
