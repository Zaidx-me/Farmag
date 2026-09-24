import { describe, expect, it } from 'vitest';

import type { SqliteConnection } from '../../database/db';
import { migrate } from '../../database/migrations';
import { syncQueue, type SyncOperation, type SyncOperationInput } from '../../database/sync-queue';
import { createInMemorySqlite } from '../../database/test-shim';
import { clearQueue, countByEntity, listPending } from './queue';

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

describe('offline queue', () => {
  it('countByEntity groups pending ops by entity with failed sub-counts', () => {
    const ops: SyncOperation[] = [
      {
        ...makeOp({ operationId: 'op-1', entity: 'daily_records' }),
        status: 'pending',
        retryCount: 0,
        lastError: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        ...makeOp({ operationId: 'op-2', entity: 'daily_records' }),
        status: 'pending',
        retryCount: 1,
        lastError: 'network error',
        createdAt: '2026-01-01T00:00:01.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
      },
      {
        ...makeOp({ operationId: 'op-3', entity: 'feed_events' }),
        status: 'pending',
        retryCount: 0,
        lastError: null,
        createdAt: '2026-01-01T00:00:02.000Z',
        updatedAt: '2026-01-01T00:00:02.000Z',
      },
    ];

    expect(countByEntity(ops)).toEqual([
      { entity: 'daily_records', count: 2, failed: 1 },
      { entity: 'feed_events', count: 1, failed: 0 },
    ]);
  });

  it('countByEntity returns [] for an empty queue', () => {
    expect(countByEntity([])).toEqual([]);
  });

  it('listPending returns pending ops oldest first', async () => {
    const db = await migratedDb();
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-1' }));
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-2' }));

    const pending = await listPending(db);
    expect(pending.map((op) => op.operationId)).toEqual(['op-1', 'op-2']);
  });

  it('clearQueue removes pending and failed ops but keeps synced rows', async () => {
    const db = await migratedDb();
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-pending' }));
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-failed' }));
    await syncQueue.markFailed(db, 'op-failed', 'boom');
    await syncQueue.enqueue(db, makeOp({ operationId: 'op-synced' }));
    await syncQueue.markSynced(db, 'op-synced');

    await clearQueue(db);

    const all = await db.getAllAsync<SyncOperation>('SELECT * FROM sync_operations');
    expect(all.map((op) => op.operationId)).toEqual(['op-synced']);
  });
});