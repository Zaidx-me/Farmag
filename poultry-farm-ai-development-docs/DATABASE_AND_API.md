# Database Schema & API Design

## 1. Database

Database: PostgreSQL  
ORM: Prisma  
Primary key: UUID  
Currency: PKR initially

---

# 2. Core Entities

```text
User
 ├── Farm
 │    ├── Shed
 │    │    └── Batch
 │    │         ├── DailyRecord
 │    │         ├── FeedTransaction
 │    │         ├── MedicineUsage
 │    │         ├── Vaccination
 │    │         ├── Expense
 │    │         └── Sale
 │    └── ...
 └── Alert
```

---

# 3. User

Fields:

```text
id UUID PK
fullName
email UNIQUE
phone nullable
passwordHash
role
status
createdAt
updatedAt
```

Roles:

```text
OWNER
MANAGER
WORKER
ACCOUNTANT
```

---

# 4. Farm

```text
id UUID PK
ownerId UUID FK users.id
name
location
address nullable
phone nullable
farmType nullable
notes nullable
status
createdAt
updatedAt
```

---

# 5. Shed

```text
id UUID PK
farmId UUID FK farms.id
name
capacity INTEGER
type nullable
status
notes nullable
createdAt
updatedAt
```

---

# 6. Batch

```text
id UUID PK
farmId UUID FK farms.id
shedId UUID FK sheds.id
batchNumber UNIQUE within appropriate farm scope
breed
supplier nullable
arrivalDate
initialBirds INTEGER
initialAverageWeightKg DECIMAL nullable
costPerBird DECIMAL nullable
targetSaleDate nullable
status
notes nullable
createdAt
updatedAt
```

Statuses:

```text
UPCOMING
ACTIVE
SOLD
CLOSED
```

---

# 7. DailyRecord

```text
id UUID PK
batchId UUID FK batches.id
recordDate DATE
birdsAtStart INTEGER
mortality INTEGER
birdsRemaining INTEGER
feedConsumedKg DECIMAL nullable
waterConsumedLiters DECIMAL nullable
averageWeightKg DECIMAL nullable
temperatureC DECIMAL nullable
humidityPercent DECIMAL nullable
medicineNotes nullable
vaccinationNotes nullable
notes nullable
createdBy UUID FK users.id
createdAt
updatedAt
```

Recommended unique constraint:

```text
(batchId, recordDate)
```

unless multiple records/day are intentionally supported later.

---

# 8. FeedItem

```text
id UUID PK
farmId UUID FK farms.id
name
type
supplier nullable
unit
currentStock DECIMAL
lowStockThreshold DECIMAL
createdAt
updatedAt
```

Types:

```text
STARTER
GROWER
FINISHER
OTHER
```

---

# 9. FeedTransaction

```text
id UUID PK
feedItemId UUID FK feed_items.id
batchId UUID nullable FK batches.id
type
quantity DECIMAL
unitCost DECIMAL nullable
totalCost DECIMAL nullable
transactionDate
notes nullable
createdBy
createdAt
```

Types:

```text
PURCHASE
CONSUMPTION
ADJUSTMENT
```

---

# 10. Medicine

```text
id UUID PK
farmId UUID FK farms.id
name
supplier nullable
unit
currentStock DECIMAL
lowStockThreshold DECIMAL
expiryDate nullable
createdAt
updatedAt
```

---

# 11. MedicineTransaction

```text
id UUID PK
medicineId UUID FK medicines.id
batchId UUID nullable FK batches.id
type
quantity
transactionDate
notes
createdBy
createdAt
```

Types:

```text
PURCHASE
USAGE
ADJUSTMENT
```

---

# 12. Vaccination

```text
id UUID PK
batchId UUID FK batches.id
vaccineName
scheduledDate
completedDate nullable
dose nullable
supplier nullable
status
notes nullable
createdBy
createdAt
updatedAt
```

Statuses:

```text
UPCOMING
COMPLETED
MISSED
```

---

# 13. Expense

```text
id UUID PK
farmId UUID FK farms.id
batchId UUID nullable
category
description
amount DECIMAL
expenseDate
supplier nullable
paymentStatus
receiptObjectKey nullable
notes nullable
createdBy
createdAt
updatedAt
```

---

# 14. Sale

```text
id UUID PK
farmId UUID FK farms.id
batchId UUID FK batches.id
buyer
saleDate
birdsSold INTEGER
totalWeightKg DECIMAL
ratePerKg DECIMAL
totalAmount DECIMAL
amountReceived DECIMAL
outstandingAmount DECIMAL
paymentStatus
notes nullable
createdBy
createdAt
updatedAt
```

