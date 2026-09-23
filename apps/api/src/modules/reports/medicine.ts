import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { ReportLabels } from './service.js';

export interface MedicineUsage {
  medicineId: string;
  name: string;
  unit: string;
  currentStock: string;
  usedQuantity: string;
  purchaseQuantity: string;
}

export interface MedicineResult {
  items: MedicineUsage[];
  labels: ReportLabels;
}

/**
 * MEDICINE — per-medicine usage summary (documented choice: per-medicine totals, not a
 * day-series). For every medicine of the farm:
 * - `usedQuantity`: Σ MedicineTransaction.USAGE.quantity (Decimal sum).
 * - `purchaseQuantity`: Σ MedicineTransaction.PURCHASE.quantity (Decimal sum).
 * - `currentStock`: the medicine's live stock row (Decimal-safe string).
 * Optional batchId/from/to filters apply to the transactions only (stock is a snapshot).
 * Labels: constant `{ actual: true, estimated: false, incomplete: false }` (documented) —
 * stock is always sourced from the live row and the sums are exact over the filtered set.
 */
export async function computeMedicine(
  farmId: string,
  batchId?: string,
  from?: string,
  to?: string
): Promise<MedicineResult> {
  const [medicines, usageRows, purchaseRows] = await Promise.all([
    prisma.medicine.findMany({
      where: { farmId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, unit: true, currentStock: true },
    }),
    prisma.medicineTransaction.groupBy({
      by: ['medicineId'],
      where: {
        type: 'USAGE',
        medicine: { farmId },
        ...(batchId ? { batchId } : {}),
        ...(from || to
          ? {
              transactionDate: {
                gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
                lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
              },
            }
          : {}),
      },
      _sum: { quantity: true },
    }),
    prisma.medicineTransaction.groupBy({
      by: ['medicineId'],
      where: {
        type: 'PURCHASE',
        medicine: { farmId },
        ...(batchId ? { batchId } : {}),
        ...(from || to
          ? {
              transactionDate: {
                gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
                lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
              },
            }
          : {}),
      },
      _sum: { quantity: true },
    }),
  ]);

  const usedByMedicine = new Map(usageRows.map((r) => [r.medicineId, r._sum.quantity]));
  const purchasedByMedicine = new Map(purchaseRows.map((r) => [r.medicineId, r._sum.quantity]));

  const items = medicines.map((m) => ({
    medicineId: m.id,
    name: m.name,
    unit: m.unit,
    currentStock: m.currentStock.toString(),
    usedQuantity: (usedByMedicine.get(m.id) ?? new Prisma.Decimal(0)).toString(),
    purchaseQuantity: (purchasedByMedicine.get(m.id) ?? new Prisma.Decimal(0)).toString(),
  }));

  return {
    items,
    labels: { actual: true, estimated: false, incomplete: false },
  };
}