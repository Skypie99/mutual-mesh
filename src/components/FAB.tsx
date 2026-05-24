import { Pressable, Text } from 'react-native';

type FABProps = {
  onPress: () => void;
  /** Required for screen-reader users — describes the action, not the icon. */
  label: string;
};

/**
 * Floating Action Button — 56pt round, accent background, positioned bottom-right
 * by parent. Glyph is a simple "+" for now; design tokens for icon system land later.
 */
export function FAB({ onPress, label }: FABProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 56, height: 56 }}
      className="absolute bottom-6 right-6 items-center justify-center rounded-full bg-light-accent shadow-md active:opacity-80 dark:bg-dark-accent"
    >
      <Text
        // Plus glyph — keep visually clean, no icon font dependency yet
        className="text-2xl font-bold text-light-accent-text dark:text-dark-accent-text"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        +
      </Text>
    </Pressable>
  );
}
