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

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmAId = '';
let farmBId = '';
let batchId = '';

describe('batches', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
    // Cleanup in cascade-safe order: FarmMember cascades, but Farm.ownerId FK is NOT
    // cascade on User delete — delete Farms first, then Users.
    const testUsers = await prisma.user.findMany({
      where: { email: { endsWith: '@test.dev' } },
      select: { id: true },
    });
    if (testUsers.length) {
      await prisma.farm.deleteMany({ where: { ownerId: { in: testUsers.map((u) => u.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: testUsers.map((u) => u.id) } } });
    }
  });

  afterAll(async () => {
    // Self-clean ONLY our own farms by id (cascade removes sheds, batches, records, sales).
    // Do NOT wipe all @test.dev rows — a parallel suite may be mid-flight.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces batch lifecycle, validation and summary aggregation', async () => {
    const ownerA = await createUser(app, 'batches-owner-a@test.dev');
    const ownerB = await createUser(app, 'batches-owner-b@test.dev');

    // Farms A (owner A) and B (owner B), each with one shed.
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(ownerA.token),
      payload: { name: 'Batches Farm A', location: 'Lahore' },
    });
    expect(farmA.statusCode).toBe(200);
    farmAId = (farmA.json() as { data: { id: string } }).data.id;

    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(ownerB.token),
      payload: { name: 'Batches Farm B', location: 'Karachi' },
    });
    expect(farmB.statusCode).toBe(200);
    farmBId = (farmB.json() as { data: { id: string } }).data.id;

    const shedA = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: auth(ownerA.token),
      payload: { name: 'Broiler Shed A', capacity: 12000 },
    });
    expect(shedA.statusCode).toBe(200);
    const shedAId = (shedA.json() as { data: { id: string } }).data.id;

    const shedB = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/sheds`,
      headers: auth(ownerB.token),
      payload: { name: 'Broiler Shed B', capacity: 8000 },
    });
    expect(shedB.statusCode).toBe(200);
    const shedBId = (shedB.json() as { data: { id: string } }).data.id;

    // 1. Owner creates a valid batch → 200, status UPCOMING.
    const createBatch = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(ownerA.token),
      payload: {
        shedId: shedAId,
        batchNumber: 'B-100',
        breed: 'Cobb 500',
        supplier: 'Hatchery Co',
        arrivalDate: '2026-09-01',
        initialBirds: 10000,
        initialAverageWeightKg: '0.05',
        costPerBird: '0.35',
        targetSaleDate: '2026-10-15',
      },
    });
    expect(createBatch.statusCode).toBe(200);
    const created = createBatch.json() as { data: { id: string; status: string } };
    batchId = created.data.id;
    expect(created.data.status).toBe('UPCOMING');

    // 2. Duplicate batchNumber on the same farm → 400 VALIDATION_ERROR.
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(ownerA.token),
      payload: {
        shedId: shedAId,
        batchNumber: 'B-100',
        breed: 'Ross 308',
        arrivalDate: '2026-09-05',
        initialBirds: 5000,
      },
    });
    expect(duplicate.statusCode).toBe(400);
    expect((duplicate.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 3. Batch pointing at a shed of ANOTHER farm → 400 VALIDATION_ERROR.
    const foreignShed = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(ownerA.token),
      payload: {
        shedId: shedBId,
        batchNumber: 'B-200',
        breed: 'Cobb 500',
        arrivalDate: '2026-09-10',
        initialBirds: 3000,
      },
    });
    expect(foreignShed.statusCode).toBe(400);
    expect((foreignShed.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 4. Cross-user GET → 404 RESOURCE_NOT_FOUND (no existence leak).
    const crossUserGet = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchId}`,
      headers: auth(ownerB.token),
    });
    expect(crossUserGet.statusCode).toBe(404);
    expect((crossUserGet.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 5. open on UPCOMING → ACTIVE; close on ACTIVE → CLOSED (reason recorded in notes).
    const open = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchId}/open`,
      headers: auth(ownerA.token),
    });
    expect(open.statusCode).toBe(200);
    expect((open.json() as { data: { status: string } }).data.status).toBe('ACTIVE');

    const close = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchId}/close`,
      headers: auth(ownerA.token),
      payload: { reason: 'End of cycle' },
    });
    expect(close.statusCode).toBe(200);
    const closed = close.json() as { data: { status: string; notes: string | null } };
    expect(closed.data.status).toBe('CLOSED');
    expect(closed.data.notes).toContain('Closed: End of cycle');

    // 7 (setup). Seed 50 daily records (first 43 carry no data; the last 7 carry the
    // mortality/feed/weight the summary aggregates — the service fetches the last 7) + 2 sales.
    const baseDate = new Date('2026-09-02');
    const last7Mortality = [10, 20, 30, 40, 50, 60, 70];
    const last7Feed = ['100.000', '200.000', '300.000', '400.000', '500.000', '600.000', '700.000'];
    const records = Array.from({ length: 50 }, (_, i) => {
      const isLast7 = i >= 43;
      const idx = i - 43;
      const recordDate = new Date(baseDate);
      recordDate.setDate(baseDate.getDate() + i);
      return {
        batchId,
        recordDate,
        birdsAtStart: 10000,
        mortality: isLast7 ? (last7Mortality[idx] ?? 0) : 0,
        birdsRemaining: 10000 - (isLast7 ? (last7Mortality[idx] ?? 0) : 0),
        feedConsumedKg: isLast7 ? last7Feed[idx] : null,
        averageWeightKg: isLast7 && idx === 6 ? '1.800' : null,
        createdBy: ownerA.userId,
      };
    });
    await prisma.dailyRecord.createMany({ data: records });

    const saleBase = new Date('2026-10-01');
    await prisma.sale.create({
      data: {
        farmId: farmAId,
        batchId,
        buyer: 'Market Buyer',
        saleDate: saleBase,
        birdsSold: 100,
        totalWeightKg: '180.000',
        ratePerKg: '220.00',
        totalAmount: '39600.00',
        outstandingAmount: '0.00',
        createdBy: ownerA.userId,
      },
    });
    const saleBase2 = new Date('2026-10-05');
    await prisma.sale.create({
      data: {
        farmId: farmAId,
        batchId,
        buyer: 'Wholesale Buyer',
        saleDate: saleBase2,
        birdsSold: 50,
        totalWeightKg: '90.000',
        ratePerKg: '220.00',
        totalAmount: '19800.00',
        outstandingAmount: '0.00',
        createdBy: ownerA.userId,
      },
    });

    // 6. open on a CLOSED batch (with records) → 400 VALIDATION_ERROR.
    const reopen = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchId}/open`,
      headers: auth(ownerA.token),
    });
    expect(reopen.statusCode).toBe(400);
    expect((reopen.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 7. Summary aggregates: currentBirds = 10000 − Σmortality(280) − ΣbirdsSold(150) = 9570.
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchId}`,
      headers: auth(ownerA.token),
    });
    expect(get.statusCode).toBe(200);
    const body = get.json() as {
      data: {
        summary: {
          currentBirds: number;
          mortalityPct: number;
          totalFeedConsumed: string;
          currentAvgWeightKg: string | null;
          fcr: { value: number | null; incomplete: boolean };
        };
        last7DailyRecords: unknown[];
      };
    };
    expect(body.data.summary.currentBirds).toBe(9570);
    expect(body.data.summary.mortalityPct).toBeCloseTo(2.8, 10);
    expect(new Prisma.Decimal(body.data.summary.totalFeedConsumed).equals(new Prisma.Decimal(2800))).toBe(true);
    expect(new Prisma.Decimal(body.data.summary.currentAvgWeightKg ?? '0').equals(new Prisma.Decimal('1.800'))).toBe(true);
    expect(body.data.summary.fcr.incomplete).toBe(false);
    expect(body.data.last7DailyRecords).toHaveLength(7);
  });
});