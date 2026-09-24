/**
 * ExportPanel (T39) — edge-guard UI for the CSV export feature.
 *
 * Guards:
 * - empty-set → renders the shared `EmptyState` when every entity has 0 rows
 *   (a header-only CSV is still valid, but there is nothing worth exporting).
 * - big-set → the entity list renders through a virtualized `FlatList`, and
 *   the export itself runs through the chunked converter (`entityToCsvChunked`)
 *   with a live progress bar instead of a blocking freeze.
 *
 * Presentational: the caller owns the `useExport` hook and the db wiring.
 */

import { FlatList, Text, View } from 'react-native';

import type { ExportStatus } from '../../hooks/useExport';
import type { ExportEntity } from '../../utils/export/converters';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

export interface ExportEntityRow {
  entity: ExportEntity;
  label: string;
  rowCount: number;
}

export interface ExportPanelProps {
  entities: ExportEntityRow[];
  status: ExportStatus;
  progress: number;
  error: string | null;
  onExport: (entity: ExportEntity) => void;
  onReset: () => void;
}

export function ExportPanel({
  entities,
  status,
  progress,
  error,
  onExport,
  onReset,
}: ExportPanelProps) {
  const totalRows = entities.reduce((sum, entity) => sum + entity.rowCount, 0);
  const exporting = status === 'exporting';

  // Edge guard: empty-set → EmptyState.
  if (totalRows === 0) {
    return (
      <EmptyState
        title="Nothing to export"
        message="Add batches, daily records, expenses, or sales before exporting."
      />
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={entities}
        keyExtractor={(item) => item.entity}
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900">{item.label}</Text>
              <Text className="text-xs text-gray-500">
                {item.rowCount} {item.rowCount === 1 ? 'row' : 'rows'}
              </Text>
            </View>
            <Button
              title="Export"
              onPress={() => onExport(item.entity)}
              disabled={exporting}
              className="px-3 py-2"
            />
          </View>
        )}
        ItemSeparatorComponent={() => <View className="h-2" />}
        contentContainerStyle={{ padding: 16 }}
      />

      {exporting ? (
        <View className="border-t border-gray-200 bg-white px-4 py-3">
          <View className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <View
              className="h-full rounded-full bg-green-600"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
          <Text className="mt-1 text-xs text-gray-500">
            Exporting… {Math.round(progress * 100)}%
          </Text>
        </View>
      ) : null}

      {status === 'done' ? (
        <View className="border-t border-gray-200 bg-white px-4 py-3">
          <Text className="text-sm font-medium text-green-700">
            Export complete — check the share sheet.
          </Text>
          <Button title="Export again" onPress={onReset} variant="ghost" className="mt-1 self-start px-2 py-1" />
        </View>
      ) : null}

      {status === 'error' ? (
        <View className="border-t border-gray-200 bg-white px-4 py-3">
          <Text className="text-sm font-medium text-red-600">Export failed: {error}</Text>
          <Button title="Try again" onPress={onReset} variant="ghost" className="mt-1 self-start px-2 py-1" />
        </View>
      ) : null}
    </View>
  );
}