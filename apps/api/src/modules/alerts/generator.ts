import pino from 'pino';
import { AlertSeverity, AlertType } from '@poultry/shared-types';
import { prisma } from '../../config/prisma.js';

/**
 * Alert generator core (Task 16). Standalone module — Tasks 17/18/23 import
 * `{ alertGenerator }` or the named `evaluate` from here. No other module imports
 * INTO this file, so there are no circular dependencies.
 *
 * API shape (stable, documented): `evaluate(farmId: string): Promise<void>`.
 * The generator NEVER throws — the whole body is wrapped in try/catch; on error it
 * logs via a module-level pino logger (matching the `utils/audit.ts` pattern) and returns.
 */

const logger = pino({ name: 'alert-generator' });

/** Mortality ratio above which a HIGH_MORTALITY alert fires (LOCKED: > 5%). */
const HIGH_MORTALITY_THRESHOLD_PCT = 5;
/** Dedupe window: skip an alert if an identical unread one exists within 7 days. */
const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface AlertDraft {
  farmId: string;
  batchId: string | null;
  type: string;
  severity: string;
  title: string;
  message: string;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Inserts one alert per recipient, skipping any recipient that already has an unread
 * alert with the same (userId, type, farmId, batchId, title) within the last 7 days.
 * Titles are deterministic per type (batch number / item name) so the dedupe key is stable.
 */
async function createAlertForRecipients(recipientIds: string[], draft: AlertDraft): Promise<void> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  for (const userId of recipientIds) {
    const existing = await prisma.alert.findFirst({
      where: {
        userId,
        type: draft.type,
        farmId: draft.farmId,
        batchId: draft.batchId,
        title: draft.title,
        isRead: false,
        createdAt: { gte: since },
      },
    });
    if (existing) continue;
    await prisma.alert.create({
      data: {
        userId,
        farmId: draft.farmId,
        batchId: draft.batchId,
        type: draft.type,
        severity: draft.severity,
        title: draft.title,
        message: draft.message,
      },
    });
  }
}

export async function evaluate(farmId: string): Promise<void> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: { members: { select: { userId: true } } },
    });
    if (!farm) {
      logger.warn({ farmId }, 'alertGenerator.evaluate: farm not found, skipping');
      return;
    }
    // Recipients: farm OWNER + all FarmMembers (deduped).
    const recipientIds = Array.from(new Set([farm.ownerId, ...farm.members.map((m) => m.userId)]));

    // HIGH_MORTALITY (CRITICAL): latest daily record of each ACTIVE/UPCOMING batch.
    const batches = await prisma.batch.findMany({
      where: { farmId, status: { in: ['ACTIVE', 'UPCOMING'] } },
      select: { id: true, batchNumber: true },
    });
    for (const batch of batches) {
      const latest = await prisma.dailyRecord.findFirst({
        where: { batchId: batch.id },
        orderBy: { recordDate: 'desc' },
      });
      if (!latest || latest.mortality <= 0 || latest.birdsAtStart <= 0) continue;
      const pct = (latest.mortality / latest.birdsAtStart) * 100;
      if (pct > HIGH_MORTALITY_THRESHOLD_PCT) {
        const title = `High mortality in batch ${batch.batchNumber}`;
        const message =
          `Batch ${batch.batchNumber} recorded ${latest.mortality} deaths ` +
          `(${pct.toFixed(1)}%) on ${toDateString(latest.recordDate)}.`;
        await createAlertForRecipients(recipientIds, {
          farmId,
          batchId: batch.id,
          type: AlertType.HighMortality,
          severity: AlertSeverity.Critical,
          title,
          message,
        });
      }
    }

    // LOW_FEED (WARNING): FeedItem where currentStock <= lowStockThreshold.
    const feedItems = await prisma.feedItem.findMany({
      where: { farmId },
      select: { name: true, unit: true, currentStock: true, lowStockThreshold: true },
    });
    for (const item of feedItems) {
      if (item.currentStock.lessThanOrEqualTo(item.lowStockThreshold)) {
        const title = `Low feed stock: ${item.name}`;
        const message =
          `Feed item ${item.name} is at ${item.currentStock.toString()} ${item.unit}, ` +
          `at or below the low-stock threshold of ${item.lowStockThreshold.toString()} ${item.unit}.`;
        await createAlertForRecipients(recipientIds, {
          farmId,
          batchId: null,
          type: AlertType.LowFeed,
          severity: AlertSeverity.Warning,
          title,
          message,
        });
      }
    }

    // LOW_MEDICINE (WARNING): Medicine where currentStock <= lowStockThreshold.
    const medicines = await prisma.medicine.findMany({
      where: { farmId },
      select: { name: true, unit: true, currentStock: true, lowStockThreshold: true },
    });
    for (const item of medicines) {
      if (item.currentStock.lessThanOrEqualTo(item.lowStockThreshold)) {
        const title = `Low medicine stock: ${item.name}`;
        const message =
          `Medicine ${item.name} is at ${item.currentStock.toString()} ${item.unit}, ` +
          `at or below the low-stock threshold of ${item.lowStockThreshold.toString()} ${item.unit}.`;
        await createAlertForRecipients(recipientIds, {
          farmId,
          batchId: null,
          type: AlertType.LowMedicine,
          severity: AlertSeverity.Warning,
          title,
          message,
        });
      }
    }
  } catch (error) {
    logger.error({ err: error, farmId }, 'alertGenerator.evaluate failed');
  }
}

/** Object form for consumers that prefer a namespace import (Tasks 17–22). */
export const alertGenerator = { evaluate };