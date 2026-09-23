/**
 * Sync engine — pushes pending `sync_operations` to the API and pulls server
 * changes into the local tables. Implemented in Task 29; this module exists so
 * the database layer ships complete and Task 29 can build on the injected
 * connection plus the shared in-memory test shim.
 */

import type { SqliteConnection } from './db';

export interface SyncEngine {
  pushPending(db: SqliteConnection): Promise<void>;
  pullChanges(db: SqliteConnection): Promise<void>;
}

export const syncEngine: SyncEngine = {
  async pushPending(_db: SqliteConnection): Promise<void> {
    throw new Error('syncEngine.pushPending: not implemented (Task 29)');
  },
  async pullChanges(_db: SqliteConnection): Promise<void> {
    throw new Error('syncEngine.pullChanges: not implemented (Task 29)');
  },
};