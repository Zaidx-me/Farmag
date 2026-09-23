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

/** Poll a predicate until it holds (≤2s) — guards the fire-and-forget lazy-evaluate race. */
async function pollUntil(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(await predicate()).toBe(true);
}

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmId = '';
let ownerUserId = '';
let memberUserId = '';

describe('alerts', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    // Let in-flight fire-and-forget lazy evaluates (fired by the GET/read-all calls)
    // settle before cleanup — otherwise they race the farm/user delete and log FK
    // violations (caught by the generator's try/catch, but noisy).
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Self-clean ONLY our own rows by id: farm first (cascade removes sheds, batches,
    // records, feed, medicines, vaccinations, sales), then the users we registered
    // (Farm.ownerId FK is NOT cascade on User delete). No global @test.dev wipe.
    await prisma.farm.deleteMany({ where: { id: { in: [farmId].filter(Boolean) } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, memberUserId].filter(Boolean) } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('alerts: generator extension, lazy evaluate, dedupe parity and read paths', async () => {
    // 2 register calls total; emails @test.dev unique.
    const owner = await createUser(app, 'alerts-owner@test.dev');
    const member = await createUser(app, 'alerts-member@test.dev');
    ownerUserId = owner.userId;
    memberUserId = member.userId;

    // Farm + shed + batch (initialBirds 100, initialAverageWeightKg 1.000 for LOW_WEIGHT);
    // member added as WORKER.
    const farm = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Alerts Farm', location: 'Lahore' },
    });
    expect(farm.statusCode).toBe(200);
    farmId = (farm.json() as { data: { id: string } }).data.id;

    const shed = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sheds`,
      headers: auth(owner.token),
      payload: { name: 'Alerts Shed', capacity: 1000 },
    });
    expect(shed.statusCode).toBe(200);
    const shedId = (shed.json() as { data: { id: string } }).data.id;

    const batch = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/batches`,
      headers: auth(owner.token),
      payload: {
        shedId,
        batchNumber: 'AL-B-100',
        breed: 'Cobb 500',
        arrivalDate: dateInDays(-10),
        initialBirds: 100,
        initialAverageWeightKg: '1.000',
      },
    });
    expect(batch.statusCode).toBe(200);
    const batchId = (batch.json() as { data: { id: string } }).data.id;

    const addMember = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/members`,
      headers: auth(owner.token),
      payload: { members: [{ userId: member.userId, role: 'WORKER' }] },
    });
    expect(addMember.statusCode).toBe(200);

    // 1. HIGH_MORTALITY + LOW_WEIGHT: 10% mortality record (avg 0.400 < 1.000/2) via API.
    //    The daily-records create path AWAITS evaluate — deterministic.
    const record = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchId}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: dateInDays(0), birdsAtStart: 100, mortality: 10, averageWeightKg: '0.400' },
    });
    expect(record.statusCode).toBe(200);

    const alertsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/alerts',
      headers: auth(owner.token),
    });
    expect(alertsRes.statusCode).toBe(200);
    const alertsBody = alertsRes.json() as {
      data: {
        items: Array<{
          id: string;
          userId: string;
          type: string;
          severity: string;
          batchId: string | null;
          title: string;
          isRead: boolean;
        }>;
      };
    };
    const highMortality = alertsBody.data.items.filter((a) => a.type === 'HIGH_MORTALITY');
    expect(highMortality).toHaveLength(1);
    expect(highMortality[0].severity).toBe('CRITICAL');
    expect(highMortality[0].batchId).toBe(batchId);
    expect(highMortality[0].title).toContain('AL-B-100');
    const lowWeight = alertsBody.data.items.filter((a) => a.type === 'LOW_WEIGHT');
    expect(lowWeight).toHaveLength(1);
    expect(lowWeight[0].severity).toBe('WARNING');
    expect(lowWeight[0].batchId).toBe(batchId);

    // 2. LOW_FEED + dedupe: feed item at/below threshold; two evaluate triggers (feed
    //    purchases AWAIT evaluate) → exactly ONE unread LOW_FEED for the owner.
    const feedItem = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/feed`,
      headers: auth(owner.token),
      payload: { name: 'Broiler Starter', type: 'STARTER', unit: 'kg', currentStock: '5', lowStockThreshold: '10' },
    });
    expect(feedItem.statusCode).toBe(200);
    const feedItemId = (feedItem.json() as { data: { id: string } }).data.id;

    const purchase1 = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '1' },
    });
    expect(purchase1.statusCode).toBe(200);
    const lowFeedAfterFirst = await prisma.alert.count({
      where: { userId: owner.userId, type: 'LOW_FEED', isRead: false },
    });
    expect(lowFeedAfterFirst).toBe(1);

    const purchase2 = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '1' },
    });
    expect(purchase2.statusCode).toBe(200);
    const lowFeedAfterSecond = await prisma.alert.count({
      where: { userId: owner.userId, type: 'LOW_FEED', isRead: false },
    });
    expect(lowFeedAfterSecond).toBe(1);

    // 3. VACCINATION_DUE dedupe parity: vaccination today+1 via API; the vaccinations
    //    list path (T19 inline) emits first, then the generator (via a feed purchase)
    //    emits — the 7-day dedupe key (userId,type,farmId,batchId,title) collides →
    //    exactly ONE unread despite both emission paths.
    const vaccination = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'Newcastle', scheduledDate: dateInDays(1) },
    });
    expect(vaccination.statusCode).toBe(200);

    const vaxList = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchId}/vaccinations`,
      headers: auth(owner.token),
    });
    expect(vaxList.statusCode).toBe(200);
    const dueAfterInline = await prisma.alert.count({
      where: { userId: owner.userId, type: 'VACCINATION_DUE', isRead: false },
    });
    expect(dueAfterInline).toBe(1);

    const purchase3 = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '1' },
    });
    expect(purchase3.statusCode).toBe(200);
    const dueAfterGenerator = await prisma.alert.count({
      where: { userId: owner.userId, type: 'VACCINATION_DUE', isRead: false },
    });
    expect(dueAfterGenerator).toBe(1);

    // 4. MEDICINE_EXPIRY dedupe parity: medicine expiry today+10 via API; generator
    //    (feed purchase) emits first, then the medicine list path (T18 inline) — dedupe
    //    key (userId,type,farmId,batchId=null,title) collides → exactly ONE unread.
    const medicine = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/medicines`,
      headers: auth(owner.token),
      payload: {
        name: 'Amoxicillin',
        unit: 'bottle',
        currentStock: '100',
        lowStockThreshold: '10',
        expiryDate: dateInDays(10),
      },
    });
    expect(medicine.statusCode).toBe(200);

    const purchase4 = await app.inject({
      method: 'POST',
      url: `/api/v1/feed/${feedItemId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '1' },
    });
    expect(purchase4.statusCode).toBe(200);
    const expiryAfterGenerator = await prisma.alert.count({
      where: { userId: owner.userId, type: 'MEDICINE_EXPIRY', isRead: false },
    });
    expect(expiryAfterGenerator).toBe(1);

    const medList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmId}/medicines`,
      headers: auth(owner.token),
    });
    expect(medList.statusCode).toBe(200);
    const expiryAfterInline = await prisma.alert.count({
      where: { userId: owner.userId, type: 'MEDICINE_EXPIRY', isRead: false },
    });
    expect(expiryAfterInline).toBe(1);

    // 5. PAYMENT_OVERDUE + SALE_DATE_APPROACHING: sales create AWAITS evaluate (Task 23
    //    wiring) → deterministic. PENDING sale 40 days ago → PAYMENT_OVERDUE; sale in
    //    +3 days → SALE_DATE_APPROACHING INFO.
    const overdueSale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sales`,
      headers: auth(owner.token),
      payload: {
        batchId,
        buyer: 'Overdue Buyer',
        saleDate: dateInDays(-40),
        birdsSold: 10,
        totalWeightKg: '100',
        ratePerKg: '250',
      },
    });
    expect(overdueSale.statusCode).toBe(200);
    const overdueAlerts = await prisma.alert.count({
      where: { userId: owner.userId, type: 'PAYMENT_OVERDUE', isRead: false },
    });
    expect(overdueAlerts).toBe(1);

    const approachingSale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/sales`,
      headers: auth(owner.token),
      payload: {
        batchId,
        buyer: 'Approaching Buyer',
        saleDate: dateInDays(3),
        birdsSold: 10,
        totalWeightKg: '100',
        ratePerKg: '250',
      },
    });
    expect(approachingSale.statusCode).toBe(200);
    const approachingAlerts = await prisma.alert.count({
      where: { userId: owner.userId, type: 'SALE_DATE_APPROACHING', isRead: false },
    });
    expect(approachingAlerts).toBe(1);

    // 6. Read paths.
    // ?unread=true → only unread.
    const unreadRes = await app.inject({
      method: 'GET',
      url: '/api/v1/alerts?unread=true',
      headers: auth(owner.token),
    });
    expect(unreadRes.statusCode).toBe(200);
    const unreadBody = unreadRes.json() as { data: { items: Array<{ id: string; isRead: boolean }> } };
    expect(unreadBody.data.items.length).toBeGreaterThan(0);
    expect(unreadBody.data.items.every((a) => a.isRead === false)).toBe(true);

    // ?type=HIGH_MORTALITY → only that type.
    const typeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/alerts?type=HIGH_MORTALITY',
      headers: auth(owner.token),
    });
    expect(typeRes.statusCode).toBe(200);
    const typeBody = typeRes.json() as { data: { items: Array<{ type: string }> } };
    expect(typeBody.data.items.length).toBeGreaterThan(0);
    expect(typeBody.data.items.every((a) => a.type === 'HIGH_MORTALITY')).toBe(true);

    // Mark single read → isRead true + readAt set.
    const targetId = unreadBody.data.items[0].id;
    const markRead = await app.inject({
      method: 'PATCH',
      url: `/api/v1/alerts/${targetId}/read`,
      headers: auth(owner.token),
    });
    expect(markRead.statusCode).toBe(200);
    const marked = markRead.json() as { data: { isRead: boolean; readAt: string | null } };
    expect(marked.data.isRead).toBe(true);
    expect(marked.data.readAt).not.toBeNull();

    // 7. Cross-user: the member sees ONLY their own alerts (no farm leak); a member's
    //    alert id is FOREIGN to the owner → 404 (no existence leak).
    const memberAlerts = await app.inject({
      method: 'GET',
      url: '/api/v1/alerts',
      headers: auth(member.token),
    });
    expect(memberAlerts.statusCode).toBe(200);
    const memberBody = memberAlerts.json() as { data: { items: Array<{ id: string; userId: string }> } };
    expect(memberBody.data.items.length).toBeGreaterThan(0);
    expect(memberBody.data.items.every((a) => a.userId === member.userId)).toBe(true);

    const foreign = await app.inject({
      method: 'PATCH',
      url: `/api/v1/alerts/${memberBody.data.items[0].id}/read`,
      headers: auth(owner.token),
    });
    expect(foreign.statusCode).toBe(404);
    expect((foreign.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // read-all → { count } equals the owner's unread count; afterwards all read.
    const unreadBefore = await prisma.alert.count({ where: { userId: owner.userId, isRead: false } });
    const readAll = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/read-all',
      headers: auth(owner.token),
    });
    expect(readAll.statusCode).toBe(200);
    const readAllBody = readAll.json() as { data: { count: number } };
    expect(readAllBody.data.count).toBe(unreadBefore);
    await pollUntil(async () => {
      const unread = await prisma.alert.count({ where: { userId: owner.userId, isRead: false } });
      return unread === 0;
    });
  });
});