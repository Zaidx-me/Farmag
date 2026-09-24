/**
 * Profit calculation with a sign label — mobile helper (spec §5.6).
 *
 * profit = salesRevenue − totalExpenses, where totalExpenses =
 * feedCost + medicineCost + otherCosts. The label is 'profit' when the value is
 * non-negative and 'loss' when it is negative (client previews never present an
 * unlabeled figure; the server remains authoritative for financial writes).
 */

export interface ProfitResult {
  value: number;
  label: 'profit' | 'loss';
}

export function profitWithLabel(
  revenue: number,
  feedCost: number,
  medicineCost: number,
  otherCosts: number
): ProfitResult {
  const value = revenue - feedCost - medicineCost - otherCosts;
  return { value, label: value >= 0 ? 'profit' : 'loss' };
}