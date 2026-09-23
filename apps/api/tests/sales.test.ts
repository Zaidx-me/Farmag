import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

interface TestUser {
  token: string;
  userId: string;
}

async function createUser(app: ReturnType<typeof buildApp>, email: string): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { fullName: 'Test User', email, password: 'Password123!' },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data: { user: { id: string }; tokens: { accessToken: string } } };
  return { token: body.data.tokens.accessToken, userId: body.data.user.id };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** UTC date string N days from now (YYYY-MM-DD) — matches the service's UTC-midnight @db.Date storage. */
const dateInDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Prisma Decimal serializes as its normalized string ('250000', not '250000.00') — compare numerically. */
const expectDecimal = (actual: string, expected: string) => {
  expect(new Prisma.Decimal(actual).equals(new Prisma.Decimal(expected))).toBe(true);
};

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
// No global @test.dev wipe — a parallel suite may be mid-flight.
let farmAId = '';
let farmBId = '';
let batchA1Id = '';
let batchA2Id = '';
let batchBId = '';
let ownerUserId = '';
let accountantUserId = '';
let workerUserId = '';
let otherUserId = '';

describe('sales', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farms first (cascade removes sheds, batches,
    // daily records, sales), then the users we registered (Farm.ownerId FK is NOT cascade
    // on User delete, so farms must go first). No global @test.dev wipe.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, accountantUserId, workerUserId, otherUserId].filter(Boolean) } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('computes all money server-side, enforces the finance matrix, and guards birds/batch', async () => {
    // 4 register calls total (≤ ~6); all emails @test.dev unique.
    const owner = await createUser(app, 'sales-owner@test.dev');
    const accountant = await createUser(app, 'sales-accountant@test.dev');
    const worker = await createUser(app, 'sales-worker@test.dev');
    const other = await createUser(app, 'sales-other@test.dev');
    ownerUserId = owner.userId;
    accountantUserId = accountant.userId;
    workerUserId = worker.userId;
    otherUserId = other.userId;

    // Farm A owned by OWNER; accountant/worker added as members (one call).
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Sales Farm A', location: 'Lahore' },
    });
    expect(farmA.statusCode).toBe(200);
    farmAId = (farmA.json() as { data: { id: string } }).data.id;

    const addMembers = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/members`,
      headers: auth(owner.token),
      payload: {
        members: [
          { userId: accountant.userId, role: 'ACCOUNTANT' },
          { userId: worker.userId, role: 'WORKER' },
        ],
      },
    });
    expect(addMembers.statusCode).toBe(200);

    // Shed + two batches on farm A: A1 (5000 birds) for the money tests, A2 (100 birds)
    // for the birdsSold > currentBirds test.
    const shedA = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: auth(owner.token),
      payload: { name: 'Broiler Shed A', capacity: 8000 },
    });
    expect(shedA.statusCode).toBe(200);
    const shedAId = (shedA.json() as { data: { id: string } }).data.id;

    const batchA1 = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(owner.token),
      payload: {
        shedId: shedAId,
        batchNumber: 'SAL-A1-100',
        breed: 'Ross 308',
        arrivalDate: '2026-09-02',
        initialBirds: 5000,
      },
    });
    expect(batchA1.statusCode).toBe(200);
    batchA1Id = (batchA1.json() as { data: { id: string } }).data.id;

    const batchA2 = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(owner.token),
      payload: {
        shedId: shedAId,
        batchNumber: 'SAL-A2-100',
        breed: 'Ross 308',
        arrivalDate: '2026-09-02',
        initialBirds: 100,
      },
    });
    expect(batchA2.statusCode).toBe(200);
    batchA2Id = (batchA2.json() as { data: { id: string } }).data.id;

    // Farm B owned by `other` with a shed + batch — for the cross-farm 404 and the
    // cross-farm batchId 400 tests.
    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(other.token),
      payload: { name: 'Sales Farm B', location: 'Karachi' },
    });
    expect(farmB.statusCode).toBe(200);
    farmBId = (farmB.json() as { data: { id: string } }).data.id;

    const shedB = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/sheds`,
      headers: auth(other.token),
      payload: { name: 'Broiler Shed B', capacity: 8000 },
    });
    expect(shedB.statusCode).toBe(200);
    const shedBId = (shedB.json() as { data: { id: string } }).data.id;

    const batchB = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/batches`,
      headers: auth(other.token),
      payload: {
        shedId: shedBId,
        batchNumber: 'SAL-B-200',
        breed: 'Ross 308',
        arrivalDate: '2026-09-02',
        initialBirds: 5000,
      },
    });
    expect(batchB.statusCode).toBe(200);
    batchBId = (batchB.json() as { data: { id: string } }).data.id;

    // 1. SERVER-COMPUTED TOTALS: weight 1000 × rate 250 = 250000; received 100000 →
    //    PARTIALLY_PAID, outstanding 150000. A client-sent `totalAmount` is stripped by
    //    zod (schema has no such key) — the stored totalAmount must be the server's 250000.
    const createSale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: auth(accountant.token),
      payload: {
        batchId: batchA1Id,
        buyer: 'Karachi Wholesale',
        saleDate: dateInDays(0),
        birdsSold: 1000,
        totalWeightKg: '1000',
        ratePerKg: '250',
        amountReceived: '100000',
        totalAmount: '1', // must be stripped — server computes
      },
    });
    expect(createSale.statusCode).toBe(200);
    const created = createSale.json() as {
      data: {
        id: string;
        totalAmount: string;
        amountReceived: string;
        outstandingAmount: string;
        paymentStatus: string;
        farmId: string;
        batchId: string;
        createdBy: string;
      };
    };
    expectDecimal(created.data.totalAmount, '250000');
    expectDecimal(created.data.amountReceived, '100000');
    expectDecimal(created.data.outstandingAmount, '150000');
    expect(created.data.paymentStatus).toBe('PARTIALLY_PAID');
    expect(created.data.farmId).toBe(farmAId);
    expect(created.data.batchId).toBe(batchA1Id);
    expect(created.data.createdBy).toBe(accountant.userId);
    const sale1Id = created.data.id;

    // Same assertions against the persisted row (API response + DB agree).
    const storedSale1 = await prisma.sale.findUnique({ where: { id: sale1Id } });
    expect(storedSale1).not.toBeNull();
    expectDecimal(storedSale1!.totalAmount.toString(), '250000');
    expectDecimal(storedSale1!.outstandingAmount.toString(), '150000');
    expect(storedSale1!.paymentStatus).toBe('PARTIALLY_PAID');

    // 2. amountReceived 300000 exceeds total 250000 → 400 PAYMENT_EXCEEDS_TOTAL.
    const overpay = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: auth(accountant.token),
      payload: {
        batchId: batchA1Id,
        buyer: 'Karachi Wholesale',
        saleDate: dateInDays(0),
        birdsSold: 100,
        totalWeightKg: '1000',
        ratePerKg: '250',
        amountReceived: '300000',
      },
    });
    expect(overpay.statusCode).toBe(400);
    expect((overpay.json() as { error: { code: string } }).error.code).toBe('PAYMENT_EXCEEDS_TOTAL');

    // 3. updatePayment — NEW TOTAL semantics: amountReceived is the total received so far.
    //    250000 → outstanding 0 → PAID.
    const payOff = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/${sale1Id}/payment`,
      headers: auth(accountant.token),
      payload: { amountReceived: '250000' },
    });
    expect(payOff.statusCode).toBe(200);
    const paid = payOff.json() as { data: { amountReceived: string; outstandingAmount: string; paymentStatus: string } };
    expectDecimal(paid.data.amountReceived, '250000');
    expectDecimal(paid.data.outstandingAmount, '0');
    expect(paid.data.paymentStatus).toBe('PAID');

    // updatePayment overpay → 400 PAYMENT_EXCEEDS_TOTAL.
    const payOver = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/${sale1Id}/payment`,
      headers: auth(accountant.token),
      payload: { amountReceived: '300000' },
    });
    expect(payOver.statusCode).toBe(400);
    expect((payOver.json() as { error: { code: string } }).error.code).toBe('PAYMENT_EXCEEDS_TOTAL');

    // 4. PATCH full update recomputes server-side: ratePerKg 300 → totalAmount 300000,
    //    outstanding 50000 (received stays 250000), still PARTIALLY_PAID.
    const patchSale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/sales/${sale1Id}`,
      headers: auth(accountant.token),
      payload: { ratePerKg: '300' },
    });
    expect(patchSale.statusCode).toBe(200);
    const patched = patchSale.json() as {
      data: { totalAmount: string; outstandingAmount: string; paymentStatus: string; ratePerKg: string };
    };
    expectDecimal(patched.data.ratePerKg, '300');
    expectDecimal(patched.data.totalAmount, '300000');
    expectDecimal(patched.data.outstandingAmount, '50000');
    expect(patched.data.paymentStatus).toBe('PARTIALLY_PAID');

    // 5. birdsSold > currentBirds → 400 BATCH_BIRD_COUNT_INVALID.
    //    Batch A2: initialBirds 100, daily record mortality 10 → current 90.
    const dailyRecord = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchA2Id}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: dateInDays(0), birdsAtStart: 100, mortality: 10 },
    });
    expect(dailyRecord.statusCode).toBe(200);

    // 50 ≤ 90 → OK; remaining after this sale = 40.
    const partialSale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: auth(accountant.token),
      payload: {
        batchId: batchA2Id,
        buyer: 'Local Buyer',
        saleDate: dateInDays(0),
        birdsSold: 50,
        totalWeightKg: '500',
        ratePerKg: '250',
      },
    });
    expect(partialSale.statusCode).toBe(200);
    const partialSaleId = (partialSale.json() as { data: { id: string } }).data.id;

    // 41 > 40 remaining → BATCH_BIRD_COUNT_INVALID.
    const tooMany = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: auth(accountant.token),
      payload: {
        batchId: batchA2Id,
        buyer: 'Local Buyer',
        saleDate: dateInDays(0),
        birdsSold: 41,
        totalWeightKg: '410',
        ratePerKg: '250',
      },
    });
    expect(tooMany.statusCode).toBe(400);
    expect((tooMany.json() as { error: { code: string } }).error.code).toBe('BATCH_BIRD_COUNT_INVALID');

    // 6. Cross-farm sale GET → 404 (existence leak guard): a sale that EXISTS on farm B
    //    is indistinguishable from absent for a non-member of farm B.
    const farmBSale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/sales`,
      headers: auth(other.token),
      payload: {
        batchId: batchBId,
        buyer: 'Farm B Buyer',
        saleDate: dateInDays(0),
        birdsSold: 10,
        totalWeightKg: '100',
        ratePerKg: '250',
      },
    });
    expect(farmBSale.statusCode).toBe(200);
    const farmBSaleId = (farmBSale.json() as { data: { id: string } }).data.id;

    const crossFarmGet = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/${farmBSaleId}`,
      headers: auth(accountant.token),
    });
    expect(crossFarmGet.statusCode).toBe(404);
    expect((crossFarmGet.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 7. WORKER create → 403 FORBIDDEN (finance matrix: only OWNER + ACCOUNTANT write).
    const workerCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: auth(worker.token),
      payload: {
        batchId: batchA1Id,
        buyer: 'Worker Attempt',
        saleDate: dateInDays(0),
        birdsSold: 10,
        totalWeightKg: '100',
        ratePerKg: '250',
      },
    });
    expect(workerCreate.statusCode).toBe(403);
    expect((workerCreate.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // WORKER PATCH → 403 too.
    const workerPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/sales/${sale1Id}`,
      headers: auth(worker.token),
      payload: { buyer: 'Worker edit attempt' },
    });
    expect(workerPatch.statusCode).toBe(403);
    expect((workerPatch.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // WORKER DELETE → 403.
    const workerDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/sales/${partialSaleId}`,
      headers: auth(worker.token),
    });
    expect(workerDelete.statusCode).toBe(403);

    // Read is open to EVERY accessible farm role — WORKER can list and get.
    const workerList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/sales?page=1&pageSize=5`,
      headers: auth(worker.token),
    });
    expect(workerList.statusCode).toBe(200);
    const workerGet = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/${sale1Id}`,
      headers: auth(worker.token),
    });
    expect(workerGet.statusCode).toBe(200);

    // 8. batchId belonging to ANOTHER farm → 400 VALIDATION_ERROR (present-but-wrong-farm
    //    is a validation mismatch, not a 404).
    const crossFarmBatch = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: auth(accountant.token),
      payload: {
        batchId: batchBId,
        buyer: 'Wrong Farm Batch',
        saleDate: dateInDays(0),
        birdsSold: 10,
        totalWeightKg: '100',
        ratePerKg: '250',
      },
    });
    expect(crossFarmBatch.statusCode).toBe(400);
    expect((crossFarmBatch.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 9. List filters by batchId return only that batch's sales.
    const listByBatch = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/sales?batchId=${batchA2Id}`,
      headers: auth(accountant.token),
    });
    expect(listByBatch.statusCode).toBe(200);
    const listBody = listByBatch.json() as { data: { items: Array<{ id: string }>; meta: { total: number } } };
    expect(listBody.data.items.map((s) => s.id)).toEqual([partialSaleId]);
    expect(listBody.data.meta.total).toBe(1);

    // 10. ACCOUNTANT delete → 200; row gone.
    const accountantDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/sales/${partialSaleId}`,
      headers: auth(accountant.token),
    });
    expect(accountantDelete.statusCode).toBe(200);
    expect((accountantDelete.json() as { data: { success: boolean } }).data.success).toBe(true);
    expect(await prisma.sale.findUnique({ where: { id: partialSaleId } })).toBeNull();
  });
});