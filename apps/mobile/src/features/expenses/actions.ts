import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { Expense } from '@poultry/shared-types';

import { repositories } from '@/src/database/repositories';
import { enqueueLocal, getDb } from '@/src/services/sync';
import { useAuthStore } from '@/src/store/auth-store';
import { buildExpensePayload, buildLocalExpense, type ExpenseValues } from './expense';

export interface ExpenseActionResult {
  /** Enqueue a new expense locally + optimistically add it to the list. */
  add: (values: ExpenseValues) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Expense wiring: writes the local row, enqueues an `expense` CREATE op for the
 * sync push, and optimistically prepends the row to every matching expenses
 * query cache (offline-first).
 */
export function useExpenseActions(farmId: string): ExpenseActionResult {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (values: ExpenseValues): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const db = await getDb();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const row = buildLocalExpense({
          id,
          farmId,
          values,
          createdBy: user?.id ?? '',
          createdAt: now,
        });
        await repositories.upsertRecord(db, 'expenses', row);
        await enqueueLocal({
          entity: 'expense',
          entityId: id,
          payload: buildExpensePayload(farmId, values),
          operationType: 'CREATE',
        });
        queryClient.setQueriesData<Expense[]>({ queryKey: ['expenses', farmId] }, (items) => [
          row,
          ...(items ?? []),
        ]);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to add expense');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [farmId, queryClient, user?.id],
  );

  return { add, isSubmitting, error };
}