Payment statuses:

```text
PAID
PARTIALLY_PAID
PENDING
```

---

# 15. Alert

```text
id UUID PK
userId UUID FK users.id
farmId UUID nullable
batchId UUID nullable
type
severity
title
message
isRead
createdAt
readAt nullable
```

---

# 16. SyncOperation

Used for mobile offline synchronization.

```text
id UUID PK
operationId UNIQUE
userId
entity
entityId nullable
operationType
payload JSONB
status
retryCount
lastError nullable
createdAt
processedAt nullable
```

---

# 17. API Conventions

Base URL:

`https://api.example.com/api/v1`

Use JWT bearer authentication.

Example:

`Authorization: Bearer <access-token>`

---

# 18. Authentication Endpoints

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/forgot-password
POST /auth/reset-password
GET  /auth/me
```

---

# 19. Farm Endpoints

```text
GET    /farms
POST   /farms
GET    /farms/:farmId
PATCH  /farms/:farmId
DELETE /farms/:farmId
```

---

# 20. Shed Endpoints

```text
GET    /farms/:farmId/sheds
POST   /farms/:farmId/sheds
GET    /sheds/:shedId
PATCH  /sheds/:shedId
DELETE /sheds/:shedId
```

---

# 21. Batch Endpoints

```text
GET    /farms/:farmId/batches
POST   /farms/:farmId/batches
GET    /batches/:batchId
PATCH  /batches/:batchId
DELETE /batches/:batchId
```

---

# 22. Daily Record Endpoints

```text
GET    /batches/:batchId/daily-records
POST   /batches/:batchId/daily-records
GET    /daily-records/:recordId
PATCH  /daily-records/:recordId
DELETE /daily-records/:recordId
```

---

# 23. Feed Endpoints

```text
GET    /farms/:farmId/feed
POST   /farms/:farmId/feed
POST   /feed/:feedId/purchase
POST   /feed/:feedId/consume
GET    /feed/:feedId/transactions
```

---

# 24. Medicine Endpoints

```text
GET    /farms/:farmId/medicines
POST   /farms/:farmId/medicines
POST   /medicines/:medicineId/purchase
POST   /medicines/:medicineId/use
GET    /medicines/:medicineId/transactions
```

---

# 25. Vaccination Endpoints

```text
GET    /batches/:batchId/vaccinations
POST   /batches/:batchId/vaccinations
PATCH  /vaccinations/:vaccinationId
DELETE /vaccinations/:vaccinationId
```

---

# 26. Expense Endpoints

```text
GET    /farms/:farmId/expenses
POST   /farms/:farmId/expenses
GET    /expenses/:expenseId
PATCH  /expenses/:expenseId
DELETE /expenses/:expenseId
```

---

# 27. Sales Endpoints

```text
GET    /farms/:farmId/sales
POST   /farms/:farmId/sales
GET    /sales/:saleId
PATCH  /sales/:saleId
DELETE /sales/:saleId
```

---

# 28. Dashboard

Use an aggregated endpoint:

```text
GET /dashboard?farmId=<id>
```

Response:

```json
{
  "data": {
    "farms": 2,
    "activeBatches": 5,
    "totalBirds": 42100,
    "mortalityPercent": 3.1,
    "feedConsumedKg": 18450,
    "expenses": 3250000,
    "revenue": 4850000,
    "profit": 1600000
  }
}
```

The backend should calculate these from authorized data.

---

# 29. Reports

```text
GET /reports/growth
GET /reports/mortality
GET /reports/feed
GET /reports/medicine
GET /reports/vaccination
GET /reports/expenses
GET /reports/sales
GET /reports/profit-loss
GET /reports/batch-comparison
```

Common query parameters:

```text
farmId
batchId
from
to
```

---

# 30. Alerts

```text
GET   /alerts
PATCH /alerts/:alertId/read
POST  /alerts/read-all
```

---

# 31. Sync

```text
POST /sync/push
GET  /sync/pull?cursor=<cursor>
```

The exact sync protocol must be implemented transactionally and idempotently.

Do not assume network delivery is exactly-once.

---

# 32. Health

```text
GET /health
GET /ready
```

---

# 33. API Rules

- Validate all payloads.
- Enforce role permissions.
- Enforce farm ownership/scope.
- Never trust totals sent by the client for financial operations.
- Recalculate critical totals server-side.
- Use transactions for stock and financial operations.
- Use pagination for list endpoints.
- Return stable error codes.
