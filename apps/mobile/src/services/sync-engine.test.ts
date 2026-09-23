import { describe, expect, it, vi } from 'vitest';

import type { SqliteConnection } from '../database/db';
import { migrate } from '../database/migrations';
import { syncQueue, type SyncOperation, type SyncOperationInput } from '../database/sync-queue';
import { createInMemorySqlite } from '../database/test-shim';
import { syncEngine, type SyncAuthStore } from './sync-engine';

function makeOp(operationId: string, overrides: Partial<SyncOperationInput> = {}): SyncOperation {
  return {
    operationId,
    entity: 'dailyRecord',
    operationType: 'CREATE',
    entityId: `local-${operationId}`,
    payload: JSON.stringify({ recordDate: '2026-01-01' }),
    status: 'pending',
    retryCount: 0,
    lastError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAuthStore(overrides: Partial<SyncAuthStore> = {}): SyncAuthStore {
  return { accessToken: 'access-token', refreshToken: 'refresh-token', ...overrides };
}

function makeApi() {
  return {
    post: vi.fn(),
    get: vi.fn(),
  };
}

async function migratedDb(): Promise<SqliteConnection> {
  const db = createInMemorySqlite();
  await migrate(db);
  return db;
}

describe('syncEngine.enqueueLocal', () => {
  it('builds a CREATE op with a fresh operationId and pending status', async () => {
    const db = await migratedDb();
    await syncEngine.enqueueLocal(db, {
      entity: 'dailyRecord',
      entityId: 'local-1',
      payload: { recordDate: '2026-01-01' },
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: 'dailyRecord',
      operationType: 'CREATE',
      entityId: 'local-1',
      payload: JSON.stringify({ recordDate: '2026-01-01' }),
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });
    expect(pending[0].operationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('syncEngine.runOnce — push', () => {
  it('pushes 3 pending ops: 2 synced + 1 failed; failed stays pending with lastError; mapping stored', async () => {
    const db = await migratedDb();
    const api = makeApi();
    api.post.mockResolvedValue([
      { operationId: 'op-1', status: 'SYNCED', entityId: 'server-1' },
      { operationId: 'op-2', status: 'SYNCED', entityId: 'server-2' },
      { operationId: 'op-3', status: 'FAILED', error: { code: 'VALIDATION_ERROR', message: 'bad payload' } },
    ]);
    api.get.mockResolvedValue({ changes: [], nextCursor: null });

    await syncQueue.enqueue(db, makeOp('op-1'));
    await syncQueue.enqueue(db, makeOp('op-2'));
    await syncQueue.enqueue(db, makeOp('op-3'));

    const summary = await syncEngine.runOnce(api, db, makeAuthStore());

    expect(summary).toEqual({ pushed: 2, pulled: 0, failed: 1 });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/sync/push', {
      operations: [
        expect.objectContaining({ operationId: 'op-1' }),
        expect.objectContaining({ operationId: 'op-2' }),
        expect.objectContaining({ operationId: 'op-3' }),
      ],
    });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].operationId).toBe('op-3');
    expect(pending[0].status).toBe('pending');
    expect(pending[0].retryCount).toBe(1);
    expect(pending[0].lastError).toBe('bad payload');

    const mapping1 = await db.getFirstAsync<{ value: string }>('SELECT * FROM meta WHERE key = ?', [
      'server:op-1',
    ]);
    expect(mapping1?.value).toBe('server-1');
    const mapping2 = await db.getFirstAsync<{ value: string }>('SELECT * FROM meta WHERE key = ?', [
      'server:op-2',
    ]);
    expect(mapping2?.value).toBe('server-2');
  });

  it('drains the queue: api invoked once for a batch; re-run pushes nothing', async () => {
    const db = await migratedDb();
    const api = makeApi();
    api.post.mockResolvedValue([
      { operationId: 'op-1', status: 'SYNCED', entityId: 'server-1' },
      { operationId: 'op-2', status: 'SYNCED', entityId: 'server-2' },
    ]);
    api.get.mockResolvedValue({ changes: [], nextCursor: null });

    await syncQueue.enqueue(db, makeOp('op-1'));
    await syncQueue.enqueue(db, makeOp('op-2'));

    const first = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(first).toEqual({ pushed: 2, pulled: 0, failed: 0 });
    expect(api.post).toHaveBeenCalledTimes(1);

    const second = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(second).toEqual({ pushed: 0, pulled: 0, failed: 0 });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('re-enqueueing the same operationId keeps one row and invokes the api once', async () => {
    const db = await migratedDb();
    const api = makeApi();
    api.post.mockResolvedValue([{ operationId: 'op-1', status: 'SYNCED', entityId: 'server-1' }]);
    api.get.mockResolvedValue({ changes: [], nextCursor: null });

    await syncQueue.enqueue(db, makeOp('op-1'));
    await syncQueue.enqueue(db, makeOp('op-1'));

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);

    const summary = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(summary).toEqual({ pushed: 1, pulled: 0, failed: 0 });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('short-circuits without tokens or network: api not called', async () => {
    const db = await migratedDb();
    const api = makeApi();

    const noTokens = await syncEngine.runOnce(
      api,
      db,
      makeAuthStore({ accessToken: null, refreshToken: null }),
    );
    expect(noTokens).toEqual({ pushed: 0, pulled: 0, failed: 0 });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();

    const offline = await syncEngine.runOnce(api, db, makeAuthStore(), { isOnline: async () => false });
    expect(offline).toEqual({ pushed: 0, pulled: 0, failed: 0 });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('offline changes are not lost: failed op stays pending, later success removes it', async () => {
    const db = await migratedDb();
    const api = makeApi();
    api.post.mockResolvedValueOnce([
      { operationId: 'op-1', status: 'FAILED', error: { code: 'NETWORK_ERROR', message: 'offline' } },
    ]);
    api.get.mockResolvedValue({ changes: [], nextCursor: null });

    await syncQueue.enqueue(db, makeOp('op-1'));
    const first = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(first).toEqual({ pushed: 0, pulled: 0, failed: 1 });

    const pending = await syncQueue.listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].operationId).toBe('op-1');

    api.post.mockResolvedValueOnce([{ operationId: 'op-1', status: 'SYNCED', entityId: 'server-1' }]);
    const second = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(second).toEqual({ pushed: 1, pulled: 0, failed: 0 });

    const after = await syncQueue.listPending(db);
    expect(after).toHaveLength(0);
  });
});

describe('syncEngine.runOnce — pull', () => {
  it('saves the cursor after a pull and upserts each change', async () => {
    const db = await migratedDb();
    const api = makeApi();
    api.get.mockResolvedValue({
      changes: [
        {
          entity: 'batch',
          entityId: 'b-1',
          updatedAt: '2026-01-01T00:00:00.000Z',
          data: {
            id: 'b-1',
            farmId: 'f-1',
            name: 'Batch A',
            location: 'Shed 1',
            status: 'ACTIVE',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        },
        {
          entity: 'dailyRecord',
          entityId: 'd-1',
          updatedAt: '2026-01-01T00:00:01.000Z',
          data: {
            id: 'd-1',
            batchId: 'b-1',
            recordDate: '2026-01-01',
            birdsAtStart: 100,
            mortality: 1,
            birdsRemaining: 99,
            createdBy: 'u-1',
            createdAt: '2026-01-01T00:00:01.000Z',
          },
        },
      ],
      nextCursor: '2026-01-01T00:00:02.000Z',
    });

    const summary = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(summary).toEqual({ pushed: 0, pulled: 2, failed: 0 });
    expect(api.get).toHaveBeenCalledWith('/sync/pull?limit=100');

    const cursor = await db.getFirstAsync<{ value: string }>('SELECT * FROM meta WHERE key = ?', [
      '_syncCursor',
    ]);
    expect(cursor?.value).toBe('2026-01-01T00:00:02.000Z');

    const batch = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM batches WHERE id = ?', [
      'b-1',
    ]);
    expect(batch?.name).toBe('Batch A');
    expect(batch?.sync_status).toBe('synced');

    const record = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM daily_records WHERE id = ?',
      ['d-1'],
    );
    expect(record?.record_date).toBe('2026-01-01');
  });

  it('uses the stored cursor and keeps it unchanged when nextCursor is null', async () => {
    const db = await migratedDb();
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
      '_syncCursor',
      '2026-01-01T00:00:00.000Z',
    ]);
    const api = makeApi();
    api.get.mockResolvedValue({ changes: [], nextCursor: null });

    const summary = await syncEngine.runOnce(api, db, makeAuthStore());
    expect(summary).toEqual({ pushed: 0, pulled: 0, failed: 0 });
    expect(api.get).toHaveBeenCalledWith('/sync/pull?cursor=2026-01-01T00%3A00%3A00.000Z&limit=100');

    const cursor = await db.getFirstAsync<{ value: string }>('SELECT * FROM meta WHERE key = ?', [
      '_syncCursor',
    ]);
    expect(cursor?.value).toBe('2026-01-01T00:00:00.000Z');
  });
});