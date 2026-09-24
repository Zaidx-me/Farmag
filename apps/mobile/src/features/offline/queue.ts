/**
 * Offline queue feature — per-entity pending counts, listing, and clearing of
 * the durable sync outbox (T29 queue over the T28 sqlite layer). Pure helpers
 * are testable against the in-memory shim; db-backed functions take the
 * injected SqliteConnection like the rest of the database layer.
 */

import type { SqliteConnection } from '../../database/db';
import { syncQueue, type SyncOperation } from '../../database/sync-queue';

export interface EntityPendingCount {
  entity: string;
  count: number;
  failed: number;
}

/** Group pending operations by entity, with failed sub-counts. */
export function countByEntity(ops: SyncOperation[]): EntityPendingCount[] {
  const byEntity = new Map<string, { count: number; failed: number }>();
  for (const op of ops) {
    const entry = byEntity.get(op.entity) ?? { count: 0, failed: 0 };
    entry.count += 1;
    if (op.lastError !== null) entry.failed += 1;
    byEntity.set(op.entity, entry);
  }
  return [...byEntity.entries()]
    .map(([entity, { count, failed }]) => ({ entity, count, failed }))
    .sort((a, b) => b.count - a.count || a.entity.localeCompare(b.entity));
}

/** All pending operations, oldest first. */
export async function listPending(db: SqliteConnection): Promise<SyncOperation[]> {
  return syncQueue.listPending(db);
}

/** Drop every pending operation (pending + failed) — used by "clear queue". */
export async function clearQueue(db: SqliteConnection): Promise<void> {
  await db.runAsync(`DELETE FROM sync_operations WHERE status = 'pending'`);
}

export const offlineQueue = { countByEntity, listPending, clearQueue };