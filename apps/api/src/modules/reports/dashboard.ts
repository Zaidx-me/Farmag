import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { mortalityPercent } from '../batches/calculations.js';
import type { ReportLabels } from './service.js';

export interface DashboardResult {
  farms: number;
  activeBatches: number;
  totalBirds: number;
  mortalityPercent: number;
  feedConsumedKg: string;
  expenses: string;
  revenue: string;
  profit: string;
  labels: ReportLabels;
}

/**
 * DASHBOARD — single-farm aggregation (documented decision): the endpoint takes ONE
 * `farmId`, so `farms` is the constant 1 (the plan's cross-farm count does not apply).
 *
 * Aggregation choices (documented):
 * - `activeBatches`: count of batches with status ACTIVE.
 * - `totalBirds`: Σ over ACTIVE batches of their LATEST daily record's `birdsRemaining`;
 *   a batch WITHOUT any record contributes `batch.initialBirds` (fallback) and marks the
 *   report `estimated`/`incomplete`.
 * - `mortalityPercent`: farm-wide via the T15 helper —
 *   `mortalityPercent(Σ per-batch cumulative mortality, Σ initialBirds)` (0-guard).
 * - `feedConsumedKg`: Σ FeedTransaction.CONSUMPTION.quantity for the farm (Decimal sum).
 * - `expenses` / `revenue`: Σ Expense.amount / Σ Sale.totalAmount (Decimal sums).
 * - `profit`: revenue − expenses (Decimal `.sub()`).
 *
 * Labels: `estimated` = `incomplete` = ANY active batch lacks daily records (the only
 * data-quality issue here is the initialBirds fallback); `actual` = neither.
 */
export async function computeDashboard(farmId: string): Promise<DashboardResult> {
  const [activeBatches, feedAgg, expenseAgg, saleAgg, records] = await Promise.all([
    prisma.batch.findMany({
      where: { farmId, status: 'ACTIVE' },
      select: { id: true, initialBirds: true },
    }),
    prisma.feedTransaction.aggregate({
      where: { type: 'CONSUMPTION', feedItem: { farmId } },
      _sum: { quantity: true },
    }),
    prisma.expense.aggregate({ where: { farmId }, _sum: { amount: true } }),
    prisma.sale.aggregate({ where: { farmId }, _sum: { totalAmount: true } }),
    prisma.dailyRecord.findMany({
      where: { batch: { farmId, status: 'ACTIVE' } },
      orderBy: { recordDate: 'asc' },
      select: { batchId: true, birdsRemaining: true, mortality: true },
    }),
  ]);

  // Latest record per batch (records are ordered asc → last write wins) + per-batch
  // cumulative mortality (Σ all records of that batch).
  const latestByBatch = new Map<string, { birdsRemaining: number }>();
  const cumulativeMortalityByBatch = new Map<string, number>();
  for (const r of records) {
    latestByBatch.set(r.batchId, { birdsRemaining: r.birdsRemaining });
    cumulativeMortalityByBatch.set(r.batchId, (cumulativeMortalityByBatch.get(r.batchId) ?? 0) + r.mortality);
  }

  let totalBirds = 0;
  let cumulativeMortality = 0;
  let totalInitialBirds = 0;
  let anyBatchWithoutRecords = false;
  for (const batch of activeBatches) {
    totalInitialBirds += batch.initialBirds;
    cumulativeMortality += cumulativeMortalityByBatch.get(batch.id) ?? 0;
    const latest = latestByBatch.get(batch.id);
    if (latest) {
      totalBirds += latest.birdsRemaining;
    } else {
      // Documented fallback: no records → assume the batch still holds its initial birds.
      totalBirds += batch.initialBirds;
      anyBatchWithoutRecords = true;
    }
  }

  const expenses = expenseAgg._sum.amount ?? new Prisma.Decimal(0);
  const revenue = saleAgg._sum.totalAmount ?? new Prisma.Decimal(0);
  const profit = revenue.sub(expenses);

  const incomplete = anyBatchWithoutRecords;
  return {
    farms: 1,
    activeBatches: activeBatches.length,
    totalBirds,
    mortalityPercent: mortalityPercent(cumulativeMortality, totalInitialBirds),
    feedConsumedKg: (feedAgg._sum.quantity ?? new Prisma.Decimal(0)).toString(),
    expenses: expenses.toString(),
    revenue: revenue.toString(),
    profit: profit.toString(),
    labels: { actual: !incomplete, estimated: incomplete, incomplete },
  };
}