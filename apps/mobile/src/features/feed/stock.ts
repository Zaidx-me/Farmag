/**
 * Feed stock logic — pure helpers for the feed screens (T35). Stock moves mirror
 * the API's feed service: PURCHASE adds, CONSUMPTION subtracts (floored at 0),
 * and the low-stock badge fires when `currentStock <= lowStockThreshold` (the
 * same rule the server's alert generator uses for LOW_FEED).
 */

import type { BadgeTone } from '../../components/ui';
import { todayISO } from '../daily-entry/record';
import { addDecimalStrings, compareDecimalStrings, subtractDecimalStrings } from '../../utils/decimal';

export type FeedMoveType = 'PURCHASE' | 'CONSUMPTION';

export interface FeedPurchaseValues {
  quantity: string;
  unitCost?: string;
  totalCost?: string;
  transactionDate?: string;
  notes?: string;
}

export interface FeedConsumeValues {
  quantity: string;
  batchId?: string;
  transactionDate?: string;
  notes?: string;
}

export type FeedMoveValues = FeedPurchaseValues | FeedConsumeValues;

/** Local `feed_transactions` row (camelCase — repositories map to snake_case). */
export interface FeedTransactionRow {
  id: string;
  feedItemId: string;
  batchId?: string;
  type: FeedMoveType;
  quantity: string;
  unitCost?: string;
  totalCost?: string;
  transactionDate: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  syncStatus: 'pending';
}

/** New stock after a move — PURCHASE adds, CONSUMPTION subtracts (floor at 0). */
export function applyStockMove(currentStock: string, quantity: string, type: FeedMoveType): string {
  if (type === 'PURCHASE') return addDecimalStrings(currentStock, quantity);
  return subtractDecimalStrings(currentStock, quantity);
}

/** LOW_FEED rule parity: `currentStock <= lowStockThreshold`. */
export function isLowStock(currentStock: string, threshold: string): boolean {
  return compareDecimalStrings(currentStock, threshold) <= 0;
}

export function stockBadgeTone(currentStock: string, threshold: string): BadgeTone {
  return isLowStock(currentStock, threshold) ? 'red' : 'green';
}

export function buildFeedTransactionRow(params: {
  id: string;
  feedItemId: string;
  type: FeedMoveType;
  values: FeedMoveValues;
  createdBy: string;
  createdAt?: string;
}): FeedTransactionRow {
  const { id, feedItemId, type, values, createdBy, createdAt = new Date().toISOString() } = params;
  const row: FeedTransactionRow = {
    id,
    feedItemId,
    type,
    quantity: values.quantity,
    transactionDate: values.transactionDate ?? todayISO(),
    createdBy,
    createdAt,
    syncStatus: 'pending',
  };
  if (type === 'CONSUMPTION') {
    const consume = values as FeedConsumeValues;
    if (consume.batchId !== undefined) row.batchId = consume.batchId;
  }
  if (type === 'PURCHASE') {
    const purchase = values as FeedPurchaseValues;
    if (purchase.unitCost !== undefined) row.unitCost = purchase.unitCost;
    if (purchase.totalCost !== undefined) row.totalCost = purchase.totalCost;
  }
  if (values.notes !== undefined) row.notes = values.notes;
  return row;
}

/** Wire payload for the sync push — mirrors the API's purchase/consume schemas. */
export function buildFeedTransactionPayload(
  feedItemId: string,
  type: FeedMoveType,
  values: FeedMoveValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { feedItemId, type, quantity: values.quantity };
  if (values.transactionDate !== undefined) payload.transactionDate = values.transactionDate;
  if (values.notes !== undefined) payload.notes = values.notes;
  if (type === 'PURCHASE') {
    const purchase = values as FeedPurchaseValues;
    if (purchase.unitCost !== undefined) payload.unitCost = purchase.unitCost;
    if (purchase.totalCost !== undefined) payload.totalCost = purchase.totalCost;
  } else {
    const consume = values as FeedConsumeValues;
    if (consume.batchId !== undefined) payload.batchId = consume.batchId;
  }
  return payload;
}