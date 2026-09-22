# Poultry Farm Management — MVP Design Specification

**Date:** 2026-09-22
**Status:** Approved-in-principle (source of truth: `poultry-farm-ai-development-docs/`)
**Product:** Poultry Farm Management (offline-first mobile + API)
**Commercial model:** Completely free MVP. No subscriptions/payments/paywalls any where.

---

## 1. Overview

An offline-first poultry farm management application. Farm owners, managers, workers, and
accountants record daily operations (birds, mortality, feed, weight, medicine, vaccination,
expenses, sales) on Android-first mobile devices and get centralized dashboards, reports, and
alerts.

The system has exactly two runtime components:

1. **Mobile app** (`apps/mobile`) — Expo / React Native. Primary UI. Offline-capable via SQLite.
2. **API** (`apps/api`) — Node.js + Fastify + PostgreSQL. Security and business authority boundary.

Plus two shared packages: `shared-types` and `validation` (single source of truth for domain
types and Zod schemas used by both apps).

**Key architectural rule (repeat):** the mobile app NEVER connects to PostgreSQL directly, and
never holds database credentials. All cross-device persistence flows through the API.

---

## 2. Scope

### 2.1 In scope (MVP)

- Authentication: register, login, logout, refresh, forgot/reset password, profile, roles.
- Farm, Shed, Batch (flock) lifecycle management.
- Daily records (birds, mortality, feed, water, weight, temp/humidity, notes).
- Feed inventory + purchase/consumption/adjustment transactions + low-stock alert.
- Medicine inventory + purchase/usage/adjustment transactions + expiry/low-stock alert.
- Vaccination schedule + completion + due reminders.
- Expenses (categorized) with payment status.
- Sales with payment tracking (received/outstanding, PAID/PARTIALLY_PAID/PENDING).
- Dashboard (aggregated backend endpoint).
- Reports: growth, mortality, feed, medicine, vaccination, expenses, sales, profit-loss,
  batch-comparison.
- Alerts: high mortality, low feed, low medicine, vaccination due, medicine expiry, low weight,
  payment overdue, sale date approaching.
- Offline-first: local SQLite + sync queue + idempotent push/pull.
- Export: CSV via mobile share sheet (PDF deferred, marked out of scope for code).
- Health endpoints `/health` and `/ready`.

### 2.2 Explicitly out of scope (MVP)

- Subscriptions, billing, plans, entitlements, payments gateways, Stripe, JazzCash/Easypaisa
  billing, IAP, premium locks, trial limits.
- Advertising, marketplace, feed marketplace, veterinary telemedicine, AI/disease diagnosis.
- Live IoT sensor integration.
- Complex accounting/ERP, multi-country tax.
- PDF export implementation (schema/API-ready only).
- Urdu/localization (i18n-friendly structure only).
- Firebase (Firestore is explicitly NOT the backend; rejected by design).

---

## 3. Monorepo structure

Root: `<workspace>/` (sibling of `poultry-farm-ai-development-docs/`).

```
├── apps/
│   ├── api/                      # Fastify API
│   └── mobile/                   # Expo mobile app
├── packages/
│   ├── shared-types/             # Pure TS types, no runtime deps
│   └── validation/               # Zod schemas
├── docs/superpowers/specs/       # This spec
├── docker-compose.yml            # postgres, minio, redis (dev)
├── package.json                  # workspace root scripts
├── pnpm-workspace.yaml
└── README.md
```

Package manager: **pnpm** workspaces.

---

## 4. Shared packages

### 4.1 `shared-types`

Pure TypeScript types (no runtime deps) shared by API and mobile:

- Enums: `UserRole` (OWNER, MANAGER, WORKER, ACCOUNTANT), `UserStatus` (ACTIVE, INACTIVE),
  `FarmStatus`, `ShedStatus`, `BatchStatus` (UPCOMING, ACTIVE, SOLD, CLOSED), `PaymentStatus`
  (PAID, PARTIALLY_PAID, PENDING), `FeedType` (STARTER, GROWER, FINISHER, OTHER),
  `FeedTransactionType` (PURCHASE, CONSUMPTION, ADJUSTMENT), `MedicineTransactionType`
  (PURCHASE, USAGE, ADJUSTMENT), `VaccinationStatus` (UPCOMING, COMPLETED, MISSED),
  `ExpenseCategory` (11 categories from PRD), `AlertType`, `AlertSeverity`,
  `SyncOperationType`, `SyncOperationStatus` (PENDING, SYNCING, SYNCED, FAILED).
