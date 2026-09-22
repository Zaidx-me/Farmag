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

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmAId = '';
let farmBId = '';
let batchAId = '';
let batchBId = '';
let memberUserId = '';

describe('daily-records', () => {
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
    // Self-clean ONLY our own farms by id (cascade removes sheds, batches, records, alerts).
    // Do NOT wipe all @test.dev rows — a parallel suite may be mid-flight.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces daily-record business rules, alert generation and batch activation', async () => {
    const owner = await createUser(app, 'daily-records-owner@test.dev');
    const member = await createUser(app, 'daily-records-member@test.dev');
    const other = await createUser(app, 'daily-records-other@test.dev');
    memberUserId = member.userId;

    // Farm A (owner) with shed + UPCOMING batch; member added as WORKER.
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Daily Records Farm A', location: 'Lahore' },
    });
    expect(farmA.statusCode).toBe(200);
    farmAId = (farmA.json() as { data: { id: string } }).data.id;

    const shedA = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: auth(owner.token),
      payload: { name: 'Broiler Shed A', capacity: 12000 },
    });
    expect(shedA.statusCode).toBe(200);
    const shedAId = (shedA.json() as { data: { id: string } }).data.id;

    const batchA = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: auth(owner.token),
      payload: {
        shedId: shedAId,
        batchNumber: 'DR-B-100',
        breed: 'Cobb 500',
        arrivalDate: '2026-09-01',
        initialBirds: 10000,
      },
    });
    expect(batchA.statusCode).toBe(200);
    batchAId = (batchA.json() as { data: { id: string } }).data.id;

    const addMember = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/members`,
      headers: auth(owner.token),
      payload: { members: [{ userId: member.userId, role: 'WORKER' }] },
    });
    expect(addMember.statusCode).toBe(200);

    // Farm B (other user) with shed + batch — for the cross-user 404 test.
    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(other.token),
      payload: { name: 'Daily Records Farm B', location: 'Karachi' },
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
        batchNumber: 'DR-B-200',
        breed: 'Ross 308',
        arrivalDate: '2026-09-02',
        initialBirds: 5000,
      },
    });
    expect(batchB.statusCode).toBe(200);
    batchBId = (batchB.json() as { data: { id: string } }).data.id;

    // 1+8. First record on the UPCOMING batch → 200, birdsRemaining server-computed,
    // and the batch transitions to ACTIVE inside the same transaction.
    const createRecord1 = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: '2026-09-10', birdsAtStart: 10000, mortality: 100 },
    });
    expect(createRecord1.statusCode).toBe(200);
    const record1 = createRecord1.json() as { data: { id: string; birdsRemaining: number } };
    expect(record1.data.birdsRemaining).toBe(9900);

    const batchAfterFirst = await prisma.batch.findUnique({ where: { id: batchAId } });
    expect(batchAfterFirst?.status).toBe('ACTIVE');

    // 2. mortality (200) > birdsAtStart (100) → 400 BATCH_BIRD_COUNT_INVALID.
    const invalidMortality = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: '2026-09-11', birdsAtStart: 100, mortality: 200 },
    });
    expect(invalidMortality.statusCode).toBe(400);
    expect((invalidMortality.json() as { error: { code: string } }).error.code).toBe('BATCH_BIRD_COUNT_INVALID');

    // 3. Duplicate (batchId, recordDate) → 409 DUPLICATE_DAILY_RECORD.
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: '2026-09-10', birdsAtStart: 10000, mortality: 50 },
    });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: { code: string } }).error.code).toBe('DUPLICATE_DAILY_RECORD');

    // 4. Cross-user batch: owner A writes under other's batch → 404 RESOURCE_NOT_FOUND.
    const crossUser = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchBId}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: '2026-09-10', birdsAtStart: 5000, mortality: 10 },
    });
    expect(crossUser.statusCode).toBe(404);
    expect((crossUser.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 5. WORKER member cannot create → 403 FORBIDDEN.
    const workerCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: auth(member.token),
      payload: { recordDate: '2026-09-12', birdsAtStart: 10000, mortality: 10 },
    });
    expect(workerCreate.statusCode).toBe(403);
    expect((workerCreate.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // 6. Update recomputes birdsRemaining server-side (mortality 100 → 150).
    const updateRecord1 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/daily-records/${record1.data.id}`,
      headers: auth(owner.token),
      payload: { mortality: 150 },
    });
    expect(updateRecord1.statusCode).toBe(200);
    expect((updateRecord1.json() as { data: { birdsRemaining: number } }).data.birdsRemaining).toBe(9850);

    // 7. 10% mortality record on the ACTIVE batch → HIGH_MORTALITY CRITICAL for owner + member.
    const createRecord2 = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: '2026-09-13', birdsAtStart: 1000, mortality: 100 },
    });
    expect(createRecord2.statusCode).toBe(200);

    const alertsAfterRecord2 = await prisma.alert.findMany({
      where: { farmId: farmAId, type: 'HIGH_MORTALITY' },
    });
    expect(alertsAfterRecord2.length).toBe(2);
    const recipientIds = alertsAfterRecord2.map((a) => a.userId).sort();
    expect(recipientIds).toEqual([member.userId, owner.userId].sort());
    for (const alert of alertsAfterRecord2) {
      expect(alert.severity).toBe('CRITICAL');
      expect(alert.batchId).toBe(batchAId);
      expect(alert.title).toContain('DR-B-100');
    }

    // Date-change update to a date already used by ANOTHER record → 409 DUPLICATE_DAILY_RECORD.
    const dateChangeDup = await app.inject({
      method: 'PATCH',
      url: `/api/v1/daily-records/${record1.data.id}`,
      headers: auth(owner.token),
      payload: { recordDate: '2026-09-13' },
    });
    expect(dateChangeDup.statusCode).toBe(409);
    expect((dateChangeDup.json() as { error: { code: string } }).error.code).toBe('DUPLICATE_DAILY_RECORD');

    // 7 (dedupe). Another 10% record → same deterministic title within 7 days → no new alerts.
    const createRecord3 = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: auth(owner.token),
      payload: { recordDate: '2026-09-14', birdsAtStart: 1000, mortality: 100 },
    });
    expect(createRecord3.statusCode).toBe(200);
    const record3Id = (createRecord3.json() as { data: { id: string } }).data.id;

    const alertsAfterRecord3 = await prisma.alert.findMany({
      where: { farmId: farmAId, type: 'HIGH_MORTALITY' },
    });
    expect(alertsAfterRecord3.length).toBe(2);

    // 6 (delete). OWNER deletes a record → 200; GET of the deleted id → 404.
    const deleteRecord3 = await app.inject({
      method: 'DELETE',
      url: `/api/v1/daily-records/${record3Id}`,
      headers: auth(owner.token),
    });
    expect(deleteRecord3.statusCode).toBe(200);
    expect((deleteRecord3.json() as { data: { success: boolean } }).data.success).toBe(true);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/v1/daily-records/${record3Id}`,
      headers: auth(owner.token),
    });
    expect(gone.statusCode).toBe(404);
  });
});