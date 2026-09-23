import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

/** UTC date string N days from now (YYYY-MM-DD) — matches the services' UTC-midnight @db.Date storage. */
const dateInDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface PushResult {
  operationId: string;
  status: string;
  entityId?: string;
  error?: { code: string; message: string };
}

interface PullBody {
  data: {
    changes: Array<{ entity: string; entityId: string; updatedAt: string; data: Record<string, unknown> }>;
    nextCursor: string | null;
  };
}

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmId = '';
let ownerUserId = '';
let outsiderUserId = '';

describe('sync', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farm first (cascade removes sheds, batches,
    // records, feed, medicines, vaccinations, sales), then the users we registered
    // (SyncOperation.userId FK is cascade on User delete). No global @test.dev wipe.
    await prisma.farm.deleteMany({ where: { id: { in: [farmId].filter(Boolean) } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, outsiderUserId].filter(Boolean) } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('sync: idempotent push, batch continuation, cursor pull, cross-user isolation', async () => {
    // 2 register calls total; emails @test.dev unique.
    const owner = await createUser(app, 'sync-owner@test.dev');
    const outsider = await createUser(app, 'sync-outsider@test.dev');
    ownerUserId = owner.userId;
    outsiderUserId = outsider.userId;

    // Farm + shed + batch (initialBirds 100).
    const farm = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Sync Farm', location: 'Lahore' },
    });
    expect(farm.statusCode).toBe(200);
    farmId = (farm.json() as { data: { id: string } }).data.id;

    const shed = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sheds`,
      headers: auth(owner.token),
      payload: { name: 'Sync Shed', capacity: 1000 },
    });
    expect(shed.statusCode).toBe(200);
    const shedId = (shed.json() as { data: { id: string } }).data.id;

    const batch = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/batches`,
      headers: auth(owner.token),
      payload: {
        shedId,
        batchNumber: 'SY-B-100',
        breed: 'Cobb 500',
        arrivalDate: dateInDays(-10),
        initialBirds: 100,
        initialAverageWeightKg: '1.000',
      },
    });
    expect(batch.statusCode).toBe(200);
    const batchId = (batch.json() as { data: { id: string } }).data.id;

    // ---- Scenario 1: push a daily-record op → record created + SYNCED w/ server entityId.
    const dailyOp = {
      operationId: crypto.randomUUID(),
      entity: 'dailyRecord',
      operationType: 'CREATE',
      entityId: crypto.randomUUID(),
      payload: {
        batchId,
        recordDate: dateInDays(0),
        birdsAtStart: 100,
        mortality: 5,
        averageWeightKg: '1.200',
      },
      createdAt: new Date().toISOString(),
    };
    const push1 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: auth(owner.token),
      payload: { operations: [dailyOp] },
    });
    expect(push1.statusCode).toBe(200);
    const push1Body = push1.json() as { data: { results: PushResult[] } };
    expect(push1Body.data.results).toHaveLength(1);
    expect(push1Body.data.results[0].status).toBe('SYNCED');
    const serverRecordId = push1Body.data.results[0].entityId;
    expect(serverRecordId).toBeTruthy();
    expect(await prisma.dailyRecord.count({ where: { id: serverRecordId } })).toBe(1);

    // ---- Scenario 2: push SAME op again → SYNCED with SAME entityId, count == 1.
    const push2 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: auth(owner.token),
      payload: { operations: [dailyOp] },
    });
    expect(push2.statusCode).toBe(200);
    const push2Body = push2.json() as { data: { results: PushResult[] } };
    expect(push2Body.data.results[0].status).toBe('SYNCED');
    expect(push2Body.data.results[0].entityId).toBe(serverRecordId);
    expect(await prisma.dailyRecord.count({ where: { batchId } })).toBe(1);

    // ---- Scenario 3: batch with one bad expense → that op FAILED VALIDATION_ERROR,
    //      sibling sale op still applied (batch continuation).
    const badExpenseOp = {
      operationId: crypto.randomUUID(),
      entity: 'expense',
      operationType: 'CREATE',
      entityId: crypto.randomUUID(),
      payload: {
        farmId,
        category: 'NOT_A_CATEGORY',
        description: 'bad expense',
        amount: '100',
        expenseDate: dateInDays(0),
      },
      createdAt: new Date().toISOString(),
    };
    const goodSaleOp = {
      operationId: crypto.randomUUID(),
      entity: 'sale',
      operationType: 'CREATE',
      entityId: crypto.randomUUID(),
      payload: {
        farmId,
        batchId,
        buyer: 'Sync Buyer',
        saleDate: dateInDays(0),
        birdsSold: 10,
        totalWeightKg: '100',
        ratePerKg: '250',
      },
      createdAt: new Date().toISOString(),
    };
    const push3 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: auth(owner.token),
      payload: { operations: [badExpenseOp, goodSaleOp] },
    });
    expect(push3.statusCode).toBe(200);
    const push3Body = push3.json() as { data: { results: PushResult[] } };
    expect(push3Body.data.results).toHaveLength(2);
    expect(push3Body.data.results[0].status).toBe('FAILED');
    expect(push3Body.data.results[0].error?.code).toBe('VALIDATION_ERROR');
    expect(push3Body.data.results[1].status).toBe('SYNCED');
    const saleId = push3Body.data.results[1].entityId;
    expect(saleId).toBeTruthy();
    expect(await prisma.sale.count({ where: { id: saleId } })).toBe(1);
    // The bad expense must NOT have been created.
    expect(await prisma.expense.count({ where: { farmId, category: 'NOT_A_CATEGORY' } })).toBe(0);

    // ---- Scenario 4: pull.
    const pull1 = await app.inject({
      method: 'GET',
      url: '/api/v1/sync/pull',
      headers: auth(owner.token),
    });
    expect(pull1.statusCode).toBe(200);
    const pull1Body = pull1.json() as PullBody;
    const entities = pull1Body.data.changes.map((c) => c.entity);
    expect(entities).toContain('dailyRecord');
    expect(entities).toContain('sale');
    // Sorted ASC by updatedAt.
    const times = pull1Body.data.changes.map((c) => new Date(c.updatedAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // Serialization discipline: dates are ISO strings, Decimals are strings.
    const recordChange = pull1Body.data.changes.find((c) => c.entityId === serverRecordId);
    expect(recordChange).toBeDefined();
    expect(typeof recordChange?.data.averageWeightKg).toBe('string');
    expect(typeof recordChange?.data.recordDate).toBe('string');

    // ?cursor= returns only newer: a future cursor → nothing; an old cursor → everything.
    const futureCursor = new Date(Date.now() + 60_000).toISOString();
    const pullFuture = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?cursor=${encodeURIComponent(futureCursor)}`,
      headers: auth(owner.token),
    });
    const pullFutureBody = pullFuture.json() as PullBody;
    expect(pullFutureBody.data.changes).toHaveLength(0);

    const oldCursor = new Date(Date.now() - 60_000).toISOString();
    const pullOld = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?cursor=${encodeURIComponent(oldCursor)}`,
      headers: auth(owner.token),
    });
    const pullOldBody = pullOld.json() as PullBody;
    expect(pullOldBody.data.changes.length).toBeGreaterThanOrEqual(pull1Body.data.changes.length);

    // ?limit=2 → ≤2 changes + nextCursor non-null; follow-up with nextCursor returns the
    // remaining changes with no overlap.
    const pullLimit = await app.inject({
      method: 'GET',
      url: '/api/v1/sync/pull?limit=2',
      headers: auth(owner.token),
    });
    expect(pullLimit.statusCode).toBe(200);
    const pullLimitBody = pullLimit.json() as PullBody;
    expect(pullLimitBody.data.changes.length).toBeLessThanOrEqual(2);
    expect(pullLimitBody.data.nextCursor).not.toBeNull();
    const firstPageIds = new Set(pullLimitBody.data.changes.map((c) => c.entityId));
    const pullNext = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?cursor=${encodeURIComponent(pullLimitBody.data.nextCursor as string)}`,
      headers: auth(owner.token),
    });
    expect(pullNext.statusCode).toBe(200);
    const pullNextBody = pullNext.json() as PullBody;
    const nextPageIds = pullNextBody.data.changes.map((c) => c.entityId);
    expect(nextPageIds.every((id) => !firstPageIds.has(id))).toBe(true);

    // ---- Scenario 5: cross-user isolation — outsider with NO farm access sees nothing.
    const outsiderPull = await app.inject({
      method: 'GET',
      url: '/api/v1/sync/pull',
      headers: auth(outsider.token),
    });
    expect(outsiderPull.statusCode).toBe(200);
    const outsiderBody = outsiderPull.json() as PullBody;
    expect(outsiderBody.data.changes).toHaveLength(0);
    expect(outsiderBody.data.nextCursor).toBeNull();

    // ---- Scenario 6: unsupported entity / unsupported operationType → per-op FAILED,
    //      batch continues.
    const badEntityOp = {
      operationId: crypto.randomUUID(),
      entity: 'chicken',
      operationType: 'CREATE',
      payload: {},
      createdAt: new Date().toISOString(),
    };
    const badTypeOp = {
      operationId: crypto.randomUUID(),
      entity: 'expense',
      operationType: 'DELETE',
      payload: {},
      createdAt: new Date().toISOString(),
    };
    const push6 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: auth(owner.token),
      payload: { operations: [badEntityOp, badTypeOp] },
    });
    expect(push6.statusCode).toBe(200);
    const push6Body = push6.json() as { data: { results: PushResult[] } };
    expect(push6Body.data.results).toHaveLength(2);
    expect(push6Body.data.results[0].status).toBe('FAILED');
    expect(push6Body.data.results[0].error?.code).toBe('VALIDATION_ERROR');
    expect(push6Body.data.results[1].status).toBe('FAILED');
    expect(push6Body.data.results[1].error?.code).toBe('VALIDATION_ERROR');
  });
});