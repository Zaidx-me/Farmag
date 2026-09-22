import type { Shed } from '@prisma/client';
import type { z } from 'zod';
import type { createShedSchema, updateShedSchema } from '@poultry/validation';

export type CreateShedInput = z.infer<typeof createShedSchema>;
export type UpdateShedInput = z.infer<typeof updateShedSchema>;

/** Shed wire shape. */
export type ShedResponse = Shed;