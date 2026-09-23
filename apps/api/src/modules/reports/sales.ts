import { Prisma } from '@prisma/client';
import { PaymentStatus } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';
import type { ReportLabels } from './service.js';

export interface SalesByStatus {
  paymentStatus: string;
  totalAmount: string;
}

export interface SalesResult {
  byPaymentStatus: SalesByStatus[];
  totalAmount: string;
  amountReceived: string;
  outstandingAmount: string;
  labels: ReportLabels;
}

const PAYMENT_STATUSES = Object.values(PaymentStatus);

/**
 * SALES — Σ totalAmount by paymentStatus (plan Step 4). Every PaymentStatus const is
 * present (zero-filled), plus Decimal totals: totalAmount, amountReceived and
 * outstandingAmount. Optional batchId filter + optional from/to window on saleDate.
 * All money is Decimal-safe strings.
 * Labels: constant `{ actual: true, estimated: false, incomplete: false }` (documented) —
 * the sums are exact over the filtered set.
 */
export async function computeSales(
  farmId: string,
  batchId?: string,
  from?: string,
  to?: string
): Promise<SalesResult> {
  const where = {
    farmId,
    ...(batchId ? { batchId } : {}),
    ...(from || to
      ? {
          saleDate: {
            gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
            lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
          },
        }
      : {}),
  };

  const [byStatus, totals] = await Promise.all([
    prisma.sale.groupBy({ by: ['paymentStatus'], where, _sum: { totalAmount: true } }),
    prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true, amountReceived: true, outstandingAmount: true },
    }),
  ]);

  const byPaymentStatus = PAYMENT_STATUSES.map((paymentStatus) => {
    const row = byStatus.find((r) => r.paymentStatus === paymentStatus);
    return { paymentStatus, totalAmount: (row?._sum.totalAmount ?? new Prisma.Decimal(0)).toString() };
  });

  return {
    byPaymentStatus,
    totalAmount: (totals._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
    amountReceived: (totals._sum.amountReceived ?? new Prisma.Decimal(0)).toString(),
    outstandingAmount: (totals._sum.outstandingAmount ?? new Prisma.Decimal(0)).toString(),
    labels: { actual: true, estimated: false, incomplete: false },
  };
}