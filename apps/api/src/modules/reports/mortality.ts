import type { Batch } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { mortalityPercent } from '../batches/calculations.js';
import type { ReportLabels } from './service.js';

export interface MortalityPoint {
  recordDate: string;
  mortality: number;
  cumulativeMortality: number;
  mortalityPercent: number;
}

export interface MortalityResult {
  batchId: string;
  batchNumber: string;
  series: MortalityPoint[];
  labels: ReportLabels;
}

/**
 * MORTALITY — per-batch mortality time series (plan Step 2).
 * Cumulative values are computed over ALL of the batch's records (batch-relative), THEN
 * the from/to window is applied to the series — so a filtered point still shows the true
 * running cumulative. `mortalityPercent` per point uses the T15 helper (0-guard).
 * Labels: `incomplete` when the filtered series is empty; `estimated` always false.
 */
export async function computeMortality(batch: Batch, from?: string, to?: string): Promise<MortalityResult> {
  const records = await prisma.dailyRecord.findMany({
    where: { batchId: batch.id },
    orderBy: { recordDate: 'asc' },
    select: { recordDate: true, mortality: true },
  });

  let cumulative = 0;
  const allPoints = records.map((r) => {
    cumulative += r.mortality;
    return {
      recordDate: r.recordDate.toISOString().slice(0, 10),
      mortality: r.mortality,
      cumulativeMortality: cumulative,
      mortalityPercent: mortalityPercent(cumulative, batch.initialBirds),
    };
  });

  // ISO 'YYYY-MM-DD' strings compare lexicographically — safe window filter.
  const series = allPoints.filter((p) => {
    if (from && p.recordDate < from) return false;
    if (to && p.recordDate > to) return false;
    return true;
  });

  const incomplete = series.length === 0;
  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    series,
    labels: { actual: !incomplete, estimated: false, incomplete },
  };
}