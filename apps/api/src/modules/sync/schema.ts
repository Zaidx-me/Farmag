import { z } from 'zod';

/**
 * Sync module schemas (LOCKED: schemas live in THIS module — packages/validation is
 * untouched). `entity` is deliberately a free string (not an enum): the per-op dispatch
 * in service.ts is the authority on supported entities, so an unknown entity reaches the
 * loop and yields a per-op FAILED result instead of a route-level 400 (plan Step 4
 * scenario 6 requires per-op FAILED). This mirrors the existing shared
 * syncOperationSchema (packages/validation/src/schemas/sync.ts).
 *
 * `createdAt`/`cursor` use strict ISO-8601 UTC (`z.string().datetime()` requires the `Z`
 * suffix) — the pull cursor is server-generated via `Date.toISOString()` so round-trips
 * cleanly; clients must send UTC timestamps.
 */
export const operationSchema = z.object({
  operationId: z.string().uuid(),
  entity: z.string().min(1).max(60),
  operationType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  entityId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

/** Batch cap of 100 ops per push — a sensible ceiling for a mobile offline queue flush. */
export const pushSchema = z.object({
  operations: z.array(operationSchema).min(1).max(100),
});

export const pullQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});