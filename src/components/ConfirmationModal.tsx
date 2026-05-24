import { Modal, Pressable, Text, View } from 'react-native';
import { Button } from './Button';

type ConfirmationModalProps = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, confirm button uses the danger variant. */
  destructive?: boolean;
  /** Disables both buttons (e.g., during async submit). */
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * ConfirmationModal — reusable confirm dialog.
 *
 * Used by:
 *   - Claim flow (ResourceDetailScreen) — non-destructive
 *   - Delete account flow (ProfileScreen) — destructive
 *   - Any future "are you sure?" prompts
 *
 * A11y:
 *   - accessibilityViewIsModal traps screen-reader focus inside
 *   - accessibilityRole="alert" on the title region announces the prompt
 *   - Android back button maps to onCancel via onRequestClose
 *   - Backdrop tap also dismisses (matches platform conventions)
 *
 * Visually: full-bleed semitransparent backdrop with a centered card. NativeWind
 * tokens; respects light/dark.
 */
export function ConfirmationModal({
  visible,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      {/* Backdrop — tap to cancel */}
      <Pressable
        onPress={busy ? undefined : onCancel}
        accessibilityLabel="Dismiss"
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        {/* Stop propagation so taps on the card don't dismiss */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full max-w-md rounded-card border border-light-border bg-light-surface p-5 dark:border-dark-border dark:bg-dark-surface"
        >
          <View accessibilityRole="alert">
            <Text className="text-lg font-semibold text-light-text dark:text-dark-text">
              {title}
            </Text>
            {body && (
              <Text className="mt-2 text-sm leading-5 text-light-text-secondary dark:text-dark-text-secondary">
                {body}
              </Text>
            )}
          </View>

          <View className="mt-5 gap-2">
            <Button
              label={busy ? 'Working…' : confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={() => void onConfirm()}
              disabled={busy}
            />
            <Button label={cancelLabel} variant="ghost" onPress={onCancel} disabled={busy} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
