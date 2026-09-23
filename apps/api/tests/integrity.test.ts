import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import {
  authHeader,
  createBatch,
  createFarm,
  createShed,
  createUser,
  dateInDays,
  expectDecimal,
} from './helpers.js';

/**
 * Integrity guards suite — design doc §5.5/5.6 (lines 205–235), END-TO-END.
 *
 * Isolation (LOCKED T14 rule): module-scope ids + afterAll self-clean-by-id
 * (farms first — Farm.ownerId FK is NOT cascade on User delete — then users).
 * NO global @test.dev wipe, NO beforeEach deleteMany over shared rows.
 * Each file builds its OWN app via buildApp().
 *
 * Deviation from the brief: DUPLICATE_DAILY_RECORD is emitted with status 409
 * (daily-records/service.ts throws ApiError('DUPLICATE_DAILY_RECORD', ..., 409)),
 * not 400 as the brief suggested — asserted against the REAL module surface.
 */

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmId = '';
let batchAId = ''; // mortality guards (scenarios 1–2)
let batchBId = ''; // duplicate daily record (scenario 6)
let batchCId = ''; // sales guards (scenarios 5, 7)
let feedItemId = ''; // consume-over-stock (scenario 3)
let feedItem2Id = ''; // purchase totalCost (scenario 8)
let medicineItemId = ''; // use-over-stock (scenario 4)
let ownerToken = '';
let ownerUserId = '';

