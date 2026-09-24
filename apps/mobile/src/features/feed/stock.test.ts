import { describe, expect, it } from 'vitest';

import {
  applyStockMove,
  buildFeedTransactionPayload,
  buildFeedTransactionRow,
  isLowStock,
  stockBadgeTone,
} from './stock';

describe('feed stock helpers', () => {
  it('applyStockMove adds on PURCHASE and subtracts on CONSUMPTION', () => {
    expect(applyStockMove('10', '5', 'PURCHASE')).toBe('15');
    expect(applyStockMove('10', '5', 'CONSUMPTION')).toBe('5');
  });

  it('applyStockMove floors at 0', () => {
    expect(applyStockMove('3', '5', 'CONSUMPTION')).toBe('0');
    expect(applyStockMove('0.1', '0.2', 'CONSUMPTION')).toBe('0');
  });

  it('isLowStock triggers at or below the threshold', () => {
    expect(isLowStock('5', '5')).toBe(true);
    expect(isLowStock('4.99', '5')).toBe(true);
    expect(isLowStock('5.01', '5')).toBe(false);
  });

  it('stockBadgeTone is red when low, green otherwise', () => {
    expect(stockBadgeTone('5', '5')).toBe('red');
    expect(stockBadgeTone('10', '5')).toBe('green');
  });

  it('buildFeedTransactionRow maps values to the local row with pending sync status', () => {
    const row = buildFeedTransactionRow({
      id: 'local-1',
      feedItemId: 'feed-1',
      type: 'PURCHASE',
      values: {
        quantity: '50',
        unitCost: '1.25',
        totalCost: '62.50',
        transactionDate: '2026-09-24',
        notes: 'weekly order',
      },
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
    });
    expect(row).toEqual({
      id: 'local-1',
      feedItemId: 'feed-1',
      type: 'PURCHASE',
      quantity: '50',
      unitCost: '1.25',
      totalCost: '62.50',
      transactionDate: '2026-09-24',
      notes: 'weekly order',
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
      syncStatus: 'pending',
    });
  });

  it('buildFeedTransactionRow omits optional fields that are not provided', () => {
    const row = buildFeedTransactionRow({
      id: 'local-2',
      feedItemId: 'feed-1',
      type: 'CONSUMPTION',
      values: { quantity: '10' },
      createdBy: 'user-1',
    });
    expect(row.unitCost).toBeUndefined();
    expect(row.totalCost).toBeUndefined();
    expect(row.batchId).toBeUndefined();
    expect(row.notes).toBeUndefined();
    expect(row.transactionDate).toBeTruthy();
  });

  it('buildFeedTransactionPayload includes feedItemId, type and quantity', () => {
    const payload = buildFeedTransactionPayload('feed-1', 'PURCHASE', {
      quantity: '50',
      unitCost: '1.25',
    });
    expect(payload).toEqual({
      feedItemId: 'feed-1',
      type: 'PURCHASE',
      quantity: '50',
      unitCost: '1.25',
    });
  });
});