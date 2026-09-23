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
/** Vaccination due lookahead: alert when an UPCOMING vaccination is scheduled within 3 days (mirrors T19). */
const VACCINATION_DUE_LOOKAHEAD_DAYS = 3;
/** Medicine expiry lookahead: alert when expiryDate is within 30 days (mirrors T18). */
const MEDICINE_EXPIRY_LOOKAHEAD_DAYS = 30;
/** Payment overdue: alert when a PARTIALLY_PAID/PENDING sale is older than 30 days. */
const PAYMENT_OVERDUE_DAYS = 30;
/** Sale approaching: alert when saleDate is within the next 7 days. */
const SALE_APPROACHING_DAYS = 7;

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

/** UTC-midnight "today" — same convention as vaccinations/medicine services (@db.Date storage). */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

    // VACCINATION_DUE (WARNING, ≤3 days): UPCOMING vaccinations scheduled within the next
    // 3 days. UTC-midnight boundary mirrors vaccinations/service.ts createDueAlerts
    // (DUE_LOOKAHEAD_DAYS = 3, setUTCDate). Title parity with the T19 inline emission —
    // the 7-day dedupe key (userId, type, farmId, batchId, title) collides so the two
    // emission paths never produce duplicates.
    const vaccinationToday = startOfToday();
    const vaccinationHorizon = new Date(vaccinationToday);
    vaccinationHorizon.setUTCDate(vaccinationHorizon.getUTCDate() + VACCINATION_DUE_LOOKAHEAD_DAYS);
    for (const batch of batches) {
      const vaccinations = await prisma.vaccination.findMany({
        where: {
          batchId: batch.id,
          status: 'UPCOMING',
          scheduledDate: { gte: vaccinationToday, lte: vaccinationHorizon },
        },
        select: { vaccineName: true, scheduledDate: true },
      });
      for (const vaccination of vaccinations) {
        const title = `Vaccination due: ${vaccination.vaccineName}`;
        const message = `Vaccination ${vaccination.vaccineName} is scheduled for ${vaccination.scheduledDate
          .toISOString()
          .slice(0, 10)}.`;
        await createAlertForRecipients(recipientIds, {
          farmId,
          batchId: batch.id,
          type: AlertType.VaccinationDue,
          severity: AlertSeverity.Warning,
          title,
          message,
        });
      }
    }

    // MEDICINE_EXPIRY (WARNING, ≤30 days): medicines expiring within the next 30 days.
    // UTC-midnight boundary mirrors medicine/service.ts createExpiryAlerts
    // (EXPIRY_LOOKAHEAD_DAYS = 30, setUTCDate). Title parity with the T18 inline emission —
    // dedupe key (userId, type, farmId, batchId=null, title) collides.
    const medicineToday = startOfToday();
    const medicineHorizon = new Date(medicineToday);
    medicineHorizon.setUTCDate(medicineHorizon.getUTCDate() + MEDICINE_EXPIRY_LOOKAHEAD_DAYS);
    const expiringMedicines = await prisma.medicine.findMany({
      where: { farmId, expiryDate: { not: null, lte: medicineHorizon } },
      select: { name: true },
    });
    for (const medicine of expiringMedicines) {
      const title = `Medicine expiring: ${medicine.name}`;
      const message = `Medicine ${medicine.name} expires within the next ${MEDICINE_EXPIRY_LOOKAHEAD_DAYS} days.`;
      await createAlertForRecipients(recipientIds, {
        farmId,
        batchId: null,
        type: AlertType.MedicineExpiry,
        severity: AlertSeverity.Warning,
        title,
        message,
      });
    }

    // LOW_WEIGHT (WARNING): latest daily record's averageWeightKg below 50% of the batch's
    // initialAverageWeightKg. No max-weight field exists on Batch — initialAverageWeightKg
    // (the batch's target/starting weight) is the documented baseline. Decimal math only
    // (initialAverageWeightKg.div(2)) — never float.
    const weightBatches = await prisma.batch.findMany({
      where: { farmId, status: { in: ['ACTIVE', 'UPCOMING'] }, initialAverageWeightKg: { not: null } },
      select: { id: true, batchNumber: true, initialAverageWeightKg: true },
    });
    for (const batch of weightBatches) {
      if (batch.initialAverageWeightKg === null) continue;
      const latest = await prisma.dailyRecord.findFirst({
        where: { batchId: batch.id, averageWeightKg: { not: null } },
        orderBy: { recordDate: 'desc' },
      });
      if (!latest || latest.averageWeightKg === null) continue;
      if (latest.averageWeightKg.lessThan(batch.initialAverageWeightKg.div(2))) {
        const title = `Low weight in batch ${batch.batchNumber}`;
        const message =
          `Batch ${batch.batchNumber} latest average weight is ${latest.averageWeightKg.toString()} kg, ` +
          `below 50% of the initial average weight of ${batch.initialAverageWeightKg.toString()} kg.`;
        await createAlertForRecipients(recipientIds, {
          farmId,
          batchId: batch.id,
          type: AlertType.LowWeight,
          severity: AlertSeverity.Warning,
          title,
          message,
        });
      }
    }

    // PAYMENT_OVERDUE (WARNING): PARTIALLY_PAID/PENDING sales with saleDate older than 30 days.
    const paymentCutoff = new Date(Date.now() - PAYMENT_OVERDUE_DAYS * 24 * 60 * 60 * 1000);
    const overdueSales = await prisma.sale.findMany({
      where: {
        farmId,
        paymentStatus: { in: ['PARTIALLY_PAID', 'PENDING'] },
        saleDate: { lt: paymentCutoff },
      },
      select: { batchId: true, buyer: true, saleDate: true, outstandingAmount: true },
    });
    for (const sale of overdueSales) {
      const title = `Payment overdue: ${sale.buyer}`;
      const message =
        `Payment for sale to ${sale.buyer} (${sale.saleDate.toISOString().slice(0, 10)}) is overdue; ` +
        `outstanding amount is ${sale.outstandingAmount.toString()}.`;
      await createAlertForRecipients(recipientIds, {
        farmId,
        batchId: sale.batchId,
        type: AlertType.PaymentOverdue,
        severity: AlertSeverity.Warning,
        title,
        message,
      });
    }

    // SALE_DATE_APPROACHING (INFO, ≤7 days): sales with saleDate within [today, today+7].
    const saleToday = startOfToday();
    const saleHorizon = new Date(saleToday);
    saleHorizon.setUTCDate(saleHorizon.getUTCDate() + SALE_APPROACHING_DAYS);
    const approachingSales = await prisma.sale.findMany({
      where: { farmId, saleDate: { gte: saleToday, lte: saleHorizon } },
      select: { batchId: true, buyer: true, saleDate: true },
    });
    for (const sale of approachingSales) {
      const title = `Sale approaching: ${sale.buyer}`;
      const message = `Sale to ${sale.buyer} is scheduled for ${sale.saleDate.toISOString().slice(0, 10)}.`;
      await createAlertForRecipients(recipientIds, {
        farmId,
        batchId: sale.batchId,
        type: AlertType.SaleDateApproaching,
        severity: AlertSeverity.Info,
        title,
        message,
      });
    }
  } catch (error) {
    logger.error({ err: error, farmId }, 'alertGenerator.evaluate failed');
  }
}

/** Object form for consumers that prefer a namespace import (Tasks 17–22). */
export const alertGenerator = { evaluate };