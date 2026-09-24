import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import type { FeedItem } from '@poultry/shared-types';

import {
  Badge,
  Card,
  EmptyState,
  OfflineBanner,
  ScreenState,
  Select,
  type BadgeTone,
} from '@/src/components/ui';
import { useFarms } from '@/src/features/daily-entry/queries';
import { useFeedItems } from '@/src/features/feed/queries';
import { stockBadgeTone } from '@/src/features/feed/stock';
import { useSync } from '@/src/hooks/useSync';

const TYPE_TONE: Record<string, BadgeTone> = {
  STARTER: 'blue',
  GROWER: 'green',
  FINISHER: 'amber',
  OTHER: 'gray',
};

export default function FeedScreen() {
  const router = useRouter();
  const { pendingCount, refresh } = useSync();
  const { data: farms, isLoading: farmsLoading, error: farmsError, refetch: refetchFarms } =
    useFarms();
  const [farmId, setFarmId] = useState<string | null>(null);

  useEffect(() => {
    if (farmId === null && farms !== undefined && farms.length > 0) {
      setFarmId(farms[0].id);
    }
  }, [farmId, farms]);

  const { data: items, isLoading, error, refetch, isRefetching } = useFeedItems(farmId);

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">Feed</Text>
        {farms !== undefined && farms.length > 1 ? (
          <Select
            className="mt-3"
            options={farms.map((farm) => ({ label: farm.name, value: farm.id }))}
            value={farmId ?? ''}
            onChange={(value) => setFarmId(value)}
          />
        ) : null}
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
        emptyMessage="Create a farm to start tracking feed."
      >
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          ListEmptyComponent={
            <EmptyState title="No feed items yet" message="Add a feed item to get started." />
          }
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              onPress={() =>
                router.push({
                  pathname: '/feed/[feedItemId]',
                  params: { feedItemId: item.id, farmId: item.farmId },
                })
              }
            />
          )}
        />
      </ScreenState>
    </View>
  );
}

function FeedCard({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const tone = stockBadgeTone(item.currentStock, item.lowStockThreshold);
  return (
    <Card onPress={onPress}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{item.name}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">{item.type}</Text>
        </View>
        <Badge label={item.type} tone={TYPE_TONE[item.type] ?? 'gray'} />
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">
          Stock:{' '}
          <Text className="font-semibold text-gray-900">
            {item.currentStock} {item.unit}
          </Text>
        </Text>
        <Badge label={tone === 'red' ? 'LOW' : 'OK'} tone={tone} />
      </View>
    </Card>
  );
}