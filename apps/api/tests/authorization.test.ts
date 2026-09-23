import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import {
  addFarmMembers,
  authHeader,
  createBatch,
  createFarm,
  createShed,
  createUser,
  dateInDays,
} from './helpers.js';

/**
 * Authorization matrix suite — design doc §5.4 (lines 176–203), END-TO-END.
 *
 * Isolation (LOCKED T14 rule): module-scope ids + afterAll self-clean-by-id
 * (farms first — Farm.ownerId FK is NOT cascade on User delete — then users).
 * NO global @test.dev wipe, NO beforeEach deleteMany over shared rows.
 * Each file builds its OWN app via buildApp().
 *
 * Deviations from the brief (asserted against the REAL module surface, documented):
 * - WORKER create daily-record → 403 FORBIDDEN: the daily-records service restricts
 *   writes to OWNER/MANAGER (requireRole(['OWNER','MANAGER'])); the design matrix
 *   shows WORKER ✅ for daily records, but the implementation (approved in T16) is
 *   authoritative. WORKER reads remain open.
 * - Batches has NO DELETE route (batches/routes.ts: get/list/create/patch/close/open
 *   only) — the "DELETE batch → 403" matrix cell is asserted via PATCH → 403.
 * - Missing Authorization header → 401 AUTH_UNAUTHORIZED (unauthorized() helper in
 *   utils/errors.ts emits code AUTH_UNAUTHORIZED).
 */

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmAId = '';
let farmBId = '';
let shedAId = '';
let batchAId = '';
let batchBId = '';
let recordAId = '';
let expenseAId = '';
let saleAId = '';
let ownerAToken = '';
let userBToken = '';
let workerToken = '';
let accountantToken = '';
let managerToken = '';
let ownerAUserId = '';
let userBUserId = '';
let workerUserId = '';
let accountantUserId = '';
let managerUserId = '';

