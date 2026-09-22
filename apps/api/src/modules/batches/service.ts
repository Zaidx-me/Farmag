import { Prisma } from '@prisma/client';
import type { BatchStatus } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { ApiError, notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import * as batchCalculations from './calculations.js';
import type { BatchResponse, CreateBatchInput, UpdateBatchInput } from './types.js';

export interface ListParams {
  page: number;
  pageSize: number;
  status?: BatchStatus;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function shedBelongsToFarm(shed: { farmId: string } | null, farmId: string): boolean {
  return shed !== null && shed.farmId === farmId;
}

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function list(farmId: string, user: { id: string }, { status, page, pageSize }: ListParams) {
  await isFarmAccessible(farmId, user.id);
  const [items, total] = await Promise.all([
    prisma.batch.findMany({
      where: { farmId, ...(status ? { status } : {}) },
      orderBy: { arrivalDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.batch.count({ where: { farmId, ...(status ? { status } : {}) } }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function get(batchId: string, user: { id: string }): Promise<BatchResponse> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      shed: true,
      dailyRecords: { orderBy: { recordDate: 'desc' }, take: 7 },
      sales: true,
    },
  });
  if (!batch) throw notFound('Batch not found');
  await isFarmAccessible(batch.farmId, user.id);
  const { dailyRecords, sales, ...rest } = batch;
  const batchSummary = batchCalculations.summary(batch, dailyRecords, sales);
  return { ...rest, summary: batchSummary, last7DailyRecords: dailyRecords, sales };
}

export async function create(farmId: string, user: { id: string }, input: CreateBatchInput) {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  const shed = await prisma.shed.findUnique({ where: { id: input.shedId } });
  if (!shedBelongsToFarm(shed, farmId)) {
    throw new ApiError('VALIDATION_ERROR', 'Shed does not belong to this farm', 400);
  }
  try {
    // Never trust client-sent status/farmId: zod strips unknown keys, and we pin both here.
    const { arrivalDate, targetSaleDate, ...rest } = input;
    return await prisma.batch.create({
      data: {
        ...rest,
        arrivalDate: toDate(arrivalDate),
        ...(targetSaleDate !== undefined ? { targetSaleDate: toDate(targetSaleDate) } : {}),
        farmId,
        status: 'UPCOMING',
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError('VALIDATION_ERROR', 'batch number already exists', 400);
    }
    throw error;
  }
}

export async function update(batchId: string, user: { id: string }, input: UpdateBatchInput) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Batch not found');
  const { role } = await isFarmAccessible(batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  // Defensive: farmId/status are never client-managed — zod strips unknown keys and the
  // input type has no such fields; status is managed only via open/close. shedId IS a
  // legit update target but must be re-validated against the batch's farm.
  const { shedId, arrivalDate, targetSaleDate, ...rest } = input;
  if (shedId !== undefined) {
    const shed = await prisma.shed.findUnique({ where: { id: shedId } });
    if (!shedBelongsToFarm(shed, batch.farmId)) {
      throw new ApiError('VALIDATION_ERROR', 'Shed does not belong to this farm', 400);
    }
  }
  try {
    return await prisma.batch.update({
      where: { id: batchId },
      data: {
        ...rest,
        ...(arrivalDate !== undefined ? { arrivalDate: toDate(arrivalDate) } : {}),
        ...(targetSaleDate !== undefined ? { targetSaleDate: toDate(targetSaleDate) } : {}),
        ...(shedId !== undefined ? { shedId } : {}),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError('VALIDATION_ERROR', 'batch number already exists', 400);
    }
    throw error;
  }
}

export async function close(batchId: string, user: { id: string }, reason?: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Batch not found');
  const { role } = await isFarmAccessible(batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  if (batch.status !== 'ACTIVE' && batch.status !== 'SOLD') {
    throw new ApiError('VALIDATION_ERROR', 'Only ACTIVE or SOLD batches can be closed', 400);
  }
  // The Batch schema has no closeReason field — the close reason is recorded in `notes`.
  const notes = reason
    ? batch.notes ? `${batch.notes}\nClosed: ${reason}` : `Closed: ${reason}`
    : batch.notes;
  return prisma.batch.update({ where: { id: batchId }, data: { status: 'CLOSED', notes } });
}

export async function open(batchId: string, user: { id: string }) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Batch not found');
  const { role } = await isFarmAccessible(batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  if (batch.status !== 'UPCOMING') {
    throw new ApiError('VALIDATION_ERROR', 'Only UPCOMING batches can be opened', 400);
  }
  return prisma.batch.update({ where: { id: batchId }, data: { status: 'ACTIVE' } });
}