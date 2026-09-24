import type { Sale } from '@poultry/shared-types';

/**
 * Sale totals — mobile helper (spec §5.6).
 *
 * totalAmount = totalWeightKg × ratePerKg (per sale, server-computed).
 * This helper aggregates already-recorded sales:
 *   - count        = number of sales
 *   - revenue      = Σ totalAmount (Decimal strings parsed to numbers)
 *   - averagePrice = revenue ÷ Σ totalWeightKg (weighted average rate per kg)
 *
 * `averagePrice` is the weighted average of ratePerKg, matching the spec's
 * per-kg pricing model. It is 0 when there is no recorded weight.
 */

export interface SaleTotals {
  count: number;
  revenue: number;
  averagePrice: number;
}

export function saleTotals(sales: Sale[]): SaleTotals {
  let revenue = 0;
  let totalWeightKg = 0;
  for (const sale of sales) {
    revenue += Number(sale.totalAmount);
    totalWeightKg += Number(sale.totalWeightKg);
  }
  const averagePrice = totalWeightKg > 0 ? revenue / totalWeightKg : 0;
  return { count: sales.length, revenue, averagePrice };
}