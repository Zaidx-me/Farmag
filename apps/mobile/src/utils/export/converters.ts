/**
 * Entity CSV converters (T39) — one converter per exportable entity
 * (batches, daily records, expenses, sales). Each maps the camelCase rows
 * returned by `repositories.queryRecords` onto a fixed, human-readable header
 * set and serializes via the RFC 4180 helpers in `./csv`. Pure functions —
 * Node-testable against the fixture rows in `./fixtures`.
 */

import type { LocalTableName } from '../../database/schema';
import { toCsv, toCsvChunked, type CsvProgressListener } from './csv';

export const BATCH_COLUMNS = [
  'id',
  'farmId',
  'shedId',
  'batchNumber',
  'breed',
  'supplier',
  'arrivalDate',
  'initialBirds',
  'initialAverageWeightKg',
  'costPerBird',
  'targetSaleDate',
  'status',
  'notes',
  'createdAt',
] as const;

export const DAILY_RECORD_COLUMNS = [
  'id',
  'batchId',
  'recordDate',
  'birdsAtStart',
  'mortality',
  'birdsRemaining',
  'feedConsumedKg',
  'waterConsumedLiters',
  'averageWeightKg',
  'temperatureC',
  'humidityPercent',
  'medicineNotes',
  'vaccinationNotes',
  'notes',
  'createdBy',
  'createdAt',
] as const;

export const EXPENSE_COLUMNS = [
  'id',
  'farmId',
  'batchId',
  'category',
  'description',
  'amount',
  'expenseDate',
  'supplier',
  'paymentStatus',
  'receiptObjectKey',
  'notes',
  'createdBy',
  'createdAt',
] as const;

export const SALE_COLUMNS = [
  'id',
  'farmId',
  'batchId',
  'buyer',
  'saleDate',
  'birdsSold',
  'totalWeightKg',
  'ratePerKg',
  'totalAmount',
  'amountReceived',
  'outstandingAmount',
  'paymentStatus',
  'notes',
  'createdBy',
  'createdAt',
] as const;

export type ExportEntity = 'batches' | 'daily_records' | 'expenses' | 'sales';

export interface EntityExportDef {
  entity: ExportEntity;
  table: LocalTableName;
  columns: readonly string[];
  filename: string;
  label: string;
}

export const ENTITY_EXPORT_DEFS: Record<ExportEntity, EntityExportDef> = {
  batches: {
    entity: 'batches',
    table: 'batches',
    columns: BATCH_COLUMNS,
    filename: 'batches.csv',
    label: 'Batches',
  },
  daily_records: {
    entity: 'daily_records',
    table: 'daily_records',
    columns: DAILY_RECORD_COLUMNS,
    filename: 'daily-records.csv',
    label: 'Daily records',
  },
  expenses: {
    entity: 'expenses',
    table: 'expenses',
    columns: EXPENSE_COLUMNS,
    filename: 'expenses.csv',
    label: 'Expenses',
  },
  sales: {
    entity: 'sales',
    table: 'sales',
    columns: SALE_COLUMNS,
    filename: 'sales.csv',
    label: 'Sales',
  },
};

/** Deterministic export order (batches → daily → expenses → sales). */
export const EXPORT_ENTITIES: ExportEntity[] = [
  'batches',
  'daily_records',
  'expenses',
  'sales',
];

/** Serialize rows for one entity as RFC 4180 CSV (header + rows, CRLF). */
export function entityToCsv(entity: ExportEntity, rows: Record<string, unknown>[]): string {
  const def = ENTITY_EXPORT_DEFS[entity];
  return toCsv(rows, [...def.columns]);
}

/** Chunked variant for big sets — reports progress; output identical to `entityToCsv`. */
export function entityToCsvChunked(
  entity: ExportEntity,
  rows: Record<string, unknown>[],
  chunkSize = 500,
  onProgress?: CsvProgressListener,
): string {
  const def = ENTITY_EXPORT_DEFS[entity];
  return toCsvChunked(rows, [...def.columns], chunkSize, onProgress);
}