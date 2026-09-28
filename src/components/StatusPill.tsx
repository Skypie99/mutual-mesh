import { Text, View } from 'react-native';

export type ResourceStatus = 'available' | 'reserved' | 'completed';

type StatusPillProps = {
  status: ResourceStatus;
};

/**
 * Small pill showing a resource's status. White text on either accent color
 * (Available) or muted background (Reserved). Contrast verified by Alex.
 *
 * Completed dark-mode: bg-dark-accent (#4FBFA8) is too bright for white text
 * (2.25:1). Uses dark-accent-text (#0E0D0B) in dark mode to achieve 8.65:1.
 * Light mode keeps white text on dark accent (#1F7A6A) at 5.18:1. (F-003 fix)
 */
export function StatusPill({ status }: StatusPillProps) {
  const bg =
    status === 'available'
      ? 'bg-light-success dark:bg-dark-success'
      : status === 'completed'
        ? 'bg-light-accent dark:bg-dark-accent'
        : 'bg-light-text-muted dark:bg-dark-text-muted';
  // Completed: dark-mode accent bg is light (#4FBFA8); use dark-accent-text for contrast.
  const textColor =
    status === 'completed' ? 'text-white dark:text-dark-accent-text' : 'text-white';
  const label =
    status === 'available' ? 'Available' : status === 'completed' ? 'Completed' : 'Reserved';
  return (
    <View className={`rounded-full px-2 py-0.5 ${bg}`}>
      <Text accessibilityLabel={`Status: ${label}`} className={`text-xs font-semibold ${textColor}`}>
        {label}
      </Text>
    </View>
  );
}
