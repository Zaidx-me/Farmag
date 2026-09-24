import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SyncOperation } from '../database/sync-queue';

export interface OfflineQueueListProps {
  operations: SyncOperation[];
}

/** Tap-through list of pending sync operations; tapping a row expands its details. */
export function OfflineQueueList({ operations }: OfflineQueueListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (operations.length === 0) return null;

  return (
    <View className="mt-3">
      <Text className="text-xs font-semibold uppercase text-gray-400">Queued changes</Text>
      {operations.map((op) => {
        const expanded = op.operationId === expandedId;
        return (
          <Pressable
            key={op.operationId}
            onPress={() => setExpandedId(expanded ? null : op.operationId)}
            accessibilityRole="button"
            className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-medium text-gray-900">
                {op.entity} · {op.operationType}
              </Text>
              <Text className="text-xs text-gray-400">{expanded ? '▾' : '▸'}</Text>
            </View>
            <Text className="text-xs text-gray-500">
              {op.entityId} — queued {new Date(op.createdAt).toLocaleString()}
            </Text>
            {expanded ? (
              <View className="mt-2 border-t border-gray-200 pt-2">
                <Text className="text-xs text-gray-600">Retries: {op.retryCount}</Text>
                {op.lastError !== null ? (
                  <Text className="mt-1 text-xs text-red-600">Error: {op.lastError}</Text>
                ) : null}
                <Text className="mt-1 text-xs text-gray-500" numberOfLines={4}>
                  {op.payload}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}