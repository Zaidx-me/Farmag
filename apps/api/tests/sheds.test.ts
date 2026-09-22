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

// Module-scope farm ids so afterAll can self-clean (parallel-run isolation).
let farmAId = '';
let farmBId = '';

describe('sheds', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
    // Cleanup in cascade-safe order: FarmMember cascades, but Farm.ownerId FK is NOT
    // cascade on User delete — delete Farms first, then Users. Sheds/Batches cascade on Farm delete.
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
    // Self-clean ONLY our own farms (cascade removes their sheds + the batch under Farm A).
    // Do NOT wipe all @test.dev rows — an auth/other suite may be mid-flight in parallel.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces farm-scoped access on sheds', async () => {
    const ownerA = await createUser(app, 'sheds-owner-a@test.dev');
    const ownerB = await createUser(app, 'sheds-owner-b@test.dev');
    const worker = await createUser(app, 'sheds-worker@test.dev');

    // Farms A (owner A) and B (owner B).
    const createFarmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(ownerA.token),
      payload: { name: 'Sheds Farm A', location: 'Lahore' },
    });
    expect(createFarmA.statusCode).toBe(200);
    farmAId = (createFarmA.json() as { data: { id: string } }).data.id;

    const createFarmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(ownerB.token),
      payload: { name: 'Sheds Farm B', location: 'Karachi' },
    });
    expect(createFarmB.statusCode).toBe(200);
    farmBId = (createFarmB.json() as { data: { id: string } }).data.id;

    // 1. Owner A creates a shed under farm A → 200; list shows it.
    const createShed = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: auth(ownerA.token),
      payload: { name: 'Broiler Shed 1', capacity: 500 },
    });
    expect(createShed.statusCode).toBe(200);
    const shedId = (createShed.json() as { data: { id: string } }).data.id;

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: auth(ownerA.token),
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { data: { items: Array<{ id: string }>; meta: { total: number } } };
    expect(listBody.data.items.some((s) => s.id === shedId)).toBe(true);
    expect(listBody.data.meta.total).toBe(1);

    // 2. Owner A adds worker (WORKER role); worker can read (list + get) but PATCH → 403.
    const addWorker = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/members`,
      headers: auth(ownerA.token),
      payload: { members: [{ userId: worker.userId, role: 'WORKER' }] },
    });
    expect(addWorker.statusCode).toBe(200);

    const workerList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: auth(worker.token),
    });
    expect(workerList.statusCode).toBe(200);

    const workerGet = await app.inject({
      method: 'GET',
      url: `/api/v1/sheds/${shedId}`,
      headers: auth(worker.token),
    });
    expect(workerGet.statusCode).toBe(200);

    const workerPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/sheds/${shedId}`,
      headers: auth(worker.token),
      payload: { name: 'Worker Rename' },
    });
    expect(workerPatch.statusCode).toBe(403);
    expect((workerPatch.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // 3. Shed under farm B: owner A GET → 404 RESOURCE_NOT_FOUND (no existence leak).
    const shedB = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/sheds`,
      headers: auth(ownerB.token),
      payload: { name: 'Farm B Shed', capacity: 300 },
    });
    expect(shedB.statusCode).toBe(200);
    const shedBId = (shedB.json() as { data: { id: string } }).data.id;

    const crossFarmGet = await app.inject({
      method: 'GET',
      url: `/api/v1/sheds/${shedBId}`,
      headers: auth(ownerA.token),
    });
    expect(crossFarmGet.statusCode).toBe(404);
    expect((crossFarmGet.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 4. Delete shed WITH a batch → 409 SHED_HAS_DEPENDENCIES.
    await prisma.batch.create({
      data: {
        farmId: farmAId,
        shedId,
        batchNumber: 'B-001',
        breed: 'Cobb 500',
        arrivalDate: new Date('2026-09-01'),
        initialBirds: 450,
      },
    });
    const deleteWithBatch = await app.inject({
      method: 'DELETE',
      url: `/api/v1/sheds/${shedId}`,
      headers: auth(ownerA.token),
    });
    expect(deleteWithBatch.statusCode).toBe(409);
    expect((deleteWithBatch.json() as { error: { code: string } }).error.code).toBe('SHED_HAS_DEPENDENCIES');

    // 5. Delete empty shed → 200 { data: { success: true } }.
    const deleteEmpty = await app.inject({
      method: 'DELETE',
      url: `/api/v1/sheds/${shedBId}`,
      headers: auth(ownerB.token),
    });
    expect(deleteEmpty.statusCode).toBe(200);
    expect((deleteEmpty.json() as { data: { success: boolean } }).data.success).toBe(true);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/v1/sheds/${shedBId}`,
      headers: auth(ownerB.token),
    });
    expect(gone.statusCode).toBe(404);
  });
});