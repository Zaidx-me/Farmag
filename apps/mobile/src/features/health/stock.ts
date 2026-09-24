/**
 * Medicine stock + expiry logic — pure helpers for the health screens (T35).
 * Stock moves mirror the API's medicine service (PURCHASE adds, USAGE subtracts,
 * floored at 0); the low-stock badge fires on `currentStock <= lowStockThreshold`
 * (the server's LOW_MEDICINE rule) and the expiry badge mirrors the server's
 * MEDICINE_EXPIRY lookahead (≤30 days → amber, already past → red).
 */

import type { BadgeTone } from '../../components/ui';
import { todayISO } from '../daily-entry/record';
import { addDecimalStrings, compareDecimalStrings, subtractDecimalStrings } from '../../utils/decimal';

export type MedicineMoveType = 'PURCHASE' | 'USAGE';

export interface MedicinePurchaseValues {
  quantity: string;
  expiryDate?: string;
  transactionDate?: string;
  notes?: string;
}

export interface MedicineUseValues {
  quantity: string;
  batchId?: string;
  transactionDate?: string;
  notes?: string;
}

export type MedicineMoveValues = MedicinePurchaseValues | MedicineUseValues;

/** Local `medicine_transactions` row (camelCase — repositories map to snake_case). */
export interface MedicineTransactionRow {
  id: string;
  medicineId: string;
  batchId?: string;
  type: MedicineMoveType;
  quantity: string;
  transactionDate: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  syncStatus: 'pending';
}

/** New stock after a move — PURCHASE adds, USAGE subtracts (floor at 0). */
export function applyMedicineStockMove(
  currentStock: string,
  quantity: string,
  type: MedicineMoveType,
): string {
  if (type === 'PURCHASE') return addDecimalStrings(currentStock, quantity);
  return subtractDecimalStrings(currentStock, quantity);
}

/** LOW_MEDICINE rule parity: `currentStock <= lowStockThreshold`. */
export function isLowStock(currentStock: string, threshold: string): boolean {
  return compareDecimalStrings(currentStock, threshold) <= 0;
}

export function stockBadgeTone(currentStock: string, threshold: string): BadgeTone {
  return isLowStock(currentStock, threshold) ? 'red' : 'green';
}

/** Whole days until expiry (negative = already expired); null when no expiry date. */
export function daysUntilExpiry(
  expiryDate: string | null | undefined,
  from: Date = new Date(),
): number | null {
  if (expiryDate === null || expiryDate === undefined) return null;
  const expiry = new Date(`${expiryDate}T00:00:00.000Z`);
  const today = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

/** Expiry badge tone — red when past, amber within 30 days, green otherwise. */
export function expiryBadgeTone(
  expiryDate: string | null | undefined,
  from?: Date,
): BadgeTone {
  const days = daysUntilExpiry(expiryDate, from);
  if (days === null) return 'gray';
  if (days < 0) return 'red';
  if (days <= 30) return 'amber';
  return 'green';
}

export function expiryLabel(expiryDate: string | null | undefined, from?: Date): string {
  const days = daysUntilExpiry(expiryDate, from);
  if (days === null) return 'No expiry';
  if (days < 0) return `Expired ${-days}d ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days}d`;
}

export function buildMedicineTransactionRow(params: {
  id: string;
  medicineId: string;
  type: MedicineMoveType;
  values: MedicineMoveValues;
  createdBy: string;
  createdAt?: string;
}): MedicineTransactionRow {
  const { id, medicineId, type, values, createdBy, createdAt = new Date().toISOString() } = params;
  const row: MedicineTransactionRow = {
    id,
    medicineId,
    type,
    quantity: values.quantity,
    transactionDate: values.transactionDate ?? todayISO(),
    createdBy,
    createdAt,
    syncStatus: 'pending',
  };
  if (type === 'USAGE') {
    const useValues = values as MedicineUseValues;
    if (useValues.batchId !== undefined) row.batchId = useValues.batchId;
  }
  if (values.notes !== undefined) row.notes = values.notes;
  return row;
}

/** Wire payload for the sync push — mirrors the API's purchase/use schemas. */
export function buildMedicineTransactionPayload(
  medicineId: string,
  type: MedicineMoveType,
  values: MedicineMoveValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { medicineId, type, quantity: values.quantity };
  if (values.transactionDate !== undefined) payload.transactionDate = values.transactionDate;
  if (values.notes !== undefined) payload.notes = values.notes;
  if (type === 'PURCHASE') {
    const purchase = values as MedicinePurchaseValues;
    if (purchase.expiryDate !== undefined) payload.expiryDate = purchase.expiryDate;
  } else {
    const useValues = values as MedicineUseValues;
    if (useValues.batchId !== undefined) payload.batchId = useValues.batchId;
  }
  return payload;
}