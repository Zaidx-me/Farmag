import { useQuery } from '@tanstack/react-query';

import type { Expense, ExpenseCategory } from '@poultry/shared-types';

import type { Paginated } from '@/src/features/daily-entry/queries';
import { apiClient } from '@/src/services/api-client';

const PAGE_SIZE = 100;

export interface ExpenseFilters {
  category?: ExpenseCategory | 'ALL';
  from?: string;
  to?: string;
}

export function useExpenses(farmId: string | null, filters: ExpenseFilters = {}) {
  const { category = 'ALL', from = '', to = '' } = filters;
  return useQuery({
    queryKey: ['expenses', farmId, category, from, to],
    enabled: farmId !== null,
    queryFn: async () => {
      if (farmId === null) throw new Error('No farm selected');
      const params = new URLSearchParams({ page: '1', pageSize: String(PAGE_SIZE) });
      if (category !== 'ALL') params.set('category', category);
      if (from !== '') params.set('from', from);
      if (to !== '') params.set('to', to);
      const data = await apiClient.get<Paginated<Expense>>(
        `/farms/${farmId}/expenses?${params.toString()}`,
      );
      return data.items;
    },
  });
}

export function useExpense(expenseId: string) {
  return useQuery({
    queryKey: ['expense', expenseId],
    queryFn: async () => apiClient.get<Expense>(`/expenses/${expenseId}`),
  });
}