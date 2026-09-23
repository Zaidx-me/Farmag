import type { Batch } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { ReportLabels } from './service.js';

export interface GrowthPoint {
  recordDate: string;
  averageWeightKg: string | null;
}

export interface GrowthResult {
  batchId: string;
  batchNumber: string;
  series: GrowthPoint[];
  labels: ReportLabels;
}

/**
 * GROWTH — per-batch average-weight time series (plan Step 2).
 * Series is the batch's daily records (asc by recordDate) within the optional from/to
 * window. `averageWeightKg` is a Decimal-safe string, or null when the record has no
 * weight. Labels: `incomplete` when the series is empty OR any point lacks a weight;
 * `estimated` is always false (no derived values here).
 */
export async function computeGrowth(batch: Batch, from?: string, to?: string): Promise<GrowthResult> {
  const records = await prisma.dailyRecord.findMany({
    where: { batchId: batch.id, ...(from || to ? { recordDate: { gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined, lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined } } : {}) },
    orderBy: { recordDate: 'asc' },
    select: { recordDate: true, averageWeightKg: true },
  });

  const series = records.map((r) => ({
    recordDate: r.recordDate.toISOString().slice(0, 10),
    averageWeightKg: r.averageWeightKg ? r.averageWeightKg.toString() : null,
  }));

  const incomplete = series.length === 0 || series.some((p) => p.averageWeightKg === null);
  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    series,
    labels: { actual: !incomplete, estimated: false, incomplete },
  };
}