import { z } from 'zod';
import { dateSchema, decimalSchema } from './common.js';

export const createVaccinationSchema = z.object({
  vaccineName: z.string().min(1).max(120),
  scheduledDate: dateSchema,
  dose: decimalSchema.optional(),
  supplier: z.string().max(255).optional(),
  notes: z.string().max(500).optional()
});
export const updateVaccinationSchema = z.object({
  completedDate: dateSchema.optional(),
  status: z.enum(['UPCOMING', 'COMPLETED', 'MISSED']).optional(),
  notes: z.string().max(500).optional()
});
