import { describe, expect, it } from 'vitest';

import { saleTotals } from './sales';

describe('calculations/sales', () => {
  it('aggregates count, revenue and weighted average price', () => {
    const sales = [
      { totalAmount: '1000', totalWeightKg: '100' } as any,
      { totalAmount: '800', totalWeightKg: '50' } as any,
    ];
    const result = saleTotals(sales as any);
    expect(result.count).toBe(2);
    expect(result.revenue).toBe(1800);
    expect(result.averagePrice).toBe(12);
  });

  it('returns zero average price when no weight recorded', () => {
    const sales = [
      { totalAmount: '500', totalWeightKg: '0' } as any,
    ];
    const result = saleTotals(sales as any);
    expect(result.count).toBe(1);
    expect(result.revenue).toBe(500);
    expect(result.averagePrice).toBe(0);
  });

  it('handles empty sales array', () => {
    const result = saleTotals([]);
    expect(result.count).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.averagePrice).toBe(0);
  });
});
