/**
 * Export utilities (T39) — RFC 4180 CSV helpers, per-entity converters,
 * parity fixtures, and the export state machine. Pure and Node-testable.
 */

export {
  countCsvDataRows,
  escapeCsvCell,
  parseCsv,
  toCsv,
  toCsvChunked,
  type CsvProgress,
  type CsvProgressListener,
} from './csv';
export {
  BATCH_COLUMNS,
  DAILY_RECORD_COLUMNS,
  ENTITY_EXPORT_DEFS,
  EXPENSE_COLUMNS,
  EXPORT_ENTITIES,
  SALE_COLUMNS,
  entityToCsv,
  entityToCsvChunked,
  type EntityExportDef,
  type ExportEntity,
} from './converters';
export { EXPORT_FIXTURES } from './fixtures';
export {
  createExportController,
  type ExportController,
  type ExportState,
  type ExportStatus,
} from './controller';