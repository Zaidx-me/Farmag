import { describe, expect, it } from 'vitest';

import type { Expense } from '@poultry/shared-types';

import {
  buildExpensePayload,
  buildLocalExpense,
  EXPENSE_CATEGORIES,
  PAYMENT_STATUSES,
  totalExpenseAmount,
  totalsByCategory,
  type ExpenseValues,
} from './expense';

const VALUES: ExpenseValues = {
  category: 'FEED',
  description: 'Broiler starter feed',
  amount: '1250.50',
  expenseDate: '2026-09-24',
  paymentStatus: 'PAID',
};

describe('expense logic', () => {
  it('exposes the 11 categories and 3 payment statuses', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(11);
    expect(EXPENSE_CATEGORIES).toContain('FEED');
    expect(EXPENSE_CATEGORIES).toContain('OTHER');
    expect(PAYMENT_STATUSES).toEqual(['PAID', 'PARTIALLY_PAID', 'PENDING']);
  });

  it('buildLocalExpense pins farmId, syncStatus and optional fields', () => {
    const row = buildLocalExpense({
      id: 'exp-1',
      farmId: 'farm-1',
      values: { ...VALUES, supplier: 'Agro Ltd', notes: 'Invoice #12' },
      createdBy: 'user-1',
      createdAt: '2026-09-24T10:00:00.000Z',
    });
    expect(row).toMatchObject({
      id: 'exp-1',
      farmId: 'farm-1',
      category: 'FEED',
      description: 'Broiler starter feed',
      amount: '1250.50',
      expenseDate: '2026-09-24',
      paymentStatus: 'PAID',
      supplier: 'Agro Ltd',
      notes: 'Invoice #12',
      createdBy: 'user-1',
      createdAt: '2026-09-24T10:00:00.000Z',
      updatedAt: '2026-09-24T10:00:00.000Z',
      syncStatus: 'pending',
    });
  });

  it('buildLocalExpense omits undefined optional fields', () => {
    const row = buildLocalExpense({
      id: 'exp-2',
      farmId: 'farm-1',
      values: VALUES,
      createdBy: 'user-1',
    });
    expect(row.supplier).toBeUndefined();
    expect(row.notes).toBeUndefined();
    expect(row.batchId).toBeUndefined();
  });

  it('buildExpensePayload mirrors createExpenseSchema fields + farmId', () => {
    const payload = buildExpensePayload('farm-1', { ...VALUES, batchId: 'batch-1' });
    expect(payload).toEqual({
      farmId: 'farm-1',
      category: 'FEED',
      description: 'Broiler starter feed',
      amount: '1250.50',
      expenseDate: '2026-09-24',
      paymentStatus: 'PAID',
      batchId: 'batch-1',
    });
  });

  it('totalsByCategory sums amounts per category', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        farmId: 'farm-1',
        category: 'FEED',
        description: 'a',
        amount: '100',
        expenseDate: '2026-09-24',
        paymentStatus: 'PAID',
        createdBy: 'u',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      },
      {
        id: 'e2',
        farmId: 'farm-1',
        category: 'FEED',
        description: 'b',
        amount: '50.5',
        expenseDate: '2026-09-24',
        paymentStatus: 'PENDING',
        createdBy: 'u',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      },
      {
        id: 'e3',
        farmId: 'farm-1',
        category: 'ELECTRICITY',
        description: 'c',
        amount: '25',
        expenseDate: '2026-09-24',
        paymentStatus: 'PAID',
        createdBy: 'u',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      },
    ];
    const totals = totalsByCategory(expenses);
    expect(totals.FEED).toBe(150.5);
    expect(totals.ELECTRICITY).toBe(25);
    expect(totals.OTHER).toBe(0);
    expect(totalExpenseAmount(expenses)).toBe(175.5);
  });
});