import { Text, View } from 'react-native';

export type ResourceStatus = 'available' | 'reserved' | 'completed';

type StatusPillProps = {
  status: ResourceStatus;
};

/**
 * Small pill showing a resource's status. White text on either accent color
 * (Available) or muted background (Reserved). Contrast verified by Alex.
 */
export function StatusPill({ status }: StatusPillProps) {
  const bg =
    status === 'available'
      ? 'bg-light-success dark:bg-dark-success'
      : status === 'completed'
        ? 'bg-light-accent dark:bg-dark-accent'
        : 'bg-light-text-muted dark:bg-dark-text-muted';
  const label =
    status === 'available' ? 'Available' : status === 'completed' ? 'Completed' : 'Reserved';
  return (
    <View className={`rounded-full px-2 py-0.5 ${bg}`}>
      <Text accessibilityLabel={`Status: ${label}`} className="text-xs font-semibold text-white">
        {label}
      </Text>
    </View>
  );
}
