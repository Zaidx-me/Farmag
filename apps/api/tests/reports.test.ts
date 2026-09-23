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

/** Prisma Decimal serializes as its normalized string ('250000', not '250000.00') — compare numerically. */
const expectDecimal = (actual: string, expected: string) => {
  expect(new Prisma.Decimal(actual).equals(new Prisma.Decimal(expected))).toBe(true);
};

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
// No global @test.dev wipe — a parallel suite may be mid-flight.
let farmAId = '';
let farmBId = '';
let batch1Id = '';
let batch2Id = '';
let ownerUserId = '';
let accountantUserId = '';
let workerUserId = '';

describe('reports', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farms first (cascade removes sheds, batches,
    // daily records, feed items/transactions, expenses, sales), then the users we
    // registered (Farm.ownerId FK is NOT cascade on User delete, so farms must go first).
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, accountantUserId, workerUserId].filter(Boolean) } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('aggregates exact dashboard/report numbers, enforces report roles, and labels data quality', async () => {
    // 3 register calls total (≤ ~4); all emails @test.dev unique.
    const owner = await createUser(app, 'reports-owner@test.dev');
    const accountant = await createUser(app, 'reports-accountant@test.dev');
    const worker = await createUser(app, 'reports-worker@test.dev');
    ownerUserId = owner.userId;
    accountantUserId = accountant.userId;
    workerUserId = worker.userId;

    // Farm A owned by OWNER; accountant/worker added as members (one call).
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Reports Farm A', location: 'Lahore' },
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

    // Farm B owned by ACCOUNTANT — the cross-farm 404 target for the owner.
    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(accountant.token),
      payload: { name: 'Reports Farm B', location: 'Karachi' },
    });
    expect(farmB.statusCode).toBe(200);
    farmBId = (farmB.json() as { data: { id: string } }).data.id;

    // Shed + batch1 (10000 birds) on farm A. First daily record opens it → ACTIVE.
    const shedA = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: auth(owner.token),
      payload: { name: 'Broiler Shed A', capacity: 12000 },
    });
    expect(shedA.statusCode).toBe(200);
    const shedAId = (shedA.json() as { data: { id: string } }).data.id;

    const batch1 = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(owner.token),
      payload: {
        shedId: shedAId,
        batchNumber: 'REP-A1-100',
        breed: 'Ross 308',
        arrivalDate: '2026-09-01',
        initialBirds: 10000,
        initialAverageWeightKg: '0.04',
      },
    });
    expect(batch1.statusCode).toBe(200);
    batch1Id = (batch1.json() as { data: { id: string } }).data.id;

    // 2 daily records via API (integration proof): mortality 40 + 60 = 100 total,
    // feedConsumed 2000 + 3000 = 5000kg, weights 1.5 → 2.0.
    const rec1 = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batch1Id}/daily-records`,
      headers: auth(owner.token),
      payload: {
        recordDate: '2026-09-10',
        birdsAtStart: 10000,
        mortality: 40,
        feedConsumedKg: '2000',
        averageWeightKg: '1.5',
      },
    });
    expect(rec1.statusCode).toBe(200);

    const rec2 = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batch1Id}/daily-records`,
      headers: auth(owner.token),
      payload: {
        recordDate: '2026-09-11',
        birdsAtStart: 9960,
        mortality: 60,
        feedConsumedKg: '3000',
        averageWeightKg: '2',
      },
    });
    expect(rec2.statusCode).toBe(200);

    // Feed item via API, then a raw-prisma CONSUMPTION transaction (5000kg) — the API
    // consume path is already covered by the feed module tests; raw insert keeps the
    // seed fast and deterministic. Stock is intentionally NOT decremented (the report
    // reads transactions, not stock).
    const feedItem = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/feed`,
      headers: auth(owner.token),
      payload: {
        name: 'Broiler Starter',
        type: 'STARTER',
        unit: 'kg',
        currentStock: '10000',
        lowStockThreshold: '1000',
      },
    });
    expect(feedItem.statusCode).toBe(200);
    const feedItemId = (feedItem.json() as { data: { id: string } }).data.id;

    await prisma.feedTransaction.create({
      data: {
        feedItemId,
        batchId: batch1Id,
        type: 'CONSUMPTION',
        quantity: new Prisma.Decimal('5000'),
        transactionDate: new Date('2026-09-10T00:00:00.000Z'),
        createdBy: ownerUserId,
      },
    });

    // Expense 50000 (FEED) via API as ACCOUNTANT (finance matrix allows it).
    const expense = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(accountant.token),
      payload: {
        batchId: batch1Id,
        category: 'FEED',
        description: 'Feed purchase',
        amount: '50000',
        expenseDate: '2026-09-10',
      },
    });
    expect(expense.statusCode).toBe(200);

    // Sale via API as ACCOUNTANT: 1000kg × 250 = 250000, received 250000 → PAID.
    const sale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: auth(accountant.token),
      payload: {
        batchId: batch1Id,
        buyer: 'Karachi Wholesale',
        saleDate: '2026-09-12',
        birdsSold: 50,
        totalWeightKg: '1000',
        ratePerKg: '250',
        amountReceived: '250000',
      },
    });
    expect(sale.statusCode).toBe(200);

    // ===== 1. EXACT DASHBOARD NUMBERS (owner) =====
    const dash = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(dash.statusCode).toBe(200);
    const dashBody = dash.json() as {
      data: {
        farms: number;
        activeBatches: number;
        totalBirds: number;
        mortalityPercent: number;
        feedConsumedKg: string;
        expenses: string;
        revenue: string;
        profit: string;
        labels: { actual: boolean; estimated: boolean; incomplete: boolean };
        meta: { isComplete: boolean };
      };
    };
    expect(dashBody.data.farms).toBe(1);
    expect(dashBody.data.activeBatches).toBe(1);
    expect(dashBody.data.totalBirds).toBe(9900); // latest record birdsRemaining (9960 − 60)
    expect(dashBody.data.mortalityPercent).toBe(1); // 100 / 10000 × 100
    expectDecimal(dashBody.data.feedConsumedKg, '5000');
    expectDecimal(dashBody.data.expenses, '50000');
    expectDecimal(dashBody.data.revenue, '250000');
    expectDecimal(dashBody.data.profit, '200000');
    expect(dashBody.data.labels).toEqual({ actual: true, estimated: false, incomplete: false });
    expect(dashBody.data.meta.isComplete).toBe(true);

    // ACCOUNTANT can read the dashboard too (report read roles: OWNER/MANAGER/ACCOUNTANT).
    const dashAccountant = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard?farmId=${farmAId}`,
      headers: auth(accountant.token),
    });
    expect(dashAccountant.statusCode).toBe(200);

    // ===== 2. WORKER → 403 on dashboard AND a report (plan's auth assert) =====
    const workerDash = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard?farmId=${farmAId}`,
      headers: auth(worker.token),
    });
    expect(workerDash.statusCode).toBe(403);
    expect((workerDash.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const workerGrowth = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/growth?farmId=${farmAId}&batchId=${batch1Id}`,
      headers: auth(worker.token),
    });
    expect(workerGrowth.statusCode).toBe(403);
    expect((workerGrowth.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // ===== 3. farmId validation: missing / invalid → 400 VALIDATION_ERROR =====
    const missingFarmId = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: auth(owner.token),
    });
    expect(missingFarmId.statusCode).toBe(400);
    expect((missingFarmId.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    const invalidFarmId = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard?farmId=not-a-uuid',
      headers: auth(owner.token),
    });
    expect(invalidFarmId.statusCode).toBe(400);
    expect((invalidFarmId.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // ===== 4. SERIES + MONEY REPORTS MATCH THE SEED =====
    // Growth: two points, weights as seeded.
    const growth = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/growth?farmId=${farmAId}&batchId=${batch1Id}`,
      headers: auth(owner.token),
    });
    expect(growth.statusCode).toBe(200);
    const growthBody = growth.json() as {
      data: {
        batchId: string;
        batchNumber: string;
        series: Array<{ recordDate: string; averageWeightKg: string | null }>;
        labels: { actual: boolean; estimated: boolean; incomplete: boolean };
      };
    };
    expect(growthBody.data.batchId).toBe(batch1Id);
    expect(growthBody.data.batchNumber).toBe('REP-A1-100');
    expect(growthBody.data.series).toEqual([
      { recordDate: '2026-09-10', averageWeightKg: '1.5' },
      { recordDate: '2026-09-11', averageWeightKg: '2' },
    ]);
    expect(growthBody.data.labels).toEqual({ actual: true, estimated: false, incomplete: false });

    // Mortality: cumulative over ALL records, per-point percent via T15 helper.
    const mortality = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/mortality?farmId=${farmAId}&batchId=${batch1Id}`,
      headers: auth(owner.token),
    });
    expect(mortality.statusCode).toBe(200);
    const mortalityBody = mortality.json() as {
      data: {
        series: Array<{
          recordDate: string;
          mortality: number;
          cumulativeMortality: number;
          mortalityPercent: number;
        }>;
      };
    };
    expect(mortalityBody.data.series).toEqual([
      { recordDate: '2026-09-10', mortality: 40, cumulativeMortality: 40, mortalityPercent: 0.4 },
      { recordDate: '2026-09-11', mortality: 60, cumulativeMortality: 100, mortalityPercent: 1 },
    ]);

    // Feed: series + totals + T15 currentBirds/fcr.
    const feed = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/feed?farmId=${farmAId}&batchId=${batch1Id}`,
      headers: auth(owner.token),
    });
    expect(feed.statusCode).toBe(200);
    const feedBody = feed.json() as {
      data: {
        series: Array<{ recordDate: string; feedConsumedKg: string | null }>;
        totalFeedConsumed: string;
        currentBirds: number;
        currentAvgWeightKg: string | null;
        fcr: { value: number | null; incomplete: boolean };
        labels: { actual: boolean; estimated: boolean; incomplete: boolean };
      };
    };
    expect(feedBody.data.series).toEqual([
      { recordDate: '2026-09-10', feedConsumedKg: '2000' },
      { recordDate: '2026-09-11', feedConsumedKg: '3000' },
    ]);
    expectDecimal(feedBody.data.totalFeedConsumed, '5000');
    expect(feedBody.data.currentBirds).toBe(9850); // 10000 − 100 mortality − 50 sold
    expectDecimal(feedBody.data.currentAvgWeightKg ?? '', '2');
    expect(feedBody.data.fcr.incomplete).toBe(false);
    expect(feedBody.data.fcr.value).toBeCloseTo(0.2591, 4); // 5000 / (9850×2 − 10000×0.04)
    expect(feedBody.data.labels).toEqual({ actual: true, estimated: false, incomplete: false });

    // Expenses: FEED category 50000, total 50000, all categories zero-filled.
    const expenses = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/expenses?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(expenses.statusCode).toBe(200);
    const expensesBody = expenses.json() as {
      data: { byCategory: Array<{ category: string; amount: string }>; total: string };
    };
    const feedCategory = expensesBody.data.byCategory.find((c) => c.category === 'FEED');
    expect(feedCategory).toBeDefined();
    expectDecimal(feedCategory!.amount, '50000');
    expect(expensesBody.data.byCategory.length).toBe(11); // every ExpenseCategory const
    expectDecimal(expensesBody.data.total, '50000');

    // Sales: PAID 250000, totals exact.
    const sales = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/sales?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(sales.statusCode).toBe(200);
    const salesBody = sales.json() as {
      data: {
        byPaymentStatus: Array<{ paymentStatus: string; totalAmount: string }>;
        totalAmount: string;
        amountReceived: string;
        outstandingAmount: string;
      };
    };
    const paid = salesBody.data.byPaymentStatus.find((s) => s.paymentStatus === 'PAID');
    expect(paid).toBeDefined();
    expectDecimal(paid!.totalAmount, '250000');
    expectDecimal(salesBody.data.totalAmount, '250000');
    expectDecimal(salesBody.data.amountReceived, '250000');
    expectDecimal(salesBody.data.outstandingAmount, '0');

    // Profit-loss: totals + profit = revenue − expenses.
    const pnl = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/profit-loss?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(pnl.statusCode).toBe(200);
    const pnlBody = pnl.json() as {
      data: { totalExpenses: string; totalRevenue: string; profit: string };
    };
    expectDecimal(pnlBody.data.totalExpenses, '50000');
    expectDecimal(pnlBody.data.totalRevenue, '250000');
    expectDecimal(pnlBody.data.profit, '200000');

    // Batch-comparison: batch1 row exact (before batch2 exists).
    const comparison = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/batch-comparison?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(comparison.statusCode).toBe(200);
    const comparisonBody = comparison.json() as {
      data: {
        batches: Array<{
          batchId: string;
          batchNumber: string;
          breed: string;
          status: string;
          currentBirds: number;
          mortalityPct: number;
          fcr: { value: number | null; incomplete: boolean };
          totalExpenses: string;
          revenue: string;
          profit: string;
          labels: { actual: boolean; estimated: boolean; incomplete: boolean };
        }>;
      };
    };
    expect(comparisonBody.data.batches).toHaveLength(1);
    const row1 = comparisonBody.data.batches[0]!;
    expect(row1.batchId).toBe(batch1Id);
    expect(row1.batchNumber).toBe('REP-A1-100');
    expect(row1.breed).toBe('Ross 308');
    expect(row1.status).toBe('ACTIVE');
    expect(row1.currentBirds).toBe(9850);
    expect(row1.mortalityPct).toBe(1);
    expect(row1.fcr.incomplete).toBe(false);
    expect(row1.fcr.value).toBeCloseTo(0.2591, 4);
    expectDecimal(row1.totalExpenses, '50000');
    expectDecimal(row1.revenue, '250000');
    expectDecimal(row1.profit, '200000');
    expect(row1.labels).toEqual({ actual: true, estimated: false, incomplete: false });

    // ===== 5. CROSS-FARM + ABSENT FARM → 404 (no existence leak) =====
    const crossFarm = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard?farmId=${farmBId}`,
      headers: auth(owner.token),
    });
    expect(crossFarm.statusCode).toBe(404);
    expect((crossFarm.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    const absentFarm = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard?farmId=00000000-0000-4000-8000-000000000000',
      headers: auth(owner.token),
    });
    expect(absentFarm.statusCode).toBe(404);
    expect((absentFarm.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // ===== 6. from/to FILTERING NARROWS SERIES =====
    const growthFrom = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/growth?farmId=${farmAId}&batchId=${batch1Id}&from=2026-09-11`,
      headers: auth(owner.token),
    });
    expect(growthFrom.statusCode).toBe(200);
    const growthFromBody = growthFrom.json() as {
      data: { series: Array<{ recordDate: string; averageWeightKg: string | null }> };
    };
    expect(growthFromBody.data.series).toEqual([{ recordDate: '2026-09-11', averageWeightKg: '2' }]);

    // Mortality cumulative is batch-relative (computed over ALL records) then filtered —
    // the filtered point still shows the true running cumulative of 100.
    const mortalityFrom = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/mortality?farmId=${farmAId}&batchId=${batch1Id}&from=2026-09-11`,
      headers: auth(owner.token),
    });
    expect(mortalityFrom.statusCode).toBe(200);
    const mortalityFromBody = mortalityFrom.json() as {
      data: {
        series: Array<{
          recordDate: string;
          mortality: number;
          cumulativeMortality: number;
          mortalityPercent: number;
        }>;
      };
    };
    expect(mortalityFromBody.data.series).toEqual([
      { recordDate: '2026-09-11', mortality: 60, cumulativeMortality: 100, mortalityPercent: 1 },
    ]);

    // ===== 7. BATCH WITHOUT RECORDS → dashboard estimated/incomplete + comparison row =====
    const batch2 = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(owner.token),
      payload: {
        shedId: shedAId,
        batchNumber: 'REP-A2-200',
        breed: 'Cobb 500',
        arrivalDate: '2026-09-05',
        initialBirds: 1000,
      },
    });
    expect(batch2.statusCode).toBe(200);
    batch2Id = (batch2.json() as { data: { id: string } }).data.id;

    const openBatch2 = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batch2Id}/open`,
      headers: auth(owner.token),
    });
    expect(openBatch2.statusCode).toBe(200);

    const dashAfter = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(dashAfter.statusCode).toBe(200);
    const dashAfterBody = dashAfter.json() as {
      data: {
        activeBatches: number;
        totalBirds: number;
        labels: { actual: boolean; estimated: boolean; incomplete: boolean };
        meta: { isComplete: boolean };
      };
    };
    expect(dashAfterBody.data.activeBatches).toBe(2);
    expect(dashAfterBody.data.totalBirds).toBe(10900); // 9900 + initialBirds fallback 1000
    expect(dashAfterBody.data.labels).toEqual({ actual: false, estimated: true, incomplete: true });
    expect(dashAfterBody.data.meta.isComplete).toBe(false);

    const comparisonAfter = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/batch-comparison?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(comparisonAfter.statusCode).toBe(200);
    const comparisonAfterBody = comparisonAfter.json() as {
      data: {
        batches: Array<{
          batchId: string;
          currentBirds: number;
          mortalityPct: number;
          fcr: { value: number | null; incomplete: boolean };
          totalExpenses: string;
          revenue: string;
          profit: string;
          labels: { actual: boolean; estimated: boolean; incomplete: boolean };
        }>;
        labels: { actual: boolean; estimated: boolean; incomplete: boolean };
      };
    };
    expect(comparisonAfterBody.data.batches).toHaveLength(2);
    const row2 = comparisonAfterBody.data.batches.find((b) => b.batchId === batch2Id)!;
    expect(row2.currentBirds).toBe(1000);
    expect(row2.mortalityPct).toBe(0);
    expect(row2.fcr).toEqual({ value: null, incomplete: true });
    expectDecimal(row2.totalExpenses, '0');
    expectDecimal(row2.revenue, '0');
    expectDecimal(row2.profit, '0');
    expect(row2.labels).toEqual({ actual: false, estimated: true, incomplete: true });
    // Report-level labels aggregate over rows (any-row OR).
    expect(comparisonAfterBody.data.labels).toEqual({ actual: false, estimated: true, incomplete: true });

    // ===== 8. MEDICINE / VACCINATION: empty farm → empty groups, constant labels =====
    const medicine = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/medicine?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(medicine.statusCode).toBe(200);
    const medicineBody = medicine.json() as {
      data: { items: unknown[]; labels: { actual: boolean; estimated: boolean; incomplete: boolean } };
    };
    expect(medicineBody.data.items).toEqual([]);
    expect(medicineBody.data.labels).toEqual({ actual: true, estimated: false, incomplete: false });

    const vaccination = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/vaccination?farmId=${farmAId}`,
      headers: auth(owner.token),
    });
    expect(vaccination.statusCode).toBe(200);
    const vaccinationBody = vaccination.json() as {
      data: {
        upcoming: unknown[];
        completed: unknown[];
        missed: unknown[];
        labels: { actual: boolean; estimated: boolean; incomplete: boolean };
      };
    };
    expect(vaccinationBody.data.upcoming).toEqual([]);
    expect(vaccinationBody.data.completed).toEqual([]);
    expect(vaccinationBody.data.missed).toEqual([]);
    expect(vaccinationBody.data.labels).toEqual({ actual: true, estimated: false, incomplete: false });
  });
});