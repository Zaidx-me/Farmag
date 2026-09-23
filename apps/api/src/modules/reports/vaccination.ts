import { prisma } from '../../config/prisma.js';
import type { ReportLabels } from './service.js';

export interface VaccinationRow {
  id: string;
  batchId: string;
  batchNumber: string;
  vaccineName: string;
  scheduledDate: string;
  completedDate: string | null;
  status: string;
}

export interface VaccinationResult {
  upcoming: VaccinationRow[];
  completed: VaccinationRow[];
  missed: VaccinationRow[];
  labels: ReportLabels;
}

/**
 * VACCINATION — per-batch vaccinations grouped by status (documented choice: grouped
 * list, not a time series). Rows are the farm's vaccinations (optional batchId filter)
 * within the optional from/to window on scheduledDate, ordered by scheduledDate asc.
 * Labels: `incomplete` when any COMPLETED row lacks a completedDate (data inconsistency);
 * `estimated` always false.
 */
export async function computeVaccination(
  farmId: string,
  batchId?: string,
  from?: string,
  to?: string
): Promise<VaccinationResult> {
  const vaccinations = await prisma.vaccination.findMany({
    where: {
      batch: { farmId },
      ...(batchId ? { batchId } : {}),
      ...(from || to
        ? {
            scheduledDate: {
              gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
              lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
            },
          }
        : {}),
    },
    orderBy: { scheduledDate: 'asc' },
    select: {
      id: true,
      batchId: true,
      batch: { select: { batchNumber: true } },
      vaccineName: true,
      scheduledDate: true,
      completedDate: true,
      status: true,
    },
  });

  const rows = vaccinations.map((v) => ({
    id: v.id,
    batchId: v.batchId,
    batchNumber: v.batch.batchNumber,
    vaccineName: v.vaccineName,
    scheduledDate: v.scheduledDate.toISOString().slice(0, 10),
    completedDate: v.completedDate ? v.completedDate.toISOString().slice(0, 10) : null,
    status: v.status,
  }));

  const upcoming = rows.filter((r) => r.status === 'UPCOMING');
  const completed = rows.filter((r) => r.status === 'COMPLETED');
  const missed = rows.filter((r) => r.status === 'MISSED');

  const incomplete = completed.some((r) => r.completedDate === null);
  return {
    upcoming,
    completed,
    missed,
    labels: { actual: !incomplete, estimated: false, incomplete },
  };
}