- Entity interfaces matching the Prisma model (see §6).
- API envelope types: `ApiSuccess<T> = { data: T; meta?: Record<string, unknown> }`,
  `ApiError = { error: { code: string; message: string; details?: unknown } }`.
- DTOs for sync: `SyncOperationInput`, `SyncPushRequest`, `SyncPullResponse`.

### 4.2 `validation`

Zod schemas, one per endpoint, under `src/schemas/` grouped by module. Both server (request
validation) and mobile (React Hook Form resolvers) import from here.

- `auth.ts`, `farm.ts`, `shed.ts`, `batch.ts`, `dailyRecord.ts`, `feed.ts`, `medicine.ts`,
  `vaccination.ts`, `expense.ts`, `sale.ts`, `sync.ts`, `common.ts` (pagination, ids, dates).
- All monetary and measurement fields use Zod `decimal`-string validation (never float).
- Ids validated as UUID.

---

## 5. Backend architecture (`apps/api`)

### 5.1 Module layout

```
src/
  config/            # env (validated), constants
  plugins/           # fastify plugins: auth, authorization, error-handler, swagger, rate-limit
  middleware/        # guards, request logging
  modules/
    auth/            # register, login, refresh, logout, forgot/reset, me
    users/
    farms/
    sheds/
    batches/
    daily-records/
    feed/
    medicine/
    vaccinations/
    expenses/
    sales/
    reports/
    alerts/
    files/
    sync/
  utils/             # errors, pagination, db helpers
  app.ts             # builds fastify instance (register plugins + routes)
  server.ts          # entrypoint
prisma/
  schema.prisma
  migrations/
```

Each module: `routes.ts` (fastify plugin registering routes), `schema.ts` (Zod request schemas),
`service.ts` (business logic), `types.ts` (module-local types).

### 5.2 Tech

- Fastify v5, TypeScript strict.
- Prisma ORM, PostgreSQL 16.
- Argon2id password hashing (via `argon2` package).
- `@fastify/jwt` for access tokens (15 min) — signed HS256 with env secret.
- Refresh tokens: 30-day random opaque tokens stored hashed in `RefreshToken` table
  (revocable, rotated on use).
- `@fastify/rate-limit` on auth routes.
- `@fastify/swagger` + `@fastify/swagger-ui` for OpenAPI at `/documentation` (dev only).
- pino structured logging; error handler maps stable error codes, never leaks stack traces.
- `@fastify/cors` configured for mobile origins only.

### 5.3 Response envelopes

Success: `{ "data": ..., "meta": { "page", "pageSize", "total", ... } }`
Error: `{ "error": { "code", "message", "details"? } }`

Stable error codes (from TDD.md):
`AUTH_INVALID_CREDENTIALS`, `AUTH_UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`,
`VALIDATION_ERROR`, `BATCH_BIRD_COUNT_INVALID`, `STOCK_INSUFFICIENT`, `PAYMENT_EXCEEDS_TOTAL`,
`SYNC_CONFLICT`, `INTERNAL_ERROR`, plus `DUPLICATE_EMAIL`, `RATE_LIMITED`,
`TOKEN_EXPIRED`, `TOKEN_INVALID`, `DUPLICATE_DAILY_RECORD`.

### 5.4 Authorization model

**Server-side only.** Never trust client role/scope claims beyond the signed JWT `sub`+`role`.

- Permissions matrix (role → allowed actions):

| Action area | OWNER | MANAGER | WORKER | ACCOUNTANT |
|---|---|---|---|---|
| Farms CRUD | ✅ | ✅ (assigned) | ❌ | ❌ |
| Sheds CRUD | ✅ | ✅ (assigned) | ❌ | ❌ |
| Batches CRUD | ✅ | ✅ (assigned) | ❌ | ❌ |
| Daily records | ✅ | ✅ | ✅ (assigned farm/shed) | ❌ |
| Feed/Medicine inventory | ✅ | ✅ | ❌ | ❌ |
| Vaccinations | ✅ | ✅ | ✅ (record completion) | ❌ |
| Expenses/Sales | ✅ | ❌ | ❌ | ✅ |
| Reports | ✅ | ✅ | ❌ | ✅ |
| Alerts | ✅ | ✅ | ✅ (own) | ✅ |
| User management | ✅ (own farm) | ❌ | ❌ | ❌ |
| Dashboard | ✅ | ✅ | ❌ | ✅ |

