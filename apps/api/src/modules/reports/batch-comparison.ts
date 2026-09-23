import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { currentBirds, fcr, mortalityPercent } from '../batches/calculations.js';
import type { ReportLabels } from './service.js';

export interface BatchComparisonRow {
  batchId: string;
  batchNumber: string;
  breed: string;
  status: string;
  currentBirds: number;
  mortalityPct: number;
  fcr: { value: number | null; incomplete: boolean };
  totalExpenses: string;
  revenue: string;
  profit: string;
  labels: ReportLabels;
}

export interface BatchComparisonResult {
  batches: BatchComparisonRow[];
  labels: ReportLabels;
}

/**
 * BATCH-COMPARISON — table of the farm's batches (plan Step 6), ordered by arrivalDate
 * asc then batchNumber asc. Per batch (all T15 helpers imported, never reimplemented):
 * - `currentBirds` / `mortalityPct`: T15 helpers over the batch's dailyRecords + sales.
 * - `fcr`: T15 `fcr()` helper (incomplete when weights missing / gain non-positive).
 * - `totalExpenses` / `revenue` / `profit`: Decimal sums over the batch's expenses/sales
 *   relations; `profit = revenue − totalExpenses`.
 * Row labels: `incomplete` when the batch has ZERO daily records; `estimated` when it has
 * ZERO sales (revenue/profit are then derived from an empty set). Report labels aggregate
 * over rows (any-row OR). Empty farm → complete/actual (documented).
 */
export async function computeBatchComparison(farmId: string): Promise<BatchComparisonResult> {
  const batches = await prisma.batch.findMany({
    where: { farmId },
    orderBy: [{ arrivalDate: 'asc' }, { batchNumber: 'asc' }],
    select: {
      id: true,
      batchNumber: true,
      breed: true,
      status: true,
      initialBirds: true,
      initialAverageWeightKg: true,
      dailyRecords: {
        orderBy: { recordDate: 'asc' },
        select: { mortality: true, feedConsumedKg: true, averageWeightKg: true },
      },
      sales: { select: { birdsSold: true, totalAmount: true } },
      expenses: { select: { amount: true } },
    },
  });

  const rows = batches.map((b) => {
    const cumulativeMortality = b.dailyRecords.reduce((sum, r) => sum + r.mortality, 0);
    const cumulativeSold = b.sales.reduce((sum, s) => sum + s.birdsSold, 0);
    const currentBirdsCount = currentBirds(b.initialBirds, cumulativeMortality, cumulativeSold);
    const mortalityPct = mortalityPercent(cumulativeMortality, b.initialBirds);

    const totalFeed = b.dailyRecords.reduce(
      (sum, r) => (r.feedConsumedKg ? sum.add(r.feedConsumedKg) : sum),
      new Prisma.Decimal(0)
    );
    const latest = b.dailyRecords[b.dailyRecords.length - 1];
    const fcrResult = fcr(
      totalFeed.toNumber(),
      currentBirdsCount,
      latest?.averageWeightKg ? latest.averageWeightKg.toNumber() : null,
      b.initialBirds,
      b.initialAverageWeightKg ? b.initialAverageWeightKg.toNumber() : null
    );

    const totalExpenses = b.expenses.reduce((sum, e) => sum.add(e.amount), new Prisma.Decimal(0));
    const revenue = b.sales.reduce((sum, s) => sum.add(s.totalAmount), new Prisma.Decimal(0));
    const profit = revenue.sub(totalExpenses);

    const incomplete = b.dailyRecords.length === 0;
    const estimated = b.sales.length === 0;
    return {
      batchId: b.id,
      batchNumber: b.batchNumber,
      breed: b.breed,
      status: b.status,
      currentBirds: currentBirdsCount,
      mortalityPct,
      fcr: fcrResult,
      totalExpenses: totalExpenses.toString(),
      revenue: revenue.toString(),
      profit: profit.toString(),
      labels: { actual: !incomplete && !estimated, estimated, incomplete },
    };
  });

  const anyIncomplete = rows.some((r) => r.labels.incomplete);
  const anyEstimated = rows.some((r) => r.labels.estimated);
  return {
    batches: rows,
    labels: {
      actual: !anyIncomplete && !anyEstimated,
      estimated: anyEstimated,
      incomplete: anyIncomplete,
    },
  };
}