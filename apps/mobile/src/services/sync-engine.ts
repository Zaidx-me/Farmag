/**
 * Sync engine — pushes pending `sync_operations` to the API and pulls server
 * changes into the local tables. Pure logic: `api`, `db`, and `authStore` are
 * injected so tests can pass a mocked apiClient and the in-memory shim (no
 * expo-sqlite / expo-network import executes at test time).
 */

import type {
  SyncOperationInput as SharedSyncOperationInput,
  SyncPullResponse,
  SyncPushResult,
} from '@poultry/shared-types';

import type { SqliteConnection } from '../database/db';
import { repositories } from '../database/repositories';
import type { LocalTableName } from '../database/schema';
import { syncQueue, type SyncOperation, type SyncOperationInput, type SyncOperationType } from '../database/sync-queue';

export interface SyncSummary {
  pushed: number;
  pulled: number;
  failed: number;
}

/** Structural subset of the apiClient the engine uses (mockable in tests). */
export interface SyncApi {
  post<T>(path: string, body?: unknown, options?: { auth?: boolean }): Promise<T>;
  get<T>(path: string, options?: { auth?: boolean }): Promise<T>;
}

/** Structural subset of the auth store used for the token gate. */
export interface SyncAuthStore {
  accessToken: string | null;
  refreshToken: string | null;
}

export interface RunOnceDeps {
  /** Override the network check (tests inject a fixed value). */
  isOnline?: () => Promise<boolean>;
}

export interface EnqueueLocalInput {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  /** Defaults to CREATE — pass UPDATE to re-push an existing local entity. */
  operationType?: SyncOperationType;
}

const PUSH_CHUNK_SIZE = 100;
const PULL_LIMIT = 100;
const CURSOR_KEY = '_syncCursor';

/** API pull entity names → local table names (the 9 syncable tables). */
const ENTITY_TO_TABLE: Record<string, LocalTableName> = {
  batch: 'batches',
  dailyRecord: 'daily_records',
  feedItem: 'feed_items',
  feedTransaction: 'feed_transactions',
  medicine: 'medicines',
  medicineTransaction: 'medicine_transactions',
  vaccination: 'vaccinations',
  expense: 'expenses',
  sale: 'sales',
};

async function metaGet(db: SqliteConnection, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ key: string; value: string }>(
    'SELECT * FROM meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

async function metaSet(db: SqliteConnection, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

function parsePayload(payload: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(payload);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function toSharedOp(op: SyncOperation): SharedSyncOperationInput {
  return {
    operationId: op.operationId,
    entity: op.entity,
    operationType: op.operationType,
    entityId: op.entityId,
    payload: parsePayload(op.payload),
    createdAt: op.createdAt,
  };
}

async function defaultIsOnline(): Promise<boolean> {
  try {
    const Network = await import('expo-network');
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    return true; // network module unavailable — assume online and let the push fail fast
  }
}

async function pushBatch(
  api: SyncApi,
  db: SqliteConnection,
  ops: SyncOperation[],
): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;
  for (let i = 0; i < ops.length; i += PUSH_CHUNK_SIZE) {
    const chunk = ops.slice(i, i + PUSH_CHUNK_SIZE);
    const results = await api.post<SyncPushResult[]>('/sync/push', {
      operations: chunk.map(toSharedOp),
    });
    for (const result of results) {
      if (result.status === 'SYNCED') {
        await syncQueue.markSynced(db, result.operationId);
        if (result.entityId !== undefined) {
          await metaSet(db, `server:${result.operationId}`, result.entityId);
        }
        pushed += 1;
      } else {
        await syncQueue.markFailed(db, result.operationId, result.error?.message ?? 'sync push failed');
        failed += 1;
      }
    }
  }
  return { pushed, failed };
}

async function pullChanges(api: SyncApi, db: SqliteConnection): Promise<number> {
  const cursor = await metaGet(db, CURSOR_KEY);
  const query =
    cursor === null ? `?limit=${PULL_LIMIT}` : `?cursor=${encodeURIComponent(cursor)}&limit=${PULL_LIMIT}`;
  const response = await api.get<SyncPullResponse>(`/sync/pull${query}`);
  let pulled = 0;
  for (const change of response.changes) {
    const table = ENTITY_TO_TABLE[change.entity];
    if (table === undefined) continue; // unknown entity — nothing to upsert locally
    await repositories.upsertRecord(db, table, change.data);
    pulled += 1;
  }
  if (response.nextCursor !== null) {
    await metaSet(db, CURSOR_KEY, response.nextCursor);
  }
  return pulled;
}

export async function runOnce(
  api: SyncApi,
  db: SqliteConnection,
  authStore: SyncAuthStore,
  deps: RunOnceDeps = {},
): Promise<SyncSummary> {
  const online = deps.isOnline === undefined ? await defaultIsOnline() : await deps.isOnline();
  if (!online || authStore.accessToken === null || authStore.refreshToken === null) {
    return { pushed: 0, pulled: 0, failed: 0 };
  }

  const pending = await syncQueue.listPending(db);
  const { pushed, failed } = await pushBatch(api, db, pending);
  const pulled = await pullChanges(api, db);
  return { pushed, pulled, failed };
}

export function enqueueLocal(db: SqliteConnection, input: EnqueueLocalInput): Promise<void> {
  const op: SyncOperationInput & { createdAt: string } = {
    operationId: crypto.randomUUID(),
    entity: input.entity,
    operationType: input.operationType ?? 'CREATE',
    entityId: input.entityId,
    payload: JSON.stringify(input.payload),
    createdAt: new Date().toISOString(),
  };
  return syncQueue.enqueue(db, op);
}

export const syncEngine = { runOnce, enqueueLocal };