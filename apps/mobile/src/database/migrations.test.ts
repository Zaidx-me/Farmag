import { describe, expect, it } from 'vitest';

import { MIGRATIONS, migrate } from './migrations';
import { LOCAL_TABLES } from './schema';
import { createInMemorySqlite } from './test-shim';

describe('migrate', () => {
  it('creates all 14 tables and sets user_version to 1 on a fresh database', async () => {
    const db = createInMemorySqlite();
    await migrate(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(1);

    for (const table of LOCAL_TABLES) {
      const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
      expect(rows).toEqual([]);
    }
  });

  it('is a no-op when run again', async () => {
    const db = createInMemorySqlite();
    await migrate(db);
    await expect(migrate(db)).resolves.toBeUndefined();

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(1);
  });

  it('exposes exactly one migration (v1) covering the full schema', () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0]).toContain('CREATE TABLE sync_operations');
    expect(MIGRATIONS[0]).toContain('CREATE TABLE daily_records');
  });
});