import type { UserRole } from '@poultry/shared-types';
import {
  createDailyRecordSchema,
  createExpenseSchema,
  createSaleSchema,
  createVaccinationSchema,
  updateDailyRecordSchema,
} from '@poultry/validation';
import { z } from 'zod';
import { ApiError } from '../../utils/errors.js';
import * as dailyRecordsService from '../daily-records/service.js';
import * as expensesService from '../expenses/service.js';
import * as salesService from '../sales/service.js';
import * as vaccinationsService from '../vaccinations/service.js';

export interface SyncHandler {
  create: (user: { id: string; role: UserRole }, payload: Record<string, unknown>) => Promise<string>;
  update?: (user: { id: string; role: UserRole }, entityId: string, payload: Record<string, unknown>) => Promise<string>;
  delete?: (user: { id: string; role: UserRole }, entityId: string) => Promise<void>;
}

/**
 * Boundary validation: the owning module's ROUTES zod-parse before calling the service,
 * but the sync surface bypasses those routes — so each handler validates the wire payload
 * against the owning module's create/update schema here. A ZodError is converted to an
 * ApiError VALIDATION_ERROR so the push service's catch contract stays exactly
 * "ApiError → FAILED with its code+message; anything else → FAILED INTERNAL_ERROR".
 */
function parsePayload<T extends z.ZodTypeAny>(schema: T, payload: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ApiError(
      'VALIDATION_ERROR',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      400
    );
  }
  return result.data;
}

/**
 * Handler map (plan sample, adapted to the services' real signatures). Each entry calls
 * the owning module's service — the single source of authorization + integrity truth
 * (isFarmAccessible / requireRole / server-computed fields all live there). The services
 * return the created/updated prisma row, so `.then((r) => r.id)` yields the SERVER entity
 * id. `entityId` from the op is the client-local UUID — recorded on SyncOperation.entityId
 * but NEVER used as the server PK (the services generate server UUIDs).
 *
 * The only coercions are the plan's `as string` casts for the first positional arg
 * (batchId/farmId) — the payload is `Record<string, unknown>` by mandate and the schema
 * parse above produces the typed input.
 */
export const syncHandlers: Record<string, SyncHandler> = {
  dailyRecord: {
    create: (u, p) => {
      const input = parsePayload(createDailyRecordSchema, p);
      return dailyRecordsService.create(p.batchId as string, u, input).then((r) => r.id);
    },
    update: (u, id, p) => {
      const input = parsePayload(updateDailyRecordSchema, p);
      return dailyRecordsService.update(id, u, input).then((r) => r.id);
    },
  },
  expense: {
    create: (u, p) => {
      const input = parsePayload(createExpenseSchema, p);
      return expensesService.create(p.farmId as string, u, input).then((r) => r.id);
    },
  },
  sale: {
    create: (u, p) => {
      const input = parsePayload(createSaleSchema, p);
      return salesService.create(p.farmId as string, u, input).then((r) => r.id);
    },
  },
  vaccination: {
    create: (u, p) => {
      const input = parsePayload(createVaccinationSchema, p);
      return vaccinationsService.create(p.batchId as string, u, input).then((r) => r.id);
    },
  },
};