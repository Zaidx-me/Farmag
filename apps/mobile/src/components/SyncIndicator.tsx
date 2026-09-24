import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { SyncStatusView } from './SyncStatusView';

/**
 * Top-right global sync indicator. Phase visuals: syncing → spinner,
 * queued → amber dot + pending count, error → red dot + failed count,
 * synced → green check, none → hidden. Tapping opens the SyncStatusView.
 */
export function SyncIndicator() {
  const status = useOfflineStatus();
  const insets = useSafeAreaInsets();
  const [statusVisible, setStatusVisible] = useState(false);

  const { offlinePhase, queueCount, failedCount } = status;
  if (offlinePhase === 'none') return null;

  return (
    <>
      <Pressable
        onPress={() => setStatusVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Sync status"
        className="absolute right-4 z-50 h-9 flex-row items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 shadow-sm"
        style={{ top: insets.top + 8 }}
      >
        {offlinePhase === 'syncing' ? (
          <ActivityIndicator size="small" color="#16a34a" />
        ) : offlinePhase === 'synced' ? (
          <Text className="text-sm font-bold text-green-600">✓</Text>
        ) : (
          <>
            <View
              className={`h-2.5 w-2.5 rounded-full ${
                offlinePhase === 'error' ? 'bg-red-500' : 'bg-amber-500'
              }`}
            />
            <Text className="text-xs font-semibold text-gray-800">
              {offlinePhase === 'error' ? failedCount : queueCount}
            </Text>
          </>
        )}
      </Pressable>
      <SyncStatusView
        visible={statusVisible}
        onClose={() => setStatusVisible(false)}
        status={status}
      />
    </>
  );
}