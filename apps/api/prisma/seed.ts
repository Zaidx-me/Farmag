import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';

/**
 * Deterministic dev fixture for the poultry-farm MVP.
 *
 * Idempotency strategy: the owner's downstream data is deleted first (children
 * before parents, FK-safe order), then recreated with fixed stable UUIDs. A
 * rerun therefore produces zero new rows.
 */

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@farm.test';
const OWNER_PASSWORD = 'Password123!';
const OWNER_ID = '00000000-0000-4000-8000-000000000001';

const FARM_1_ID = '00000000-0000-4000-8000-000000000101';
const FARM_2_ID = '00000000-0000-4000-8000-000000000102';
const SHED_1_ID = '00000000-0000-4000-8000-000000000201';
const SHED_2_ID = '00000000-0000-4000-8000-000000000202';
const SHED_3_ID = '00000000-0000-4000-8000-000000000203';
const BATCH_1_ID = '00000000-0000-4000-8000-000000000301';
const BATCH_2_ID = '00000000-0000-4000-8000-000000000302';
const FEED_1_ID = '00000000-0000-4000-8000-000000000401';
const FEED_2_ID = '00000000-0000-4000-8000-000000000402';
const MED_1_ID = '00000000-0000-4000-8000-000000000501';
const MED_2_ID = '00000000-0000-4000-8000-000000000502';
const VACC_1_ID = '00000000-0000-4000-8000-000000000601';
const EXP_1_ID = '00000000-0000-4000-8000-000000000701';
const EXP_2_ID = '00000000-0000-4000-8000-000000000702';
const SALE_1_ID = '00000000-0000-4000-8000-000000000801';

const BATCH_1_ARRIVAL = new Date('2026-01-01T00:00:00.000Z');
const DAILY_RECORD_COUNT = 50;
const INITIAL_BIRDS = 500;

function dailyRecordId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

