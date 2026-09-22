import type { FeedItem, FeedTransaction } from '@prisma/client';
import type { z } from 'zod';
import type { createFeedItemSchema, feedConsumeSchema, feedPurchaseSchema } from '@poultry/validation';

export type CreateFeedItemInput = z.infer<typeof createFeedItemSchema>;
export type UpdateFeedItemInput = Partial<CreateFeedItemInput>;
export type PurchaseFeedInput = z.infer<typeof feedPurchaseSchema>;
export type ConsumeFeedInput = z.infer<typeof feedConsumeSchema>;

export interface ListParams {
  page: number;
  pageSize: number;
}

export interface TransactionListParams {
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/** Feed item wire shape — the Prisma row as-is (currentStock is Decimal, serialized as string). */
export type FeedItemResponse = FeedItem;

/** Feed transaction wire shape. */
export type FeedTransactionResponse = FeedTransaction;