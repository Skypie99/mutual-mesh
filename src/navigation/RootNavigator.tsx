import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, useColorScheme } from 'react-native';
import { colors } from '@/lib/theme';
import type { HomeStackParamList, MainTabParamList } from '@/types/navigation';

import { HomeScreen } from '@/screens/HomeScreen';
import { ResourceDetailScreen } from '@/screens/ResourceDetailScreen';
import { AddResourceScreen } from '@/screens/AddResourceScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

/**
 * Home stack — Feed → Detail (push) → AddResource (push).
 *
 * The HomeScreen receives navigation handlers from this stack; the real
 * `onOpenResource` / `onAddResource` callbacks wire up here.
 *
 * Phase 0b will replace HomeScreen's mock data with a real `useResources()`
 * hook; the navigation wiring below stays the same.
 */
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Feed" options={{ headerShown: false }}>
        {({ navigation }) => (
          <HomeScreen
            onOpenResource={(id) => navigation.navigate('Detail', { resourceId: id })}
            onAddResource={() => navigation.navigate('AddResource')}
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen name="Detail" options={{ title: '' }}>
        {({ route }) => <ResourceDetailScreen resourceId={route.params.resourceId} />}
      </HomeStack.Screen>
      <HomeStack.Screen
        name="AddResource"
        options={{ title: 'Post a resource', presentation: 'modal' }}
      >
        {({ navigation }) => (
          <AddResourceScreen
            onCancel={() => navigation.goBack()}
            onPosted={() => navigation.goBack()}
          />
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
}

/**
 * Main tab navigator — Home + Profile.
 *
 * Tab icons are plain text glyphs in Day-0 (no icon-font dep yet). Dani's
 * icon system lands in a later cycle.
 */
function MainTabNavigator() {
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
