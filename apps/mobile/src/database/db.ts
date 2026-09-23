/**
 * SQLite connection layer for the mobile app.
 *
 * `openDb()` opens the real expo-sqlite database in WAL mode. Every other
 * module in this directory accepts an injected `SqliteConnection` and never
 * imports expo-sqlite directly, so tests can pass the pure in-memory shim from
 * `./test-shim` (expo-sqlite is a native module and cannot run under vitest's
 * Node environment).
 */

export type SqliteBindValue = string | number | null | boolean;

export interface SqliteRunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * The async SQLite subset the database layer uses. Structurally satisfied by
 * expo-sqlite's `SQLiteDatabase` (see `openDb`) and by the in-memory shim.
 */
export interface SqliteConnection {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqliteBindValue[]): Promise<SqliteRunResult>;
  getFirstAsync<T>(source: string, params?: SqliteBindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqliteBindValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/**
 * Open the app database in WAL mode. The expo-sqlite import is deferred to a
 * dynamic import so merely importing this module never executes native code
 * (tests use the shim instead).
 */
export async function openDb(databaseName = 'poultry.db'): Promise<SqliteConnection> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  const db = await openDatabaseAsync(databaseName);
  await db.execAsync('PRAGMA journal_mode = WAL');
  return {
    execAsync: (source: string) => db.execAsync(source),
    runAsync: (source: string, params?: SqliteBindValue[]) => db.runAsync(source, params ?? []),
    getFirstAsync: <T>(source: string, params?: SqliteBindValue[]) =>
      db.getFirstAsync<T>(source, params ?? []),
    getAllAsync: <T>(source: string, params?: SqliteBindValue[]) =>
      db.getAllAsync<T>(source, params ?? []),
    withTransactionAsync: (task: () => Promise<void>) => db.withTransactionAsync(task),
  };
}