- MVP access rule: a farm is owned by one user (`Farm.ownerId`). Farm-scoped reads/writes query
  `WHERE farm.ownerId = userId` (or farm membership for shared roles). Users who are not the
  owner of a farm simply see `RESOURCE_NOT_FOUND` for that farm — no cross-farm ID swapping.
- Batches/sheds/daily records are always resolved through their farm and subject to the same check.
- `WORKER` and `ACCOUNTANT` participation is modeled by `Farm` having a `ownerId` plus a join
  `FarmMember` table: `(farmId, userId, role)` — enables delegated roles while keeping
  ownership unambiguous. (Adds one table beyond DATABASE_AND_API.md; documented reason: the
  `Farm.ownerId` FK alone cannot represent a worker/accountant without farm ownership.)

### 5.5 Transactions & data integrity

All mutation of the following run inside `prisma.$transaction`:

- Feed purchase/consumption/adjustment (update `FeedItem.currentStock` + create
  `FeedTransaction`; reject if `consumption > currentStock` → `STOCK_INSUFFICIENT`).
- Medicine purchase/usage/adjustment (same pattern).
- Daily record create/update (verify birds: `mortality <= birdsAtStart`,
  `birdsRemaining >= 0`; enforce `unique(batchId, recordDate)` → `DUPLICATE_DAILY_RECORD`).
- Sale create/payment update (`totalAmount = totalWeightKg × ratePerKg` recalculated server-side;
  `amountReceived <= totalAmount` → `PAYMENT_EXCEEDS_TOTAL`; `outstanding` recomputed).
- Batch create (initial bird counts), batch status transitions.
- Auth refresh rotation (revoke old + create new in one tx).

Client-sent totals are NEVER trusted for financial/stock writes — always recompute server-side.

### 5.6 Business calculations (backend authoritative)

Centralized in `apps/api/src/modules/<module>/calculations.ts` AND mirrored in mobile
`src/utils/calculations/` (client side only for UX). Both import shared formula implementations
where practical; backend results persist.

- `currentBirds = initialBirds - cumulativeMortality - cumulativeBirdsSold` (floor 0).
- `mortalityPct = cumulativeMortality / initialBirds × 100`.
- `totalAmount = totalWeightKg × ratePerKg`.
- `outstanding = totalAmount - amountReceived`.
- `feedClosing = openingStock + purchases - consumption` (never negative; enforced).
- `profit = salesRevenue - totalExpenses`; when data incomplete → labeled
  `estimated`/`incomplete`, never presented as definitive.
- **FCR (documented methodology):** batch cumulative FCR =
  `Σ dailyRecord.feedConsumedKg` ÷ `totalLiveWeightGainKg`, where
  `totalLiveWeightGainKg = (currentBirds × currentAvgWeightKg) - (initialBirds × initialAverageWeightKg)`.
  Uses all daily records from `arrivalDate` through the report `to` date; if any required
  weight/feed field is missing in the window, FCR is reported as `incomplete`.

---

## 6. Data model (Prisma)

All tables per DATABASE_AND_API.md §3–16 with these refinements:

- All monetary/measurement columns: `Decimal` (mapped to numeric), never float.
- Timestamps: `timestamptz` (`DateTime @db.Timestamptz`).
- PKs: UUID (`@default(uuid())`).
- Additions beyond DATABASE_AND_API.md:
  - `RefreshToken { id, userId, tokenHash, expiresAt, revokedAt?, createdAt }`.
  - `FarmMember { id, farmId, userId, role }` with `@@unique([farmId, userId])`.
- Unique constraints: `User.email`, `DailyRecord(batchId, recordDate)`,
  `SyncOperation.operationId`, `FarmMember(farmId, userId)`.
- Indexes: `Farm.ownerId`, `Shed.farmId`, `Batch.farmId`, `Batch.shedId`,
  `DailyRecord.batchId+recordDate`, `FeedTransaction.feedItemId+transactionDate`,
  `MedicineTransaction.medicineId+transactionDate`, `Expense.farmId+expenseDate`,
  `Sale.batchId+saleDate`, `Alert.userId+createdAt`, `RefreshToken.userId`,
  `SyncOperation.userId+status`.
