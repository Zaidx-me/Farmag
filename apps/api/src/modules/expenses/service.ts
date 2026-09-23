import type { UserRole } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { ApiError, notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import type { CreateExpenseInput, ExpenseListParams, UpdateExpenseInput } from './types.js';

/**
 * FINANCE MATRIX — the deliberate difference from every other domain module (which allows
 * OWNER + MANAGER): expenses touch money, so only OWNER + ACCOUNTANT may write.
 * MANAGER and WORKER are NOT allowed and get 403 from requireRole.
 * READ (list/get) is open to every accessible farm role via isFarmAccessible.
 */
const FINANCE_WRITE_ROLES: UserRole[] = ['OWNER', 'ACCOUNTANT'];

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime (batches pattern). */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * batchId must reference a batch that exists AND belongs to `farmId` — a cross-farm (or
 * absent) batch is a validation-level mismatch (400 VALIDATION_ERROR), consistent with the
 * feed/medicine consume rule; 404 is NOT the right code for a present-but-wrong-farm id.
 */
async function assertBatchBelongsToFarm(batchId: string, farmId: string): Promise<void> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.farmId !== farmId) {
    throw new ApiError('VALIDATION_ERROR', 'batch does not belong to this farm', 400);
  }
}

export async function list(farmId: string, user: { id: string }, params: ExpenseListParams) {
  await isFarmAccessible(farmId, user.id);
  const { page, pageSize, from, to, category, batchId } = params;
  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where: {
        farmId,
        ...(from ? { expenseDate: { gte: toDate(from) } } : {}),
        ...(to ? { expenseDate: { lte: toDate(to) } } : {}),
        ...(category ? { category } : {}),
        ...(batchId ? { batchId } : {}),
      },
      orderBy: { expenseDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({
      where: {
        farmId,
        ...(from ? { expenseDate: { gte: toDate(from) } } : {}),
        ...(to ? { expenseDate: { lte: toDate(to) } } : {}),
        ...(category ? { category } : {}),
        ...(batchId ? { batchId } : {}),
      },
    }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function get(expenseId: string, user: { id: string }) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw notFound('Expense not found');
  // Non-member → isFarmAccessible throws 404 (no existence leak for cross-farm GETs).
  await isFarmAccessible(expense.farmId, user.id);
  return expense;
}

export async function create(farmId: string, user: { id: string }, input: CreateExpenseInput) {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, FINANCE_WRITE_ROLES);
  const { batchId, category, description, amount, expenseDate, supplier, paymentStatus, notes, receiptObjectKey } =
    input;
  if (batchId !== undefined) await assertBatchBelongsToFarm(batchId, farmId);
  return prisma.expense.create({
    data: {
      // farmId is pinned from the route param — never trusted from the wire.
      farmId,
      ...(batchId !== undefined ? { batchId } : {}),
      category,
      description,
      // moneySchema (2dp string) → Prisma Decimal(12,2) passthrough — NEVER float, no toNumber.
      amount,
      expenseDate: toDate(expenseDate),
      ...(supplier !== undefined ? { supplier } : {}),
      // paymentStatus schema default is 'PAID' (mirrors the model default) — map to the
      // shared-types PaymentStatus const strings.
      paymentStatus,
      ...(receiptObjectKey !== undefined ? { receiptObjectKey } : {}),
      ...(notes !== undefined ? { notes } : {}),
      createdBy: user.id,
    },
  });
}

export async function update(expenseId: string, user: { id: string }, input: UpdateExpenseInput) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw notFound('Expense not found');
  const { role } = await isFarmAccessible(expense.farmId, user.id);
  requireRole(role, FINANCE_WRITE_ROLES);
  const { batchId, category, description, amount, expenseDate, supplier, paymentStatus, notes, receiptObjectKey } =
    input;
  // Re-validate batchId against the EXPENSE's farm (same rule as create).
  if (batchId !== undefined) await assertBatchBelongsToFarm(batchId, expense.farmId);
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(batchId !== undefined ? { batchId } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(expenseDate !== undefined ? { expenseDate: toDate(expenseDate) } : {}),
      ...(supplier !== undefined ? { supplier } : {}),
      ...(paymentStatus !== undefined ? { paymentStatus } : {}),
      ...(receiptObjectKey !== undefined ? { receiptObjectKey } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  });
}

export async function remove(expenseId: string, user: { id: string }): Promise<void> {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw notFound('Expense not found');
  const { role } = await isFarmAccessible(expense.farmId, user.id);
  requireRole(role, FINANCE_WRITE_ROLES);
  await prisma.expense.delete({ where: { id: expenseId } });
}
