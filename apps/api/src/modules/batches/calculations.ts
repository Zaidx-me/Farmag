import { Prisma } from '@prisma/client';

/**
 * Pure batch-calculation helpers, exported for tests AND mobile parity (spec §5.6).
 *
 * Decimal-arithmetic choice (documented): kg quantities arrive as Prisma Decimal.
 * Aggregation (totalFeedConsumed) uses Prisma Decimal arithmetic (`.add()`), and
 * `toNumber()` is applied ONLY at the output boundary — for the FCR ratio and the
 * wire-safe string forms of the totals. Money is never touched here.
 */

export function currentBirds(initialBirds: number, cumulativeMortality: number, cumulativeSold: number): number {
  return Math.max(0, initialBirds - cumulativeMortality - cumulativeSold);
}

export function mortalityPercent(cumulativeMortality: number, initialBirds: number): number {
  if (initialBirds <= 0) return 0;
  return (cumulativeMortality / initialBirds) * 100;
}

export interface FcrResult {
  value: number | null;
  incomplete: boolean;
}

/**
 * Feed-conversion ratio: Σ feedConsumedKg ÷ ((currentBirds × currentAvgWeightKg)
 * − (initialBirds × initialAverageWeightKg)). Returns `{ value: null, incomplete: true }`
 * when a required weight is missing or the weight gain is non-positive.
 */
export function fcr(
  feedConsumedKg: number,
  currentBirdsCount: number,
  currentAvgWeightKg: number | null,
  initialBirds: number,
  initialAverageWeightKg: number | null
): FcrResult {
  if (currentAvgWeightKg === null || initialAverageWeightKg === null) {
    return { value: null, incomplete: true };
  }
  const gain = currentBirdsCount * currentAvgWeightKg - initialBirds * initialAverageWeightKg;
  if (gain <= 0) return { value: null, incomplete: true };
  return { value: Math.round((feedConsumedKg / gain) * 10_000) / 10_000, incomplete: false };
}

export interface BatchSummary {
  currentBirds: number;
  mortalityPct: number;
  /** Decimal-safe string (Prisma Decimal toString) — never a JS float. */
  totalFeedConsumed: string;
  /** Decimal-safe string of the latest daily record's averageWeightKg, or null. */
  currentAvgWeightKg: string | null;
  fcr: FcrResult;
}

export interface SummaryBatch {
  initialBirds: number;
  initialAverageWeightKg: Prisma.Decimal | null;
}

export interface SummaryDailyRecord {
  recordDate: Date;
  mortality: number;
  feedConsumedKg: Prisma.Decimal | null;
  averageWeightKg: Prisma.Decimal | null;
}

export interface SummarySale {
  birdsSold: number;
}

/**
 * Pure aggregation over already-fetched rows (the service fetches; this stays pure + testable).
 * `currentAvgWeightKg` is taken from the LATEST daily record by recordDate.
 */
export function summary(
  batch: SummaryBatch,
  dailyRecords: SummaryDailyRecord[],
  sales: SummarySale[]
): BatchSummary {
  const cumulativeMortality = dailyRecords.reduce((sum, r) => sum + r.mortality, 0);
  const cumulativeSold = sales.reduce((sum, s) => sum + s.birdsSold, 0);
  const currentBirdsCount = currentBirds(batch.initialBirds, cumulativeMortality, cumulativeSold);
  const mortalityPct = mortalityPercent(cumulativeMortality, batch.initialBirds);

  const totalFeed = dailyRecords.reduce(
    (sum, r) => (r.feedConsumedKg ? sum.add(r.feedConsumedKg) : sum),
    new Prisma.Decimal(0)
  );

  const latest = dailyRecords.reduce<SummaryDailyRecord | null>(
    (acc, r) => (acc === null || r.recordDate > acc.recordDate ? r : acc),
    null
  );
  const currentAvgWeightKg = latest?.averageWeightKg ?? null;

  const fcrResult = fcr(
    totalFeed.toNumber(),
    currentBirdsCount,
    currentAvgWeightKg ? currentAvgWeightKg.toNumber() : null,
    batch.initialBirds,
    batch.initialAverageWeightKg ? batch.initialAverageWeightKg.toNumber() : null
  );

  return {
    currentBirds: currentBirdsCount,
    mortalityPct,
    totalFeedConsumed: totalFeed.toString(),
    currentAvgWeightKg: currentAvgWeightKg ? currentAvgWeightKg.toString() : null,
    fcr: fcrResult,
  };
}