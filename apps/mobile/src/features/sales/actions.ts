import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { Sale } from '@poultry/shared-types';

import { repositories } from '@/src/database/repositories';
import { enqueueLocal, getDb } from '@/src/services/sync';
import { useAuthStore } from '@/src/store/auth-store';
import {
  buildLocalSale,
  buildPaymentPayload,
  buildSalePayload,
  computeSaleTotals,
  type SaleValues,
} from './sale';

export interface SaleActionResult {
  /** Enqueue a new sale locally + optimistically add it to the list. */
  add: (values: SaleValues) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Sale wiring: writes the local row, enqueues a `sale` CREATE op for the sync
 * push, and optimistically prepends the row to every matching sales query cache
 * (offline-first).
 */
export function useSaleActions(farmId: string): SaleActionResult {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (values: SaleValues): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const db = await getDb();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const row = buildLocalSale({
          id,
          farmId,
          values,
          createdBy: user?.id ?? '',
          createdAt: now,
        });
        await repositories.upsertRecord(db, 'sales', row);
        await enqueueLocal({
          entity: 'sale',
          entityId: id,
          payload: buildSalePayload(farmId, values),
          operationType: 'CREATE',
        });
        queryClient.setQueriesData<Sale[]>({ queryKey: ['sales', farmId] }, (items) => [
          row,
          ...(items ?? []),
        ]);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to add sale');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [farmId, queryClient, user?.id],
  );

  return { add, isSubmitting, error };
}

export interface SalePaymentActionResult {
  /** Enqueue a payment UPDATE locally + optimistically recompute the sale. */
  updatePayment: (amountReceived: string) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Payment wiring: recomputes totals from the new amountReceived, writes the
 * local row, enqueues a `sale` UPDATE op, and optimistically updates the list +
 * detail caches. NOTE: the sync handler for `sale` only implements `create`, so
 * the UPDATE push fails server-side until that handler lands (same gap as T35).
 */
export function useSalePaymentActions(sale: Sale | undefined): SalePaymentActionResult {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePayment = useCallback(
    async (amountReceived: string): Promise<boolean> => {
      if (sale === undefined) return false;
      setIsSubmitting(true);
      setError(null);
      try {
        const db = await getDb();
        const now = new Date().toISOString();
        const { totalAmount, outstandingAmount, paymentStatus } = computeSaleTotals(
          sale.totalWeightKg,
          sale.ratePerKg,
          amountReceived,
        );
        const updated: Sale = {
          ...sale,
          amountReceived,
          outstandingAmount,
          paymentStatus,
          updatedAt: now,
        };
        await repositories.upsertRecord(db, 'sales', {
          ...updated,
          syncStatus: 'pending',
        });
        await enqueueLocal({
          entity: 'sale',
          entityId: sale.id,
          payload: buildPaymentPayload(amountReceived),
          operationType: 'UPDATE',
        });
        queryClient.setQueriesData<Sale[]>({ queryKey: ['sales', sale.farmId] }, (items) =>
          items?.map((item) => (item.id === sale.id ? updated : item)),
        );
        queryClient.setQueryData<Sale>(['sale', sale.id], updated);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to update payment');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [queryClient, sale],
  );

  return { updatePayment, isSubmitting, error };
}