import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import type { Batch } from '@poultry/shared-types';

import {
  Badge,
  Card,
  EmptyState,
  Input,
  OfflineBanner,
  ScreenState,
  Select,
  type BadgeTone,
} from '@/src/components/ui';
import { useBatches, useFarms } from '@/src/features/daily-entry/queries';
import { ageDays } from '@/src/features/daily-entry/record';
import { useSync } from '@/src/hooks/useSync';

const STATUS_OPTIONS = [
  { label: 'All', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Sold', value: 'SOLD' },
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'green',
  UPCOMING: 'amber',
  CLOSED: 'gray',
  SOLD: 'blue',
};

export default function BatchesScreen() {
  const router = useRouter();
  const { pendingCount, refresh } = useSync();
  const { data: farms, isLoading: farmsLoading, error: farmsError, refetch: refetchFarms } =
    useFarms();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (farmId === null && farms !== undefined && farms.length > 0) {
      setFarmId(farms[0].id);
    }
  }, [farmId, farms]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: batches, isLoading, error, refetch, isRefetching } = useBatches(
    farmId,
    status === 'ALL' ? undefined : status,
  );

  const filtered = useMemo(() => {
    if (batches === undefined) return [];
    if (debouncedSearch === '') return batches;
    return batches.filter(
      (batch) =>
        batch.batchNumber.toLowerCase().includes(debouncedSearch) ||
        batch.breed.toLowerCase().includes(debouncedSearch),
    );
  }, [batches, debouncedSearch]);

  const farmName = farms?.find((farm) => farm.id === farmId)?.name;

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">Batches</Text>
        {farms !== undefined && farms.length > 1 ? (
          <Select
            className="mt-3"
            options={farms.map((farm) => ({ label: farm.name, value: farm.id }))}
            value={farmId ?? ''}
            onChange={(value) => setFarmId(value)}
          />
        ) : null}
        <Select className="mt-3" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <Input
          className="mt-3"
          placeholder="Search by batch number or breed"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>
      <ScreenState
        loading={farmsLoading || (farmId !== null && isLoading)}
        error={farmsError?.message ?? error?.message ?? null}
        retry={() => {
          void refetchFarms();
          void refetch();
        }}
        empty={!farmsLoading && farms !== undefined && farms.length === 0}
        emptyTitle="No farms yet"
        emptyMessage="Create a farm to start tracking batches."
      >
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={
            <EmptyState
              title={debouncedSearch !== '' ? 'No matching batches' : 'No batches yet'}
              message={
                debouncedSearch !== ''
                  ? 'Try a different search or status filter.'
                  : 'Add a batch to get started.'
              }
            />
          }
          renderItem={({ item }) => (
            <BatchCard
              batch={item}
              farmName={farmName}
              onPress={() => router.push(`/batch/${item.id}`)}
            />
          )}
        />
      </ScreenState>
    </View>
  );
}

function BatchCard({
  batch,
  farmName,
  onPress,
}: {
  batch: Batch;
  farmName?: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{batch.batchNumber}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">
            {batch.breed}
            {farmName ? ` · ${farmName}` : ''}
          </Text>
        </View>
        <Badge label={batch.status} tone={STATUS_TONE[batch.status] ?? 'gray'} />
      </View>
      <View className="mt-3 flex-row gap-4">
        <Text className="text-xs text-gray-500">Age: {ageDays(batch.arrivalDate)}d</Text>
        <Text className="text-xs text-gray-500">Birds: {batch.initialBirds}</Text>
        <Text className="text-xs text-gray-500">FCR: —</Text>
      </View>
    </Card>
  );
}