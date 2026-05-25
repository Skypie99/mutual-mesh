import { Text, View } from 'react-native';
import { Button } from './Button';

type EmptyStateProps = {
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
};

/**
 * EmptyState — shown when a list or screen has nothing to render. Honest
 * copy (no "Oops! Looks like there's nothing here yet ✨"). Optional CTA.
 *
 * Per Riley's friction analysis, empty marketplace is the #1 friction —
 * the copy here should be honest about WHY (community is just starting,
 * seed phase, etc.) rather than apologetic.
 */
export function EmptyState({ title, description, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Text
        accessibilityRole="header"
        className="text-center text-xl font-semibold text-light-text dark:text-dark-text"
      >
        {title}
      </Text>
      {description && (
        <Text className="mt-2 text-center text-base text-light-text-secondary dark:text-dark-text-secondary">
          {description}
        </Text>
      )}
      {ctaLabel && onCta && (
        <View className="mt-6 w-full max-w-xs">
          <Button label={ctaLabel} onPress={onCta} />
        </View>
      )}
    </View>
  );
}