- Batch `batchNumber` unique within farm scope: `@@unique([farmId, batchNumber])`.
- JSONB columns: `DailyRecord` none; `SyncOperation.payload Json`.
- CASCADE/deletion policy: `DELETE /farms/:farmId` succeeds (hard delete) only when the farm has
  no sheds/batches/members; otherwise returns `409 FARM_HAS_DEPENDENCIES`. Sheds: hard delete
  only when empty of batches; otherwise `409 SHED_HAS_DEPENDENCIES`. Batches: never hard-deleted
  once records exist — `POST /batches/:batchId/close` (status `CLOSED`) is the archive path.
  Daily records, transactions, expenses, sales: hard delete allowed only by OWNER/authorized
  role with the same farm-ownership check.

Migration strategy: Prisma migrations committed; never mutate production schema by hand.

---

## 7. API surface (`/api/v1`)

Exactly the routes from DATABASE_AND_API.md §18–32, plus:

- `POST /sync/push` (body: `{ operations: SyncOperationInput[] }`) — idempotent per
  `operationId`; applies ops in a transaction; returns per-op results with error codes.
- `GET /sync/pull?cursor=<ISO>&limit=` — returns records changed after cursor, ordered by
  `updatedAt`, plus `nextCursor` in meta.
- `PATCH /farms/:farmId/members` — owner adds/updates member roles.
- `GET /farms/:farmId/members`.
- `POST /batches/:batchId/close`, `POST /batches/:batchId/open` (status transitions only if valid).
- `GET /alerts`, `PATCH /alerts/:alertId/read`, `POST /alerts/read-all`.
- `GET /dashboard?farmId=&batchId=` — aggregated response per DATABASE_AND_API.md §28.
- Reports per §29 with `farmId`, `batchId`, `from`, `to` filters; all derived from authorized
  data; `labels` indicate `actual`/`estimated`/`incomplete`.
- `GET /health`, `GET /ready` (no sensitive config).

Pagination: list endpoints accept `page` (1-based) + `pageSize` (default 20, max 100), return
`meta.total`. Filters: `from`, `to`, `status`, `batchId`, `category` where relevant.

---

## 8. Offline sync protocol

### 8.1 Local queue (mobile SQLite)

Table `sync_operations`:

```text
id TEXT PK          -- local UUID
operationId TEXT    -- client-generated UUID (idempotency key)
entity TEXT         -- e.g. 'dailyRecord', 'expense'
operationType TEXT  -- CREATE | UPDATE | DELETE
entityId TEXT
payload TEXT        -- JSON
status TEXT         -- pending | syncing | synced | failed
retryCount INTEGER
lastError TEXT
createdAt TEXT      -- ISO
```

### 8.2 Push

1. On connectivity, mobile uploads `pending` ops in creation order.
2. API validates idempotency: if `operationId` exists in `SyncOperation` with `status=synced`,
   returns the stored result and the mobile marks the op synced (no duplicate business record).
3. On success → `synced`. On failure → `failed` + `lastError`; retry with exponential backoff
   (cap 5); failed ops surfaced in UI ("N items waiting to sync"), never silently dropped.

### 8.3 Pull

- `updatedAt` cursor; server returns changed entities since cursor; mobile upserts into local SQLite.
- Conflict strategy (MVP): **server authoritative.** For `unique(batchId, recordDate)` daily
  records, conflicting push → `SYNC_CONFLICT` with the server copy in `details`; mobile keeps the
  server record and flags the local edit for manual review. Financial/stock ops never
  last-write-wins blindly.

### 8.4 Offline rules

- Every local mutation gets `operationId` immediately on save.
- Daily entry, expense, sale, feed/medicine consumption all work fully offline.
- Reads: cached local copies via TanStack Query `staleTime` + SQLite fallback.

---

## 9. Mobile architecture (`apps/mobile`)

### 9.1 Stack

- Expo SDK (current stable) with TypeScript, Expo Router (file-based), NativeWind v4 (Tailwind),
  React Hook Form + Zod (from `validation` package), Zustand (auth/session + sync queue state),
  TanStack Query (server state), `expo-sqlite` (local store), `expo-secure-store` (tokens),
  `@react-native-async-storage/async-storage` if needed for non-sensitive, `react-native-keyboard-
  controller` for forms (evaluate), `expo-crypto` for UUID generation.

