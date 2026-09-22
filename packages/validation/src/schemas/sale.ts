import { z } from 'zod';
import { dateSchema, moneySchema, decimalSchema } from './common.js';

export const createSaleSchema = z.object({
  batchId: z.string().uuid(),
  buyer: z.string().min(1).max(255),
  saleDate: dateSchema,
  birdsSold: z.coerce.number().int().min(1),
  totalWeightKg: decimalSchema,
  ratePerKg: moneySchema,
  amountReceived: moneySchema.default('0'),
  notes: z.string().max(1000).optional()
});
/** totalAmount/outstandingAmount deliberately NOT accepted — server computes. */
export const updateSaleSchema = createSaleSchema.partial();
export const updateSalePaymentSchema = z.object({
  amountReceived: moneySchema
});
