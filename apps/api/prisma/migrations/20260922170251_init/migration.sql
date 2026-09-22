-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "farmType" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmMember" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "FarmMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shed" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Shed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "shedId" UUID NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "supplier" TEXT,
    "arrivalDate" DATE NOT NULL,
    "initialBirds" INTEGER NOT NULL,
    "initialAverageWeightKg" DECIMAL(12,3),
    "costPerBird" DECIMAL(12,2),
    "targetSaleDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRecord" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "recordDate" DATE NOT NULL,
    "birdsAtStart" INTEGER NOT NULL,
    "mortality" INTEGER NOT NULL,
    "birdsRemaining" INTEGER NOT NULL,
    "feedConsumedKg" DECIMAL(12,3),
    "waterConsumedLiters" DECIMAL(12,3),
    "averageWeightKg" DECIMAL(12,3),
    "temperatureC" DECIMAL(6,2),
    "humidityPercent" DECIMAL(6,2),
    "medicineNotes" TEXT,
    "vaccinationNotes" TEXT,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DailyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "supplier" TEXT,
    "unit" TEXT NOT NULL,
    "currentStock" DECIMAL(12,3) NOT NULL,
    "lowStockThreshold" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedTransaction" (
    "id" UUID NOT NULL,
    "feedItemId" UUID NOT NULL,
    "batchId" UUID,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "transactionDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicine" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "supplier" TEXT,
    "unit" TEXT NOT NULL,
    "currentStock" DECIMAL(12,3) NOT NULL,
    "lowStockThreshold" DECIMAL(12,3) NOT NULL,
    "expiryDate" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineTransaction" (
    "id" UUID NOT NULL,
    "medicineId" UUID NOT NULL,
    "batchId" UUID,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "transactionDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccination" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "completedDate" DATE,
    "dose" DECIMAL(12,3),
    "supplier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "supplier" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "receiptObjectKey" TEXT,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "buyer" TEXT NOT NULL,
    "saleDate" DATE NOT NULL,
    "birdsSold" INTEGER NOT NULL,
    "totalWeightKg" DECIMAL(12,3) NOT NULL,
    "ratePerKg" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(12,2) NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "farmId" UUID,
    "batchId" UUID,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOperation" (
    "id" UUID NOT NULL,
    "operationId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID,
    "operationType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SYNCED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Farm_ownerId_idx" ON "Farm"("ownerId");

-- CreateIndex
CREATE INDEX "FarmMember_userId_idx" ON "FarmMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmMember_farmId_userId_key" ON "FarmMember"("farmId", "userId");

-- CreateIndex
CREATE INDEX "Shed_farmId_idx" ON "Shed"("farmId");

-- CreateIndex
CREATE INDEX "Batch_farmId_status_idx" ON "Batch"("farmId", "status");

-- CreateIndex
CREATE INDEX "Batch_shedId_idx" ON "Batch"("shedId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_farmId_batchNumber_key" ON "Batch"("farmId", "batchNumber");

-- CreateIndex
CREATE INDEX "DailyRecord_batchId_recordDate_idx" ON "DailyRecord"("batchId", "recordDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecord_batchId_recordDate_key" ON "DailyRecord"("batchId", "recordDate");

-- CreateIndex
CREATE INDEX "FeedItem_farmId_idx" ON "FeedItem"("farmId");

-- CreateIndex
CREATE INDEX "FeedTransaction_feedItemId_transactionDate_idx" ON "FeedTransaction"("feedItemId", "transactionDate");

-- CreateIndex
CREATE INDEX "FeedTransaction_batchId_idx" ON "FeedTransaction"("batchId");

-- CreateIndex
CREATE INDEX "Medicine_farmId_idx" ON "Medicine"("farmId");

-- CreateIndex
CREATE INDEX "MedicineTransaction_medicineId_transactionDate_idx" ON "MedicineTransaction"("medicineId", "transactionDate");

-- CreateIndex
CREATE INDEX "MedicineTransaction_batchId_idx" ON "MedicineTransaction"("batchId");

-- CreateIndex
CREATE INDEX "Vaccination_batchId_scheduledDate_idx" ON "Vaccination"("batchId", "scheduledDate");

-- CreateIndex
CREATE INDEX "Expense_farmId_expenseDate_idx" ON "Expense"("farmId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_batchId_idx" ON "Expense"("batchId");

-- CreateIndex
CREATE INDEX "Sale_farmId_saleDate_idx" ON "Sale"("farmId", "saleDate");

-- CreateIndex
CREATE INDEX "Sale_batchId_idx" ON "Sale"("batchId");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncOperation_operationId_key" ON "SyncOperation"("operationId");

-- CreateIndex
CREATE INDEX "SyncOperation_userId_status_idx" ON "SyncOperation"("userId", "status");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmMember" ADD CONSTRAINT "FarmMember_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmMember" ADD CONSTRAINT "FarmMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shed" ADD CONSTRAINT "Shed_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_shedId_fkey" FOREIGN KEY ("shedId") REFERENCES "Shed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecord" ADD CONSTRAINT "DailyRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedTransaction" ADD CONSTRAINT "FeedTransaction_feedItemId_fkey" FOREIGN KEY ("feedItemId") REFERENCES "FeedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedTransaction" ADD CONSTRAINT "FeedTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineTransaction" ADD CONSTRAINT "MedicineTransaction_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineTransaction" ADD CONSTRAINT "MedicineTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