describe('authorization matrix', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();

    // 5 register calls total (≤ ~10); all emails @t26.dev unique.
    // Domain @t26.dev (NOT @test.dev): 7 existing suites wipe ALL @test.dev users in
    // their beforeAll (auth/sheds/medicine/feed/farms/daily-records/batches) and race
    // with parallel files — a distinct domain keeps our rows isolated (LOCKED T14 rule).
    const ownerA = await createUser(app, 'authz-owner-a@t26.dev');
    const userB = await createUser(app, 'authz-user-b@t26.dev');
    const worker = await createUser(app, 'authz-worker@t26.dev');
    const accountant = await createUser(app, 'authz-accountant@t26.dev');
    const manager = await createUser(app, 'authz-manager@t26.dev');
    ownerAToken = ownerA.token;
    userBToken = userB.token;
    workerToken = worker.token;
    accountantToken = accountant.token;
    managerToken = manager.token;
    ownerAUserId = ownerA.userId;
    userBUserId = userB.userId;
    workerUserId = worker.userId;
    accountantUserId = accountant.userId;
    managerUserId = manager.userId;

    // Farm A owned by ownerA; worker/accountant/manager added as members (one call).
    const farmA = await createFarm(app, ownerA.token, 'Authz Farm A');
    farmAId = farmA.farmId;
    await addFarmMembers(app, ownerA.token, farmAId, [
      { userId: worker.userId, role: 'WORKER' },
      { userId: accountant.userId, role: 'ACCOUNTANT' },
      { userId: manager.userId, role: 'MANAGER' },
    ]);

    const shedA = await createShed(app, ownerA.token, farmAId, 'Authz Shed A');
    shedAId = shedA.shedId;
    const batchA = await createBatch(app, ownerA.token, farmAId, shedAId, {
      batchNumber: 'AUTHZ-A-100',
      initialBirds: 1000,
    });
    batchAId = batchA.batchId;

    // Seed a daily record, expense and sale on farmA via the API (owner writes all).
    const record = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: authHeader(ownerA.token),
      payload: { recordDate: dateInDays(0), birdsAtStart: 1000, mortality: 10 },
    });
    expect(record.statusCode).toBe(200);
    recordAId = (record.json() as { data: { id: string } }).data.id;

    const expense = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: authHeader(ownerA.token),
      payload: { category: 'FEED', description: 'Authz seed expense', amount: '100.00', expenseDate: dateInDays(0) },
    });
    expect(expense.statusCode).toBe(200);
    expenseAId = (expense.json() as { data: { id: string } }).data.id;

    const sale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: authHeader(ownerA.token),
      payload: {
        batchId: batchAId,
        buyer: 'Authz Buyer',
        saleDate: dateInDays(0),
        birdsSold: 10,
        totalWeightKg: '100',
        ratePerKg: '250',
      },
    });
    expect(sale.statusCode).toBe(200);
    saleAId = (sale.json() as { data: { id: string } }).data.id;

    // Farm B owned by userB with a shed + batch — for the cross-user 404s.
    const farmB = await createFarm(app, userB.token, 'Authz Farm B');
    farmBId = farmB.farmId;
    const shedB = await createShed(app, userB.token, farmBId, 'Authz Shed B');
    const batchB = await createBatch(app, userB.token, farmBId, shedB.shedId, {
      batchNumber: 'AUTHZ-B-200',
      initialBirds: 500,
    });
    batchBId = batchB.batchId;
  });

  afterAll(async () => {
    // Self-clean ONLY our own rows by id: farms first (cascade removes sheds, batches,
    // daily records, expenses, sales, memberships), then the users we registered.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [ownerAUserId, userBUserId, workerUserId, accountantUserId, managerUserId].filter(Boolean),
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('cross-user: a non-member sees 404 for every farmA resource (no existence leak)', async () => {
    const farmGet = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}`,
      headers: authHeader(userBToken),
    });
    expect(farmGet.statusCode).toBe(404);
    expect((farmGet.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    const shedsList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/sheds`,
      headers: authHeader(userBToken),
    });
    expect(shedsList.statusCode).toBe(404);

    const shedGet = await app.inject({
      method: 'GET',
      url: `/api/v1/sheds/${shedAId}`,
      headers: authHeader(userBToken),
    });
    expect(shedGet.statusCode).toBe(404);

    const batchesList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/batches`,
      headers: authHeader(userBToken),
    });
    expect(batchesList.statusCode).toBe(404);

    const batchGet = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchAId}`,
      headers: authHeader(userBToken),
    });
    expect(batchGet.statusCode).toBe(404);

    const recordsList = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: authHeader(userBToken),
    });
    expect(recordsList.statusCode).toBe(404);

    const recordGet = await app.inject({
      method: 'GET',
      url: `/api/v1/daily-records/${recordAId}`,
      headers: authHeader(userBToken),
    });
    expect(recordGet.statusCode).toBe(404);

    const expensesList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: authHeader(userBToken),
    });
    expect(expensesList.statusCode).toBe(404);

    const expenseGet = await app.inject({
      method: 'GET',
      url: `/api/v1/expenses/${expenseAId}`,
      headers: authHeader(userBToken),
    });
    expect(expenseGet.statusCode).toBe(404);

    const salesList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: authHeader(userBToken),
    });
    expect(salesList.statusCode).toBe(404);

    const saleGet = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/${saleAId}`,
      headers: authHeader(userBToken),
    });
    expect(saleGet.statusCode).toBe(404);
  });

  it('WORKER member: farm writes denied, daily-record write denied (impl), reads open, farmB 404', async () => {
    // Farms CRUD ❌ WORKER → PATCH farmA → 403.
    const patchFarm = await app.inject({
      method: 'PATCH',
      url: `/api/v1/farms/${farmAId}`,
      headers: authHeader(workerToken),
      payload: { name: 'Worker rename attempt' },
    });
    expect(patchFarm.statusCode).toBe(403);
    expect((patchFarm.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // Daily records: the implementation restricts writes to OWNER/MANAGER (T16), so the
    // WORKER create → 403 (deviation from the §5.4 matrix's WORKER ✅ — documented).
    const workerRecord = await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: authHeader(workerToken),
      payload: { recordDate: dateInDays(1), birdsAtStart: 1000, mortality: 5 },
    });
    expect(workerRecord.statusCode).toBe(403);
    expect((workerRecord.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // WORKER read on farmA is open (daily-records list).
    const workerList = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchAId}/daily-records`,
      headers: authHeader(workerToken),
    });
    expect(workerList.statusCode).toBe(200);

    // Access to OTHER farm's batch → 404 (member only of farmA).
    const otherBatch = await app.inject({
      method: 'GET',
      url: `/api/v1/batches/${batchBId}`,
      headers: authHeader(workerToken),
    });
    expect(otherBatch.statusCode).toBe(404);
    expect((otherBatch.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('ACCOUNTANT member: finance writes allowed, farm/batch writes denied', async () => {
    // Expenses/Sales ✅ ACCOUNTANT → create expense → 200.
    const expense = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/expenses`,
      headers: authHeader(accountantToken),
      payload: { category: 'LABOUR', description: 'Accountant expense', amount: '50.00', expenseDate: dateInDays(0) },
    });
    expect(expense.statusCode).toBe(200);

    // create sale → 200.
    const sale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: authHeader(accountantToken),
      payload: {
        batchId: batchAId,
        buyer: 'Accountant Buyer',
        saleDate: dateInDays(0),
        birdsSold: 5,
        totalWeightKg: '50',
        ratePerKg: '250',
      },
    });
    expect(sale.statusCode).toBe(200);

    // Farms CRUD ❌ ACCOUNTANT → PATCH farmA → 403.
    const patchFarm = await app.inject({
      method: 'PATCH',
      url: `/api/v1/farms/${farmAId}`,
      headers: authHeader(accountantToken),
      payload: { name: 'Accountant rename attempt' },
    });
    expect(patchFarm.statusCode).toBe(403);
    expect((patchFarm.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // Batches CRUD ❌ ACCOUNTANT: batches has NO DELETE route (batches/routes.ts), so the
    // write-denial cell is asserted via PATCH → 403 (documented deviation).
    const patchBatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/batches/${batchAId}`,
      headers: authHeader(accountantToken),
      payload: { notes: 'Accountant batch edit attempt' },
    });
    expect(patchBatch.statusCode).toBe(403);
    expect((patchBatch.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('MANAGER member: batch create allowed, sale create denied (finance matrix)', async () => {
    // Batches CRUD ✅ MANAGER → create batch → 200.
    const batch = await createBatch(app, managerToken, farmAId, shedAId, {
      batchNumber: 'AUTHZ-M-300',
      initialBirds: 200,
    });
    expect(batch.batchId).toBeTruthy();

    // Expenses/Sales ❌ MANAGER (T21 finance matrix: FINANCE_WRITE_ROLES = OWNER+ACCOUNTANT)
    // → create sale → 403.
    const sale = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/sales`,
      headers: authHeader(managerToken),
      payload: {
        batchId: batchAId,
        buyer: 'Manager Buyer',
        saleDate: dateInDays(0),
        birdsSold: 5,
        totalWeightKg: '50',
        ratePerKg: '250',
      },
    });
    expect(sale.statusCode).toBe(403);
    expect((sale.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('token errors: expired → TOKEN_EXPIRED, garbage → TOKEN_INVALID, missing → AUTH_UNAUTHORIZED', async () => {
    // Expired access token: sign with a negative expiry so verify throws the expired path
    // (auth plugin maps FAST_JWT_EXPIRED → TOKEN_EXPIRED).
    const expired = app.jwt.sign(
      { sub: ownerAUserId, role: 'OWNER', email: 'authz-owner-a@t26.dev', type: 'access' },
      { expiresIn: '-1s' }
    );
    const expiredRes = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}`,
      headers: authHeader(expired),
    });
    expect(expiredRes.statusCode).toBe(401);
    expect((expiredRes.json() as { error: { code: string } }).error.code).toBe('TOKEN_EXPIRED');

    // Garbage token → verify throws (not expired) → TOKEN_INVALID.
    const garbageRes = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}`,
      headers: authHeader('not.a.jwt'),
    });
    expect(garbageRes.statusCode).toBe(401);
    expect((garbageRes.json() as { error: { code: string } }).error.code).toBe('TOKEN_INVALID');

    // Missing header → authenticate() throws unauthorized() → 401 AUTH_UNAUTHORIZED.
    const missingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}`,
    });
    expect(missingRes.statusCode).toBe(401);
    expect((missingRes.json() as { error: { code: string } }).error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('invalid body → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: authHeader(ownerAToken),
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });
});