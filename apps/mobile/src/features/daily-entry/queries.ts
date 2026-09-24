import { useQuery } from '@tanstack/react-query';

import type { Batch, DailyRecord, Farm } from '@poultry/shared-types';

import { apiClient } from '@/src/services/api-client';

export interface Paginated<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface BatchSummary {
  currentBirds: number;
  mortalityPct: number;
  totalFeedConsumed: string;
  currentAvgWeightKg: string | null;
  fcr: { value: number | null; incomplete: boolean };
}

/** `GET /batches/:id` — batch + shed + summary + last-7 records + sales. */
export interface BatchDetail extends Batch {
  shed?: { id: string; name: string };
  summary: BatchSummary;
  last7DailyRecords: DailyRecord[];
  sales: unknown[];
}

const PAGE_SIZE = 100;

export function useFarms() {
  return useQuery({
    queryKey: ['farms'],
    queryFn: async () => {
      const data = await apiClient.get<Paginated<Farm>>(`/farms?page=1&pageSize=${PAGE_SIZE}`);
      return data.items;
    },
  });
}

export function useBatches(farmId: string | null, status?: string) {
  return useQuery({
    queryKey: ['batches', farmId, status ?? 'ALL'],
    enabled: farmId !== null,
    queryFn: async () => {
      if (farmId === null) throw new Error('No farm selected');
      const params = new URLSearchParams({ page: '1', pageSize: String(PAGE_SIZE) });
      if (status !== undefined) params.set('status', status);
      const data = await apiClient.get<Paginated<Batch>>(
        `/farms/${farmId}/batches?${params.toString()}`,
      );
      return data.items;
    },
  });
}

export function useBatch(batchId: string) {
  return useQuery({
    queryKey: ['batch', batchId],
    queryFn: async () => apiClient.get<BatchDetail>(`/batches/${batchId}`),
  });
}

export function useDailyRecords(batchId: string) {
  return useQuery({
    queryKey: ['daily-records', batchId],
    queryFn: async () => {
      const data = await apiClient.get<Paginated<DailyRecord>>(
        `/batches/${batchId}/daily-records?page=1&pageSize=${PAGE_SIZE}`,
      );
      return data.items;
    },
  });
}