describe('integrity guards', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();

    // 1 register call (≤ ~5); email @t26.dev unique (distinct from @test.dev so the
    // 7 existing suites' beforeAll @test.dev wipes can never delete our rows mid-flight).
    const owner = await createUser(app, 'integrity-owner@t26.dev');
    ownerToken = owner.token;
    ownerUserId = owner.userId;

    const farm = await createFarm(app, owner.token, 'Integrity Farm');
    farmId = farm.farmId;
    const shed = await createShed(app, owner.token, farmId, 'Integrity Shed');

    const batchA = await createBatch(app, owner.token, farmId, shed.shedId, {
      batchNumber: 'INT-A-100',
      initialBirds: 100,
    });
    batchAId = batchA.batchId;
    const batchB = await createBatch(app, owner.token, farmId, shed.shedId, {
      batchNumber: 'INT-B-100',
      initialBirds: 100,
    });
    batchBId = batchB.batchId;
    const batchC = await createBatch(app, owner.token, farmId, shed.shedId, {
      batchNumber: 'INT-C-100',
      initialBirds: 100,
    });
    batchCId = batchC.batchId;

    // Feed item for consume-over-stock (scenario 3).
    const feed = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/feed`,
      headers: authHeader(owner.token),
      payload: { name: 'Integrity Feed', type: 'STARTER', unit: 'kg', currentStock: '10', lowStockThreshold: '2' },
    });
    expect(feed.statusCode).toBe(200);
    feedItemId = (feed.json() as { data: { id: string } }).data.id;

    // Feed item for purchase-totalCost (scenario 8).
    const feed2 = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/feed`,
      headers: authHeader(owner.token),
      payload: { name: 'Integrity Feed 2', type: 'GROWER', unit: 'kg', currentStock: '0', lowStockThreshold: '2' },
    });
    expect(feed2.statusCode).toBe(200);
    feedItem2Id = (feed2.json() as { data: { id: string } }).data.id;

    // Medicine item for use-over-stock (scenario 4).
    const medicine = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/medicines`,
      headers: authHeader(owner.token),
      payload: { name: 'Integrity Med', unit: 'ml', currentStock: '10', lowStockThreshold: '2' },
    });
    expect(medicine.statusCode).toBe(200);
    medicineItemId = (medicine.json() as { data: { id: string } }).data.id;
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farms first (cascade removes sheds, batches,
    // daily records, sales, feed/medicine items + transactions), then the user.
    await prisma.farm.deleteMany({ where: { id: { in: [farmId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId].filter(Boolean) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects mortality > birdsAtStart with no row written', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: authHeader(ownerToken),
      payload: { recordDate: dateInDays(0), birdsAtStart: 100, mortality: 101 },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('BATCH_BIRD_COUNT_INVALID');
    const count = await prisma.dailyRecord.count({ where: { batchId: batchAId } });
    expect(count).toBe(0);
  });

  it('rejects writes that would drive cumulative birds to zero or below', async () => {
    // mortality 60 → current 40.
    const record = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: authHeader(ownerToken),
      payload: { recordDate: dateInDays(1), birdsAtStart: 100, mortality: 60 },
    });
    expect(record.statusCode).toBe(200);

    // sale 40 → current 0.
    const sale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sales`,
      headers: authHeader(ownerToken),
      payload: {
        batchId: batchAId,
        buyer: 'Integrity Buyer',
        saleDate: dateInDays(1),
        birdsSold: 40,
        totalWeightKg: '400',
        ratePerKg: '250',
      },
    });
    expect(sale.statusCode).toBe(200);

    // Next daily-record create (even mortality 0) → 400 BATCH_BIRD_COUNT_INVALID.
    const nextRecord = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: authHeader(ownerToken),
      payload: { recordDate: dateInDays(2), birdsAtStart: 100, mortality: 0 },
    });
    expect(nextRecord.statusCode).toBe(400);
    expect((nextRecord.json() as { error: { code: string } }).error.code).toBe('BATCH_BIRD_COUNT_INVALID');

    // Next sale birdsSold 1 → 400 BATCH_BIRD_COUNT_INVALID.
    const nextSale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sales`,
      headers: authHeader(ownerToken),
      payload: {
        batchId: batchAId,
        buyer: 'Integrity Buyer',
        saleDate: dateInDays(1),
        birdsSold: 1,
        totalWeightKg: '10',
        ratePerKg: '250',
      },
    });
    expect(nextSale.statusCode).toBe(400);
    expect((nextSale.json() as { error: { code: string } }).error.code).toBe('BATCH_BIRD_COUNT_INVALID');
  });

  it('rejects feed consumption over stock and leaves currentStock unchanged', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/consume`,
      headers: authHeader(ownerToken),
      payload: { quantity: '11' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('STOCK_INSUFFICIENT');
    const item = await prisma.feedItem.findUnique({ where: { id: feedItemId } });
    expect(item?.currentStock.equals(new Prisma.Decimal('10'))).toBe(true);
    const txCount = await prisma.feedTransaction.count({ where: { feedItemId } });
    expect(txCount).toBe(0);
  });

  it('rejects medicine use over stock and leaves currentStock unchanged', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineItemId}/use`,
      headers: authHeader(ownerToken),
      payload: { quantity: '11' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('STOCK_INSUFFICIENT');
    const item = await prisma.medicine.findUnique({ where: { id: medicineItemId } });
    expect(item?.currentStock.equals(new Prisma.Decimal('10'))).toBe(true);
    const txCount = await prisma.medicineTransaction.count({ where: { medicineId: medicineItemId } });
    expect(txCount).toBe(0);
  });

  it('rejects sale over-payment and leaves outstanding unchanged', async () => {
    // weight 1000 × rate 250 → total 250000; received 0 → outstanding 250000.
    const sale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sales`,
      headers: authHeader(ownerToken),
      payload: {
        batchId: batchCId,
        buyer: 'Overpay Buyer',
        saleDate: dateInDays(0),
        birdsSold: 10,
        totalWeightKg: '1000',
        ratePerKg: '250',
        amountReceived: '0',
      },
    });
    expect(sale.statusCode).toBe(200);
    const created = sale.json() as { data: { id: string; totalAmount: string; outstandingAmount: string } };
    expectDecimal(created.data.totalAmount, '250000');
    expectDecimal(created.data.outstandingAmount, '250000');
    const saleId = created.data.id;

    // amountReceived 300000 > total 250000 → 400 PAYMENT_EXCEEDS_TOTAL.
    const overpay = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/${saleId}/payment`,
      headers: authHeader(ownerToken),
      payload: { amountReceived: '300000' },
    });
    expect(overpay.statusCode).toBe(400);
    expect((overpay.json() as { error: { code: string } }).error.code).toBe('PAYMENT_EXCEEDS_TOTAL');

    // Outstanding unchanged.
    const stored = await prisma.sale.findUnique({ where: { id: saleId } });
    expect(stored?.outstandingAmount.equals(new Prisma.Decimal('250000'))).toBe(true);
  });

  it('rejects a duplicate daily record for the same batch and date', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchBId}/daily-records`,
      headers: authHeader(ownerToken),
      payload: { recordDate: dateInDays(0), birdsAtStart: 100, mortality: 5 },
    });
    expect(first.statusCode).toBe(200);

    const dup = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchBId}/daily-records`,
      headers: authHeader(ownerToken),
      payload: { recordDate: dateInDays(0), birdsAtStart: 100, mortality: 5 },
    });
    // Real code is 409 (daily-records/service.ts throws ApiError(..., 409)) — brief said
    // 400; asserted against the actual module surface (documented deviation).
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: { code: string } }).error.code).toBe('DUPLICATE_DAILY_RECORD');

    const count = await prisma.dailyRecord.count({ where: { batchId: batchBId } });
    expect(count).toBe(1);
  });

  it('rejects a sale with birdsSold above currentBirds and writes no row', async () => {
    // batchC already has the scenario-5 sale (birdsSold 10) → current 90; 101 > 90.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sales`,
      headers: authHeader(ownerToken),
      payload: {
        batchId: batchCId,
        buyer: 'Too Many Buyer',
        saleDate: dateInDays(0),
        birdsSold: 101,
        totalWeightKg: '1000',
        ratePerKg: '250',
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('BATCH_BIRD_COUNT_INVALID');
    const count = await prisma.sale.count({ where: { batchId: batchCId } });
    expect(count).toBe(1); // only the scenario-5 sale
  });

  it('computes feed purchase totalCost server-side (5 × 20 = 100)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItem2Id}/purchase`,
      headers: authHeader(ownerToken),
      payload: { quantity: '5', unitCost: '20' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { feedItem: { currentStock: string }; transaction: { totalCost: string } };
    };
    expectDecimal(body.data.feedItem.currentStock, '5');
    expectDecimal(body.data.transaction.totalCost, '100');

    const tx = await prisma.feedTransaction.findFirst({
      where: { feedItemId: feedItem2Id, type: 'PURCHASE' },
    });
    expect(tx?.totalCost?.equals(new Prisma.Decimal('100'))).toBe(true);
  });
});