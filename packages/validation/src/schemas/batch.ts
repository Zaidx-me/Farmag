import { z } from 'zod';
import { dateSchema, moneySchema, optionalDecimalSchema } from './common.js';

export const createBatchSchema = z.object({
  shedId: z.string().uuid(),
  batchNumber: z.string().min(1).max(60),
  breed: z.string().min(1).max(120),
  supplier: z.string().max(255).optional(),
  arrivalDate: dateSchema,
  initialBirds: z.coerce.number().int().min(1).max(10_000_000),
  initialAverageWeightKg: optionalDecimalSchema,
  costPerBird: moneySchema.optional(),
  targetSaleDate: dateSchema.optional(),
  notes: z.string().max(1000).optional()
});
export const updateBatchSchema = createBatchSchema.partial();
export const closeBatchSchema = z.object({ reason: z.string().max(500).optional() });
