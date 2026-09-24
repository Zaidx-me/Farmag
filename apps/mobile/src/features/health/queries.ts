import { useQuery } from '@tanstack/react-query';

import type { Medicine, MedicineTransaction } from '@poultry/shared-types';

import type { Paginated } from '@/src/features/daily-entry/queries';
import { apiClient } from '@/src/services/api-client';

const PAGE_SIZE = 100;

export function useMedicines(farmId: string | null) {
  return useQuery({
    queryKey: ['medicines', farmId],
    enabled: farmId !== null,
    queryFn: async () => {
      if (farmId === null) throw new Error('No farm selected');
      const data = await apiClient.get<Paginated<Medicine>>(
        `/farms/${farmId}/medicines?page=1&pageSize=${PAGE_SIZE}`,
      );
      return data.items;
    },
  });
}

export function useMedicineTransactions(medicineId: string) {
  return useQuery({
    queryKey: ['medicine-transactions', medicineId],
    queryFn: async () => {
      const data = await apiClient.get<Paginated<MedicineTransaction>>(
        `/medicines/${medicineId}/transactions?page=1&pageSize=${PAGE_SIZE}`,
      );
      return data.items;
    },
  });
}