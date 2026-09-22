import { z } from 'zod';
import { decimalSchema, moneySchema, dateSchema } from './common.js';

export const createMedicineItemSchema = z.object({
  name: z.string().min(1).max(120),
  supplier: z.string().max(255).optional(),
  unit: z.string().min(1).max(30),
  currentStock: decimalSchema,
  lowStockThreshold: decimalSchema,
  expiryDate: dateSchema.optional()
});
export const medicinePurchaseSchema = z.object({
  quantity: decimalSchema,
  unitCost: moneySchema.optional(),
  totalCost: moneySchema.optional(),
  expiryDate: dateSchema.optional(),
  transactionDate: dateSchema.optional(),
  notes: z.string().max(500).optional()
});
export const medicineUseSchema = z.object({
  quantity: decimalSchema,
  batchId: z.string().uuid().optional(),
  transactionDate: dateSchema.optional(),
  notes: z.string().max(500).optional()
});
