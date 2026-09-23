import { Prisma } from '@prisma/client';
import type { PaymentStatus, UserRole } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { ApiError, notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import { alertGenerator } from '../alerts/generator.js';
import { currentBirds } from '../batches/calculations.js';
import type { CreateSaleInput, SaleListParams, UpdateSaleInput, UpdateSalePaymentInput } from './types.js';

/**
 * FINANCE MATRIX — same as expenses (T20): sales touch money, so only OWNER + ACCOUNTANT
 * may write. MANAGER and WORKER are NOT allowed and get 403 from requireRole.
 * READ (list/get) is open to every accessible farm role via isFarmAccessible.
 */
const FINANCE_WRITE_ROLES: UserRole[] = ['OWNER', 'ACCOUNTANT'];

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime (batches pattern). */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * ALL money math is server-side and exclusively Prisma.Decimal — never float, never
 * toNumber(). totalAmount = totalWeightKg × ratePerKg; amountReceived > totalAmount is
 * rejected (PAYMENT_EXCEEDS_TOTAL); outstanding = totalAmount − amountReceived;
 * paymentStatus derived: outstanding == 0 → PAID, 0 < outstanding < total →
 * PARTIALLY_PAID, else (amountReceived == 0 → outstanding == total) → PENDING.
 */
function computeMoney(totalWeightKg: string, ratePerKg: string, amountReceived: string) {
  const totalAmount = new Prisma.Decimal(totalWeightKg).mul(new Prisma.Decimal(ratePerKg));
  const received = new Prisma.Decimal(amountReceived);
  if (received.greaterThan(totalAmount)) {
    throw new ApiError('PAYMENT_EXCEEDS_TOTAL', 'amountReceived exceeds totalAmount', 400);
  }
  const outstanding = totalAmount.sub(received);
  const paymentStatus: PaymentStatus = outstanding.isZero()
    ? 'PAID'
    : outstanding.greaterThan(0) && outstanding.lessThan(totalAmount)
      ? 'PARTIALLY_PAID'
      : 'PENDING';
  return { totalAmount, received, outstanding, paymentStatus };
}

/**
 * Intra-transaction batch validation + current-birds check (T15 `currentBirds` helper —
 * imported, never reimplemented):
 *   available = currentBirds(initialBirds, Σ dailyRecord.mortality, Σ existing sale.birdsSold)
 *   birdsSold > available → BATCH_BIRD_COUNT_INVALID.
 * `excludeSaleId` (update path) removes the sale being edited from the ΣbirdsSold so the
 * check measures the batch's remaining birds BEFORE this sale's new count is applied.
 * A batch that is absent OR belongs to another farm is a validation mismatch (400), not a
 * 404 — consistent with the feed/medicine/expenses cross-farm batch rule.
 */
async function assertBatchAndBirds(
  tx: Prisma.TransactionClient,
  batchId: string,
  farmId: string,
  birdsSold: number,
  excludeSaleId?: string
): Promise<void> {
  const batch = await tx.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.farmId !== farmId) {
    throw new ApiError('VALIDATION_ERROR', 'batch does not belong to this farm', 400);
  }
  const [mortalityAgg, soldAgg] = await Promise.all([
    tx.dailyRecord.aggregate({ where: { batchId }, _sum: { mortality: true } }),
    tx.sale.aggregate({
      where: { batchId, ...(excludeSaleId !== undefined ? { id: { not: excludeSaleId } } : {}) },
      _sum: { birdsSold: true },
    }),
  ]);
  const available = currentBirds(
    batch.initialBirds,
    mortalityAgg._sum.mortality ?? 0,
    soldAgg._sum.birdsSold ?? 0
  );
  if (birdsSold > available) {
    throw new ApiError('BATCH_BIRD_COUNT_INVALID', 'birdsSold exceeds current batch birds', 400);
  }
}

