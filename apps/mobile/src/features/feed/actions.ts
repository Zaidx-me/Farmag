import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { FeedItem, FeedTransaction } from '@poultry/shared-types';

import { repositories } from '@/src/database/repositories';
import { enqueueLocal, getDb } from '@/src/services/sync';
import { useAuthStore } from '@/src/store/auth-store';
import {
  applyStockMove,
  buildFeedTransactionPayload,
  buildFeedTransactionRow,
  type FeedMoveType,
  type FeedMoveValues,
} from './stock';

export interface FeedActionResult {
  /** Enqueue a purchase/consume locally + optimistically update stock. Returns success. */
  recordMove: (type: FeedMoveType, values: FeedMoveValues) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Feed purchase/consume wiring: writes the transaction + updated stock to the
 * local DB, enqueues a `feedTransaction` CREATE op for the sync push, and
 * optimistically updates the react-query caches so the UI reflects the move
 * immediately (offline-first).
 */
export function useFeedActions(feedItem: FeedItem | undefined): FeedActionResult {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordMove = useCallback(
    async (type: FeedMoveType, values: FeedMoveValues): Promise<boolean> => {
      if (feedItem === undefined) return false;
      setIsSubmitting(true);
      setError(null);
      try {
        const db = await getDb();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const row = buildFeedTransactionRow({
          id,
          feedItemId: feedItem.id,
          type,
          values,
          createdBy: user?.id ?? '',
          createdAt: now,
        });
        await repositories.upsertRecord(db, 'feed_transactions', row);

        const newStock = applyStockMove(feedItem.currentStock, values.quantity, type);
        await repositories.upsertRecord(db, 'feed_items', {
          ...feedItem,
          currentStock: newStock,
          syncStatus: 'pending',
          updatedAt: now,
        });

        await enqueueLocal({
          entity: 'feedTransaction',
          entityId: id,
          payload: buildFeedTransactionPayload(feedItem.id, type, values),
          operationType: 'CREATE',
        });

        queryClient.setQueryData<FeedItem[]>(['feed-items', feedItem.farmId], (items) =>
          items?.map((item) =>
            item.id === feedItem.id ? { ...item, currentStock: newStock } : item,
          ),
        );
        queryClient.setQueryData<FeedTransaction[]>(['feed-transactions', feedItem.id], (txs) => [
          row,
          ...(txs ?? []),
        ]);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to record feed move');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [feedItem, queryClient, user?.id],
  );

  return { recordMove, isSubmitting, error };
}