### 9.2 Structure

```
app/
  _layout.tsx
  (auth)/         # login, register, forgot-password, reset-password
  (app)/          # protected group
    _layout.tsx   # tabs
    (tabs)/
      index.tsx       # Dashboard
      batches.tsx     # Batches list
      feed.tsx        # Feed
      health.tsx      # Medicine + Vaccinations
      finance.tsx     # Expenses + Sales
      alerts.tsx      # Alerts
      more.tsx        # More (farms, sheds, users, profile, reports, settings)
    batch/[batchId].tsx
    daily-entry/[batchId].tsx
    expense/new.tsx
    sale/new.tsx
    ...
src/
  components/     # ui primitives + feature components
  features/       # feature-oriented (auth/, farms/, batches/, daily-entry/, feed/, ...)
  hooks/          # useDailyEntry, useFarms, useSync, ...
  services/       # api client, sync engine, export
  store/          # zustand: auth store, sync store
  database/       # sqlite init, repositories, migrations
  utils/
    calculations/ # birds, mortality, feed, fcr, profit, sales (mirrors backend)
  types/
  validation/
  constants/
```

### 9.3 Key flows

- **Daily entry (highest-frequency):** Dashboard/Batches → pick active batch → pre-filled today
  form (yesterday's feed/humidity weights as hints) → save → local SQLite + queue → sync.
  Target: < 60 s.
- **Auth:** token pair in SecureStore; access token attached via api client; on 401 → refresh →
  retry; refresh fail → logout.
- **Alerts:** banner + list; pull-to-refresh; local cache.
- **Offline indicator:** global banner when sync queue non-empty or network absent.
- Every async screen has loading/success/error/empty/retry states (shared screen-state
  components). No placeholder buttons; every visible action wired.

---

## 10. Testing strategy

- **Shared packages:** vitest + `tsc --noEmit`. Calculations 90%+ coverage.
- **API:** vitest + Fastify `inject()` against PostgreSQL test DB (Docker). Cover: auth flow,
  farm/shed/batch CRUD, authorization matrix (User A ≠ User B; role restrictions), data
  integrity (negative stock/birds rejected, overpayment rejected, duplicate daily record),
  idempotent sync push (same op twice → one record), dashboard/report aggregation, alerts.
- **Mobile:** vitest for calculations + sync queue logic + validation; jest-expo for
  components (light); manual E2E checklist for device flows (E2E-01..04 from TESTING.md).
- Gates: `tsc --noEmit` clean on api + mobile + packages; vitest green; lint clean.

---

## 11. Deployment & infrastructure

- `docker-compose.yml` at root: `postgres:16` (volume), `minio` (volume), `redis` (optional).
- API Dockerfile; Coolify-ready (env vars for DATABASE_URL, JWT secrets, PORT; healthchecks).
- Backups: pg_dump cron in compose (daily, retention 7, off-server copy documented).
- HTTPS: Coolify-managed; DB port not exposed publicly.
- Seeding: `prisma db seed` with dev fixture (10 farms/50 sheds/100 batches scale for perf tests).

---

## 12. Non-functional requirements

- TypeScript strict everywhere; no `any`.
- No secrets in code; env-only. `.env.example` committed, `.env` gitignored.
- Logging never includes passwords/tokens.
- Money as Decimal/numeric strings end-to-end.
- All endpoints validate input; error envelope stable; no stack traces to clients.

---

## 13. Build sequence (execution order for implementation plan)

1. Toolchain install (Node, pnpm, Docker) + workspace scaffold + git init.
2. `shared-types` + `validation` packages with tests.
3. Prisma schema + migrations + seed.
4. API core: config, plugins (auth, errors, rate-limit, swagger), error codes.
5. API modules in dependency order: auth → users → farms → sheds → batches → daily-records →
   feed → medicine → vaccinations → expenses → sales → reports/alerts/dashboard → sync → files.
6. API integration + authorization + integrity tests.
7. Mobile scaffold (expo-router tabs) + auth screens + api client + secure store.
8. Mobile feature screens (dashboard → batches → daily entry → feed → health → finance →
   alerts → reports/settings) with offline SQLite + sync engine.
9. Mobile tests + manual E2E checklist.
10. Full verification: type-check, unit, integration, smoke `docker-compose up`.