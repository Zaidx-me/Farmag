import { z } from 'zod';
import { isoDateSchema } from './common.js';

export const syncOperationSchema = z.object({
  operationId: z.string().uuid(),
  entity: z.string().min(1).max(60),
  operationType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  entityId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: isoDateSchema
});
export const syncPushSchema = z.object({ operations: z.array(syncOperationSchema).min(1).max(500) });
export const syncPullQuerySchema = z.object({
  cursor: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});
