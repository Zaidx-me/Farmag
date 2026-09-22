import { Prisma } from '@prisma/client';
import { AlertSeverity, AlertType } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import { ApiError, notFound } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import { paginate } from '../../utils/pagination.js';
import { alertGenerator } from '../alerts/generator.js';
import type {
  CreateMedicineItemInput,
  ListParams,
  PurchaseMedicineInput,
  TransactionListParams,
  UpdateMedicineItemInput,
  UseMedicineInput,
} from './types.js';

/** dateSchema yields 'YYYY-MM-DD'; Prisma @db.Date needs a full ISO-8601 DateTime. */
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Dedupe window for the inline MEDICINE_EXPIRY alerts — mirrors alerts/generator.ts
 * (7-day unread window keyed on userId/type/farmId/batchId/title). Do NOT drift.
 */
const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Expiry lookahead: alert when expiryDate is within the next 30 days (plan-mandated). */
const EXPIRY_LOOKAHEAD_DAYS = 30;

/**
 * Fire-and-forget alert evaluation after a stock move (LOCKED rule 4). The generator
 * never throws (it logs + swallows internally); this is belt-and-braces so a future
 * regression can never break the medicine write path.
 */
async function evaluateAlerts(farmId: string): Promise<void> {
  try {
    await alertGenerator.evaluate(farmId);
  } catch {
    // no-op — see above.
  }
}

/**
 * MEDICINE_EXPIRY is NOT part of the T16 generator core (Task 23 consolidates it), so it
 * is created inline here, checked on every `list` (plan-mandated). It follows the
 * generator's exact dedupe pattern: skip when an unread alert with the same
 * (userId, type, farmId, batchId=null, title) exists within the last 7 days.
 * Alert creation must NEVER break `list` — the whole body is wrapped in try/catch.
 */
async function createExpiryAlerts(farmId: string): Promise<void> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: { members: { select: { userId: true } } },
    });
    if (!farm) return;
    // Recipients: farm OWNER + all FarmMembers (deduped) — same as the generator.
    const recipientIds = Array.from(new Set([farm.ownerId, ...farm.members.map((m) => m.userId)]));

    // UTC-midnight window matching the @db.Date storage (toDate stores UTC midnight).
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + EXPIRY_LOOKAHEAD_DAYS);

    const medicines = await prisma.medicine.findMany({
      where: { farmId, expiryDate: { gte: today, lte: horizon } },
      select: { name: true },
    });

    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    for (const medicine of medicines) {
      // Title is deterministic per medicine name — part of the dedupe key.
      const title = `Medicine expiring: ${medicine.name}`;
      const message = `Medicine ${medicine.name} expires within the next ${EXPIRY_LOOKAHEAD_DAYS} days.`;
      for (const userId of recipientIds) {
        const existing = await prisma.alert.findFirst({
          where: {
            userId,
            type: AlertType.MedicineExpiry,
            farmId,
            batchId: null,
            title,
            isRead: false,
            createdAt: { gte: since },
          },
        });
        if (existing) continue;
        await prisma.alert.create({
          data: {
            userId,
            farmId,
            batchId: null,
            type: AlertType.MedicineExpiry,
            severity: AlertSeverity.Warning,
            title,
            message,
          },
        });
      }
    }
  } catch {
    // no-op — alert creation must never break `list`.
  }
}

export async function list(farmId: string, user: { id: string }, { page, pageSize }: ListParams) {
  await isFarmAccessible(farmId, user.id);
  const [items, total] = await Promise.all([
    prisma.medicine.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.medicine.count({ where: { farmId } }),
  ]);
  // MEDICINE_EXPIRY is evaluated inline here (plan-mandated) — never breaks list.
  await createExpiryAlerts(farmId);
  return { items, meta: paginate({ page, pageSize, total }) };
}

export async function create(farmId: string, user: { id: string }, input: CreateMedicineItemInput) {
  const { role } = await isFarmAccessible(farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  // farmId is pinned from the route param — never trusted from the wire (schema has no farmId).
  const { expiryDate, ...rest } = input;
  return prisma.medicine.create({
    data: {
      ...rest,
      farmId,
      ...(expiryDate !== undefined ? { expiryDate: toDate(expiryDate) } : {}),
    },
  });
}

export async function update(medicineId: string, user: { id: string }, input: UpdateMedicineItemInput) {
  const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!medicine) throw notFound('Medicine not found');
  const { role } = await isFarmAccessible(medicine.farmId, user.id);
  requireRole(role, ['OWNER', 'MANAGER']);
  // Stock changes ONLY via purchase/use — currentStock is stripped from update.
  const { currentStock: _currentStock, expiryDate, ...rest } = input;
  return prisma.medicine.update({
    where: { id: medicineId },
    data: {
      ...rest,
      ...(expiryDate !== undefined ? { expiryDate: toDate(expiryDate) } : {}),
    },
  });
}

