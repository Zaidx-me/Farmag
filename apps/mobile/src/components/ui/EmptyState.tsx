import { Text, View } from 'react-native';

import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <Text className="text-center text-base font-semibold text-gray-900">{title}</Text>
      {message ? <Text className="mt-1 text-center text-sm text-gray-500">{message}</Text> : null}
      {actionLabel && onAction ? (
        <View className="mt-4">
          <Button title={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}