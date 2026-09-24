import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { Vaccination } from '@poultry/shared-types';

import { repositories } from '@/src/database/repositories';
import { todayISO } from '@/src/features/daily-entry/record';
import { enqueueLocal, getDb } from '@/src/services/sync';
import { useAuthStore } from '@/src/store/auth-store';
import {
  buildCompletePayload,
  buildLocalVaccination,
  buildVaccinationPayload,
  type VaccinationValues,
} from './vaccination';

export interface VaccinationActionResult {
  /** Enqueue a new vaccination locally + optimistically add it to the list. */
  add: (values: VaccinationValues) => Promise<boolean>;
  /** Enqueue a mark-complete UPDATE locally + optimistically update the row. */
  markComplete: (vaccination: Vaccination) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Vaccination wiring: add enqueues a `vaccination` CREATE op and optimistically
 * prepends the local row; mark-complete enqueues an UPDATE op and optimistically
 * flips the row to COMPLETED (offline-first).
 */
export function useVaccinationActions(batchId: string): VaccinationActionResult {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (values: VaccinationValues): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const db = await getDb();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const row = buildLocalVaccination({
          id,
          batchId,
          values,
          createdBy: user?.id ?? '',
          createdAt: now,
        });
        await repositories.upsertRecord(db, 'vaccinations', row);
        await enqueueLocal({
          entity: 'vaccination',
          entityId: id,
          payload: buildVaccinationPayload(batchId, values),
          operationType: 'CREATE',
        });
        queryClient.setQueryData<Vaccination[]>(['vaccinations', batchId], (items) => [
          row,
          ...(items ?? []),
        ]);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to add vaccination');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [batchId, queryClient, user?.id],
  );

  const markComplete = useCallback(
    async (vaccination: Vaccination): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const db = await getDb();
        const completedDate = todayISO();
        const now = new Date().toISOString();
        await repositories.upsertRecord(db, 'vaccinations', {
          ...vaccination,
          completedDate,
          status: 'COMPLETED',
          syncStatus: 'pending',
          updatedAt: now,
        });
        await enqueueLocal({
          entity: 'vaccination',
          entityId: vaccination.id,
          payload: buildCompletePayload(completedDate),
          operationType: 'UPDATE',
        });
        queryClient.setQueryData<Vaccination[]>(['vaccinations', batchId], (items) =>
          items?.map((item) =>
            item.id === vaccination.id
              ? { ...item, completedDate, status: 'COMPLETED' }
              : item,
          ),
        );
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to mark vaccination complete');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [batchId, queryClient],
  );

  return { add, markComplete, isSubmitting, error };
}