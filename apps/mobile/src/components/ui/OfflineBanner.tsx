import { Text, View } from 'react-native';

import { Button } from './Button';

export interface OfflineBannerProps {
  pendingCount: number;
  onSync?: () => void;
}

/** Amber banner shown whenever the local sync queue is non-empty. */
export function OfflineBanner({ pendingCount, onSync }: OfflineBannerProps) {
  if (pendingCount <= 0) return null;
  return (
    <View className="flex-row items-center justify-between bg-amber-50 px-4 py-2">
      <Text className="flex-1 text-xs font-medium text-amber-800">
        {pendingCount} change{pendingCount === 1 ? '' : 's'} pending sync
      </Text>
      {onSync ? (
        <Button title="Sync" onPress={onSync} variant="ghost" className="px-2 py-1" />
      ) : null}
    </View>
  );
}