import { z } from 'zod';
import { dateSchema, decimalSchema } from './common.js';

export const createDailyRecordSchema = z.object({
  recordDate: dateSchema,
  birdsAtStart: z.coerce.number().int().min(0),
  mortality: z.coerce.number().int().min(0),
  feedConsumedKg: decimalSchema.optional(),
  waterConsumedLiters: decimalSchema.optional(),
  averageWeightKg: decimalSchema.optional(),
  temperatureC: decimalSchema.optional(),
  humidityPercent: decimalSchema.optional(),
  medicineNotes: z.string().max(1000).optional(),
  vaccinationNotes: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional()
});
export const updateDailyRecordSchema = createDailyRecordSchema.partial();
