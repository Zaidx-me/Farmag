import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from './Button';
import { EmptyState } from './EmptyState';

export interface ScreenStateProps {
  /** Show the centered loading spinner. */
  loading?: boolean;
  /** Non-null shows the error state with an optional retry. */
  error?: string | null;
  /** True shows the empty state (title/message/action). */
  empty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  retry?: () => void;
  children: React.ReactNode;
}

/**
 * Wraps the five screen states (AGENTS.md §14): loading, error, empty, and
 * content. `retry` renders a Retry button in the error state.
 */
export function ScreenState({
  loading = false,
  error = null,
  empty = false,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
  retry,
  children,
}: ScreenStateProps) {
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }
  if (error != null) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-center text-base font-medium text-gray-900">{error}</Text>
        {retry ? (
          <View className="mt-4">
            <Button title="Retry" onPress={retry} variant="secondary" />
          </View>
        ) : null}
      </View>
    );
  }
  if (empty) {
    return (
      <EmptyState
        title={emptyTitle}
        message={emptyMessage}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }
  return <>{children}</>;
}