import { Prisma } from '@prisma/client';
import { ExpenseCategory } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import type { ReportLabels } from './service.js';

export interface ProfitLossCategoryTotal {
  category: string;
  amount: string;
}

export interface ProfitLossResult {
  byCategory: ProfitLossCategoryTotal[];
  totalExpenses: string;
  totalRevenue: string;
  amountReceived: string;
  outstandingAmount: string;
  profit: string;
  labels: ReportLabels;
}

const EXPENSE_CATEGORIES = Object.values(ExpenseCategory);

/**
 * PROFIT-LOSS — farm-wide P&L (plan Step 3). Σ expenses by category (zero-filled over
 * every ExpenseCategory const) + Decimal totals: totalExpenses, totalRevenue,
 * amountReceived, outstandingAmount, and `profit = totalRevenue − totalExpenses`
 * (Decimal `.sub()` — a negative profit is a loss). All money is Decimal-safe strings.
 * Labels: constant `{ actual: true, estimated: false, incomplete: false }` (documented) —
 * the sums are exact over the farm's rows.
 */
export async function computeProfitLoss(farmId: string): Promise<ProfitLossResult> {
  const [expenseRows, saleTotals] = await Promise.all([
    prisma.expense.groupBy({ by: ['category'], where: { farmId }, _sum: { amount: true } }),
    prisma.sale.aggregate({
      where: { farmId },
      _sum: { totalAmount: true, amountReceived: true, outstandingAmount: true },
    }),
  ]);

  const byCategory = EXPENSE_CATEGORIES.map((category) => {
    const row = expenseRows.find((r) => r.category === category);
    return { category, amount: (row?._sum.amount ?? new Prisma.Decimal(0)).toString() };
  });

  const totalExpenses = expenseRows.reduce(
    (sum, r) => (r._sum.amount ? sum.add(r._sum.amount) : sum),
    new Prisma.Decimal(0)
  );
  const totalRevenue = saleTotals._sum.totalAmount ?? new Prisma.Decimal(0);
  const amountReceived = saleTotals._sum.amountReceived ?? new Prisma.Decimal(0);
  const outstandingAmount = saleTotals._sum.outstandingAmount ?? new Prisma.Decimal(0);
  const profit = totalRevenue.sub(totalExpenses);

  return {
    byCategory,
    totalExpenses: totalExpenses.toString(),
    totalRevenue: totalRevenue.toString(),
    amountReceived: amountReceived.toString(),
    outstandingAmount: outstandingAmount.toString(),
    profit: profit.toString(),
    labels: { actual: true, estimated: false, incomplete: false },
  };
}