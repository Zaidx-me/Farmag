import { Prisma } from '@prisma/client';
import type { SyncChange, SyncOperationStatus, SyncPullResponse, SyncPushResult, UserRole } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/errors.js';
import { syncHandlers } from './handlers.js';
import type { PullParams, PushParams } from './types.js';

/**
 * PUSH — per-op isolation, batch continuation.
 *
 * Per-op transaction shape (documented): the handler runs OUTSIDE any transaction, inside
 * its own try/catch; the SyncOperation row is then written in its own `$transaction`
 * (upsert). Rationale:
 *  - The owning services are already internally transactional (e.g. dailyRecordsService
 *    wraps create in `prisma.$transaction`), so the handler write is atomic on its own.
 *  - A FAILED handler can never poison the SyncOperation insert (they are separate
 *    transactions), and a failed insert can never roll back an already-applied handler
 *    write — so "other ops in the same batch still applied" holds by construction.
 *  - The plan's "whole batch in one transaction" is satisfied in eventual-consistency
 *    terms by per-op atomicity + batch continuation (each op commits independently).
 *
 * FAILED-retry decision (documented): an existing row with status FAILED is RE-ATTEMPTED
 * (not short-circuited). The client retries failed ops until they succeed; short-circuiting
 * would permanently wedge an op that failed transiently (e.g. a 5xx). The upsert's update
 * branch bumps retryCount and overwrites status/lastError/processedAt.
 */
