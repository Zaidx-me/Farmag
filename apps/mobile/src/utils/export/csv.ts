/**
 * RFC 4180 CSV helpers — pure, dependency-free, Node-testable (T39).
 *
 * `escapeCsvCell` / `toCsv` were originally authored in
 * `services/export-csv.ts` (T37); they live here now so the parity-tested
 * converters and the chunked big-set path share one implementation. The
 * service module re-exports them for backward compatibility.
 */

/** RFC 4180: quote fields containing commas, quotes, or newlines; double quotes. */
export function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** RFC 4180: header + rows joined with CRLF; every cell escaped. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeCsvCell).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(','));
  return [header, ...body].join('\r\n');
}

export interface CsvProgress {
  /** 0..1 fraction of rows serialized so far. */
  fraction: number;
  /** Rows serialized so far. */
  rowsDone: number;
  /** Total rows to serialize. */
  rowsTotal: number;
}

export type CsvProgressListener = (progress: CsvProgress) => void;

/**
 * Chunked CSV generation for big sets — serializes `chunkSize` rows per pass
 * and reports progress so the UI can render a progress bar instead of freezing
 * on a 5k-row export. Output is byte-identical to `toCsv` (same escaping, same
 * CRLF line endings).
 */
export function toCsvChunked(
  rows: Record<string, unknown>[],
  columns: string[],
  chunkSize = 500,
  onProgress?: CsvProgressListener,
): string {
  const header = columns.map(escapeCsvCell).join(',');
  const parts: string[] = [header];
  const total = rows.length;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    for (const row of chunk) {
      parts.push(columns.map((column) => escapeCsvCell(row[column])).join(','));
    }
    onProgress?.({
      fraction: Math.min(1, (i + chunk.length) / total),
      rowsDone: i + chunk.length,
      rowsTotal: total,
    });
  }
  return parts.join('\r\n');
}

/**
 * Minimal RFC 4180 parser — used by tests to verify round-trip parity and by
 * the big-data QA to count rows. Handles quoted fields with embedded commas,
 * doubled quotes, and CRLF/LF line endings.
 */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < csv.length) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (csv[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Number of data rows (excluding the header) in a CSV string. */
export function countCsvDataRows(csv: string): number {
  const rows = parseCsv(csv);
  return rows.length > 0 ? rows.length - 1 : 0;
}