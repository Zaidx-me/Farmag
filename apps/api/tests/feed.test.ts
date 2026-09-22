import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { feedPurchaseSchema } from '../src/modules/feed/schema.js';

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

/** Prisma Decimal serializes as its normalized string ('100', not '100.000') — compare numerically. */
const expectDecimal = (actual: string, expected: string) => {
  expect(new Prisma.Decimal(actual).equals(new Prisma.Decimal(expected))).toBe(true);
};

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmAId = '';
let farmBId = '';
let feedItemId = '';
let feedItemBId = '';

describe('feed', () => {
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
    // Self-clean ONLY our own farms by id (cascade removes feed items, transactions, alerts).
    // Do NOT wipe all @test.dev rows — a parallel suite may be mid-flight.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces feed inventory rules: transactional stock, alerts, access and validation', async () => {
    const owner = await createUser(app, 'feed-owner@test.dev');
    const other = await createUser(app, 'feed-other@test.dev');
    const worker = await createUser(app, 'feed-worker@test.dev');

    // Farms A (owner) and B (other); worker added as WORKER member of farm A.
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Feed Farm A', location: 'Lahore' },
    });
    expect(farmA.statusCode).toBe(200);
    farmAId = (farmA.json() as { data: { id: string } }).data.id;

    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(other.token),
      payload: { name: 'Feed Farm B', location: 'Karachi' },
    });
    expect(farmB.statusCode).toBe(200);
    farmBId = (farmB.json() as { data: { id: string } }).data.id;

    const addWorker = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/members`,
      headers: auth(owner.token),
      payload: { members: [{ userId: worker.userId, role: 'WORKER' }] },
    });
    expect(addWorker.statusCode).toBe(200);

    // Batches: one in farm A (same-farm consume) and one in farm B (cross-farm consume).
    const shedA = await prisma.shed.create({
      data: { farmId: farmAId, name: 'Feed Shed A', capacity: 1000 },
    });
    const batchA = await prisma.batch.create({
      data: {
        farmId: farmAId,
        shedId: shedA.id,
        batchNumber: 'FEED-B-A',
        breed: 'Cobb 500',
        arrivalDate: new Date('2026-09-01'),
        initialBirds: 1000,
      },
    });
    const shedB = await prisma.shed.create({
      data: { farmId: farmBId, name: 'Feed Shed B', capacity: 1000 },
    });
    const batchB = await prisma.batch.create({
      data: {
        farmId: farmBId,
        shedId: shedB.id,
        batchNumber: 'FEED-B-B',
        breed: 'Ross 308',
        arrivalDate: new Date('2026-09-02'),
        initialBirds: 1000,
      },
    });

    // 1. Create feed item → 200 with currentStock stored.
    const createItem = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/feed`,
      headers: auth(owner.token),
      payload: {
        name: 'Broiler Starter',
        type: 'STARTER',
        unit: 'kg',
        currentStock: '100',
        lowStockThreshold: '200',
      },
    });
    expect(createItem.statusCode).toBe(200);
    const created = createItem.json() as { data: { id: string; currentStock: string } };
    feedItemId = created.data.id;
    expectDecimal(created.data.currentStock, '100');

    // 2. Purchase 500 → stock 600; PURCHASE transaction recorded.
    const purchase = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '500' },
    });
    expect(purchase.statusCode).toBe(200);
    expectDecimal((purchase.json() as { data: { feedItem: { currentStock: string } } }).data.feedItem.currentStock, '600');

    // 3. Consume 300 → stock 300; CONSUMPTION transaction recorded.
    const consume = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/consume`,
      headers: auth(owner.token),
      payload: { quantity: '300' },
    });
    expect(consume.statusCode).toBe(200);
    expectDecimal((consume.json() as { data: { feedItem: { currentStock: string } } }).data.feedItem.currentStock, '300');

    // 4. Consume 400 (exceeds stock 300) → 400 STOCK_INSUFFICIENT; stock unchanged, no tx row.
    const overConsume = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/consume`,
      headers: auth(owner.token),
      payload: { quantity: '400' },
    });
    expect(overConsume.statusCode).toBe(400);
    expect((overConsume.json() as { error: { code: string } }).error.code).toBe('STOCK_INSUFFICIENT');
    const stockAfterReject = await prisma.feedItem.findUnique({ where: { id: feedItemId } });
    expect(stockAfterReject?.currentStock.equals(new Prisma.Decimal('300'))).toBe(true);
    const txCountAfterReject = await prisma.feedTransaction.count({ where: { feedItemId } });
    expect(txCountAfterReject).toBe(2);

    // 5. Negative quantity → 400 VALIDATION_ERROR (decimalSchema rejects negatives).
    expect(feedPurchaseSchema.safeParse({ quantity: '-50' }).success).toBe(false);
    const negative = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '-50' },
    });
    expect(negative.statusCode).toBe(400);
    expect((negative.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 6. Consume 100 → stock 200 (== threshold) → LOW_FEED WARNING for owner + worker member.
    const consumeToThreshold = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/consume`,
      headers: auth(owner.token),
      payload: { quantity: '100' },
    });
    expect(consumeToThreshold.statusCode).toBe(200);
    expectDecimal(
      (consumeToThreshold.json() as { data: { feedItem: { currentStock: string } } }).data.feedItem.currentStock,
      '200'
    );
    const lowFeedAlerts = await prisma.alert.findMany({ where: { farmId: farmAId, type: 'LOW_FEED' } });
    expect(lowFeedAlerts.length).toBe(2);
    const alertRecipients = lowFeedAlerts.map((a) => a.userId).sort();
    expect(alertRecipients).toEqual([owner.userId, worker.userId].sort());
    for (const alert of lowFeedAlerts) {
      expect(alert.severity).toBe('WARNING');
      expect(alert.title).toContain('Broiler Starter');
    }

    // 7. Purchase with unitCost only → server-computed totalCost = unitCost × quantity (Decimal).
    const purchaseWithCost = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '100', unitCost: '50.00' },
    });
    expect(purchaseWithCost.statusCode).toBe(200);
    expectDecimal(
      (purchaseWithCost.json() as { data: { feedItem: { currentStock: string } } }).data.feedItem.currentStock,
      '300'
    );
    const costTx = await prisma.feedTransaction.findFirst({
      where: { feedItemId, type: 'PURCHASE', unitCost: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    expect(costTx).not.toBeNull();
    expect(new Prisma.Decimal(costTx!.totalCost ?? '0').equals(new Prisma.Decimal('5000.00'))).toBe(true);

    // 8. Update strips currentStock — stock changes ONLY via purchase/consume.
    const updateItem = await app.inject({
      method: 'PATCH',
      url: `/api/v1/feed/${feedItemId}`,
      headers: auth(owner.token),
      payload: { name: 'Broiler Starter v2', currentStock: '999' },
    });
    expect(updateItem.statusCode).toBe(200);
    const updated = updateItem.json() as { data: { name: string; currentStock: string } };
    expect(updated.data.name).toBe('Broiler Starter v2');
    expectDecimal(updated.data.currentStock, '300');

    // 9. Cross-farm access → 404 (no existence leak): owner A lists farm B feed, PATCHes farm B item.
    const crossFarmList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmBId}/feed`,
      headers: auth(owner.token),
    });
    expect(crossFarmList.statusCode).toBe(404);
    expect((crossFarmList.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    const farmBItem = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/feed`,
      headers: auth(other.token),
      payload: { name: 'Farm B Feed', type: 'GROWER', unit: 'kg', currentStock: '50', lowStockThreshold: '10' },
    });
    expect(farmBItem.statusCode).toBe(200);
    feedItemBId = (farmBItem.json() as { data: { id: string } }).data.id;

    const crossFarmPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/feed/${feedItemBId}`,
      headers: auth(owner.token),
      payload: { name: 'Hijack' },
    });
    expect(crossFarmPatch.statusCode).toBe(404);
    expect((crossFarmPatch.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 10. WORKER member can list but cannot purchase → 403 FORBIDDEN.
    const workerList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/feed`,
      headers: auth(worker.token),
    });
    expect(workerList.statusCode).toBe(200);

    const workerPurchase = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(worker.token),
      payload: { quantity: '10' },
    });
    expect(workerPurchase.statusCode).toBe(403);
    expect((workerPurchase.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // 11. Consume with a batch of ANOTHER farm → 400 VALIDATION_ERROR.
    const crossFarmBatch = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/consume`,
      headers: auth(owner.token),
      payload: { quantity: '10', batchId: batchB.id },
    });
    expect(crossFarmBatch.statusCode).toBe(400);
    expect((crossFarmBatch.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 12. Consume with a SAME-farm batch → 200; CONSUMPTION tx carries the batchId.
    const consumeWithBatch = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/consume`,
      headers: auth(owner.token),
      payload: { quantity: '10', batchId: batchA.id },
    });
    expect(consumeWithBatch.statusCode).toBe(200);
    expectDecimal(
      (consumeWithBatch.json() as { data: { feedItem: { currentStock: string } } }).data.feedItem.currentStock,
      '290'
    );
    const batchTx = await prisma.feedTransaction.findFirst({
      where: { feedItemId, type: 'CONSUMPTION', batchId: batchA.id },
    });
    expect(batchTx).not.toBeNull();

    // 13. Transactions list: pagination + from/to date filters.
    const txPage = await app.inject({
      method: 'GET',
      url: `/api/v1/feed/${feedItemId}/transactions?page=1&pageSize=2`,
      headers: auth(owner.token),
    });
    expect(txPage.statusCode).toBe(200);
    const txPageBody = txPage.json() as {
      data: { items: unknown[]; meta: { total: number; totalPages: number } };
    };
    expect(txPageBody.data.items).toHaveLength(2);
    expect(txPageBody.data.meta.total).toBe(5);
    expect(txPageBody.data.meta.totalPages).toBe(3);

    const txFullYear = await app.inject({
      method: 'GET',
      url: `/api/v1/feed/${feedItemId}/transactions?from=2026-01-01&to=2026-12-31`,
      headers: auth(owner.token),
    });
    expect(txFullYear.statusCode).toBe(200);
    expect((txFullYear.json() as { data: { meta: { total: number } } }).data.meta.total).toBe(5);

    const txEmptyRange = await app.inject({
      method: 'GET',
      url: `/api/v1/feed/${feedItemId}/transactions?to=2020-01-01`,
      headers: auth(owner.token),
    });
    expect(txEmptyRange.statusCode).toBe(200);
    expect((txEmptyRange.json() as { data: { meta: { total: number } } }).data.meta.total).toBe(0);
  });
});