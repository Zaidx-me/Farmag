import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { medicinePurchaseSchema } from '../src/modules/medicine/schema.js';

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

/** UTC date string N days from now (YYYY-MM-DD) — matches the service's UTC-midnight @db.Date storage. */
const dateInDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Module-scope ids so afterAll can self-clean ONLY our own rows (T14 isolation rule).
let farmAId = '';
let farmBId = '';
let medicineId = '';
let medicineBId = '';

describe('medicine', () => {
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
    // Self-clean ONLY our own farms by id (cascade removes medicines, transactions, alerts).
    // Do NOT wipe all @test.dev rows — a parallel suite may be mid-flight.
    await prisma.farm.deleteMany({ where: { id: { in: [farmAId, farmBId].filter(Boolean) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces medicine inventory rules: transactional stock, alerts, access and validation', async () => {
    const owner = await createUser(app, 'medicine-owner@test.dev');
    const other = await createUser(app, 'medicine-other@test.dev');
    const worker = await createUser(app, 'medicine-worker@test.dev');

    // Farms A (owner) and B (other); worker added as WORKER member of farm A.
    const farmA = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(owner.token),
      payload: { name: 'Medicine Farm A', location: 'Lahore' },
    });
    expect(farmA.statusCode).toBe(200);
    farmAId = (farmA.json() as { data: { id: string } }).data.id;

    const farmB = await app.inject({
      method: 'POST',
      url: '/api/v1/farms',
      headers: auth(other.token),
      payload: { name: 'Medicine Farm B', location: 'Karachi' },
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

    // Batches: one in farm A (same-farm use) and one in farm B (cross-farm use).
    const shedA = await prisma.shed.create({
      data: { farmId: farmAId, name: 'Medicine Shed A', capacity: 1000 },
    });
    const batchA = await prisma.batch.create({
      data: {
        farmId: farmAId,
        shedId: shedA.id,
        batchNumber: 'MED-B-A',
        breed: 'Cobb 500',
        arrivalDate: new Date('2026-09-01'),
        initialBirds: 1000,
      },
    });
    const shedB = await prisma.shed.create({
      data: { farmId: farmBId, name: 'Medicine Shed B', capacity: 1000 },
    });
    const batchB = await prisma.batch.create({
      data: {
        farmId: farmBId,
        shedId: shedB.id,
        batchNumber: 'MED-B-B',
        breed: 'Ross 308',
        arrivalDate: new Date('2026-09-02'),
        initialBirds: 1000,
      },
    });

    // 1. Create medicine (valid) → 200 with currentStock + expiryDate stored.
    const createItem = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmAId}/medicines`,
      headers: auth(owner.token),
      payload: {
        name: 'Amoxicillin',
        supplier: 'VetPharm',
        unit: 'bottle',
        currentStock: '100',
        lowStockThreshold: '200',
        expiryDate: dateInDays(60),
      },
    });
    expect(createItem.statusCode).toBe(200);
    const created = createItem.json() as { data: { id: string; currentStock: string; expiryDate: string | null } };
    medicineId = created.data.id;
    expectDecimal(created.data.currentStock, '100');
    expect(created.data.expiryDate?.slice(0, 10)).toBe(dateInDays(60));

    // 2. Purchase 500 → stock 600; PURCHASE tx recorded; expiryDate updated in-tx (latest-purchase-wins).
    const purchase = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '500', expiryDate: dateInDays(5) },
    });
    expect(purchase.statusCode).toBe(200);
    expectDecimal(
      (purchase.json() as { data: { medicine: { currentStock: string } } }).data.medicine.currentStock,
      '600'
    );
    const afterPurchase = await prisma.medicine.findUnique({ where: { id: medicineId } });
    expect(afterPurchase?.expiryDate?.toISOString().slice(0, 10)).toBe(dateInDays(5));

    // 3. Use 300 → stock 300; USAGE tx recorded.
    const use = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/use`,
      headers: auth(owner.token),
      payload: { quantity: '300' },
    });
    expect(use.statusCode).toBe(200);
    expectDecimal((use.json() as { data: { medicine: { currentStock: string } } }).data.medicine.currentStock, '300');

    // 4. Use 400 (exceeds stock 300) → 400 STOCK_INSUFFICIENT; stock unchanged, no tx row.
    const overUse = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/use`,
      headers: auth(owner.token),
      payload: { quantity: '400' },
    });
    expect(overUse.statusCode).toBe(400);
    expect((overUse.json() as { error: { code: string } }).error.code).toBe('STOCK_INSUFFICIENT');
    const stockAfterReject = await prisma.medicine.findUnique({ where: { id: medicineId } });
    expect(stockAfterReject?.currentStock.equals(new Prisma.Decimal('300'))).toBe(true);
    const txCountAfterReject = await prisma.medicineTransaction.count({ where: { medicineId } });
    expect(txCountAfterReject).toBe(2);

    // 5. Negative quantity → 400 VALIDATION_ERROR (decimalSchema rejects negatives).
    expect(medicinePurchaseSchema.safeParse({ quantity: '-50' }).success).toBe(false);
    const negative = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '-50' },
    });
    expect(negative.statusCode).toBe(400);
    expect((negative.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // 6. MEDICINE_EXPIRY: expiryDate is today+5d (set by the purchase above). list →
    //    MEDICINE_EXPIRY WARNING for owner + worker member; a second list does NOT duplicate.
    const list1 = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/medicines`,
      headers: auth(owner.token),
    });
    expect(list1.statusCode).toBe(200);
    const expiryAlerts = await prisma.alert.findMany({ where: { farmId: farmAId, type: 'MEDICINE_EXPIRY' } });
    expect(expiryAlerts.length).toBe(2);
    const expiryRecipients = expiryAlerts.map((a) => a.userId).sort();
    expect(expiryRecipients).toEqual([owner.userId, worker.userId].sort());
    for (const alert of expiryAlerts) {
      expect(alert.severity).toBe('WARNING');
      expect(alert.title).toContain('Amoxicillin');
    }

    const list2 = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/medicines`,
      headers: auth(owner.token),
    });
    expect(list2.statusCode).toBe(200);
    const expiryAlertsAfterSecondList = await prisma.alert.count({
      where: { farmId: farmAId, type: 'MEDICINE_EXPIRY' },
    });
    expect(expiryAlertsAfterSecondList).toBe(2);

    // 7. LOW_MEDICINE: use down to the threshold (300 → 200 == lowStockThreshold) →
    //    LOW_MEDICINE WARNING via the shared generator for owner + worker member.
    const useToThreshold = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/use`,
      headers: auth(owner.token),
      payload: { quantity: '100' },
    });
    expect(useToThreshold.statusCode).toBe(200);
    expectDecimal(
      (useToThreshold.json() as { data: { medicine: { currentStock: string } } }).data.medicine.currentStock,
      '200'
    );
    const lowMedicineAlerts = await prisma.alert.findMany({ where: { farmId: farmAId, type: 'LOW_MEDICINE' } });
    expect(lowMedicineAlerts.length).toBe(2);
    const lowRecipients = lowMedicineAlerts.map((a) => a.userId).sort();
    expect(lowRecipients).toEqual([owner.userId, worker.userId].sort());
    for (const alert of lowMedicineAlerts) {
      expect(alert.severity).toBe('WARNING');
      expect(alert.title).toContain('Amoxicillin');
    }

    // 8. Cross-farm medicine → 404 (no existence leak); use with cross-farm batchId → 400 VALIDATION_ERROR.
    const crossFarmList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmBId}/medicines`,
      headers: auth(owner.token),
    });
    expect(crossFarmList.statusCode).toBe(404);
    expect((crossFarmList.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    const farmBItem = await app.inject({
      method: 'POST',
      url: `/api/v1/farms/${farmBId}/medicines`,
      headers: auth(other.token),
      payload: { name: 'Farm B Med', unit: 'vial', currentStock: '50', lowStockThreshold: '10' },
    });
    expect(farmBItem.statusCode).toBe(200);
    medicineBId = (farmBItem.json() as { data: { id: string } }).data.id;

    const crossFarmPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/medicines/${medicineBId}`,
      headers: auth(owner.token),
      payload: { name: 'Hijack' },
    });
    expect(crossFarmPatch.statusCode).toBe(404);
    expect((crossFarmPatch.json() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');

    // WORKER member can list but cannot purchase → 403 FORBIDDEN.
    const workerList = await app.inject({
      method: 'GET',
      url: `/api/v1/farms/${farmAId}/medicines`,
      headers: auth(worker.token),
    });
    expect(workerList.statusCode).toBe(200);

    const workerPurchase = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/purchase`,
      headers: auth(worker.token),
      payload: { quantity: '10' },
    });
    expect(workerPurchase.statusCode).toBe(403);
    expect((workerPurchase.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // Use with a batch of ANOTHER farm → 400 VALIDATION_ERROR.
    const crossFarmBatch = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/use`,
      headers: auth(owner.token),
      payload: { quantity: '10', batchId: batchB.id },
    });
    expect(crossFarmBatch.statusCode).toBe(400);
    expect((crossFarmBatch.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // Use with a SAME-farm batch → 200; USAGE tx carries the batchId.
    const useWithBatch = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/use`,
      headers: auth(owner.token),
      payload: { quantity: '10', batchId: batchA.id },
    });
    expect(useWithBatch.statusCode).toBe(200);
    expectDecimal(
      (useWithBatch.json() as { data: { medicine: { currentStock: string } } }).data.medicine.currentStock,
      '190'
    );
    const batchTx = await prisma.medicineTransaction.findFirst({
      where: { medicineId, type: 'USAGE', batchId: batchA.id },
    });
    expect(batchTx).not.toBeNull();

    // 9. Purchase acceptance-and-drop: unitCost/totalCost accepted → 200, but the tx row
    //    has NO such columns (MedicineTransaction model lacks them — verified in prisma).
    const purchaseWithCost = await app.inject({
      method: 'POST',
      url: `/api/v1/medicines/${medicineId}/purchase`,
      headers: auth(owner.token),
      payload: { quantity: '100', unitCost: '50.00', totalCost: '5000.00' },
    });
    expect(purchaseWithCost.statusCode).toBe(200);
    const purchaseWithCostBody = purchaseWithCost.json() as {
      data: { medicine: { currentStock: string }; transaction: Record<string, unknown> };
    };
    expectDecimal(purchaseWithCostBody.data.medicine.currentStock, '290');
    // The wire shape must not carry the dropped money fields either.
    expect(purchaseWithCostBody.data.transaction.unitCost).toBeUndefined();
    expect(purchaseWithCostBody.data.transaction.totalCost).toBeUndefined();
    const dropTx = await prisma.medicineTransaction.findFirst({
      where: { medicineId, type: 'PURCHASE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(dropTx).not.toBeNull();
    // MedicineTransaction has NO unitCost/totalCost columns (verified in prisma schema) —
    // the row must not expose them.
    expect(Object.keys(dropTx!)).not.toContain('unitCost');
    expect(Object.keys(dropTx!)).not.toContain('totalCost');

    // 10. Update strips currentStock — stock changes ONLY via purchase/use.
    const updateItem = await app.inject({
      method: 'PATCH',
      url: `/api/v1/medicines/${medicineId}`,
      headers: auth(owner.token),
      payload: { name: 'Amoxicillin v2', currentStock: '999' },
    });
    expect(updateItem.statusCode).toBe(200);
    const updated = updateItem.json() as { data: { name: string; currentStock: string } };
    expect(updated.data.name).toBe('Amoxicillin v2');
    expectDecimal(updated.data.currentStock, '290');

    // 11. Transactions list: pagination + from/to date filters.
    const txPage = await app.inject({
      method: 'GET',
      url: `/api/v1/medicines/${medicineId}/transactions?page=1&pageSize=2`,
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
      url: `/api/v1/medicines/${medicineId}/transactions?from=2026-01-01&to=2026-12-31`,
      headers: auth(owner.token),
    });
    expect(txFullYear.statusCode).toBe(200);
    expect((txFullYear.json() as { data: { meta: { total: number } } }).data.meta.total).toBe(5);

    const txEmptyRange = await app.inject({
      method: 'GET',
      url: `/api/v1/medicines/${medicineId}/transactions?to=2020-01-01`,
      headers: auth(owner.token),
    });
    expect(txEmptyRange.statusCode).toBe(200);
    expect((txEmptyRange.json() as { data: { meta: { total: number } } }).data.meta.total).toBe(0);
  });
});