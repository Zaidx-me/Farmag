import { describe, expect, it } from 'vitest';

import {
  applyMedicineStockMove,
  buildMedicineTransactionPayload,
  buildMedicineTransactionRow,
  daysUntilExpiry,
  expiryBadgeTone,
  expiryLabel,
  isLowStock,
  stockBadgeTone,
} from './stock';

describe('medicine stock helpers', () => {
  it('applyMedicineStockMove adds on PURCHASE and subtracts on USAGE', () => {
    expect(applyMedicineStockMove('10', '5', 'PURCHASE')).toBe('15');
    expect(applyMedicineStockMove('10', '5', 'USAGE')).toBe('5');
  });

  it('applyMedicineStockMove floors at 0', () => {
    expect(applyMedicineStockMove('3', '5', 'USAGE')).toBe('0');
    expect(applyMedicineStockMove('0.1', '0.2', 'USAGE')).toBe('0');
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

  it('daysUntilExpiry counts whole days, negative when past, null when absent', () => {
    const from = new Date('2026-09-24T12:00:00.000Z');
    expect(daysUntilExpiry('2026-10-24', from)).toBe(30);
    expect(daysUntilExpiry('2026-09-20', from)).toBe(-4);
    expect(daysUntilExpiry(null, from)).toBeNull();
    expect(daysUntilExpiry(undefined, from)).toBeNull();
  });

  it('expiryBadgeTone is red past, amber within 30 days, green otherwise, gray when absent', () => {
    const from = new Date('2026-09-24T12:00:00.000Z');
    expect(expiryBadgeTone('2026-09-20', from)).toBe('red');
    expect(expiryBadgeTone('2026-10-10', from)).toBe('amber');
    expect(expiryBadgeTone('2026-12-31', from)).toBe('green');
    expect(expiryBadgeTone(null, from)).toBe('gray');
  });

  it('expiryLabel describes the remaining window', () => {
    const from = new Date('2026-09-24T12:00:00.000Z');
    expect(expiryLabel('2026-09-20', from)).toBe('Expired 4d ago');
    expect(expiryLabel('2026-10-24', from)).toBe('Expires in 30d');
    expect(expiryLabel(null, from)).toBe('No expiry');
  });

  it('buildMedicineTransactionRow maps values to the local row with pending sync status', () => {
    const row = buildMedicineTransactionRow({
      id: 'local-1',
      medicineId: 'med-1',
      type: 'PURCHASE',
      values: {
        quantity: '20',
        expiryDate: '2027-01-01',
        transactionDate: '2026-09-24',
        notes: 'restock',
      },
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
    });
    expect(row).toEqual({
      id: 'local-1',
      medicineId: 'med-1',
      type: 'PURCHASE',
      quantity: '20',
      transactionDate: '2026-09-24',
      notes: 'restock',
      createdBy: 'user-1',
      createdAt: '2026-09-24T00:00:00.000Z',
      syncStatus: 'pending',
    });
  });

  it('buildMedicineTransactionRow omits optional fields that are not provided', () => {
    const row = buildMedicineTransactionRow({
      id: 'local-2',
      medicineId: 'med-1',
      type: 'USAGE',
      values: { quantity: '5' },
      createdBy: 'user-1',
    });
    expect(row.batchId).toBeUndefined();
    expect(row.notes).toBeUndefined();
    expect(row.transactionDate).toBeTruthy();
  });

  it('buildMedicineTransactionPayload includes expiryDate on PURCHASE and batchId on USAGE', () => {
    const purchase = buildMedicineTransactionPayload('med-1', 'PURCHASE', {
      quantity: '20',
      expiryDate: '2027-01-01',
    });
    expect(purchase).toEqual({
      medicineId: 'med-1',
      type: 'PURCHASE',
      quantity: '20',
      expiryDate: '2027-01-01',
    });

    const usage = buildMedicineTransactionPayload('med-1', 'USAGE', {
      quantity: '5',
      batchId: 'batch-1',
    });
    expect(usage).toEqual({
      medicineId: 'med-1',
      type: 'USAGE',
      quantity: '5',
      batchId: 'batch-1',
    });
  });
});