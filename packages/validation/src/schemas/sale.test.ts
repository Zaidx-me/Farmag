import { describe, expect, it } from 'vitest';
import { createSaleSchema, updateSalePaymentSchema } from './sale.js';

const validSale = {
  batchId: '2f4c1a3e-5b6d-4e8f-9a0b-1c2d3e4f5a6b',
  buyer: 'City Market',
  saleDate: '2026-09-22',
  birdsSold: 120,
  totalWeightKg: '245.50',
  ratePerKg: '18.00',
  amountReceived: '2000.00',
  notes: 'Morning pickup'
};

describe('sale schemas', () => {
  it('accepts a valid create payload', () => {
    const result = createSaleSchema.safeParse(validSale);
    expect(result.success).toBe(true);
  });

  it('strips totalAmount from the parsed data (server computes it)', () => {
    const result = createSaleSchema.safeParse({ ...validSale, totalAmount: '4419.00' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalAmount).toBeUndefined();
    }
  });

  it('rejects amountReceived with 3 decimal places', () => {
    const result = createSaleSchema.safeParse({ ...validSale, amountReceived: '100.005' });
    expect(result.success).toBe(false);
  });

  it('rejects birdsSold: 0', () => {
    const result = createSaleSchema.safeParse({ ...validSale, birdsSold: 0 });
    expect(result.success).toBe(false);
  });

  it('defaults amountReceived to "0" when omitted', () => {
    const { amountReceived: _omitted, ...withoutAmount } = validSale;
    const result = createSaleSchema.safeParse(withoutAmount);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amountReceived).toBe('0');
    }
  });

  it('rejects updateSalePayment with an invalid money value', () => {
    const result = updateSalePaymentSchema.safeParse({ amountReceived: '12.345' });
    expect(result.success).toBe(false);
  });
});
