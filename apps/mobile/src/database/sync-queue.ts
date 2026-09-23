/**
 * Sync queue — durable outbox of local mutations waiting to be pushed to the
 * API. Rows live in the `sync_operations` table (camelCase columns, per the
 * sync protocol). `enqueue` is idempotent per `operationId` (INSERT OR
 * REPLACE); `listPending` is deterministic (createdAt ASC, operationId ASC).
 */

import type { SqliteConnection } from './db';

export type SyncOperationType = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncOperationStatus = 'pending' | 'synced' | 'failed';

export interface SyncOperationInput {
  operationId: string;
  entity: string;
  operationType: SyncOperationType;
  entityId: string;
  payload: string;
}

export interface SyncOperation extends SyncOperationInput {
  status: SyncOperationStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Insert a pending operation; re-enqueueing the same operationId replaces it. */
export async function enqueue(db: SqliteConnection, op: SyncOperationInput): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_operations (operationId, entity, operationType, entityId, payload, status, retryCount, lastError, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?)`,
    [op.operationId, op.entity, op.operationType, op.entityId, op.payload, now, now],
  );
}

/** All pending operations, oldest first (deterministic tie-break by id). */
export async function listPending(db: SqliteConnection): Promise<SyncOperation[]> {
  return db.getAllAsync<SyncOperation>(
    `SELECT * FROM sync_operations WHERE status = 'pending' ORDER BY createdAt ASC, operationId ASC`,
  );
}

export async function markSynced(db: SqliteConnection, operationId: string): Promise<void> {
  await db.runAsync(
    `UPDATE sync_operations SET status = 'synced', updatedAt = ? WHERE operationId = ?`,
    [new Date().toISOString(), operationId],
  );
}

/** Increment retryCount, record the error, and keep the operation pending. */
export async function markFailed(
  db: SqliteConnection,
  operationId: string,
  error: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_operations SET retryCount = retryCount + 1, lastError = ?, updatedAt = ? WHERE operationId = ?`,
    [error, new Date().toISOString(), operationId],
  );
}

/** Delete synced operations older than 7 days. Pending/failed are never pruned. */
export async function pruneSynced(db: SqliteConnection): Promise<void> {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  await db.runAsync(`DELETE FROM sync_operations WHERE status = 'synced' AND updatedAt < ?`, [
    cutoff,
  ]);
}

export const syncQueue = { enqueue, listPending, markSynced, markFailed, pruneSynced };