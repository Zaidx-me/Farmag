import { Prisma } from '@prisma/client';
import type { Batch } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { currentBirds, fcr } from '../batches/calculations.js';
import type { ReportLabels } from './service.js';

export interface FeedPoint {
  recordDate: string;
  feedConsumedKg: string | null;
}

export interface FeedResult {
  batchId: string;
  batchNumber: string;
  series: FeedPoint[];
  totalFeedConsumed: string;
  currentBirds: number;
  currentAvgWeightKg: string | null;
  fcr: { value: number | null; incomplete: boolean };
  labels: ReportLabels;
}

/**
 * FEED — per-batch feed-consumption series + totals (plan Step 2).
 * - `series`: daily records (asc) within the optional from/to window.
 * - `totalFeedConsumed`: Decimal sum of the WINDOW's feedConsumedKg (Decimal-safe string).
 * - `currentBirds`: T15 helper over ALL records + ALL sales of the batch — deliberately
 *   window-INDEPENDENT (documented): the live bird count is a snapshot, not a window slice.
 * - `currentAvgWeightKg`: latest in-window record's weight (Decimal-safe string or null).
 * - `fcr`: T15 `fcr()` helper (incomplete when weights missing / gain non-positive).
 * Labels: `incomplete` when the series is empty, any feedConsumedKg is null, or fcr is
 * incomplete; `estimated` always false.
 */
export async function computeFeed(batch: Batch, from?: string, to?: string): Promise<FeedResult> {
  const records = await prisma.dailyRecord.findMany({
    where: {
      batchId: batch.id,
      ...(from || to
        ? {
            recordDate: {
              gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
              lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
            },
          }
        : {}),
    },
    orderBy: { recordDate: 'asc' },
    select: { recordDate: true, feedConsumedKg: true, averageWeightKg: true },
  });

  const series = records.map((r) => ({
    recordDate: r.recordDate.toISOString().slice(0, 10),
    feedConsumedKg: r.feedConsumedKg ? r.feedConsumedKg.toString() : null,
  }));

  const totalFeed = records.reduce(
    (sum, r) => (r.feedConsumedKg ? sum.add(r.feedConsumedKg) : sum),
    new Prisma.Decimal(0)
  );

  // Window-independent live bird count: Σ ALL mortality + Σ ALL birdsSold.
  const [mortalityAgg, soldAgg] = await Promise.all([
    prisma.dailyRecord.aggregate({ where: { batchId: batch.id }, _sum: { mortality: true } }),
    prisma.sale.aggregate({ where: { batchId: batch.id }, _sum: { birdsSold: true } }),
  ]);
  const currentBirdsCount = currentBirds(
    batch.initialBirds,
    mortalityAgg._sum.mortality ?? 0,
    soldAgg._sum.birdsSold ?? 0
  );

  const latest = records[records.length - 1];
  const currentAvgWeightKg = latest?.averageWeightKg ?? null;

  const fcrResult = fcr(
    totalFeed.toNumber(),
    currentBirdsCount,
    currentAvgWeightKg ? currentAvgWeightKg.toNumber() : null,
    batch.initialBirds,
    batch.initialAverageWeightKg ? batch.initialAverageWeightKg.toNumber() : null
  );

  const incomplete =
    series.length === 0 || series.some((p) => p.feedConsumedKg === null) || fcrResult.incomplete;
  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    series,
    totalFeedConsumed: totalFeed.toString(),
    currentBirds: currentBirdsCount,
    currentAvgWeightKg: currentAvgWeightKg ? currentAvgWeightKg.toString() : null,
    fcr: fcrResult,
    labels: { actual: !incomplete, estimated: false, incomplete },
  };
}