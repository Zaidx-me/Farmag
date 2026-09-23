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

/** UTC date string N days from now (YYYY-MM-DD) — matches the service's UTC-midnight @db.Date storage. */
const dateInDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
// No global @test.dev wipe — a parallel suite may be mid-flight.
let farmAId = '';
let farmBId = '';
let batchAId = '';
let batchBId = '';
let ownerUserId = '';
let otherUserId = '';
let workerUserId = '';

describe('vaccinations', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farms first (cascade removes sheds, batches,
    // vaccinations, alerts), then the users we registered (Farm.ownerId FK is NOT cascade
    // on User delete, so farms must go first). This keeps the suite re-runnable with no
    // cleanup between runs while never touching another suite's rows.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId, workerUserId].filter(Boolean) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces vaccination rules: server status, MISSED auto-mark, VACCINATION_DUE alerts, worker completion', async () => {
    const owner = await createUser(app, 'vaccinations-owner@test.dev');
    const other = await createUser(app, 'vaccinations-other@test.dev');
    const worker = await createUser(app, 'vaccinations-worker@test.dev');
    ownerUserId = owner.userId;
    otherUserId = other.userId;
    workerUserId = worker.userId;

    // Farm A (owner) with shed + batch; worker added as WORKER member.
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Vaccinations Farm A', location: 'Lahore' },
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
        batchNumber: 'VAC-B-100',
        breed: 'Cobb 500',
        arrivalDate: '2026-09-01',
        initialBirds: 10000,
      },
    });
    expect(batchA.statusCode).toBe(200);
    batchAId = (batchA.json() as { data: { id: string } }).data.id;

    const addWorker = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/members`,
      headers: auth(owner.token),
      payload: { members: [{ userId: worker.userId, role: 'WORKER' }] },
    });
    expect(addWorker.statusCode).toBe(200);

    // Farm B (other user) with shed + batch — for the cross-farm 404 tests.
    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(other.token),
      payload: { name: 'Vaccinations Farm B', location: 'Karachi' },
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
        batchNumber: 'VAC-B-200',
        breed: 'Ross 308',
        arrivalDate: '2026-09-02',
        initialBirds: 5000,
      },
    });
    expect(batchB.statusCode).toBe(200);
    batchBId = (batchB.json() as { data: { id: string } }).data.id;

    // 1. Create → 200, status pinned UPCOMING server-side (never from the wire).
    const createDue = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'Newcastle', scheduledDate: dateInDays(2), dose: '0.5', supplier: 'VetPharm' },
    });
    expect(createDue.statusCode).toBe(200);
    const dueVaccination = createDue.json() as { data: { id: string; status: string; scheduledDate: string; dose: string } };
    expect(dueVaccination.data.status).toBe('UPCOMING');
    expect(dueVaccination.data.scheduledDate.slice(0, 10)).toBe(dateInDays(2));
    expect(dueVaccination.data.dose).toBe('0.5');

    // 2. Create with a PAST scheduledDate (yesterday) — dateSchema has no min, so it passes.
    const createPast = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'Gumboro', scheduledDate: dateInDays(-1) },
    });
    expect(createPast.statusCode).toBe(200);
    expect((createPast.json() as { data: { status: string } }).data.status).toBe('UPCOMING');

    // 3. Create far-future (today+10d) — outside the 3-day due lookahead → no alert.
    const createFar = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'IBD', scheduledDate: dateInDays(10) },
    });
    expect(createFar.statusCode).toBe(200);

    // 4. List → past one auto-marked MISSED, future ones stay UPCOMING; VACCINATION_DUE
    //    WARNING created for owner + worker member (only the today+2d one is due).
    const list1 = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
    });
    expect(list1.statusCode).toBe(200);
    const list1Body = list1.json() as { data: Array<{ vaccineName: string; status: string }> };
    const byName = Object.fromEntries(list1Body.data.map((v) => [v.vaccineName, v.status]));
    expect(byName['Gumboro']).toBe('MISSED');
    expect(byName['Newcastle']).toBe('UPCOMING');
    expect(byName['IBD']).toBe('UPCOMING');

    const dueAlerts = await prisma.alert.findMany({
      where: { farmId: farmAId, type: 'VACCINATION_DUE' },
    });
    expect(dueAlerts.length).toBe(2);
    const dueRecipients = dueAlerts.map((a) => a.userId).sort();
    expect(dueRecipients).toEqual([owner.userId, worker.userId].sort());
    for (const alert of dueAlerts) {
      expect(alert.severity).toBe('WARNING');
      expect(alert.title).toBe('Vaccination due: Newcastle');
      expect(alert.batchId).toBe(batchAId);
    }
    // The today+10d vaccination must NOT have produced an alert.
    expect(dueAlerts.some((a) => a.title.includes('IBD'))).toBe(false);

    // 5. Second list → no duplicate (7-day dedupe on the deterministic title).
    const list2 = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
    });
    expect(list2.statusCode).toBe(200);
    const dueAlertsAfterSecondList = await prisma.alert.count({
      where: { farmId: farmAId, type: 'VACCINATION_DUE' },
    });
    expect(dueAlertsAfterSecondList).toBe(2);

    // 6. WORKER completion: PATCH completedDate as worker → 200 COMPLETED (server-computed).
    const createWorkerTarget = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'Lasota', scheduledDate: dateInDays(5) },
    });
    expect(createWorkerTarget.statusCode).toBe(200);
    const workerTargetId = (createWorkerTarget.json() as { data: { id: string } }).data.id;

    const workerComplete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/vaccinations/${workerTargetId}`,
      headers: auth(worker.token),
      payload: { completedDate: dateInDays(0), notes: 'Done by worker' },
    });
    expect(workerComplete.statusCode).toBe(200);
    const workerCompleted = workerComplete.json() as { data: { status: string; completedDate: string | null } };
    expect(workerCompleted.data.status).toBe('COMPLETED');
    expect(workerCompleted.data.completedDate?.slice(0, 10)).toBe(dateInDays(0));

    // 7. WORKER status-strip: PATCH with a status value → status is stripped, still server-computed.
    const createStripTarget = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'Marek', scheduledDate: dateInDays(7) },
    });
    expect(createStripTarget.statusCode).toBe(200);
    const stripTargetId = (createStripTarget.json() as { data: { id: string } }).data.id;

    const workerStrip = await app.inject({
      method: 'PATCH',
      url: `/api/v1/vaccinations/${stripTargetId}`,
      headers: auth(worker.token),
      payload: { status: 'MISSED' },
    });
    expect(workerStrip.statusCode).toBe(200);
    expect((workerStrip.json() as { data: { status: string } }).data.status).toBe('UPCOMING');

    // 8. Cross-farm: owner lists other's batch → 404; worker PATCHes other farm's vaccination → 404.
    const crossFarmList = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchBId}/vaccinations`,
      headers: auth(owner.token),
    });
    expect(crossFarmList.statusCode).toBe(404);
    expect((crossFarmList.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    const farmBVaccination = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchBId}/vaccinations`,
      headers: auth(other.token),
      payload: { vaccineName: 'Farm B Vaccine', scheduledDate: dateInDays(3) },
    });
    expect(farmBVaccination.statusCode).toBe(200);
    const farmBVaccinationId = (farmBVaccination.json() as { data: { id: string } }).data.id;

    const workerCrossFarmPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/vaccinations/${farmBVaccinationId}`,
      headers: auth(worker.token),
      payload: { completedDate: dateInDays(0) },
    });
    expect(workerCrossFarmPatch.statusCode).toBe(404);
    expect((workerCrossFarmPatch.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // 9. Delete by OWNER → 200; row gone (list count declines).
    const createDeleteTarget = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'Avian Flu', scheduledDate: dateInDays(1) },
    });
    expect(createDeleteTarget.statusCode).toBe(200);
    const deleteTargetId = (createDeleteTarget.json() as { data: { id: string } }).data.id;

    const countBeforeDelete = await prisma.vaccination.count({ where: { batchId: batchAId } });
    const deleteVaccination = await app.inject({
      method: 'DELETE',
      url: `/api/v1/vaccinations/${deleteTargetId}`,
      headers: auth(owner.token),
    });
    expect(deleteVaccination.statusCode).toBe(200);
    expect((deleteVaccination.json() as { data: { success: boolean } }).data.success).toBe(true);
    const countAfterDelete = await prisma.vaccination.count({ where: { batchId: batchAId } });
    expect(countAfterDelete).toBe(countBeforeDelete - 1);

    // 10. WORKER delete → 403 FORBIDDEN (requireRole throw).
    const createWorkerDeleteTarget = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/vaccinations`,
      headers: auth(owner.token),
      payload: { vaccineName: 'Duck Plague', scheduledDate: dateInDays(3) },
    });
    expect(createWorkerDeleteTarget.statusCode).toBe(200);
    const workerDeleteTargetId = (createWorkerDeleteTarget.json() as { data: { id: string } }).data.id;

    const workerDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/vaccinations/${workerDeleteTargetId}`,
      headers: auth(worker.token),
    });
    expect(workerDelete.statusCode).toBe(403);
    expect((workerDelete.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });
});