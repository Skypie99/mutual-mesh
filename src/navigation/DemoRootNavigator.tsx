import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { colors, TOUCH_TARGET_MIN } from '@/lib/theme';
import { useDemo } from '@/lib/demo/DemoContext';
import { ResourcesProvider } from '@/contexts/ResourcesContext';
import { DemoSignUpSheet } from '@/components/DemoSignUpSheet';
import type { DemoStackParamList } from '@/types/navigation';

import { HomeScreen } from '@/screens/HomeScreen';
import { ResourceDetailScreen } from '@/screens/ResourceDetailScreen';

const DemoStack = createNativeStackNavigator<DemoStackParamList>();

/**
 * DemoBanner — persistent "Demo — sample data" strip pinned above the demo
 * stack. Always visible while in demo (NOT auto-dismissing, unlike FlashBanner)
 * so the visitor is never misled about what they're looking at.
 *
 * A11y (Jordan condition 5 + Alex handoff):
 *   - accessibilityLiveRegion="polite" announces it when the demo mounts.
 *   - accessibilityRole="alert" + an explicit label give screen readers the
 *     full "sample data" context up front.
 *   - "Sign up" and "Exit" are 44pt targets (TOUCH_TARGET_MIN).
 */
function DemoBanner() {
  const { promptSignUp, exitDemo } = useDemo();

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Demo mode. You are viewing sample data, not real listings."
      className="flex-row items-center gap-3 border-b border-light-border bg-light-accent px-4 py-2 dark:border-dark-border dark:bg-dark-accent"
    >
      <View className="flex-1">
        <Text className="text-sm font-semibold text-light-accent-text dark:text-dark-accent-text">
          Demo — sample data
        </Text>
        <Text className="text-xs text-light-accent-text dark:text-dark-accent-text">
          Browse freely. Sign up to join the real community.
        </Text>
      </View>

      <Pressable
        onPress={promptSignUp}
        accessibilityRole="button"
        accessibilityLabel="Sign up"
        accessibilityHint="Opens a prompt explaining how to join Mutual Mesh."
        style={{ minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' }}
        className="rounded-button bg-light-surface px-3 active:opacity-80 dark:bg-dark-surface"
      >
        <Text className="text-sm font-semibold text-light-accent dark:text-dark-accent">
          Sign up
        </Text>
      </Pressable>

      <Pressable
        onPress={exitDemo}
        accessibilityRole="button"
        accessibilityLabel="Exit demo"
        accessibilityHint="Leaves the demo and returns to the sign-in screen."
        style={{ minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' }}
        className="active:opacity-70"
      >
        <Text className="text-sm font-semibold text-light-accent-text underline dark:text-dark-accent-text">
          Exit
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * DemoStackNavigator — Feed → Detail, reusing the real screens.
 *
 * The screens read DemoContext and serve synthetic fixtures. Demo-specific
 * behavior: `onAddResource` opens the "Sign up to participate" sheet instead of
 * navigating to AddResource (read-only; Jordan condition 3), and the list/map
 * toggle is hidden (`showMapToggle={false}`) because the web map (react-leaflet)
 * isn't wired — so the demo has no Map screen and never hits that crash.
 */
function DemoStackNavigator() {
  const { promptSignUp } = useDemo();

  return (
    <ResourcesProvider>
      <DemoStack.Navigator>
        <DemoStack.Screen name="Feed" options={{ headerShown: false }}>
          {({ navigation }) => (
            <HomeScreen
              onOpenResource={(id) => navigation.navigate('Detail', { resourceId: id })}
              onAddResource={promptSignUp}
              showMapToggle={false}
            />
          )}
        </DemoStack.Screen>
        <DemoStack.Screen name="Detail" options={{ title: '' }}>
          {({ navigation, route }) => (
            <ResourceDetailScreen
              resourceId={route.params.resourceId}
              onNavigateBack={() => navigation.navigate('Feed')}
            />
          )}
        </DemoStack.Screen>
      </DemoStack.Navigator>
    </ResourcesProvider>
  );
}

/**
 * DemoRootNavigator — root for the anonymous guest demo (WEB-4).
 *
 * Mirrors RootNavigator's NavigationContainer + nav-theme pattern (mode-aware
 * via useColorScheme), but renders a single stack (no bottom tabs — there's no
 * user, so no Profile/Verify) with the persistent demo banner pinned on top and
 * the sign-up sheet mounted over everything.
 */
export function DemoRootNavigator() {
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
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme}>
        {/* Persistent honesty banner sits above the stack in the reading order. */}
        <DemoBanner />
        <DemoStackNavigator />
      </NavigationContainer>
      {/* Sign-up sheet — mounted once so any demo surface can open it. */}
      <DemoSignUpSheet />
    </View>
  );
}