export async function purchase(medicineId: string, user: { id: string }, input: PurchaseMedicineInput) {
  const { quantity, expiryDate, transactionDate, notes } = input;
  // VERIFIED MODEL FACT: MedicineTransaction has NO unitCost/totalCost columns (unlike
  // FeedTransaction). medicinePurchaseSchema accepts them for API compatibility, but they
  // are accept-and-dropped here — no prisma change, no server totalCost math (no column).
  let farmId = '';
  const result = await prisma.$transaction(async (tx) => {
    const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) throw notFound('Medicine not found');
    const { role } = await isFarmAccessible(medicine.farmId, user.id);
    requireRole(role, ['OWNER', 'MANAGER']);
    farmId = medicine.farmId;

    // Purchase WITH an expiryDate updates the item's expiryDate in the same tx
    // (latest-purchase-wins).
    const updated = await tx.medicine.update({
      where: { id: medicineId },
      data: {
        currentStock: medicine.currentStock.add(new Prisma.Decimal(quantity)),
        ...(expiryDate !== undefined ? { expiryDate: toDate(expiryDate) } : {}),
      },
    });
    const transaction = await tx.medicineTransaction.create({
      data: {
        medicineId,
        type: 'PURCHASE',
        quantity: new Prisma.Decimal(quantity),
        ...(transactionDate !== undefined ? { transactionDate: toDate(transactionDate) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        createdBy: user.id,
      },
    });
    return { medicine: updated, transaction };
  });

  await evaluateAlerts(farmId);
  return result;
}

export async function use(medicineId: string, user: { id: string }, input: UseMedicineInput) {
  const { quantity, batchId, transactionDate, notes } = input;

  let farmId = '';
  const result = await prisma.$transaction(async (tx) => {
    const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) throw notFound('Medicine not found');
    const { role } = await isFarmAccessible(medicine.farmId, user.id);
    requireRole(role, ['OWNER', 'MANAGER']);
    farmId = medicine.farmId;

    const qty = new Prisma.Decimal(quantity);
    // Reject BEFORE any write — the throw rolls back the transaction, so stock is
    // unchanged and no MedicineTransaction row is created.
    if (qty.greaterThan(medicine.currentStock)) {
      throw new ApiError('STOCK_INSUFFICIENT', 'quantity exceeds current stock', 400);
    }
    // batchId must reference a batch of the SAME farm — a cross-farm batch is a
    // validation-level mismatch (400), not a 404.
    if (batchId !== undefined) {
      const batch = await tx.batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.farmId !== medicine.farmId) {
        throw new ApiError('VALIDATION_ERROR', 'Batch does not belong to this farm', 400);
      }
    }

    const updated = await tx.medicine.update({
      where: { id: medicineId },
      data: { currentStock: medicine.currentStock.sub(qty) },
    });
    const transaction = await tx.medicineTransaction.create({
      data: {
        medicineId,
        type: 'USAGE',
        quantity: qty,
        ...(batchId !== undefined ? { batchId } : {}),
        ...(transactionDate !== undefined ? { transactionDate: toDate(transactionDate) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        createdBy: user.id,
      },
    });
    return { medicine: updated, transaction };
  });

  await evaluateAlerts(farmId);
  return result;
}

export async function transactions(
  medicineId: string,
  user: { id: string },
  { from, to, page, pageSize }: TransactionListParams
) {
  const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!medicine) throw notFound('Medicine not found');
  await isFarmAccessible(medicine.farmId, user.id);
  const dateFilter: Prisma.DateTimeFilter = {};
  if (from) dateFilter.gte = toDate(from);
  if (to) dateFilter.lte = toDate(to);
  const where: Prisma.MedicineTransactionWhereInput = {
    medicineId,
    ...(from || to ? { transactionDate: dateFilter } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.medicineTransaction.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.medicineTransaction.count({ where }),
  ]);
  return { items, meta: paginate({ page, pageSize, total }) };
}