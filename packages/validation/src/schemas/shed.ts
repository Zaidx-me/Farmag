import { z } from 'zod';

export const createShedSchema = z.object({
  name: z.string().min(1).max(120),
  capacity: z.coerce.number().int().min(1).max(1_000_000),
  type: z.string().max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes: z.string().max(1000).optional()
});
export const updateShedSchema = createShedSchema.partial();
