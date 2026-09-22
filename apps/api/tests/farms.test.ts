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

describe('farms', () => {
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
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces ownership and member roles on farms', async () => {
    const owner = await createUser(app, 'farms-owner@test.dev');
    const outsider = await createUser(app, 'farms-outsider@test.dev');
    const manager = await createUser(app, 'farms-manager@test.dev');
    const worker = await createUser(app, 'farms-worker@test.dev');

    // 1. Owner creates a farm; list and get both show it.
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Green Acres', location: 'Lahore' },
    });
    expect(create.statusCode).toBe(200);
    const farmId = (create.json() as { data: { id: string } }).data.id;

    const list = await app.inject({ method: 'GET', url: '/api/v1/farms', headers: auth(owner.token) });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { data: { items: Array<{ id: string; role: string }>; meta: { total: number } } };
    expect(listBody.data.items.some((f) => f.id === farmId)).toBe(true);
    expect(listBody.data.items.find((f) => f.id === farmId)?.role).toBe('OWNER');

    const get = await app.inject({ method: 'GET', url: `/api/v1/farms/${farmId}`, headers: auth(owner.token) });
    expect(get.statusCode).toBe(200);
    expect((get.json() as { data: { id: string } }).data.id).toBe(farmId);

    // 2. Non-owner GET → 404 RESOURCE_NOT_FOUND (no existence leak).
    const outsiderGet = await app.inject({ method: 'GET', url: `/api/v1/farms/${farmId}`, headers: auth(outsider.token) });
    expect(outsiderGet.statusCode).toBe(404);
    expect((outsiderGet.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 3. Non-owner PATCH and DELETE → 404 (same rule).
    const outsiderPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/farms/${farmId}`,
      headers: auth(outsider.token),
      payload: { name: 'Hijacked' },
    });
    expect(outsiderPatch.statusCode).toBe(404);
    expect((outsiderPatch.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    const outsiderDelete = await app.inject({ method: 'DELETE', url: `/api/v1/farms/${farmId}`, headers: auth(outsider.token) });
    expect(outsiderDelete.statusCode).toBe(404);
    expect((outsiderDelete.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 4. Owner adds manager as member; manager GET succeeds.
    const addManager = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/members`,
      headers: auth(owner.token),
      payload: { members: [{ userId: manager.userId, role: 'MANAGER' }] },
    });
    expect(addManager.statusCode).toBe(200);
    expect((addManager.json() as { data: { added: number } }).data.added).toBe(1);

    const managerGet = await app.inject({ method: 'GET', url: `/api/v1/farms/${farmId}`, headers: auth(manager.token) });
    expect(managerGet.statusCode).toBe(200);
    expect((managerGet.json() as { data: { role: string } }).data.role).toBe('MANAGER');

    // 5. Worker member has access but wrong role → 403; manager PATCH → 200.
    const addWorker = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/members`,
      headers: auth(owner.token),
      payload: { members: [{ userId: worker.userId, role: 'WORKER' }] },
    });
    expect(addWorker.statusCode).toBe(200);

    const workerPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/farms/${farmId}`,
      headers: auth(worker.token),
      payload: { name: 'Worker Rename' },
    });
    expect(workerPatch.statusCode).toBe(403);
    expect((workerPatch.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const managerPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/farms/${farmId}`,
      headers: auth(manager.token),
      payload: { name: 'Green Acres Renamed' },
    });
    expect(managerPatch.statusCode).toBe(200);
    expect((managerPatch.json() as { data: { name: string } }).data.name).toBe('Green Acres Renamed');

    // 6. Add-members by non-OWNER (manager) → 403.
    const managerAdd = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmId}/members`,
      headers: auth(manager.token),
      payload: { members: [{ userId: outsider.userId, role: 'WORKER' }] },
    });
    expect(managerAdd.statusCode).toBe(403);
    expect((managerAdd.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // 7. DELETE a farm that HAS a shed → 409 FARM_HAS_DEPENDENCIES.
    await prisma.shed.create({ data: { farmId, name: 'Shed 1', capacity: 100 } });
    const deleteWithShed = await app.inject({ method: 'DELETE', url: `/api/v1/farms/${farmId}`, headers: auth(owner.token) });
    expect(deleteWithShed.statusCode).toBe(409);
    expect((deleteWithShed.json() as { error: { code: string } }).error.code).toBe('FARM_HAS_DEPENDENCIES');

    // 8. DELETE an empty farm → 200 { data: { success: true } }.
    await prisma.shed.deleteMany({ where: { farmId } });
    const deleteEmpty = await app.inject({ method: 'DELETE', url: `/api/v1/farms/${farmId}`, headers: auth(owner.token) });
    expect(deleteEmpty.statusCode).toBe(200);
    expect((deleteEmpty.json() as { data: { success: boolean } }).data.success).toBe(true);

    const gone = await app.inject({ method: 'GET', url: `/api/v1/farms/${farmId}`, headers: auth(owner.token) });
    expect(gone.statusCode).toBe(404);
  });
});