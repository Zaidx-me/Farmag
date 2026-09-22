import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { ApiError, notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import { alertGenerator } from '../alerts/generator.js';
import type {
  ConsumeFeedInput,
  CreateFeedItemInput,
  ListParams,
  PurchaseFeedInput,
  TransactionListParams,
  UpdateFeedItemInput,
} from './types.js';

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Fire-and-forget alert evaluation after a stock move (LOCKED rule 4). The generator
 * never throws (it logs + swallows internally); this is belt-and-braces so a future
 * regression can never break the feed write path.
 */
async function evaluateAlerts(farmId: string): Promise<void> {
  try {
    await alertGenerator.evaluate(farmId);
  } catch {
    // no-op — see above.
  }
}

export async function list(farmId: string, user: { id: string }, { page, pageSize }: ListParams) {
  await isFarmAccessible(farmId, user.id);
  const [items, total] = await Promise.all([
    prisma.feedItem.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.feedItem.count({ where: { farmId } }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function create(farmId: string, user: { id: string }, input: CreateFeedItemInput) {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  // farmId is pinned from the route param — never trusted from the wire (schema has no farmId).
  return prisma.feedItem.create({ data: { ...input, farmId } });
}

export async function update(feedItemId: string, user: { id: string }, input: UpdateFeedItemInput) {
  const feedItem = await prisma.feedItem.findUnique({ where: { id: feedItemId } });
  if (!feedItem) throw notFound('Feed item not found');
  const { role } = await isFarmAccessible(feedItem.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  // Stock changes ONLY via purchase/consume — currentStock is stripped from update.
  const { currentStock: _currentStock, ...data } = input;
  return prisma.feedItem.update({ where: { id: feedItemId }, data });
}

export async function purchase(feedItemId: string, user: { id: string }, input: PurchaseFeedInput) {
  const { quantity, unitCost, totalCost, transactionDate, notes } = input;
  // Server-computed totalCost: unitCost × quantity in Prisma.Decimal when unitCost-only.
  // When both are given the client totalCost wins; when neither, totalCost stays null.
  // Money is NEVER float math.
  const computedTotalCost =
    unitCost !== undefined && totalCost === undefined
      ? new Prisma.Decimal(unitCost).mul(new Prisma.Decimal(quantity))
      : totalCost;

  let farmId = '';
  const result = await prisma.$transaction(async (tx) => {
    const feedItem = await tx.feedItem.findUnique({ where: { id: feedItemId } });
    if (!feedItem) throw notFound('Feed item not found');
    const { role } = await isFarmAccessible(feedItem.farmId, user.id);
    requireRole(role, ['OWNER', 'MANAGER']);
    farmId = feedItem.farmId;

    const updated = await tx.feedItem.update({
      where: { id: feedItemId },
      data: { currentStock: feedItem.currentStock.add(new Prisma.Decimal(quantity)) },
    });
    const transaction = await tx.feedTransaction.create({
      data: {
        feedItemId,
        type: 'PURCHASE',
        quantity: new Prisma.Decimal(quantity),
        ...(unitCost !== undefined ? { unitCost: new Prisma.Decimal(unitCost) } : {}),
        ...(computedTotalCost !== undefined ? { totalCost: new Prisma.Decimal(computedTotalCost) } : {}),
        ...(transactionDate !== undefined ? { transactionDate: toDate(transactionDate) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        createdBy: user.id,
      },
    });
    return { feedItem: updated, transaction };
  });

  await evaluateAlerts(farmId);
  return result;
}

export async function consume(feedItemId: string, user: { id: string }, input: ConsumeFeedInput) {
  const { quantity, batchId, transactionDate, notes } = input;

  let farmId = '';
  const result = await prisma.$transaction(async (tx) => {
    const feedItem = await tx.feedItem.findUnique({ where: { id: feedItemId } });
    if (!feedItem) throw notFound('Feed item not found');
    const { role } = await isFarmAccessible(feedItem.farmId, user.id);
    requireRole(role, ['OWNER', 'MANAGER']);
    farmId = feedItem.farmId;

    const qty = new Prisma.Decimal(quantity);
    // Reject BEFORE any write — the throw rolls back the transaction, so stock is
    // unchanged and no FeedTransaction row is created.
    if (qty.greaterThan(feedItem.currentStock)) {
      throw new ApiError('STOCK_INSUFFICIENT', 'quantity exceeds current stock', 400);
    }
    // batchId must reference a batch of the SAME farm — a cross-farm batch is a
    // validation-level mismatch (400), not a 404.
    if (batchId !== undefined) {
      const batch = await tx.batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.farmId !== feedItem.farmId) {
        throw new ApiError('VALIDATION_ERROR', 'Batch does not belong to this farm', 400);
      }
    }

    const updated = await tx.feedItem.update({
      where: { id: feedItemId },
      data: { currentStock: feedItem.currentStock.sub(qty) },
    });
    const transaction = await tx.feedTransaction.create({
      data: {
        feedItemId,
        type: 'CONSUMPTION',
        quantity: qty,
        ...(batchId !== undefined ? { batchId } : {}),
        ...(transactionDate !== undefined ? { transactionDate: toDate(transactionDate) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        createdBy: user.id,
      },
    });
    return { feedItem: updated, transaction };
  });

  await evaluateAlerts(farmId);
  return result;
}

export async function transactions(
  feedItemId: string,
  user: { id: string },
  { from, to, page, pageSize }: TransactionListParams
) {
  const feedItem = await prisma.feedItem.findUnique({ where: { id: feedItemId } });
  if (!feedItem) throw notFound('Feed item not found');
  await isFarmAccessible(feedItem.farmId, user.id);
  const dateFilter: Prisma.DateTimeFilter = {};
  if (from) dateFilter.gte = toDate(from);
  if (to) dateFilter.lte = toDate(to);
  const where: Prisma.FeedTransactionWhereInput = {
    feedItemId,
    ...(from || to ? { transactionDate: dateFilter } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.feedTransaction.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.feedTransaction.count({ where }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}