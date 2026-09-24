/**
 * CSV export — RFC 4180 escaping + share-sheet wiring (T37 Step 2, extended
 * in T39 to export ALL entities: batches, daily records, expenses, sales).
 *
 * The pure functions (`escapeCsvCell`, `toCsv`, the entity converters) live in
 * `utils/export/` and never import native modules, so vitest can exercise them
 * under the Node environment. The native expo-file-system / expo-sharing
 * imports are deferred to dynamic imports inside `exportCsvAndShare` (same
 * pattern as db.ts / sync-engine.ts), so merely importing this module never
 * executes native code at test time.
 */

import type { SqliteConnection } from '../database/db';
import { repositories } from '../database/repositories';
import type { LocalTableName } from '../database/schema';
import {
  ENTITY_EXPORT_DEFS,
  EXPORT_ENTITIES,
  entityToCsvChunked,
  type ExportEntity,
} from '../utils/export/converters';
import { escapeCsvCell, toCsv } from '../utils/export/csv';

export { escapeCsvCell, toCsv };

/**
 * Export every row of a local table as CSV and open the share sheet.
 * Returns false when sharing is unavailable (e.g. web) — the file is still
 * written to the cache directory.
 */
export async function exportCsvAndShare(csv: string, filename: string): Promise<boolean> {
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export CSV' });
  return true;
}

/** Query a local table and export the given columns as CSV via the share sheet. */
export async function exportRowsCsv(params: {
  db: SqliteConnection;
  table: LocalTableName;
  columns: string[];
  filename: string;
}): Promise<boolean> {
  const rows = await repositories.queryRecords(params.db, params.table, {});
  const csv = toCsv(rows, params.columns);
  return exportCsvAndShare(csv, params.filename);
}

export interface EntityExportResult {
  entity: ExportEntity;
  rowCount: number;
  shared: boolean;
}

/**
 * Export one entity (batches / daily_records / expenses / sales) as CSV via
 * the share sheet. `onProgress` receives a 0..1 fraction as rows are
 * serialized (chunked for big sets). An empty table still produces a valid
 * header-only CSV.
 */
export async function exportEntity(
  db: SqliteConnection,
  entity: ExportEntity,
  onProgress?: (fraction: number) => void,
): Promise<EntityExportResult> {
  const def = ENTITY_EXPORT_DEFS[entity];
  const rows = await repositories.queryRecords(db, def.table, {});
  const csv = entityToCsvChunked(entity, rows, 500, (progress) => {
    onProgress?.(progress.fraction);
  });
  const shared = await exportCsvAndShare(csv, def.filename);
  return { entity, rowCount: rows.length, shared };
}

/**
 * Export every entity in deterministic order (batches → daily → expenses →
 * sales). Overall progress is the weighted average across entities.
 */
export async function exportAllEntities(
  db: SqliteConnection,
  onProgress?: (fraction: number) => void,
): Promise<EntityExportResult[]> {
  const results: EntityExportResult[] = [];
  for (let i = 0; i < EXPORT_ENTITIES.length; i++) {
    const entity = EXPORT_ENTITIES[i];
    const result = await exportEntity(db, entity, (fraction) => {
      onProgress?.((i + fraction) / EXPORT_ENTITIES.length);
    });
    results.push(result);
  }
  return results;
}