import type { Expense, ExpenseCategory, PaymentStatus } from '@poultry/shared-types';

import { todayISO } from '../daily-entry/record';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'CHICKS',
  'FEED',
  'MEDICINE',
  'VACCINATION',
  'LABOUR',
  'ELECTRICITY',
  'GAS',
  'TRANSPORT',
  'MAINTENANCE',
  'EQUIPMENT',
  'OTHER',
];

export const PAYMENT_STATUSES: PaymentStatus[] = ['PAID', 'PARTIALLY_PAID', 'PENDING'];

export interface ExpenseValues {
  category: ExpenseCategory;
  description: string;
  amount: string;
  expenseDate: string;
  batchId?: string;
  supplier?: string;
  paymentStatus: PaymentStatus;
  notes?: string;
}

/** Local `expenses` row (camelCase — repositories map to snake_case). */
export interface ExpenseRow {
  id: string;
  farmId: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  expenseDate: string;
  paymentStatus: PaymentStatus;
  batchId?: string;
  supplier?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending';
}

export function buildLocalExpense(params: {
  id: string;
  farmId: string;
  values: ExpenseValues;
  createdBy: string;
  createdAt?: string;
}): ExpenseRow {
  const { id, farmId, values, createdBy, createdAt = new Date().toISOString() } = params;
  const row: ExpenseRow = {
    id,
    farmId,
    category: values.category,
    description: values.description,
    amount: values.amount,
    expenseDate: values.expenseDate,
    paymentStatus: values.paymentStatus,
    createdBy,
    createdAt,
    updatedAt: createdAt,
    syncStatus: 'pending',
  };
  if (values.batchId !== undefined) row.batchId = values.batchId;
  if (values.supplier !== undefined) row.supplier = values.supplier;
  if (values.notes !== undefined) row.notes = values.notes;
  return row;
}

/** Wire payload for the sync push — createExpenseSchema fields + farmId. */
export function buildExpensePayload(
  farmId: string,
  values: ExpenseValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    farmId,
    category: values.category,
    description: values.description,
    amount: values.amount,
    expenseDate: values.expenseDate,
    paymentStatus: values.paymentStatus,
  };
  if (values.batchId !== undefined) payload.batchId = values.batchId;
  if (values.supplier !== undefined) payload.supplier = values.supplier;
  if (values.notes !== undefined) payload.notes = values.notes;
  return payload;
}

/** Σ amount per category (Decimal strings summed as numbers — display only). */
export function totalsByCategory(expenses: Expense[]): Record<ExpenseCategory, number> {
  const totals = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0])) as Record<
    ExpenseCategory,
    number
  >;
  for (const expense of expenses) {
    totals[expense.category] += Number(expense.amount);
  }
  return totals;
}

/** Total expense amount across all categories. */
export function totalExpenseAmount(expenses: Expense[]): number {
  return expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
}

export function expenseDateLabel(expense: Expense): string {
  return expense.expenseDate;
}