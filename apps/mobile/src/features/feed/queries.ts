import { useQuery } from '@tanstack/react-query';

import type { FeedItem, FeedTransaction } from '@poultry/shared-types';

import type { Paginated } from '@/src/features/daily-entry/queries';
import { apiClient } from '@/src/services/api-client';

const PAGE_SIZE = 100;

export function useFeedItems(farmId: string | null) {
  return useQuery({
    queryKey: ['feed-items', farmId],
    enabled: farmId !== null,
    queryFn: async () => {
      if (farmId === null) throw new Error('No farm selected');
      const data = await apiClient.get<Paginated<FeedItem>>(
        `/farms/${farmId}/feed?page=1&pageSize=${PAGE_SIZE}`,
      );
      return data.items;
    },
  });
}

export function useFeedTransactions(feedItemId: string) {
  return useQuery({
    queryKey: ['feed-transactions', feedItemId],
    queryFn: async () => {
      const data = await apiClient.get<Paginated<FeedTransaction>>(
        `/feed/${feedItemId}/transactions?page=1&pageSize=${PAGE_SIZE}`,
      );
      return data.items;
    },
  });
}