import { Modal, Text, View } from 'react-native';

import { Button } from './Button';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive-action confirmation modal. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 p-6">
        <View className="w-full rounded-2xl bg-white p-5">
          <Text className="text-base font-semibold text-gray-900">{title}</Text>
          <Text className="mt-2 text-sm text-gray-600">{message}</Text>
          <View className="mt-5 flex-row justify-end gap-2">
            <Button title={cancelLabel} onPress={onCancel} variant="secondary" />
            <Button
              title={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'destructive' : 'primary'}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}