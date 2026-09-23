import { describe, expect, it } from 'vitest';

import type { SqliteConnection } from './db';
import { migrate } from './migrations';
import { syncQueue, type SyncOperation, type SyncOperationInput } from './sync-queue';
import { createInMemorySqlite } from './test-shim';

function makeOp(overrides: Partial<SyncOperationInput> = {}): SyncOperationInput {
  return {
    operationId: 'op-1',
    entity: 'daily_records',
    operationType: 'CREATE',
    entityId: 'rec-1',
    payload: '{}',
    ...overrides,
  };
}

async function migratedDb(): Promise<SqliteConnection> {
  const db = createInMemorySqlite();
  await migrate(db);
  return db;
}

describe('syncQueue', () => {
  it('enqueue inserts a pending operation', async () => {
    const db = await migratedDb();
    await syncQueue.enqueue(db, makeOp());

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      operationId: 'op-1',
      entity: 'daily_records',
      operationType: 'CREATE',
      entityId: 'rec-1',
      payload: '{}',
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });
  });

  it('re-enqueueing the same operationId keeps a single row', async () => {
    const db = await migratedDb();
    await syncQueue.enqueue(db, makeOp());
    await syncQueue.enqueue(db, makeOp());

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
  });

  it('listPending orders by createdAt then operationId', async () => {
    const db = await migratedDb();
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-1' }));
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-2' }));

    const pending = await syncQueue.listPending(db);
    expect(pending.map((op) => op.operationId)).toEqual(['op-1', 'op-2']);
  });

  it('markSynced removes the operation from pending', async () => {
    const db = await migratedDb();
    await syncQueue.enqueue(db, makeOp());
    await syncQueue.markSynced(db, 'op-1');

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(0);

    const all = await db.getAllAsync<SyncOperation>('SELECT * FROM sync_operations');
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('synced');
  });

  it('markFailed increments retryCount, sets lastError, and stays pending', async () => {
    const db = await migratedDb();
    await syncQueue.enqueue(db, makeOp());
    await syncQueue.markFailed(db, 'op-1', 'network error');
    await syncQueue.markFailed(db, 'op-1', 'timeout');

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].retryCount).toBe(2);
    expect(pending[0].lastError).toBe('timeout');
    expect(pending[0].status).toBe('pending');
  });

  it('pruneSynced removes only synced rows older than 7 days', async () => {
    const db = await migratedDb();

    // Recent synced op — must survive.
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-recent' }));
    await syncQueue.markSynced(db, 'op-recent');

    // Old synced op — must be pruned.
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-old' }));
    await syncQueue.markSynced(db, 'op-old');
    await db.runAsync('UPDATE sync_operations SET updatedAt = ? WHERE operationId = ?', [
      '2026-01-01T00:00:00.000Z',
      'op-old',
    ]);

    // Pending + failed ops — must survive.
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-pending' }));
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-failed' }));
    await syncQueue.markFailed(db, 'op-failed', 'boom');

    await syncQueue.pruneSynced(db);

    const all = await db.getAllAsync<SyncOperation>('SELECT * FROM sync_operations');
    expect(all.map((op) => op.operationId).sort()).toEqual(['op-failed', 'op-pending', 'op-recent']);
  });
});