import type { Expense } from '@prisma/client';
import type { z } from 'zod';
import type { ExpenseCategory } from '@poultry/shared-types';
import type { createExpenseWireSchema, updateExpenseWireSchema } from './schema.js';

export type CreateExpenseInput = z.infer<typeof createExpenseWireSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseWireSchema>;

export interface ExpenseListParams {
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  batchId?: string;
  page: number;
  pageSize: number;
}

/** Expense wire shape — the Prisma row as-is (amount is Decimal, serialized as string). */
export type ExpenseResponse = Expense;
