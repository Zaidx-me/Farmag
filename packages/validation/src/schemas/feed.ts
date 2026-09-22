import { z } from 'zod';
import { decimalSchema, moneySchema, dateSchema } from './common.js';

export const createFeedItemSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['STARTER', 'GROWER', 'FINISHER', 'OTHER']),
  supplier: z.string().max(255).optional(),
  unit: z.string().min(1).max(30),
  currentStock: decimalSchema,
  lowStockThreshold: decimalSchema
});
export const feedPurchaseSchema = z.object({
  quantity: decimalSchema,
  unitCost: moneySchema.optional(),
  totalCost: moneySchema.optional(),
  transactionDate: dateSchema.optional(),
  notes: z.string().max(500).optional()
});
export const feedConsumeSchema = z.object({
  quantity: decimalSchema,
  batchId: z.string().uuid().optional(),
  transactionDate: dateSchema.optional(),
  notes: z.string().max(500).optional()
});
