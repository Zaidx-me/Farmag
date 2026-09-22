import { z } from 'zod';
import { dateSchema, moneySchema } from './common.js';

export const createExpenseSchema = z.object({
  batchId: z.string().uuid().optional(),
  category: z.enum(['CHICKS','FEED','MEDICINE','VACCINATION','LABOUR','ELECTRICITY','GAS','TRANSPORT','MAINTENANCE','EQUIPMENT','OTHER']),
  description: z.string().min(1).max(500),
  amount: moneySchema,
  expenseDate: dateSchema,
  supplier: z.string().max(255).optional(),
  paymentStatus: z.enum(['PAID', 'PARTIALLY_PAID', 'PENDING']).default('PAID'),
  notes: z.string().max(1000).optional()
});
export const updateExpenseSchema = createExpenseSchema.partial();
