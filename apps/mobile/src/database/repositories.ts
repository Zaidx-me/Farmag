/**
 * Repositories — typed access to the local domain tables. Rows are accepted
 * and returned in camelCase; columns are stored snake_case. All column names
 * are validated against a whitelist before being interpolated into SQL — user
 * keys are never string-interpolated, only parameterized values are.
 */

import type { SqliteBindValue, SqliteConnection } from './db';
import { LOCAL_TABLES, type LocalTableName } from './schema';

const COLUMN_NAME_RE = /^[a-z_]+$/;
const CAMEL_TO_SNAKE_RE = /[A-Z]/g;
const SNAKE_TO_CAMEL_RE = /_([a-z])/g;

export function camelToSnake(key: string): string {
  return key.replace(CAMEL_TO_SNAKE_RE, (c) => `_${c.toLowerCase()}`);
}

export function snakeToCamel(key: string): string {
  return key.replace(SNAKE_TO_CAMEL_RE, (_match, letter: string) => letter.toUpperCase());
}

export function rowToSnake(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[camelToSnake(key)] = value;
  }
  return out;
}

export function rowToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[snakeToCamel(key)] = value;
  }
  return out;
}

function assertTable(table: LocalTableName): void {
  if (!LOCAL_TABLES.includes(table)) {
    throw new Error(`repositories: unknown table "${table}"`);
  }
}

function toBindValue(value: unknown): SqliteBindValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

/**
 * INSERT OR REPLACE a single camelCase row into a local table. Missing
 * `createdAt`/`syncStatus`/`updatedAt` are defaulted (now / 'synced' / now).
 */
export async function upsertRecord(
  db: SqliteConnection,
  table: LocalTableName,
  row: Record<string, unknown>,
): Promise<void> {
  assertTable(table);
  const snake = rowToSnake(row);
  const id = snake['id'];
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`upsertRecord: row for table "${table}" is missing a string "id"`);
  }
  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    ...snake,
    created_at: snake['created_at'] ?? now,
    sync_status: snake['sync_status'] ?? 'synced',
    updated_at: snake['updated_at'] ?? now,
  };
  const columns = Object.keys(record);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  await db.runAsync(sql, columns.map((column) => toBindValue(record[column])));
}

/** Fetch a single row by id, returned in camelCase (or null). */
export async function getRecord(
  db: SqliteConnection,
  table: LocalTableName,
  id: string,
): Promise<Record<string, unknown> | null> {
  assertTable(table);
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = ?`,
    [id],
  );
  return row === null ? null : rowToCamel(row);
}

/**
 * Query rows by a flat `{ column: value }` filter (camelCase keys). Column
 * names are validated against `^[a-z_]+$` after snake_case mapping; values are
 * always parameterized. An empty filter returns every row.
 */
export async function queryRecords(
  db: SqliteConnection,
  table: LocalTableName,
  where: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  assertTable(table);
  const entries = Object.entries(where);
  if (entries.length === 0) {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
    return rows.map(rowToCamel);
  }
  const conditions: string[] = [];
  const params: SqliteBindValue[] = [];
  for (const [key, value] of entries) {
    const column = camelToSnake(key);
    if (!COLUMN_NAME_RE.test(column)) {
      throw new Error(`queryRecords: invalid column name "${key}" for table "${table}"`);
    }
    conditions.push(`${column} = ?`);
    params.push(toBindValue(value));
  }
  const sql = `SELECT * FROM ${table} WHERE ${conditions.join(' AND ')}`;
  const rows = await db.getAllAsync<Record<string, unknown>>(sql, params);
  return rows.map(rowToCamel);
}

/**
 * Latest daily record for a batch on or before `date` — used for pre-filling
 * the daily record form. Returns camelCase row or null.
 */
export async function latestDailyRecord(
  db: SqliteConnection,
  batchId: string,
  date: string,
): Promise<Record<string, unknown> | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM daily_records WHERE batch_id = ? AND record_date <= ? ORDER BY record_date DESC, created_at DESC LIMIT 1`,
    [batchId, date],
  );
  return row === null ? null : rowToCamel(row);
}

/** Batch INSERT OR REPLACE of pulled rows, applied inside one transaction. */
export async function syncTable(
  db: SqliteConnection,
  table: LocalTableName,
  rows: Record<string, unknown>[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await upsertRecord(db, table, row);
    }
  });
}

export const repositories = { upsertRecord, getRecord, queryRecords, latestDailyRecord };