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

/** Prisma Decimal serializes as its normalized string ('1500.5', not '1500.50') — compare numerically. */
const expectDecimal = (actual: string, expected: string) => {
  expect(new Prisma.Decimal(actual).equals(new Prisma.Decimal(expected))).toBe(true);
};

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
// No global @test.dev wipe — a parallel suite may be mid-flight.
let farmAId = '';
let farmBId = '';
let batchBId = '';
let ownerUserId = '';
let accountantUserId = '';
let managerUserId = '';
let workerUserId = '';
let otherUserId = '';

describe('expenses', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farms first (cascade removes sheds, batches,
    // expenses), then the users we registered (Farm.ownerId FK is NOT cascade on User
    // delete, so farms must go first). Keeps the suite re-runnable with no cleanup
    // between runs while never touching another suite's rows. No global @test.dev wipe.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, accountantUserId, managerUserId, workerUserId, otherUserId].filter(Boolean) } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces the finance matrix, filters, cross-farm guards, and receiptObjectKey', async () => {
    // 5 register calls total (≤ ~6); all emails @test.dev unique.
    const owner = await createUser(app, 'expenses-owner@test.dev');
    const accountant = await createUser(app, 'expenses-accountant@test.dev');
    const manager = await createUser(app, 'expenses-manager@test.dev');
    const worker = await createUser(app, 'expenses-worker@test.dev');
    const other = await createUser(app, 'expenses-other@test.dev');
    ownerUserId = owner.userId;
    accountantUserId = accountant.userId;
    managerUserId = manager.userId;
    workerUserId = worker.userId;
    otherUserId = other.userId;

    // Farm A owned by OWNER; accountant/manager/worker added as members (one call).
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Expenses Farm A', location: 'Lahore' },
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
          { userId: manager.userId, role: 'MANAGER' },
          { userId: worker.userId, role: 'WORKER' },
        ],
      },
    });
    expect(addMembers.statusCode).toBe(200);

    // Farm B owned by `other` with a shed + batch — for the cross-farm 404 and the
    // cross-farm batchId 400 tests.
    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(other.token),
      payload: { name: 'Expenses Farm B', location: 'Karachi' },
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
        batchNumber: 'EXP-B-200',
        breed: 'Ross 308',
        arrivalDate: '2026-09-02',
        initialBirds: 5000,
      },
    });
    expect(batchB.statusCode).toBe(200);
    batchBId = (batchB.json() as { data: { id: string } }).data.id;

    // 1. ACCOUNTANT creates expense → 200; amount stored (Decimal passthrough);
    //    paymentStatus defaults to PAID.
    const accountantCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(accountant.token),
      payload: {
        category: 'MEDICINE',
        description: 'Antibiotics course',
        amount: '1500.50',
        expenseDate: dateInDays(0),
      },
    });
    expect(accountantCreate.statusCode).toBe(200);
    const created = accountantCreate.json() as {
      data: { id: string; amount: string; paymentStatus: string; farmId: string; createdBy: string; expenseDate: string };
    };
    expectDecimal(created.data.amount, '1500.50');
    expect(created.data.paymentStatus).toBe('PAID');
    expect(created.data.farmId).toBe(farmAId);
    expect(created.data.createdBy).toBe(accountant.userId);
    expect(created.data.expenseDate.slice(0, 10)).toBe(dateInDays(0));
    const expense1Id = created.data.id;

    // 2. SIGNATURE FINANCE-MATRIX ASSERT: MANAGER (a write role in every other module)
    //    PATCHes an expense → 403 FORBIDDEN. Only OWNER + ACCOUNTANT write expenses.
    const managerPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/expenses/${expense1Id}`,
      headers: auth(manager.token),
      payload: { description: 'Manager edit attempt' },
    });
    expect(managerPatch.statusCode).toBe(403);
    expect((managerPatch.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    // The row must be unchanged after the rejected PATCH.
    const afterManagerPatch = await prisma.expense.findUnique({ where: { id: expense1Id } });
    expect(afterManagerPatch?.description).toBe('Antibiotics course');

    // 3. Cross-farm expense GET → 404 (existence leak guard): an expense that EXISTS on
    //    farm B is indistinguishable from absent for a non-member of farm B.
    const farmBExpense = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/expenses`,
      headers: auth(other.token),
      payload: { category: 'OTHER', description: 'Farm B expense', amount: '99.99', expenseDate: dateInDays(0) },
    });
    expect(farmBExpense.statusCode).toBe(200);
    const farmBExpenseId = (farmBExpense.json() as { data: { id: string } }).data.id;

    const crossFarmGet = await app.inject({
      method: 'GET',
      url: `/api/v1/expenses/${farmBExpenseId}`,
      headers: auth(accountant.token),
    });
    expect(crossFarmGet.statusCode).toBe(404);
    expect((crossFarmGet.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // WORKER also gets 404 on the same cross-farm GET (any non-member role).
    const crossFarmGetWorker = await app.inject({
      method: 'GET',
      url: `/api/v1/expenses/${farmBExpenseId}`,
      headers: auth(worker.token),
    });
    expect(crossFarmGetWorker.statusCode).toBe(404);

    // 4. Filter by category + date range returns only matches.
    const oldFeed = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(accountant.token),
      payload: { category: 'FEED', description: 'Old feed order', amount: '100.00', expenseDate: dateInDays(-10) },
    });
    expect(oldFeed.statusCode).toBe(200);
    const oldFeedId = (oldFeed.json() as { data: { id: string } }).data.id;

    const recentLabour = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(accountant.token),
      payload: { category: 'LABOUR', description: 'Recent labour payment', amount: '200.00', expenseDate: dateInDays(0) },
    });
    expect(recentLabour.statusCode).toBe(200);
    const recentLabourId = (recentLabour.json() as { data: { id: string } }).data.id;

    const listFeed = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/expenses?from=${dateInDays(-11)}&to=${dateInDays(-9)}&category=FEED`,
      headers: auth(accountant.token),
    });
    expect(listFeed.statusCode).toBe(200);
    const listFeedBody = listFeed.json() as {
      data: { items: Array<{ id: string; description: string }>; meta: { total: number; page: number } };
    };
    expect(listFeedBody.data.items.map((e) => e.id)).toEqual([oldFeedId]);
    expect(listFeedBody.data.meta.total).toBe(1);

    const listLabour = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/expenses?from=${dateInDays(-1)}&to=${dateInDays(1)}&category=LABOUR`,
      headers: auth(accountant.token),
    });
    expect(listLabour.statusCode).toBe(200);
    const listLabourBody = listLabour.json() as { data: { items: Array<{ id: string; description: string }> } };
    expect(listLabourBody.data.items.map((e) => e.id)).toEqual([recentLabourId]);

    // Read is open to EVERY accessible farm role — WORKER can list and get.
    const workerList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/expenses?page=1&pageSize=5`,
      headers: auth(worker.token),
    });
    expect(workerList.statusCode).toBe(200);
    const workerGet = await app.inject({
      method: 'GET',
      url: `/api/v1/expenses/${expense1Id}`,
      headers: auth(worker.token),
    });
    expect(workerGet.statusCode).toBe(200);

    // 5. OWNER creates → 200; ACCOUNTANT update → 200; ACCOUNTANT delete → 200;
    //    WORKER create → 403.
    const ownerCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(owner.token),
      payload: {
        category: 'ELECTRICITY',
        description: 'Electricity bill',
        amount: '75.25',
        expenseDate: dateInDays(0),
        paymentStatus: 'PENDING',
      },
    });
    expect(ownerCreate.statusCode).toBe(200);
    const ownerExpense = ownerCreate.json() as { data: { id: string; paymentStatus: string } };
    expect(ownerExpense.data.paymentStatus).toBe('PENDING');
    const ownerExpenseId = ownerExpense.data.id;

    const workerCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(worker.token),
      payload: { category: 'OTHER', description: 'Worker attempt', amount: '10.00', expenseDate: dateInDays(0) },
    });
    expect(workerCreate.statusCode).toBe(403);
    expect((workerCreate.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const accountantUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/expenses/${ownerExpenseId}`,
      headers: auth(accountant.token),
      payload: { description: 'Electricity bill (reconciled)', amount: '80.00', paymentStatus: 'PAID' },
    });
    expect(accountantUpdate.statusCode).toBe(200);
    const updated = accountantUpdate.json() as { data: { description: string; amount: string; paymentStatus: string } };
    expect(updated.data.description).toBe('Electricity bill (reconciled)');
    expectDecimal(updated.data.amount, '80.00');
    expect(updated.data.paymentStatus).toBe('PAID');

    const accountantDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/expenses/${ownerExpenseId}`,
      headers: auth(accountant.token),
    });
    expect(accountantDelete.statusCode).toBe(200);
    expect((accountantDelete.json() as { data: { success: boolean } }).data.success).toBe(true);
    expect(await prisma.expense.findUnique({ where: { id: ownerExpenseId } })).toBeNull();

    // 6. batchId belonging to ANOTHER farm → 400 VALIDATION_ERROR (present-but-wrong-farm
    //    is a validation mismatch, not a 404).
    const crossFarmBatch = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(accountant.token),
      payload: {
        batchId: batchBId,
        category: 'FEED',
        description: 'Feed for wrong farm',
        amount: '50.00',
        expenseDate: dateInDays(0),
      },
    });
    expect(crossFarmBatch.statusCode).toBe(400);
    expect((crossFarmBatch.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 7. receiptObjectKey accepted at the route boundary and persisted to the model column.
    const receiptCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: auth(owner.token),
      payload: {
        category: 'TRANSPORT',
        description: 'Diesel for pickup',
        amount: '300.00',
        expenseDate: dateInDays(0),
        receiptObjectKey: 'receipts/expenses/t20-key-1',
      },
    });
    expect(receiptCreate.statusCode).toBe(200);
    const receiptExpenseId = (receiptCreate.json() as { data: { id: string } }).data.id;
    const storedReceipt = await prisma.expense.findUnique({ where: { id: receiptExpenseId } });
    expect(storedReceipt?.receiptObjectKey).toBe('receipts/expenses/t20-key-1');
    expect(storedReceipt?.farmId).toBe(farmAId);
  });
});