async function deleteOwnerData(ownerId: string): Promise<void> {
  const farms = await prisma.farm.findMany({ where: { ownerId }, select: { id: true } });
  const farmIds = farms.map((farm) => farm.id);
  const batches = await prisma.batch.findMany({ where: { farmId: { in: farmIds } }, select: { id: true } });
  const batchIds = batches.map((batch) => batch.id);
  const feedItems = await prisma.feedItem.findMany({ where: { farmId: { in: farmIds } }, select: { id: true } });
  const feedItemIds = feedItems.map((item) => item.id);
  const medicines = await prisma.medicine.findMany({ where: { farmId: { in: farmIds } }, select: { id: true } });
  const medicineIds = medicines.map((item) => item.id);

  await prisma.syncOperation.deleteMany({ where: { userId: ownerId } });
  await prisma.alert.deleteMany({ where: { userId: ownerId } });
  await prisma.refreshToken.deleteMany({ where: { userId: ownerId } });
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
  await prisma.farm.deleteMany({ where: { ownerId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
}

async function main(): Promise<void> {
  await deleteOwnerData(OWNER_ID);

  const passwordHash = await argon2.hash(OWNER_PASSWORD);

  await prisma.user.create({
    data: {
      id: OWNER_ID,
      fullName: 'Farm Owner',
      email: OWNER_EMAIL,
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  await prisma.farm.createMany({
    data: [
      {
        id: FARM_1_ID,
        ownerId: OWNER_ID,
        name: 'Green Valley Farm',
        location: 'Lahore',
        address: '12 Main Road, Raiwind',
        phone: '+92-300-1111111',
        farmType: 'BROILER',
        notes: 'Primary broiler operation',
        status: 'ACTIVE',
      },
      {
        id: FARM_2_ID,
        ownerId: OWNER_ID,
        name: 'Sunrise Poultry',
        location: 'Multan',
        address: '5 Canal View, Multan',
        phone: '+92-300-2222222',
        farmType: 'LAYER',
        notes: 'Layer farm under expansion',
        status: 'ACTIVE',
      },
    ],
  });

  await prisma.shed.createMany({
    data: [
      { id: SHED_1_ID, farmId: FARM_1_ID, name: 'Shed A', capacity: 1000, type: 'OPEN', status: 'ACTIVE' },
      { id: SHED_2_ID, farmId: FARM_1_ID, name: 'Shed B', capacity: 800, type: 'OPEN', status: 'ACTIVE' },
      { id: SHED_3_ID, farmId: FARM_2_ID, name: 'Layer Shed 1', capacity: 1200, type: 'ENVIRONMENTAL', status: 'ACTIVE' },
    ],
  });

  await prisma.batch.createMany({
    data: [
      {
        id: BATCH_1_ID,
        farmId: FARM_1_ID,
        shedId: SHED_1_ID,
        batchNumber: 'B-2026-001',
        breed: 'Cobb 500',
        supplier: 'Hi-Tech Hatchery',
        arrivalDate: BATCH_1_ARRIVAL,
        initialBirds: INITIAL_BIRDS,
        initialAverageWeightKg: '0.042',
        costPerBird: '85.00',
        targetSaleDate: new Date('2026-02-20T00:00:00.000Z'),
        status: 'ACTIVE',
        notes: 'Main active batch',
      },
      {
        id: BATCH_2_ID,
        farmId: FARM_1_ID,
        shedId: SHED_2_ID,
        batchNumber: 'B-2026-002',
        breed: 'Ross 308',
        supplier: 'Hi-Tech Hatchery',
        arrivalDate: new Date('2026-03-01T00:00:00.000Z'),
        initialBirds: 300,
        initialAverageWeightKg: '0.040',
        costPerBird: '82.00',
        status: 'UPCOMING',
        notes: 'Next cycle',
      },
    ],
  });

  const dailyRecords: Prisma.DailyRecordCreateManyInput[] = [];
  let birdsAtStart = INITIAL_BIRDS;
  for (let i = 0; i < DAILY_RECORD_COUNT; i++) {
    const recordDate = new Date(BATCH_1_ARRIVAL);
    recordDate.setUTCDate(recordDate.getUTCDate() + i);
    const mortality = i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
    const birdsRemaining = birdsAtStart - mortality;
    dailyRecords.push({
      id: dailyRecordId(i + 1),
      batchId: BATCH_1_ID,
      recordDate,
      birdsAtStart,
      mortality,
      birdsRemaining,
      feedConsumedKg: (25 + (i % 5) * 0.5).toFixed(3),
      waterConsumedLiters: (60 + (i % 5) * 1.5).toFixed(3),
      averageWeightKg: (0.15 + i * 0.033).toFixed(3),
      temperatureC: (28 + (i % 4)).toFixed(2),
      humidityPercent: (55 + (i % 6)).toFixed(2),
      medicineNotes: i === 10 ? 'Vitamin supplement given' : null,
      vaccinationNotes: i === 14 ? 'ND vaccine administered' : null,
      notes: i === 0 ? 'Day 1 after arrival' : null,
      createdBy: OWNER_ID,
    });
    birdsAtStart = birdsRemaining;
  }
  await prisma.dailyRecord.createMany({ data: dailyRecords });

  await prisma.feedItem.createMany({
    data: [
      {
        id: FEED_1_ID,
        farmId: FARM_1_ID,
        name: 'Broiler Starter',
        type: 'STARTER',
        supplier: 'National Feeds',
        unit: 'kg',
        currentStock: '500.000',
        lowStockThreshold: '100.000',
      },
      {
        id: FEED_2_ID,
        farmId: FARM_1_ID,
        name: 'Broiler Grower',
        type: 'GROWER',
        supplier: 'National Feeds',
        unit: 'kg',
        currentStock: '800.000',
        lowStockThreshold: '150.000',
      },
    ],
  });

  await prisma.medicine.createMany({
    data: [
      {
        id: MED_1_ID,
        farmId: FARM_1_ID,
        name: 'Amprolium 20%',
        supplier: 'VetCare Pharma',
        unit: 'kg',
        currentStock: '25.000',
        lowStockThreshold: '5.000',
        expiryDate: new Date('2027-06-30T00:00:00.000Z'),
      },
      {
        id: MED_2_ID,
        farmId: FARM_1_ID,
        name: 'Vitamin Premix',
        supplier: 'VetCare Pharma',
        unit: 'kg',
        currentStock: '40.000',
        lowStockThreshold: '10.000',
        expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      },
    ],
  });

  await prisma.vaccination.create({
    data: {
      id: VACC_1_ID,
      batchId: BATCH_1_ID,
      vaccineName: 'Newcastle Disease (Lasota)',
      scheduledDate: new Date('2026-01-15T00:00:00.000Z'),
      completedDate: new Date('2026-01-15T00:00:00.000Z'),
      dose: '0.500',
      supplier: 'VetCare Pharma',
      status: 'COMPLETED',
      notes: 'First ND vaccination',
      createdBy: OWNER_ID,
    },
  });

  await prisma.expense.createMany({
    data: [
      {
        id: EXP_1_ID,
        farmId: FARM_1_ID,
        category: 'FEED',
        description: 'Starter feed purchase for batch B-2026-001',
        amount: '42500.00',
        expenseDate: new Date('2026-01-05T00:00:00.000Z'),
        supplier: 'National Feeds',
        paymentStatus: 'PAID',
        createdBy: OWNER_ID,
      },
      {
        id: EXP_2_ID,
        farmId: FARM_1_ID,
        batchId: BATCH_1_ID,
        category: 'MEDICINE',
        description: 'Coccidiostat course for batch B-2026-001',
        amount: '6500.00',
        expenseDate: new Date('2026-01-12T00:00:00.000Z'),
        supplier: 'VetCare Pharma',
        paymentStatus: 'PAID',
        createdBy: OWNER_ID,
      },
    ],
  });

  await prisma.sale.create({
    data: {
      id: SALE_1_ID,
      farmId: FARM_1_ID,
      batchId: BATCH_1_ID,
      buyer: 'Karachi Meat Traders',
      saleDate: new Date('2026-02-18T00:00:00.000Z'),
      birdsSold: 200,
      totalWeightKg: '420.000',
      ratePerKg: '180.00',
      totalAmount: '75600.00',
      amountReceived: '50000.00',
      outstandingAmount: '25600.00',
      paymentStatus: 'PARTIALLY_PAID',
      notes: 'First partial sale of batch',
      createdBy: OWNER_ID,
    },
  });

  const counts = {
    users: await prisma.user.count({ where: { id: OWNER_ID } }),
    farms: await prisma.farm.count({ where: { ownerId: OWNER_ID } }),
    sheds: await prisma.shed.count({ where: { farm: { ownerId: OWNER_ID } } }),
    batches: await prisma.batch.count({ where: { farm: { ownerId: OWNER_ID } } }),
    dailyRecords: await prisma.dailyRecord.count({ where: { batch: { farm: { ownerId: OWNER_ID } } } }),
    feedItems: await prisma.feedItem.count({ where: { farm: { ownerId: OWNER_ID } } }),
    medicines: await prisma.medicine.count({ where: { farm: { ownerId: OWNER_ID } } }),
    vaccinations: await prisma.vaccination.count({ where: { batch: { farm: { ownerId: OWNER_ID } } } }),
    expenses: await prisma.expense.count({ where: { farm: { ownerId: OWNER_ID } } }),
    sales: await prisma.sale.count({ where: { farm: { ownerId: OWNER_ID } } }),
  };

  console.log('Dev seed complete:', JSON.stringify(counts, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('Dev seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });