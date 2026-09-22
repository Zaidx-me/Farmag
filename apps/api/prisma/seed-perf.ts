import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';

/**
 * Performance-scale fixture for the poultry-farm MVP (TESTING.md §10).
 *
 * Dataset: 10 farms / 50 sheds (5 per farm) / 100 batches (2 per shed) /
 * 365 daily records per batch (36,500 total) plus feed items, medicines,
 * vaccinations, expenses and sales at reasonable volumes.
 *
 * Idempotency strategy: the perf user's downstream data is deleted first
 * (children before parents, FK-safe order), then recreated with fixed stable
 * UUIDs. A rerun therefore produces zero new rows.
 */

const prisma = new PrismaClient();

const PERF_EMAIL = 'perf@farm.test';
const PERF_PASSWORD = 'Password123!';
const PERF_USER_ID = '00000000-0000-4000-8000-000000000002';

const FARM_COUNT = 10;
const SHEDS_PER_FARM = 5;
const BATCHES_PER_SHED = 2;
const DAILY_RECORDS_PER_BATCH = 365;
const CHUNK_SIZE = 1000;

function perfUuid(n: number): string {
  return `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
function farmId(n: number): string {
  return perfUuid(100 + n);
}
function shedId(n: number): string {
  return perfUuid(200 + n);
}
function batchId(n: number): string {
  return perfUuid(300 + n);
}
function feedItemId(n: number): string {
  return perfUuid(400 + n);
}
function medicineId(n: number): string {
  return perfUuid(500 + n);
}
function vaccinationId(n: number): string {
  return perfUuid(600 + n);
}
function expenseId(n: number): string {
  return perfUuid(700 + n);
}
function saleId(n: number): string {
  return perfUuid(800 + n);
}
function dailyRecordId(n: number): string {
  return perfUuid(n);
}

async function deletePerfUserData(userId: string): Promise<void> {
  const farms = await prisma.farm.findMany({ where: { ownerId: userId }, select: { id: true } });
  const farmIds = farms.map((farm) => farm.id);
  const batches = await prisma.batch.findMany({ where: { farmId: { in: farmIds } }, select: { id: true } });
  const batchIds = batches.map((batch) => batch.id);
  const feedItems = await prisma.feedItem.findMany({ where: { farmId: { in: farmIds } }, select: { id: true } });
  const feedItemIds = feedItems.map((item) => item.id);
  const medicines = await prisma.medicine.findMany({ where: { farmId: { in: farmIds } }, select: { id: true } });
  const medicineIds = medicines.map((item) => item.id);

  await prisma.syncOperation.deleteMany({ where: { userId } });
  await prisma.alert.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.sale.deleteMany({ where: { farmId: { in: farmIds } } });
  await prisma.expense.deleteMany({ where: { farmId: { in: farmIds } } });
  await prisma.vaccination.deleteMany({ where: { batchId: { in: batchIds } } });
  await prisma.medicineTransaction.deleteMany({ where: { medicineId: { in: medicineIds } } });
  await prisma.feedTransaction.deleteMany({ where: { feedItemId: { in: feedItemIds } } });
  await prisma.dailyRecord.deleteMany({ where: { batchId: { in: batchIds } } });
  await prisma.medicine.deleteMany({ where: { farmId: { in: farmIds } } });
  await prisma.feedItem.deleteMany({ where: { farmId: { in: farmIds } } });
  await prisma.batch.deleteMany({ where: { farmId: { in: farmIds } } });
  await prisma.shed.deleteMany({ where: { farmId: { in: farmIds } } });
  await prisma.farmMember.deleteMany({ where: { farmId: { in: farmIds } } });
  await prisma.farm.deleteMany({ where: { ownerId: userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function main(): Promise<void> {
  await deletePerfUserData(PERF_USER_ID);

  const passwordHash = await argon2.hash(PERF_PASSWORD);

  await prisma.user.create({
    data: {
      id: PERF_USER_ID,
      fullName: 'Perf Test User',
      email: PERF_EMAIL,
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  const farms: Prisma.FarmCreateManyInput[] = [];
  for (let f = 1; f <= FARM_COUNT; f++) {
    farms.push({
      id: farmId(f),
      ownerId: PERF_USER_ID,
      name: `Perf Farm ${f}`,
      location: `City ${f}`,
      address: `${f} Perf Avenue`,
      phone: `+92-300-0000${String(f).padStart(4, '0')}`,
      farmType: f % 2 === 0 ? 'LAYER' : 'BROILER',
      status: 'ACTIVE',
    });
  }
  await prisma.farm.createMany({ data: farms });

  const sheds: Prisma.ShedCreateManyInput[] = [];
  let shedCounter = 0;
  for (let f = 1; f <= FARM_COUNT; f++) {
    for (let s = 1; s <= SHEDS_PER_FARM; s++) {
      shedCounter += 1;
      sheds.push({
        id: shedId(shedCounter),
        farmId: farmId(f),
        name: `Shed ${s}`,
        capacity: 800 + (s * 100),
        type: s % 2 === 0 ? 'ENVIRONMENTAL' : 'OPEN',
        status: 'ACTIVE',
      });
    }
  }
  await prisma.shed.createMany({ data: sheds });

  const batches: Prisma.BatchCreateManyInput[] = [];
  let batchCounter = 0;
  for (let s = 1; s <= shedCounter; s++) {
    for (let b = 1; b <= BATCHES_PER_SHED; b++) {
      batchCounter += 1;
      const farmIndex = Math.ceil(s / SHEDS_PER_FARM);
      const arrival = new Date(Date.UTC(2026, 0, 1 + (batchCounter % 28)));
      batches.push({
        id: batchId(batchCounter),
        farmId: farmId(farmIndex),
        shedId: shedId(s),
        batchNumber: `PERF-${String(batchCounter).padStart(4, '0')}`,
        breed: batchCounter % 2 === 0 ? 'Ross 308' : 'Cobb 500',
        supplier: 'Perf Hatchery',
        arrivalDate: arrival,
        initialBirds: 400 + (s % 5) * 50,
        initialAverageWeightKg: '0.042',
        costPerBird: '85.00',
        targetSaleDate: new Date(arrival.getTime() + 42 * 86400000),
        status: batchCounter % 3 === 0 ? 'UPCOMING' : 'ACTIVE',
      });
    }
  }
  await prisma.batch.createMany({ data: batches });

  const dailyRecords: Prisma.DailyRecordCreateManyInput[] = [];
  let recordCounter = 0;
  for (let b = 1; b <= batchCounter; b++) {
    const arrival = new Date(Date.UTC(2026, 0, 1 + (b % 28)));
    const initialBirds = 400 + ((Math.ceil(b / BATCHES_PER_SHED) % 5) * 50);
    let birdsAtStart = initialBirds;
    for (let d = 0; d < DAILY_RECORDS_PER_BATCH; d++) {
      recordCounter += 1;
      const recordDate = new Date(arrival);
      recordDate.setUTCDate(recordDate.getUTCDate() + d);
      const mortality = d % 7 === 0 ? 2 : d % 3 === 0 ? 1 : 0;
      const birdsRemaining = birdsAtStart - mortality;
      dailyRecords.push({
        id: dailyRecordId(recordCounter),
        batchId: batchId(b),
        recordDate,
        birdsAtStart,
        mortality,
        birdsRemaining,
        feedConsumedKg: (25 + (d % 5) * 0.5).toFixed(3),
        waterConsumedLiters: (60 + (d % 5) * 1.5).toFixed(3),
        averageWeightKg: (0.15 + d * 0.033).toFixed(3),
        temperatureC: (28 + (d % 4)).toFixed(2),
        humidityPercent: (55 + (d % 6)).toFixed(2),
        createdBy: PERF_USER_ID,
      });
      birdsAtStart = birdsRemaining;
    }
  }
  for (let i = 0; i < dailyRecords.length; i += CHUNK_SIZE) {
    const chunk = dailyRecords.slice(i, i + CHUNK_SIZE);
    await prisma.dailyRecord.createMany({ data: chunk });
  }

  const feedItems: Prisma.FeedItemCreateManyInput[] = [];
  let feedCounter = 0;
  for (let f = 1; f <= FARM_COUNT; f++) {
    for (const type of ['STARTER', 'GROWER'] as const) {
      feedCounter += 1;
      feedItems.push({
        id: feedItemId(feedCounter),
        farmId: farmId(f),
        name: `Perf ${type} Feed`,
        type,
        supplier: 'Perf Feeds',
        unit: 'kg',
        currentStock: '1000.000',
        lowStockThreshold: '200.000',
      });
    }
  }
  await prisma.feedItem.createMany({ data: feedItems });

  const medicines: Prisma.MedicineCreateManyInput[] = [];
  let medicineCounter = 0;
  for (let f = 1; f <= FARM_COUNT; f++) {
    for (const name of ['Amprolium 20%', 'Vitamin Premix']) {
      medicineCounter += 1;
      medicines.push({
        id: medicineId(medicineCounter),
        farmId: farmId(f),
        name,
        supplier: 'Perf Pharma',
        unit: 'kg',
        currentStock: '50.000',
        lowStockThreshold: '10.000',
        expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      });
    }
  }
  await prisma.medicine.createMany({ data: medicines });

  const vaccinations: Prisma.VaccinationCreateManyInput[] = [];
  for (let b = 1; b <= batchCounter; b++) {
    vaccinations.push({
      id: vaccinationId(b),
      batchId: batchId(b),
      vaccineName: 'Newcastle Disease (Lasota)',
      scheduledDate: new Date('2026-01-15T00:00:00.000Z'),
      completedDate: new Date('2026-01-15T00:00:00.000Z'),
      dose: '0.500',
      supplier: 'Perf Pharma',
      status: 'COMPLETED',
      createdBy: PERF_USER_ID,
    });
  }
  await prisma.vaccination.createMany({ data: vaccinations });

  const expenses: Prisma.ExpenseCreateManyInput[] = [];
  let expenseCounter = 0;
  for (let f = 1; f <= FARM_COUNT; f++) {
    for (let e = 1; e <= 5; e++) {
      expenseCounter += 1;
      expenses.push({
        id: expenseId(expenseCounter),
        farmId: farmId(f),
        category: e % 2 === 0 ? 'FEED' : 'MEDICINE',
        description: `Perf expense ${e} for farm ${f}`,
        amount: (1000 + e * 500).toFixed(2),
        expenseDate: new Date(Date.UTC(2026, 0, e * 10)),
        supplier: 'Perf Supplies',
        paymentStatus: 'PAID',
        createdBy: PERF_USER_ID,
      });
    }
  }
  await prisma.expense.createMany({ data: expenses });

  const sales: Prisma.SaleCreateManyInput[] = [];
  for (let b = 1; b <= batchCounter; b++) {
    sales.push({
      id: saleId(b),
      farmId: farmId(Math.ceil(b / (SHEDS_PER_FARM * BATCHES_PER_SHED))),
      batchId: batchId(b),
      buyer: `Perf Buyer ${b}`,
      saleDate: new Date('2026-02-18T00:00:00.000Z'),
      birdsSold: 200,
      totalWeightKg: '420.000',
      ratePerKg: '180.00',
      totalAmount: '75600.00',
      amountReceived: '50000.00',
      outstandingAmount: '25600.00',
      paymentStatus: 'PARTIALLY_PAID',
      createdBy: PERF_USER_ID,
    });
  }
  await prisma.sale.createMany({ data: sales });

  const counts = {
    users: await prisma.user.count({ where: { id: PERF_USER_ID } }),
    farms: await prisma.farm.count({ where: { ownerId: PERF_USER_ID } }),
    sheds: await prisma.shed.count({ where: { farm: { ownerId: PERF_USER_ID } } }),
    batches: await prisma.batch.count({ where: { farm: { ownerId: PERF_USER_ID } } }),
    dailyRecords: await prisma.dailyRecord.count({ where: { batch: { farm: { ownerId: PERF_USER_ID } } } }),
    feedItems: await prisma.feedItem.count({ where: { farm: { ownerId: PERF_USER_ID } } }),
    medicines: await prisma.medicine.count({ where: { farm: { ownerId: PERF_USER_ID } } }),
    vaccinations: await prisma.vaccination.count({ where: { batch: { farm: { ownerId: PERF_USER_ID } } } }),
    expenses: await prisma.expense.count({ where: { farm: { ownerId: PERF_USER_ID } } }),
    sales: await prisma.sale.count({ where: { farm: { ownerId: PERF_USER_ID } } }),
  };

  console.log('Perf seed complete:', JSON.stringify(counts, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('Perf seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });