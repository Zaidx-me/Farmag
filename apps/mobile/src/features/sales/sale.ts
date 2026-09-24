import type { PaymentStatus } from '@poultry/shared-types';

import { todayISO } from '../daily-entry/record';
import { compareDecimalStrings, multiplyDecimalStrings, subtractDecimalStringsSigned } from '../../utils/decimal';

export interface SaleValues {
  batchId: string;
  buyer: string;
  saleDate: string;
  birdsSold: string;
  totalWeightKg: string;
  ratePerKg: string;
  amountReceived: string;
  notes?: string;
}

export interface SaleTotalsPreview {
  totalAmount: string;
  outstandingAmount: string;
  paymentStatus: PaymentStatus;
}

/** Local `sales` row (camelCase — repositories map to snake_case). */
export interface SaleRow {
  id: string;
  farmId: string;
  batchId: string;
  buyer: string;
  saleDate: string;
  birdsSold: number;
  totalWeightKg: string;
  ratePerKg: string;
  totalAmount: string;
  amountReceived: string;
  outstandingAmount: string;
  paymentStatus: PaymentStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending';
}

/**
 * Server parity (sales service computeMoney): totalAmount = totalWeightKg ×
 * ratePerKg rounded to 2dp; outstanding = totalAmount − amountReceived;
 * paymentStatus derived: outstanding == 0 → PAID, 0 < outstanding < total →
 * PARTIALLY_PAID, else PENDING.
 */
export function computeSaleTotals(
  totalWeightKg: string,
  ratePerKg: string,
  amountReceived: string,
): SaleTotalsPreview {
  const totalAmount = multiplyDecimalStrings(totalWeightKg, ratePerKg);
  const outstandingAmount = subtractDecimalStringsSigned(totalAmount, amountReceived);
  const paymentStatus: PaymentStatus =
    compareDecimalStrings(outstandingAmount, '0') === 0
      ? 'PAID'
      : compareDecimalStrings(outstandingAmount, '0') > 0 &&
          compareDecimalStrings(outstandingAmount, totalAmount) < 0
        ? 'PARTIALLY_PAID'
        : 'PENDING';
  return { totalAmount, outstandingAmount, paymentStatus };
}

/** amountReceived > totalAmount → the server rejects with PAYMENT_EXCEEDS_TOTAL. */
export function paymentExceedsTotal(amountReceived: string, totalAmount: string): boolean {
  return compareDecimalStrings(amountReceived, totalAmount) > 0;
}

export function buildLocalSale(params: {
  id: string;
  farmId: string;
  values: SaleValues;
  createdBy: string;
  createdAt?: string;
}): SaleRow {
  const { id, farmId, values, createdBy, createdAt = new Date().toISOString() } = params;
  const { totalAmount, outstandingAmount, paymentStatus } = computeSaleTotals(
    values.totalWeightKg,
    values.ratePerKg,
    values.amountReceived,
  );
  const row: SaleRow = {
    id,
    farmId,
    batchId: values.batchId,
    buyer: values.buyer,
    saleDate: values.saleDate,
    birdsSold: Number(values.birdsSold),
    totalWeightKg: values.totalWeightKg,
    ratePerKg: values.ratePerKg,
    totalAmount,
    amountReceived: values.amountReceived,
    outstandingAmount,
    paymentStatus,
    createdBy,
    createdAt,
    updatedAt: createdAt,
    syncStatus: 'pending',
  };
  if (values.notes !== undefined) row.notes = values.notes;
  return row;
}

/** Wire payload for the sync push — createSaleSchema fields + farmId. */
export function buildSalePayload(farmId: string, values: SaleValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    farmId,
    batchId: values.batchId,
    buyer: values.buyer,
    saleDate: values.saleDate,
    birdsSold: Number(values.birdsSold),
    totalWeightKg: values.totalWeightKg,
    ratePerKg: values.ratePerKg,
    amountReceived: values.amountReceived,
  };
  if (values.notes !== undefined) payload.notes = values.notes;
  return payload;
}

/** Wire payload for the payment update — updateSalePaymentSchema fields. */
export function buildPaymentPayload(amountReceived: string): Record<string, unknown> {
  return { amountReceived };
}