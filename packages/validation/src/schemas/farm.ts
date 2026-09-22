import { z } from 'zod';
import { uuidSchema } from './common.js';

export const createFarmSchema = z.object({
  name: z.string().min(1).max(120),
  location: z.string().min(1).max(255),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  farmType: z.string().max(50).optional(),
  notes: z.string().max(1000).optional()
});
export const updateFarmSchema = createFarmSchema.partial();
export const farmMemberSchema = z.object({ userId: uuidSchema, role: z.enum(['OWNER', 'MANAGER', 'WORKER', 'ACCOUNTANT']) });
export const addFarmMemberSchema = z.object({ members: z.array(farmMemberSchema).min(1) });
