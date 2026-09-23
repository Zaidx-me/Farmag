/**
 * Migration runner — applies ordered SQL migrations and records progress in
 * `PRAGMA user_version`. Idempotent: re-running `migrate` on an up-to-date
 * database is a no-op.
 */

import type { SqliteConnection } from './db';
import { LOCAL_SCHEMA_SQL } from './schema';

/**
 * Ordered migration SQL strings. v1 creates the full local schema; future
 * versions append ALTER/CREATE statements. `migrate` runs only the pending
 * versions and bumps `user_version` to the count.
 */
export const MIGRATIONS: string[] = [LOCAL_SCHEMA_SQL];

export async function migrate(db: SqliteConnection): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.execAsync(MIGRATIONS[version]);
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}