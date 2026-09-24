import { useQuery } from '@tanstack/react-query';

import type { Vaccination } from '@poultry/shared-types';

import { apiClient } from '@/src/services/api-client';

export function useVaccinations(batchId: string | null) {
  return useQuery({
    queryKey: ['vaccinations', batchId],
    enabled: batchId !== null,
    queryFn: async () => {
      if (batchId === null) throw new Error('No batch selected');
      const data = await apiClient.get<Vaccination[]>(`/batches/${batchId}/vaccinations`);
      return data;
    },
  });
}