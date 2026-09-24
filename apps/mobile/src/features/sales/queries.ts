import { useQuery } from '@tanstack/react-query';

import type { Sale } from '@poultry/shared-types';

import type { Paginated } from '@/src/features/daily-entry/queries';
import { apiClient } from '@/src/services/api-client';

const PAGE_SIZE = 100;

export interface SaleFilters {
  from?: string;
  to?: string;
}

export function useSales(farmId: string | null, filters: SaleFilters = {}) {
  const { from = '', to = '' } = filters;
  return useQuery({
    queryKey: ['sales', farmId, from, to],
    enabled: farmId !== null,
    queryFn: async () => {
      if (farmId === null) throw new Error('No farm selected');
      const params = new URLSearchParams({ page: '1', pageSize: String(PAGE_SIZE) });
      if (from !== '') params.set('from', from);
      if (to !== '') params.set('to', to);
      const data = await apiClient.get<Paginated<Sale>>(
        `/farms/${farmId}/sales?${params.toString()}`,
      );
      return data.items;
    },
  });
}

export function useSale(saleId: string) {
  return useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => apiClient.get<Sale>(`/sales/${saleId}`),
  });
}