import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';

import type { SyncOperation } from '../database/sync-queue';
import { clearQueue, countByEntity, listPending } from '../features/offline/queue';
import type { UseOfflineStatusResult } from '../hooks/useOfflineStatus';
import { getDb } from '../services/sync';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { OfflineQueueList } from './OfflineQueueList';

export interface SyncStatusViewProps {
  visible: boolean;
  onClose: () => void;
  status: UseOfflineStatusResult;
}

/**
 * Bottom-sheet sync status: last synced time, per-entity pending counts,
 * a tap-through queue list, retry-all, and clear-queue (with confirmation).
 */
export function SyncStatusView({ visible, onClose, status }: SyncStatusViewProps) {
  const [operations, setOperations] = useState<SyncOperation[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    setOperations(await listPending(db));
  }, []);

  useEffect(() => {
    if (visible) void reload();
  }, [visible, reload, status.queueCount]);

  const handleClear = useCallback(async () => {
    const db = await getDb();
    await clearQueue(db);
    setConfirmClear(false);
    await reload();
    await status.refresh();
  }, [reload, status]);

  const entities = countByEntity(operations);

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[80%] rounded-t-2xl bg-white p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-gray-900">Sync status</Text>
              <Button title="Close" onPress={onClose} variant="ghost" className="px-2 py-1" />
            </View>

            <Text className="mt-1 text-sm text-gray-500">
              Last synced:{' '}
              {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'Never'}
            </Text>
            {status.isOffline ? (
              <Text className="mt-1 text-xs font-medium text-amber-700">
                Offline — changes are saved on this device and will sync later.
              </Text>
            ) : null}

            <ScrollView className="mt-4">
              {entities.length === 0 ? (
                <Text className="text-sm text-gray-500">Everything is synced.</Text>
              ) : (
                entities.map((entity) => (
                  <View
                    key={entity.entity}
                    className="flex-row items-center justify-between border-b border-gray-100 py-2"
                  >
                    <Text className="text-sm text-gray-900">{entity.entity}</Text>
                    <View className="flex-row items-center gap-2">
                      {entity.failed > 0 ? (
                        <Text className="text-xs font-semibold text-red-600">
                          {entity.failed} failed
                        </Text>
                      ) : null}
                      <Text className="text-sm font-semibold text-gray-900">{entity.count}</Text>
                    </View>
                  </View>
                ))
              )}
              <OfflineQueueList operations={operations} />
            </ScrollView>

            <View className="mt-4 flex-row gap-2">
              <Button
                title="Retry all"
                onPress={() => void status.refresh()}
                loading={status.syncing}
                className="flex-1"
              />
              <Button
                title="Clear queue"
                onPress={() => setConfirmClear(true)}
                variant="destructive"
                className="flex-1"
                disabled={status.queueCount === 0}
              />
            </View>
          </View>
        </View>
      </Modal>
      <ConfirmDialog
        visible={confirmClear}
        title="Clear sync queue?"
        message="Remove all pending offline changes from this device? They will not be sent to the server."
        confirmLabel="Clear"
        destructive
        onConfirm={() => void handleClear()}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}