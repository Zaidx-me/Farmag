import { Prisma } from '@prisma/client';
import { ExpenseCategory } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import type { ReportLabels } from './service.js';

export interface ExpenseCategoryTotal {
  category: string;
  amount: string;
}

export interface ExpensesResult {
  byCategory: ExpenseCategoryTotal[];
  total: string;
  labels: ReportLabels;
}

const EXPENSE_CATEGORIES = Object.values(ExpenseCategory);

/**
 * EXPENSES — Σ amount by category (plan Step 4). Every ExpenseCategory const is present
 * (zero-filled when no expenses), plus the Decimal total. Optional from/to window applies
 * to expenseDate. All money is Decimal-safe strings.
 * Labels: constant `{ actual: true, estimated: false, incomplete: false }` (documented) —
 * the sums are exact over the filtered set; zero categories are real zeros, not estimates.
 */
export async function computeExpenses(farmId: string, from?: string, to?: string): Promise<ExpensesResult> {
  const rows = await prisma.expense.groupBy({
    by: ['category'],
    where: {
      farmId,
      ...(from || to
        ? {
            expenseDate: {
              gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
              lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
            },
          }
        : {}),
    },
    _sum: { amount: true },
  });

  const byCategory = EXPENSE_CATEGORIES.map((category) => {
    const row = rows.find((r) => r.category === category);
    return { category, amount: (row?._sum.amount ?? new Prisma.Decimal(0)).toString() };
  });

  const total = rows.reduce(
    (sum, r) => (r._sum.amount ? sum.add(r._sum.amount) : sum),
    new Prisma.Decimal(0)
  );

  return {
    byCategory,
    total: total.toString(),
    labels: { actual: true, estimated: false, incomplete: false },
  };
}