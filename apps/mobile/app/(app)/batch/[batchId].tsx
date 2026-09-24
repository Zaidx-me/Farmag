import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import type { DailyRecord } from '@poultry/shared-types';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  OfflineBanner,
  ScreenState,
  type BadgeTone,
} from '@/src/components/ui';
import { useBatch, useDailyRecords, type BatchDetail } from '@/src/features/daily-entry/queries';
import { ageDays } from '@/src/features/daily-entry/record';
import { latestSevenDayWeights, type WeightPoint } from '@/src/features/daily-entry/weight-curve';
import { useSync } from '@/src/hooks/useSync';

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'green',
  UPCOMING: 'amber',
  CLOSED: 'gray',
  SOLD: 'blue',
};

export default function BatchDetailScreen() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const router = useRouter();
  const { pendingCount, refresh } = useSync();
  const { data: batch, isLoading, error, refetch, isRefetching } = useBatch(batchId);
  const { data: records } = useDailyRecords(batchId);

  const curve = latestSevenDayWeights(batch?.last7DailyRecords ?? []);

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <ScreenState loading={isLoading} error={error?.message ?? null} retry={() => void refetch()}>
        {batch ? (
          <FlatList
            data={records ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
            }
            ListHeaderComponent={
              <View style={{ gap: 12 }}>
                <InfoCard batch={batch} />
                <SummaryCards batch={batch} />
                <WeightCurve points={curve} />
                <Button
                  title="Add Daily Entry"
                  onPress={() => router.push(`/daily-entry/${batch.id}`)}
                />
                <Text className="text-base font-semibold text-gray-900">Daily Records</Text>
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                title="No daily records yet"
                message="Add the first daily entry for this batch."
              />
            }
            renderItem={({ item }) => <RecordRow record={item} />}
          />
        ) : null}
      </ScreenState>
    </View>
  );
}

function InfoCard({ batch }: { batch: BatchDetail }) {
  return (
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900">{batch.batchNumber}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">{batch.breed}</Text>
        </View>
        <Badge label={batch.status} tone={STATUS_TONE[batch.status] ?? 'gray'} />
      </View>
      <View className="mt-3 gap-1">
        <InfoRow label="Farm" value={batch.shed?.name ?? batch.farmId} />
        <InfoRow label="Birds at start" value={String(batch.initialBirds)} />
        <InfoRow label="Arrival" value={batch.arrivalDate} />
        <InfoRow label="Age" value={`${ageDays(batch.arrivalDate)} days`} />
      </View>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900">{value}</Text>
    </View>
  );
}

function SummaryCards({ batch }: { batch: BatchDetail }) {
  const summary = batch.summary;
  const items = [
    { label: 'Current birds', value: String(summary.currentBirds) },
    { label: 'Mortality', value: `${summary.mortalityPct.toFixed(1)}%` },
    { label: 'Feed (kg)', value: summary.totalFeedConsumed },
    { label: 'Avg weight', value: summary.currentAvgWeightKg ?? '—' },
  ];
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {items.map((item) => (
        <View
          key={item.label}
          className="min-w-[45%] flex-1 rounded-xl border border-gray-200 bg-white p-3"
        >
          <Text className="text-xs text-gray-500">{item.label}</Text>
          <Text className="mt-1 text-base font-semibold text-gray-900">{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function WeightCurve({ points }: { points: WeightPoint[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((point) => point.weightKg ?? 0), 1);
  return (
    <Card>
      <Text className="text-sm font-semibold text-gray-900">Weight (last 7 days)</Text>
      <View className="mt-3 flex-row items-end justify-between" style={{ height: 96, gap: 6 }}>
        {points.map((point) => {
          const height =
            point.weightKg === null ? 4 : Math.max(4, Math.round((point.weightKg / max) * 80));
          return (
            <View key={point.date} className="flex-1 items-center">
              <View className="w-full rounded-t bg-green-500" style={{ height }} />
              <Text className="mt-1 text-[9px] text-gray-500">{point.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function RecordRow({ record }: { record: DailyRecord }) {
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-gray-900">{record.recordDate}</Text>
        <Text className="text-xs text-gray-500">Mortality: {record.mortality}</Text>
      </View>
      <View className="mt-2 flex-row gap-4">
        <Text className="text-xs text-gray-500">Weight: {record.averageWeightKg ?? '—'} kg</Text>
        <Text className="text-xs text-gray-500">Feed: {record.feedConsumedKg ?? '—'} kg</Text>
        <Text className="text-xs text-gray-500">Humidity: {record.humidityPercent ?? '—'}%</Text>
      </View>
    </Card>
  );
}