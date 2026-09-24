import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { Medicine, MedicineTransaction } from '@poultry/shared-types';

import { repositories } from '@/src/database/repositories';
import { enqueueLocal, getDb } from '@/src/services/sync';
import { useAuthStore } from '@/src/store/auth-store';
import {
  applyMedicineStockMove,
  buildMedicineTransactionPayload,
  buildMedicineTransactionRow,
  type MedicineMoveType,
  type MedicineMoveValues,
} from './stock';

export interface MedicineActionResult {
  /** Enqueue a purchase/use locally + optimistically update stock. Returns success. */
  recordMove: (type: MedicineMoveType, values: MedicineMoveValues) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Medicine purchase/use wiring: writes the transaction + updated stock to the
 * local DB, enqueues a `medicineTransaction` CREATE op for the sync push, and
 * optimistically updates the react-query caches so the UI reflects the move
 * immediately (offline-first).
 */
export function useMedicineActions(medicine: Medicine | undefined): MedicineActionResult {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordMove = useCallback(
    async (type: MedicineMoveType, values: MedicineMoveValues): Promise<boolean> => {
      if (medicine === undefined) return false;
      setIsSubmitting(true);
      setError(null);
      try {
        const db = await getDb();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const row = buildMedicineTransactionRow({
          id,
          medicineId: medicine.id,
          type,
          values,
          createdBy: user?.id ?? '',
          createdAt: now,
        });
        await repositories.upsertRecord(db, 'medicine_transactions', row);

        const newStock = applyMedicineStockMove(medicine.currentStock, values.quantity, type);
        await repositories.upsertRecord(db, 'medicines', {
          ...medicine,
          currentStock: newStock,
          syncStatus: 'pending',
          updatedAt: now,
        });

        await enqueueLocal({
          entity: 'medicineTransaction',
          entityId: id,
          payload: buildMedicineTransactionPayload(medicine.id, type, values),
          operationType: 'CREATE',
        });

        queryClient.setQueryData<Medicine[]>(['medicines', medicine.farmId], (items) =>
          items?.map((item) =>
            item.id === medicine.id
              ? {
                  ...item,
                  currentStock: newStock,
                  ...(type === 'PURCHASE' && 'expiryDate' in values && values.expiryDate !== undefined
                    ? { expiryDate: values.expiryDate }
                    : {}),
                }
              : item,
          ),
        );
        queryClient.setQueryData<MedicineTransaction[]>(
          ['medicine-transactions', medicine.id],
          (txs) => [row, ...(txs ?? [])],
        );
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to record medicine move');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [medicine, queryClient, user?.id],
  );

  return { recordMove, isSubmitting, error };
}