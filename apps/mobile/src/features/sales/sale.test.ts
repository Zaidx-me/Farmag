import { describe, expect, it } from 'vitest';

import {
  buildLocalSale,
  buildPaymentPayload,
  buildSalePayload,
  computeSaleTotals,
  paymentExceedsTotal,
  type SaleValues,
} from './sale';

const VALUES: SaleValues = {
  batchId: 'batch-1',
  buyer: 'Karachi Market',
  saleDate: '2026-09-24',
  birdsSold: '180',
  totalWeightKg: '180',
  ratePerKg: '12.50',
  amountReceived: '0',
};

describe('sale logic', () => {
  it('computeSaleTotals multiplies weight × rate and derives status', () => {
    expect(computeSaleTotals('180', '12.50', '0')).toEqual({
      totalAmount: '2250',
      outstandingAmount: '2250',
      paymentStatus: 'PENDING',
    });
    expect(computeSaleTotals('180', '12.50', '1000')).toEqual({
      totalAmount: '2250',
      outstandingAmount: '1250',
      paymentStatus: 'PARTIALLY_PAID',
    });
    expect(computeSaleTotals('180', '12.50', '2250')).toEqual({
      totalAmount: '2250',
      outstandingAmount: '0',
      paymentStatus: 'PAID',
    });
  });

  it('computeSaleTotals rounds the product to 2dp like the server Decimal(12,2)', () => {
    expect(computeSaleTotals('10.5', '1.25', '0').totalAmount).toBe('13.13');
    expect(computeSaleTotals('0.1', '0.2', '0').totalAmount).toBe('0.02');
  });

  it('paymentExceedsTotal flags overpayment (server PAYMENT_EXCEEDS_TOTAL)', () => {
    expect(paymentExceedsTotal('3000', '2250')).toBe(true);
    expect(paymentExceedsTotal('2250', '2250')).toBe(false);
    expect(paymentExceedsTotal('1000', '2250')).toBe(false);
  });

  it('buildLocalSale pins farmId, computed totals and syncStatus', () => {
    const row = buildLocalSale({
      id: 'sale-1',
      farmId: 'farm-1',
      values: { ...VALUES, amountReceived: '1000', notes: 'Paid in cash' },
      createdBy: 'user-1',
      createdAt: '2026-09-24T10:00:00.000Z',
    });
    expect(row).toMatchObject({
      id: 'sale-1',
      farmId: 'farm-1',
      batchId: 'batch-1',
      buyer: 'Karachi Market',
      saleDate: '2026-09-24',
      birdsSold: 180,
      totalWeightKg: '180',
      ratePerKg: '12.50',
      totalAmount: '2250',
      amountReceived: '1000',
      outstandingAmount: '1250',
      paymentStatus: 'PARTIALLY_PAID',
      notes: 'Paid in cash',
      createdBy: 'user-1',
      createdAt: '2026-09-24T10:00:00.000Z',
      updatedAt: '2026-09-24T10:00:00.000Z',
      syncStatus: 'pending',
    });
  });

  it('buildSalePayload mirrors createSaleSchema fields + farmId', () => {
    const payload = buildSalePayload('farm-1', VALUES);
    expect(payload).toEqual({
      farmId: 'farm-1',
      batchId: 'batch-1',
      buyer: 'Karachi Market',
      saleDate: '2026-09-24',
      birdsSold: 180,
      totalWeightKg: '180',
      ratePerKg: '12.50',
      amountReceived: '0',
    });
  });

  it('buildPaymentPayload mirrors updateSalePaymentSchema', () => {
    expect(buildPaymentPayload('2250')).toEqual({ amountReceived: '2250' });
  });
});