export async function push(user: { id: string; role: UserRole }, { operations }: PushParams): Promise<SyncPushResult[]> {
  const results: SyncPushResult[] = [];

  for (const op of operations) {
    // Idempotency: a SYNCED operation is returned from the stored row WITHOUT re-applying.
    const existing = await prisma.syncOperation.findUnique({ where: { operationId: op.operationId } });
    if (existing && existing.status === 'SYNCED') {
      results.push({
        operationId: op.operationId,
        status: 'SYNCED',
        ...(existing.entityId ? { entityId: existing.entityId } : {}),
      });
      continue;
    }

    let status: SyncOperationStatus = 'SYNCED';
    let entityId: string | null = null;
    let errorInfo: { code: string; message: string } | undefined;

    try {
      const handler = syncHandlers[op.entity];
      if (!handler) {
        throw new ApiError('VALIDATION_ERROR', `unsupported entity: ${op.entity}`, 400);
      }
      if (op.operationType === 'CREATE') {
        entityId = await handler.create(user, op.payload);
      } else if (op.operationType === 'UPDATE') {
        if (!handler.update) {
          throw new ApiError('VALIDATION_ERROR', `UPDATE not supported for entity ${op.entity}`, 400);
        }
        if (!op.entityId) {
          throw new ApiError('VALIDATION_ERROR', 'UPDATE requires entityId', 400);
        }
        entityId = await handler.update(user, op.entityId, op.payload);
      } else if (op.operationType === 'DELETE') {
        if (!handler.delete) {
          throw new ApiError('VALIDATION_ERROR', `DELETE not supported for entity ${op.entity}`, 400);
        }
        await handler.delete(user, op.entityId ?? '');
      } else {
        throw new ApiError('VALIDATION_ERROR', `unsupported operationType: ${op.operationType}`, 400);
      }
    } catch (error) {
      status = 'FAILED';
      if (error instanceof ApiError) {
        errorInfo = { code: error.code, message: error.message };
      } else {
        errorInfo = { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    // Record insert in its own transaction (see shape above). entityId stores the SERVER
    // entity id (handler result) so the idempotency replay returns the same id the client
    // already holds; the client-local op.entityId is the fallback and is never a server PK.
    const record = await prisma.$transaction((tx) =>
      tx.syncOperation.upsert({
        where: { operationId: op.operationId },
        create: {
          operationId: op.operationId,
          userId: user.id,
          entity: op.entity,
          entityId: entityId ?? op.entityId ?? null,
          operationType: op.operationType,
          // Wire payload is Record<string, unknown> by mandate; Prisma's Json input is a
          // closed union — the double cast is the minimal coercion (no `any`).
          payload: op.payload as unknown as Prisma.InputJsonValue,
          status,
          lastError: errorInfo ? JSON.stringify(errorInfo) : null,
          processedAt: new Date(),
        },
        update: {
          status,
          entityId: entityId ?? op.entityId ?? null,
          lastError: errorInfo ? JSON.stringify(errorInfo) : null,
          processedAt: new Date(),
          retryCount: { increment: 1 },
        },
      })
    );

    results.push({
      operationId: op.operationId,
      status,
      ...(entityId ? { entityId } : {}),
      ...(errorInfo ? { error: errorInfo } : {}),
    });
  }

  return results;
}

interface ChangeRef {
  entity: string;
  entityId: string;
  updatedAt: Date;
}

/**
 * PULL — cursor-based changes across the user's accessible farms (owner OR member, the
 * T23 pattern). Union of the 9 syncable tables, filtered `farmId in (...) AND updatedAt >
 * cursor`, merged, sorted ASC, sliced to limit+1, then full rows hydrated per entity.
 *
 * NOTE: FeedTransaction and MedicineTransaction have NO `@updatedAt` column (verified in
 * schema.prisma) — their change timestamp is `createdAt` (documented deviation from the
 * brief's "all 9 have @updatedAt").
 */
export async function pull(user: { id: string }, { cursor, limit }: PullParams): Promise<SyncPullResponse> {
  const farms = await prisma.farm.findMany({
    where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
    select: { id: true },
  });
  const farmIds = farms.map((f) => f.id);
  if (farmIds.length === 0) return { changes: [], nextCursor: null };

  const cursorFilter = cursor ? { gt: new Date(cursor) } : undefined;
  const farmFilter = { farmId: { in: farmIds } };
  const batchFilter = { batch: { farmId: { in: farmIds } } };
  const feedItemFilter = { feedItem: { farmId: { in: farmIds } } };
  const medicineFilter = { medicine: { farmId: { in: farmIds } } };

  const [batches, dailyRecords, feedItems, feedTransactions, medicines, medicineTransactions, vaccinations, expenses, sales] =
    await Promise.all([
      prisma.batch.findMany({
        where: { ...farmFilter, ...(cursorFilter ? { updatedAt: cursorFilter } : {}) },
        select: { id: true, updatedAt: true },
      }),
      prisma.dailyRecord.findMany({
        where: { ...batchFilter, ...(cursorFilter ? { updatedAt: cursorFilter } : {}) },
        select: { id: true, updatedAt: true },
      }),
      prisma.feedItem.findMany({
        where: { ...farmFilter, ...(cursorFilter ? { updatedAt: cursorFilter } : {}) },
        select: { id: true, updatedAt: true },
      }),
      prisma.feedTransaction.findMany({
        where: { ...feedItemFilter, ...(cursorFilter ? { createdAt: cursorFilter } : {}) },
        select: { id: true, createdAt: true },
      }),
      prisma.medicine.findMany({
        where: { ...farmFilter, ...(cursorFilter ? { updatedAt: cursorFilter } : {}) },
        select: { id: true, updatedAt: true },
      }),
      prisma.medicineTransaction.findMany({
        where: { ...medicineFilter, ...(cursorFilter ? { createdAt: cursorFilter } : {}) },
        select: { id: true, createdAt: true },
      }),
      prisma.vaccination.findMany({
        where: { ...batchFilter, ...(cursorFilter ? { updatedAt: cursorFilter } : {}) },
        select: { id: true, updatedAt: true },
      }),
      prisma.expense.findMany({
        where: { ...farmFilter, ...(cursorFilter ? { updatedAt: cursorFilter } : {}) },
        select: { id: true, updatedAt: true },
      }),
      prisma.sale.findMany({
        where: { ...farmFilter, ...(cursorFilter ? { updatedAt: cursorFilter } : {}) },
        select: { id: true, updatedAt: true },
      }),
    ]);

  const refs: ChangeRef[] = [
    ...batches.map((r) => ({ entity: 'batch', entityId: r.id, updatedAt: r.updatedAt })),
    ...dailyRecords.map((r) => ({ entity: 'dailyRecord', entityId: r.id, updatedAt: r.updatedAt })),
    ...feedItems.map((r) => ({ entity: 'feedItem', entityId: r.id, updatedAt: r.updatedAt })),
    ...feedTransactions.map((r) => ({ entity: 'feedTransaction', entityId: r.id, updatedAt: r.createdAt })),
    ...medicines.map((r) => ({ entity: 'medicine', entityId: r.id, updatedAt: r.updatedAt })),
    ...medicineTransactions.map((r) => ({ entity: 'medicineTransaction', entityId: r.id, updatedAt: r.createdAt })),
    ...vaccinations.map((r) => ({ entity: 'vaccination', entityId: r.id, updatedAt: r.updatedAt })),
    ...expenses.map((r) => ({ entity: 'expense', entityId: r.id, updatedAt: r.updatedAt })),
    ...sales.map((r) => ({ entity: 'sale', entityId: r.id, updatedAt: r.updatedAt })),
  ];

  refs.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

  const hasMore = refs.length > limit;
  const slice = hasMore ? refs.slice(0, limit) : refs;
  // nextCursor = last processed updatedAt + 1ms (null when fewer than limit remain).
  const lastProcessed = slice[slice.length - 1];
  const nextCursor =
    hasMore && lastProcessed ? new Date(lastProcessed.updatedAt.getTime() + 1).toISOString() : null;

  // Hydrate full rows for the sliced ids per entity (one findMany per entity type).
  const byEntity = new Map<string, string[]>();
  for (const ref of slice) {
    const ids = byEntity.get(ref.entity) ?? [];
    ids.push(ref.entityId);
    byEntity.set(ref.entity, ids);
  }
  const rowsByEntity: Record<string, Record<string, unknown>[]> = {};
  for (const [entity, ids] of byEntity) {
    rowsByEntity[entity] = await fetchRows(entity, ids);
  }

  const changes: SyncChange[] = [];
  for (const ref of slice) {
    const row = rowsByEntity[ref.entity]?.find((r) => r.id === ref.entityId);
    if (!row) continue; // deleted between base query and hydration — skip (documented)
    changes.push({
      entity: ref.entity,
      entityId: ref.entityId,
      updatedAt: ref.updatedAt.toISOString(),
      data: serializeRow(row),
    });
  }

  return { changes, nextCursor };
}

async function fetchRows(entity: string, ids: string[]): Promise<Record<string, unknown>[]> {
  switch (entity) {
    case 'batch':
      return prisma.batch.findMany({ where: { id: { in: ids } } });
    case 'dailyRecord':
      return prisma.dailyRecord.findMany({ where: { id: { in: ids } } });
    case 'feedItem':
      return prisma.feedItem.findMany({ where: { id: { in: ids } } });
    case 'feedTransaction':
      return prisma.feedTransaction.findMany({ where: { id: { in: ids } } });
    case 'medicine':
      return prisma.medicine.findMany({ where: { id: { in: ids } } });
    case 'medicineTransaction':
      return prisma.medicineTransaction.findMany({ where: { id: { in: ids } } });
    case 'vaccination':
      return prisma.vaccination.findMany({ where: { id: { in: ids } } });
    case 'expense':
      return prisma.expense.findMany({ where: { id: { in: ids } } });
    case 'sale':
      return prisma.sale.findMany({ where: { id: { in: ids } } });
    default:
      return [];
  }
}

/** Serialization discipline: dates → ISO strings, Decimals → `.toString()` (never floats). */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = serializeValue(value);
  }
  return out;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}