export async function list(farmId: string, user: { id: string }, params: SaleListParams) {
  await isFarmAccessible(farmId, user.id);
  const { page, pageSize, from, to, batchId } = params;
  const where: Prisma.SaleWhereInput = {
    farmId,
    ...(from ? { saleDate: { gte: toDate(from) } } : {}),
    ...(to ? { saleDate: { lte: toDate(to) } } : {}),
    ...(batchId ? { batchId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { saleDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // batch included for display (batchNumber/shed) — documented choice, plan allows.
      include: { batch: true },
    }),
    prisma.sale.count({ where }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function get(saleId: string, user: { id: string }) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { batch: true } });
  if (!sale) throw notFound('Sale not found');
  // Non-member → isFarmAccessible throws 404 (no existence leak for cross-farm GETs).
  await isFarmAccessible(sale.farmId, user.id);
  return sale;
}

export async function create(farmId: string, user: { id: string }, input: CreateSaleInput) {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, FINANCE_WRITE_ROLES);
  const { batchId, buyer, saleDate, birdsSold, totalWeightKg, ratePerKg, amountReceived, notes } = input;
  // Batch read + current-birds check + insert in ONE transaction so the birds check is
  // intra-transaction-consistent (sequential tx in Prisma).
  const sale = await prisma.$transaction(async (tx) => {
    await assertBatchAndBirds(tx, batchId, farmId, birdsSold);
    const { totalAmount, received, outstanding, paymentStatus } = computeMoney(
      totalWeightKg,
      ratePerKg,
      amountReceived
    );
    return tx.sale.create({
      data: {
        // farmId is pinned from the route param — never trusted from the wire.
        farmId,
        batchId,
        buyer,
        saleDate: toDate(saleDate),
        birdsSold,
        totalWeightKg: new Prisma.Decimal(totalWeightKg),
        ratePerKg: new Prisma.Decimal(ratePerKg),
        // Server-computed — the client NEVER sends totalAmount/outstandingAmount/paymentStatus.
        totalAmount,
        amountReceived: received,
        outstandingAmount: outstanding,
        paymentStatus,
        ...(notes !== undefined ? { notes } : {}),
        createdBy: user.id,
      },
    });
  });
  // Lazy alert refresh (Task 23): PAYMENT_OVERDUE/SALE_DATE_APPROACHING re-evaluated after
  // a sale is created. The generator never throws (logs + swallows internally); belt-and-
  // braces so a future regression can never break the sales write path.
  await alertGenerator.evaluate(farmId);
  return sale;
}

/**
 * PATCH /api/v1/sales/:saleId — full-sale update (updateSaleSchema = createSaleSchema.partial()).
 * Totals/status are ALWAYS recomputed server-side from the RESULTING field values (partial
 * fields merged over the existing row), and the birdsSold check is re-run against the
 * resulting batch (excluding this sale from the ΣbirdsSold). Decision documented in the
 * task report: implemented (recommendation) rather than skipped.
 */
export async function update(saleId: string, user: { id: string }, input: UpdateSaleInput) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw notFound('Sale not found');
  const { role } = await isFarmAccessible(sale.farmId, user.id);
  requireRole(role, FINANCE_WRITE_ROLES);
  const { batchId, buyer, saleDate, birdsSold, totalWeightKg, ratePerKg, amountReceived, notes } = input;
  return prisma.$transaction(async (tx) => {
    const nextBatchId = batchId ?? sale.batchId;
    const nextBirdsSold = birdsSold ?? sale.birdsSold;
    await assertBatchAndBirds(tx, nextBatchId, sale.farmId, nextBirdsSold, saleId);
    const nextTotalWeightKg = totalWeightKg ?? sale.totalWeightKg.toString();
    const nextRatePerKg = ratePerKg ?? sale.ratePerKg.toString();
    const nextAmountReceived = amountReceived ?? sale.amountReceived.toString();
    const { totalAmount, received, outstanding, paymentStatus } = computeMoney(
      nextTotalWeightKg,
      nextRatePerKg,
      nextAmountReceived
    );
    return tx.sale.update({
      where: { id: saleId },
      data: {
        ...(batchId !== undefined ? { batchId } : {}),
        ...(buyer !== undefined ? { buyer } : {}),
        ...(saleDate !== undefined ? { saleDate: toDate(saleDate) } : {}),
        ...(birdsSold !== undefined ? { birdsSold } : {}),
        ...(totalWeightKg !== undefined ? { totalWeightKg: new Prisma.Decimal(totalWeightKg) } : {}),
        ...(ratePerKg !== undefined ? { ratePerKg: new Prisma.Decimal(ratePerKg) } : {}),
        totalAmount,
        amountReceived: received,
        outstandingAmount: outstanding,
        paymentStatus,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
  });
}

/**
 * POST /api/v1/sales/:saleId/payment — ALL in prisma.$transaction (resolve → access-check →
 * requireRole → recompute → update). `amountReceived` is the NEW TOTAL received so far
 * (semantics documented in the task report): outstanding = totalAmount − amountReceived.
 */
export async function updatePayment(saleId: string, user: { id: string }, input: UpdateSalePaymentInput) {
  const { amountReceived } = input;
  const sale = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw notFound('Sale not found');
    const { role } = await isFarmAccessible(sale.farmId, user.id);
    requireRole(role, FINANCE_WRITE_ROLES);
    const { received, outstanding, paymentStatus } = computeMoney(
      sale.totalWeightKg.toString(),
      sale.ratePerKg.toString(),
      amountReceived
    );
    return tx.sale.update({
      where: { id: saleId },
      data: { amountReceived: received, outstandingAmount: outstanding, paymentStatus },
    });
  });
  // Lazy alert refresh (Task 23): PAYMENT_OVERDUE re-evaluated after a payment move.
  // The generator never throws (logs + swallows internally); belt-and-braces so a future
  // regression can never break the sales write path.
  await alertGenerator.evaluate(sale.farmId);
  return sale;
}

export async function remove(saleId: string, user: { id: string }): Promise<void> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw notFound('Sale not found');
  const { role } = await isFarmAccessible(sale.farmId, user.id);
  requireRole(role, FINANCE_WRITE_ROLES);
  await prisma.sale.delete({ where: { id: saleId } });
}