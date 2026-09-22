import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { ApiError, notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import { alertGenerator } from '../alerts/generator.js';
import type { CreateDailyRecordInput, ListParams, UpdateDailyRecordInput } from './types.js';

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Inverse of toDate: 'YYYY-MM-DD' from a @db.Date value (stored at UTC midnight). */
function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Cumulative-birds guard (LOCKED rule 3): reject a record whose mortality would drive
 * `initialBirds − Σmortality − Σsold` to zero or below. `oldMortality` is the record's
 * current mortality (0 on create) so the DB sum is corrected before adding the new value.
 */
async function assertCumulativeBirdsPositive(
  batch: { id: string; initialBirds: number },
  oldMortality: number,
  newMortality: number
): Promise<void> {
  const [records, sales] = await Promise.all([
    prisma.dailyRecord.findMany({ where: { batchId: batch.id }, select: { mortality: true } }),
    prisma.sale.findMany({ where: { batchId: batch.id }, select: { birdsSold: true } }),
  ]);
  const cumulativeMortality =
    records.reduce((sum, r) => sum + r.mortality, 0) - oldMortality + newMortality;
  const cumulativeSold = sales.reduce((sum, s) => sum + s.birdsSold, 0);
  const cumulativeBirds = batch.initialBirds - cumulativeMortality - cumulativeSold;
  if (cumulativeBirds <= 0) {
    throw new ApiError(
      'BATCH_BIRD_COUNT_INVALID',
      'Record would drive cumulative birds to zero or below',
      400
    );
  }
}

/** Fire-and-forget alert evaluation after a mortality-bearing create/update (LOCKED rule 6). */
async function evaluateAlerts(farmId: string): Promise<void> {
  try {
    await alertGenerator.evaluate(farmId);
  } catch {
    // The generator never throws (it logs + swallows internally); this is belt-and-braces
    // so a future regression can never break the daily-records write path.
  }
}

export async function list(batchId: string, user: { id: string }, { from, to, page, pageSize }: ListParams) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Batch not found');
  await isFarmAccessible(batch.farmId, user.id);
  const dateFilter: Prisma.DateTimeFilter = {};
  if (from) dateFilter.gte = toDate(from);
  if (to) dateFilter.lte = toDate(to);
  const where: Prisma.DailyRecordWhereInput = {
    batchId,
    ...(from || to ? { recordDate: dateFilter } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.dailyRecord.findMany({
      where,
      orderBy: { recordDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dailyRecord.count({ where }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function get(recordId: string, user: { id: string }) {
  const record = await prisma.dailyRecord.findUnique({
    where: { id: recordId },
    include: { batch: { select: { farmId: true } } },
  });
  if (!record) throw notFound('Daily record not found');
  await isFarmAccessible(record.batch.farmId, user.id);
  const { batch: _batch, ...rest } = record;
  return rest;
}

export async function create(batchId: string, user: { id: string }, input: CreateDailyRecordInput) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Batch not found');
  const { role } = await isFarmAccessible(batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);

  const { recordDate, birdsAtStart, mortality } = input;
  if (mortality > birdsAtStart) {
    throw new ApiError('BATCH_BIRD_COUNT_INVALID', 'Mortality cannot exceed birds at start', 400);
  }
  await assertCumulativeBirdsPositive(batch, 0, mortality);

  // Pre-check uniqueness (defense in depth; the P2002 catch below is authoritative).
  const existing = await prisma.dailyRecord.findUnique({
    where: { batchId_recordDate: { batchId, recordDate: toDate(recordDate) } },
  });
  if (existing) {
    throw new ApiError('DUPLICATE_DAILY_RECORD', 'A daily record already exists for this date', 409);
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.dailyRecord.create({
        data: {
          batchId,
          recordDate: toDate(recordDate),
          birdsAtStart,
          mortality,
          // birdsRemaining is ALWAYS server-computed — never trusted from the wire.
          birdsRemaining: birdsAtStart - mortality,
          ...(input.feedConsumedKg !== undefined ? { feedConsumedKg: input.feedConsumedKg } : {}),
          ...(input.waterConsumedLiters !== undefined ? { waterConsumedLiters: input.waterConsumedLiters } : {}),
          ...(input.averageWeightKg !== undefined ? { averageWeightKg: input.averageWeightKg } : {}),
          ...(input.temperatureC !== undefined ? { temperatureC: input.temperatureC } : {}),
          ...(input.humidityPercent !== undefined ? { humidityPercent: input.humidityPercent } : {}),
          ...(input.medicineNotes !== undefined ? { medicineNotes: input.medicineNotes } : {}),
          ...(input.vaccinationNotes !== undefined ? { vaccinationNotes: input.vaccinationNotes } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          createdBy: user.id,
        },
      });
      // First record on an UPCOMING batch opens it (ACTIVE) inside the same transaction.
      if (batch.status === 'UPCOMING') {
        await tx.batch.update({ where: { id: batchId }, data: { status: 'ACTIVE' } });
      }
      return created;
    });

    const resultingStatus = batch.status === 'UPCOMING' ? 'ACTIVE' : batch.status;
    if (resultingStatus === 'ACTIVE' && mortality > 0) {
      await evaluateAlerts(batch.farmId);
    }
    return record;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError('DUPLICATE_DAILY_RECORD', 'A daily record already exists for this date', 409);
    }
    throw error;
  }
}

export async function update(recordId: string, user: { id: string }, input: UpdateDailyRecordInput) {
  const existing = await prisma.dailyRecord.findUnique({ where: { id: recordId } });
  if (!existing) throw notFound('Daily record not found');
  const batch = await prisma.batch.findUnique({ where: { id: existing.batchId } });
  if (!batch) throw notFound('Daily record not found');
  const { role } = await isFarmAccessible(batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);

  const newMortality = input.mortality ?? existing.mortality;
  const newBirdsAtStart = input.birdsAtStart ?? existing.birdsAtStart;
  if (newMortality > newBirdsAtStart) {
    throw new ApiError('BATCH_BIRD_COUNT_INVALID', 'Mortality cannot exceed birds at start', 400);
  }
  await assertCumulativeBirdsPositive(batch, existing.mortality, newMortality);

  // If recordDate changed, re-check uniqueness against a DIFFERENT record (NOT id).
  if (input.recordDate !== undefined && input.recordDate !== toDateString(existing.recordDate)) {
    const duplicate = await prisma.dailyRecord.findFirst({
      where: {
        batchId: existing.batchId,
        recordDate: toDate(input.recordDate),
        NOT: { id: recordId },
      },
    });
    if (duplicate) {
      throw new ApiError('DUPLICATE_DAILY_RECORD', 'A daily record already exists for this date', 409);
    }
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.dailyRecord.update({
        where: { id: recordId },
        data: {
          ...(input.recordDate !== undefined ? { recordDate: toDate(input.recordDate) } : {}),
          ...(input.birdsAtStart !== undefined ? { birdsAtStart: input.birdsAtStart } : {}),
          ...(input.mortality !== undefined ? { mortality: input.mortality } : {}),
          // birdsRemaining is ALWAYS server-computed — never trusted from the wire.
          birdsRemaining: newBirdsAtStart - newMortality,
          ...(input.feedConsumedKg !== undefined ? { feedConsumedKg: input.feedConsumedKg } : {}),
          ...(input.waterConsumedLiters !== undefined ? { waterConsumedLiters: input.waterConsumedLiters } : {}),
          ...(input.averageWeightKg !== undefined ? { averageWeightKg: input.averageWeightKg } : {}),
          ...(input.temperatureC !== undefined ? { temperatureC: input.temperatureC } : {}),
          ...(input.humidityPercent !== undefined ? { humidityPercent: input.humidityPercent } : {}),
          ...(input.medicineNotes !== undefined ? { medicineNotes: input.medicineNotes } : {}),
          ...(input.vaccinationNotes !== undefined ? { vaccinationNotes: input.vaccinationNotes } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      // Defensive: an UPCOMING batch with an existing record (data inconsistency) is opened
      // on update too — the first-record transition normally happens on create.
      if (batch.status === 'UPCOMING') {
        await tx.batch.update({ where: { id: batch.id }, data: { status: 'ACTIVE' } });
      }
      return updated;
    });

    const resultingStatus = batch.status === 'UPCOMING' ? 'ACTIVE' : batch.status;
    if (resultingStatus === 'ACTIVE' && newMortality > 0) {
      await evaluateAlerts(batch.farmId);
    }
    return record;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError('DUPLICATE_DAILY_RECORD', 'A daily record already exists for this date', 409);
    }
    throw error;
  }
}

export async function remove(recordId: string, user: { id: string }): Promise<void> {
  const record = await prisma.dailyRecord.findUnique({ where: { id: recordId } });
  if (!record) throw notFound('Daily record not found');
  const batch = await prisma.batch.findUnique({ where: { id: record.batchId } });
  if (!batch) throw notFound('Daily record not found');
  const { role } = await isFarmAccessible(batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  await prisma.dailyRecord.delete({ where: { id: recordId } });
}