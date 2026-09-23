import type { Prisma } from '@prisma/client';
import type { UserRole } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { computeBatchComparison } from './batch-comparison.js';
import { computeDashboard } from './dashboard.js';
import { computeExpenses } from './expenses.js';
import { computeFeed } from './feed.js';
import { computeGrowth } from './growth.js';
import { computeMedicine } from './medicine.js';
import { computeMortality } from './mortality.js';
import { computeProfitLoss } from './profit-loss.js';
import { computeSales } from './sales.js';
import { computeVaccination } from './vaccination.js';

/**
 * REPORTS MODULE — the analytics layer (Task 22).
 *
 * Architecture (documented): `service.ts` owns ALL auth + shared helpers and exposes the
 * 10 public entry functions; each report file exports a pure-ish `computeX(...)` that
 * fetches + aggregates and returns `{ ...data, labels }`. `service.ts` wraps every result
 * with `meta.isComplete` (= NOT labels.incomplete). Report files import ONLY the
 * `ReportLabels` type from here (type-only, erased at runtime) — no runtime cycle.
 *
 * Authorization (LOCKED ruling): reports are read-only analytics for OWNER/MANAGER/
 * ACCOUNTANT — WORKER is EXCLUDED (403). Absent/inaccessible farm → 404 (isFarmAccessible
 * throws notFound before requireRole runs, so no existence leak). Routes use
 * `{ preHandler: app.authenticate }` ONLY; the role gate lives here in the service.
 */
const REPORT_READ_ROLES: UserRole[] = ['OWNER', 'MANAGER', 'ACCOUNTANT'];

/** Every report/dashboard result carries these three booleans (plan, MANDATORY). */
export interface ReportLabels {
  /** Fully sourced from real data — no fallbacks, no missing required fields. */
  actual: boolean;
  /** Some values derived/marked estimated (e.g. initialBirds fallback, zero-sale revenue). */
  estimated: boolean;
  /** Required data is missing (e.g. batch without daily records). */
  incomplete: boolean;
}

export interface ReportQuery {
  farmId: string;
  from?: string;
  to?: string;
}

/** Growth/mortality/feed REQUIRE a batchId (per-batch time series). */
export interface SeriesQuery extends ReportQuery {
  batchId: string;
}

/** Medicine/vaccination/sales accept an optional batchId. */
export interface OptionalBatchQuery extends ReportQuery {
  batchId?: string;
}

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Builds a Prisma DateTimeFilter from optional from/to (empty object when neither given). */
function toWindow(from?: string, to?: string): Prisma.DateTimeFilter {
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = toDate(from);
  if (to) filter.lte = toDate(to);
  return filter;
}

/** Access + role gate for every report + dashboard. */
async function assertReportAccess(farmId: string, userId: string): Promise<void> {
  const { role } = await isFarmAccessible(farmId, userId);
  requireRole(role, REPORT_READ_ROLES);
}

/**
 * Resolves a batch that must exist AND belong to `farmId` — absent or cross-farm is a
 * 404 (no existence leak), consistent with the reports' read-only 404 semantics.
 */
async function requireBatch(batchId: string, farmId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.farmId !== farmId) throw notFound('Batch not found');
  return batch;
}

/** Wraps a compute result with meta.isComplete = NOT labels.incomplete (plan, MANDATORY). */
function withMeta<T extends { labels: ReportLabels }>(result: T): T & { meta: { isComplete: boolean } } {
  return { ...result, meta: { isComplete: !result.labels.incomplete } };
}

export async function dashboard(farmId: string, user: { id: string }) {
  await assertReportAccess(farmId, user.id);
  return withMeta(await computeDashboard(farmId));
}

export async function growth(farmId: string, user: { id: string }, query: SeriesQuery) {
  await assertReportAccess(farmId, user.id);
  const batch = await requireBatch(query.batchId, farmId);
  return withMeta(await computeGrowth(batch, query.from, query.to));
}

export async function mortality(farmId: string, user: { id: string }, query: SeriesQuery) {
  await assertReportAccess(farmId, user.id);
  const batch = await requireBatch(query.batchId, farmId);
  return withMeta(await computeMortality(batch, query.from, query.to));
}

export async function feed(farmId: string, user: { id: string }, query: SeriesQuery) {
  await assertReportAccess(farmId, user.id);
  const batch = await requireBatch(query.batchId, farmId);
  return withMeta(await computeFeed(batch, query.from, query.to));
}

export async function medicine(farmId: string, user: { id: string }, query: OptionalBatchQuery) {
  await assertReportAccess(farmId, user.id);
  return withMeta(await computeMedicine(farmId, query.batchId, query.from, query.to));
}

export async function vaccination(farmId: string, user: { id: string }, query: OptionalBatchQuery) {
  await assertReportAccess(farmId, user.id);
  return withMeta(await computeVaccination(farmId, query.batchId, query.from, query.to));
}

export async function expenses(farmId: string, user: { id: string }, query: ReportQuery) {
  await assertReportAccess(farmId, user.id);
  return withMeta(await computeExpenses(farmId, query.from, query.to));
}

export async function sales(farmId: string, user: { id: string }, query: OptionalBatchQuery) {
  await assertReportAccess(farmId, user.id);
  return withMeta(await computeSales(farmId, query.batchId, query.from, query.to));
}

export async function profitLoss(farmId: string, user: { id: string }) {
  await assertReportAccess(farmId, user.id);
  return withMeta(await computeProfitLoss(farmId));
}

export async function batchComparison(farmId: string, user: { id: string }) {
  await assertReportAccess(farmId, user.id);
  return withMeta(await computeBatchComparison(farmId));
}