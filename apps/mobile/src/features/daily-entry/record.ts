import type { DailyEntryValues } from './schema';

/** Local `daily_records` row (camelCase — repositories map to snake_case). */
export interface DailyRecordRow {
  id: string;
  batchId: string;
  recordDate: string;
  birdsAtStart: number;
  mortality: number;
  birdsRemaining: number;
  feedConsumedKg?: string;
  averageWeightKg?: string;
  humidityPercent?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  syncStatus: 'pending';
}

/** Local calendar date as YYYY-MM-DD (no UTC shift). */
export function toLocalDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO(): string {
  return toLocalDateISO(new Date());
}

export function yesterdayISO(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toLocalDateISO(date);
}

export function computeBirdsRemaining(birdsAtStart: number, mortality: number): number {
  return Math.max(0, birdsAtStart - mortality);
}

export type DailyRecordOperation = 'CREATE' | 'UPDATE';

/** CREATE when no local record exists for the date, UPDATE otherwise. */
export function resolveOperationType(existing: { id: string } | null): DailyRecordOperation {
  return existing === null ? 'CREATE' : 'UPDATE';
}

export function buildLocalDailyRecord(params: {
  id: string;
  batchId: string;
  values: DailyEntryValues;
  createdBy: string;
  createdAt?: string;
}): DailyRecordRow {
  const { id, batchId, values, createdBy, createdAt = new Date().toISOString() } = params;
  const row: DailyRecordRow = {
    id,
    batchId,
    recordDate: values.recordDate,
    birdsAtStart: values.birdsAtStart,
    mortality: values.mortality,
    birdsRemaining: computeBirdsRemaining(values.birdsAtStart, values.mortality),
    createdBy,
    createdAt,
    syncStatus: 'pending',
  };
  if (values.feedConsumedKg !== undefined) row.feedConsumedKg = values.feedConsumedKg;
  if (values.averageWeightKg !== undefined) row.averageWeightKg = values.averageWeightKg;
  if (values.humidityPercent !== undefined) row.humidityPercent = values.humidityPercent;
  if (values.notes !== undefined) row.notes = values.notes;
  return row;
}

/** Wire payload for the sync push — createDailyRecordSchema fields + batchId. */
export function buildSyncPayload(batchId: string, values: DailyEntryValues): Record<string, unknown> {
  return { batchId, ...values };
}

/** Days since arrival (batch age), floored at 0. */
export function ageDays(arrivalDate: string, from: Date = new Date()): number {
  const arrival = new Date(`${arrivalDate}T00:00:00.000Z`);
  const diffMs = from.getTime() - arrival.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}