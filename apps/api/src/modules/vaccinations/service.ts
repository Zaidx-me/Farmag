import { Prisma } from '@prisma/client';
import type { Vaccination } from '@prisma/client';
import { AlertSeverity, AlertType } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import type { CreateVaccinationInput, UpdateVaccinationInput } from './types.js';

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * UTC-midnight "today" — the same convention as the batches module's toDate (UTC midnight
 * storage). A vaccination scheduled strictly BEFORE this instant is MISSED; one scheduled
 * on/after it is still UPCOMING (or due).
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Dedupe window for the inline VACCINATION_DUE alerts — mirrors alerts/generator.ts
 * (7-day unread window keyed on userId/type/farmId/batchId/title). Do NOT drift.
 */
const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Due lookahead: alert when an UPCOMING vaccination is scheduled within the next 3 days (plan-mandated). */
const DUE_LOOKAHEAD_DAYS = 3;

/**
 * VACCINATION_DUE is NOT part of the T16 generator core (Task 23 consolidates it), so it
 * is created inline here, checked on every `list` (plan-mandated). It follows the
 * generator's exact dedupe pattern: skip when an unread alert with the same
 * (userId, type, farmId, batchId, title) exists within the last 7 days. Title is
 * deterministic per vaccine name — part of the dedupe key. Alert creation must NEVER
 * break `list` — the whole body is wrapped in try/catch.
 */
async function createDueAlerts(farmId: string, batchId: string, vaccinations: Vaccination[]): Promise<void> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: { members: { select: { userId: true } } },
    });
    if (!farm) return;
    // Recipients: farm OWNER + all FarmMembers (deduped) — same as the generator.
    const recipientIds = Array.from(new Set([farm.ownerId, ...farm.members.map((m) => m.userId)]));

    // UTC-midnight window matching the @db.Date storage (toDate stores UTC midnight).
    const today = startOfToday();
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + DUE_LOOKAHEAD_DAYS);

    const due = vaccinations.filter(
      (v) => v.status === 'UPCOMING' && v.scheduledDate >= today && v.scheduledDate <= horizon
    );

    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    for (const vaccination of due) {
      // Title is deterministic per vaccine name — part of the dedupe key.
      const title = `Vaccination due: ${vaccination.vaccineName}`;
      const message = `Vaccination ${vaccination.vaccineName} is scheduled for ${vaccination.scheduledDate
        .toISOString()
        .slice(0, 10)}.`;
      for (const userId of recipientIds) {
        const existing = await prisma.alert.findFirst({
          where: {
            userId,
            type: AlertType.VaccinationDue,
            farmId,
            batchId,
            title,
            isRead: false,
            createdAt: { gte: since },
          },
        });
        if (existing) continue;
        await prisma.alert.create({
          data: {
            userId,
            farmId,
            batchId,
            type: AlertType.VaccinationDue,
            severity: AlertSeverity.Warning,
            title,
            message,
          },
        });
      }
    }
  } catch {
    // no-op — alert creation must never break `list`.
  }
}

export async function list(batchId: string, user: { id: string }) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Batch not found');
  await isFarmAccessible(batch.farmId, user.id);

  // MISSED auto-mark (plan): any UPCOMING vaccination scheduled strictly before today
  // becomes MISSED. The volatile MISSED state is server-managed — never client-sent.
  const today = startOfToday();
  await prisma.vaccination.updateMany({
    where: { batchId, status: 'UPCOMING', scheduledDate: { lt: today } },
    data: { status: 'MISSED' },
  });

  const vaccinations = await prisma.vaccination.findMany({
    where: { batchId },
    orderBy: { scheduledDate: 'asc' },
  });

  // VACCINATION_DUE is evaluated inline here (plan-mandated) — never breaks list.
  await createDueAlerts(batch.farmId, batchId, vaccinations);

  return vaccinations;
}

export async function create(batchId: string, user: { id: string }, input: CreateVaccinationInput) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Batch not found');
  const { role } = await isFarmAccessible(batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  // Status is pinned server-side (UPCOMING) — never trusted from the wire (create schema
  // has no status field anyway). Creating on a NON-ACTIVE batch is allowed (pre-scheduling).
  const { scheduledDate, dose, ...rest } = input;
  return prisma.vaccination.create({
    data: {
      ...rest,
      batchId,
      scheduledDate: toDate(scheduledDate),
      ...(dose !== undefined ? { dose: new Prisma.Decimal(dose) } : {}),
      status: 'UPCOMING',
      createdBy: user.id,
    },
  });
}

export async function update(vaccinationId: string, user: { id: string }, input: UpdateVaccinationInput) {
  const vaccination = await prisma.vaccination.findUnique({
    where: { id: vaccinationId },
    include: { batch: { select: { farmId: true } } },
  });
  if (!vaccination) throw notFound('Vaccination not found');
  const { role } = await isFarmAccessible(vaccination.batch.farmId, user.id);
  // WORKER records completion (completedDate + notes only); OWNER/MANAGER full update.
  // Any other role → 403. Status is NEVER accepted from the wire — server-computed only.
  if (role !== 'WORKER') {
    requireRole(role, ['OWNER', 'MANAGER']);
  }
  // Status is stripped entirely for everyone: only the server computes it from
  // completedDate presence (completedDate set → COMPLETED; absent → current status kept).
  const { completedDate, notes } = input;
  if (completedDate === undefined && notes === undefined) {
    // No-op update (e.g. a worker sent only `status`, which is stripped) — return current row.
    const { batch: _batch, ...current } = vaccination;
    return current;
  }
  return prisma.vaccination.update({
    where: { id: vaccinationId },
    data: {
      ...(completedDate !== undefined ? { completedDate: toDate(completedDate), status: 'COMPLETED' } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  });
}

export async function remove(vaccinationId: string, user: { id: string }): Promise<void> {
  const vaccination = await prisma.vaccination.findUnique({
    where: { id: vaccinationId },
    include: { batch: { select: { farmId: true } } },
  });
  if (!vaccination) throw notFound('Vaccination not found');
  const { role } = await isFarmAccessible(vaccination.batch.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  await prisma.vaccination.delete({ where: { id: vaccinationId } });
}