# Poultry Farm Management MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete offline-first Poultry Farm Management MVP — pnpm monorepo with a Fastify+PostgreSQL API, an Expo mobile app, and shared types/validation packages — per the approved spec.

**Architecture:** Three-layer monorepo. `packages/shared-types` + `packages/validation` are the single source of truth for domain types and Zod schemas consumed by both apps. `apps/api` is the security/business authority boundary (Fastify → service → Prisma → PostgreSQL, JWT auth, role authorization, transactional stock/finance writes, idempotent sync endpoint). `apps/mobile` is the offline-first Expo client (Expo Router, NativeWind, Zustand, TanStack Query, SQLite local store + sync queue with operationId idempotency).

**Tech Stack:** Node 22 LTS, pnpm workspaces, TypeScript strict, Fastify 5, Prisma + PostgreSQL 16, Zod 3, Argon2id, @fastify/jwt, vitest, Expo SDK ~53, Expo Router, NativeWind v4, expo-sqlite, React Hook Form, Zustand, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-22-poultry-farm-mvp-design.md` (the plan argues from the spec; executors read both).

**Workspace root:** `/run/media/ranarehman/New Volume1/Poultary_Man/`

---

## Global Constraints

- TypeScript `strict: true` everywhere; zero `any` (no `as any`, no `@ts-ignore`).
- No subscriptions/payments/paywalls/premium labels anywhere (MVP is free).
- No Firebase. Mobile never connects to PostgreSQL; no DB credentials in mobile.
- Money and measurements: `Decimal`/numeric strings end-to-end; never floats.
- API response envelopes: success `{ data, meta? }`, error `{ error: { code, message, details? } }`; never leak stack traces.
- All routes under `/api/v1`; auth via `Authorization: Bearer <access-token>`.
- Roles: OWNER, MANAGER, WORKER, ACCOUNTANT. Server-side authorization only.
- Farm-scoped access: `WHERE farm.ownerId = userId` OR `FarmMember(userId)`; cross-farm access returns `RESOURCE_NOT_FOUND`.
- Critical writes in `prisma.$transaction`: feed/medicine stock moves, daily records, sales+payments, batch creation, refresh rotation.
- Server never trusts client-sent totals for money/stock — recomputes.
- Client-sent `operationId` deduplicates sync writes (idempotency).
- Env secrets only; commit `.env.example`, never `.env`.
- No placeholder buttons; every visible mobile action wired; every async screen has loading/success/error/empty/retry.
- Money currency: PKR (numeric strings, 2dp enforced).
- Commits: conventional (`feat:`, `fix:`, `test:`, `chore:`), one per task step group.

## Review Focus

Input classes the spec implies but no single test obviously exercises — each is pinned by a test in the owning task:

1. **Mortality > birds at start, offline on device** → daily-entry form must block it locally AND server must reject with `BATCH_BIRD_COUNT_INVALID` (Task 16 server test, Task 33 mobile guard).
2. **Two daily records same batch+date (two devices / offline edit)** → server returns `DUPLICATE_DAILY_RECORD`, sync surfaces `SYNC_CONFLICT`, never silently overwrites (Task 16, Task 24).
3. **Network flaps mid-sync; same op delivered twice** → exactly one business record; op marked synced, never duplicated, never lost (Task 24, Task 29).
4. **Money input with >2 decimal places** → validation error, not silent rounding (Task 9, Task 21).
5. **WORKER/ACCOUNTANT opening a farm they don't belong to** → `RESOURCE_NOT_FOUND`, no data leak, and frontend role-hiding is not security (Task 13, Task 26).

---

## File Structure (full map)

```
apps/api/
  prisma/schema.prisma, prisma/seed.ts, prisma/migrations/
  src/config/env.ts
  src/plugins/error-handler.ts, auth.ts (jwt+decorators), swagger.ts, rate-limit.ts
  src/utils/errors.ts, pagination.ts, decimal.ts, audit.ts
  src/app.ts, src/server.ts
  src/modules/{auth,users,farms,sheds,batches,daily-records,feed,medicine,vaccinations,expenses,sales,reports,alerts,files,sync}/
    routes.ts, service.ts, schema.ts, types.ts
  src/modules/reports/{dashboard.ts,growth.ts,mortality.ts,feed.ts,medicine.ts,vaccination.ts,expenses.ts,sales.ts,profit-loss.ts,batch-comparison.ts}
  tests/ (vitest; fastify inject; per-module .test.ts + authorization.test.ts + integrity.test.ts)
apps/mobile/
  app/_layout.tsx, (auth)/{login,register,forgot-password}.tsx, (app)/_layout.tsx,
  (app)/(tabs)/{index,batches,feed,health,finance,alerts,more}.tsx,
  (app)/batch/[batchId].tsx, (app)/daily-entry/[batchId].tsx,
  (app)/farms/{index,new,[farmId]}.tsx, (app)/sheds/[shedId].tsx,
  (app)/expense/{new,[expenseId]}.tsx, (app)/sale/{new,[saleId]}.tsx,
  (app)/vaccination/new.tsx, (app)/reports/{index,growth,mortality,feed,expenses,sales,profit-loss,batch-comparison}.tsx,
  (app)/profile.tsx, (app)/settings.tsx
  src/components/ui/{ScreenState,Button,Input,Card,Select,ConfirmDialog,Badge,EmptyState,OfflineBanner}.tsx
  src/services/{api-client,api,refresh,export-csv,sync-engine}.ts
  src/store/{auth-store,sync-store}.ts
  src/database/{db,repository,sync-queue,migrations}.ts
  src/utils/calculations/{birds,mortality,feed,fcr,profit,sales}.ts
  src/features/... (per feature)
  src/hooks/use*.ts
packages/shared-types/src/{index.ts,enums.ts,entities.ts,api.ts,sync.ts}
packages/validation/src/{index.ts,schemas/{common,auth,farm,shed,batch,daily-record,feed,medicine,vaccination,expense,sale,sync}.ts}
docker-compose.yml, package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore, README.md
```

---

## Phase 0 — Toolchain + Workspace

### Task 1: Install toolchain

**Files:** none (system)

- [ ] **Step 1: Check existing installs**

Run: `which node pnpm docker psql` (on CachyOS/Arch). Expected: unknown/absent.

- [ ] **Step 2: Install Node 22 LTS + pnpm**

Run: `sudo pacman -S --noconfirm nodejs npm` then `sudo corepack enable && sudo corepack prepare pnpm@9 --activate` (fallback `sudo npm i -g pnpm@9`). Verify: `node --version` ≥ v22, `pnpm --version` ≥ 9.

- [ ] **Step 3: Install Docker + Docker Compose**

Run: `sudo pacman -S --noconfirm docker docker-compose` then `sudo systemctl enable --now docker.service`. Verify: `docker --version` and `docker compose version` succeed. If Docker daemon unavailable (e.g. no privileges), note it and continue — PostgreSQL for tests is required at Task 11, raise the blocker there.

- [ ] **Step 4: Verify**

Run: `node -v && pnpm -v && docker --version`. Expected: all present.

### Task 2: Scaffold workspace root

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.gitattributes`, `README.md`, `docker-compose.yml`

**Interfaces:**
- Produces: workspace root scripts `typecheck`, `test`, `lint`; workspaces `apps/*`, `packages/*`.

- [ ] **Step 1: Init repo**

```bash
cd "<workspace root>"
git init -b main
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "poultry-farm",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "db:up": "docker compose up -d postgres minio",
    "db:down": "docker compose down"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "prettier": "^3.3.0"
  }
}
```

- [ ] **Step 3: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.expo/
android/
ios/
coverage/
```

- [ ] **Step 6: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: poultry
      POSTGRES_PASSWORD: poultry_dev_password
      POSTGRES_DB: poultry
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U poultry"]
      interval: 5s
      timeout: 5s
      retries: 10
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: poultry_test
      POSTGRES_PASSWORD: poultry_test_password
      POSTGRES_DB: poultry_test
    ports: ["5433:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U poultry_test"]
      interval: 5s
      timeout: 5s
      retries: 10
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: poultry
      MINIO_ROOT_PASSWORD: poultry_minio_secret
    ports: ["9000:9000", "9001:9001"]
    volumes: [miniodata:/data]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 7: Write `README.md`** — 10-line summary: monorepo layout, `pnpm install`, `pnpm db:up`, per-app dev commands, link to docs.

- [ ] **Step 8: Bootstrap + commit**

```bash
pnpm install
git add -A
git commit -m "chore: scaffold pnpm workspace"
```

---

## Phase 1 — Shared Packages

### Task 3: `shared-types` — enums and API envelopes

**Files:**
- Create: `packages/shared-types/package.json`, `packages/shared-types/tsconfig.json`, `packages/shared-types/src/enums.ts`, `packages/shared-types/src/api.ts`, `packages/shared-types/src/index.ts`

**Interfaces:**
- Produces: `UserRole`, `UserStatus`, `FarmStatus`, `ShedStatus`, `BatchStatus`, `PaymentStatus`, `FeedType`, `FeedTransactionType`, `MedicineTransactionType`, `VaccinationStatus`, `ExpenseCategory`, `AlertType`, `AlertSeverity`, `SyncOperationType`, `SyncOperationStatus`, `ApiSuccess<T>`, `ApiError`, `ApiErrorCode`.

- [ ] **Step 1: Write package manifest**

```json
{
  "name": "@poultry/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.6.0" }
}
```

- [ ] **Step 2: Write `enums.ts`** — exact enum union strings:

```ts
export const UserRole = { Owner: 'OWNER', Manager: 'MANAGER', Worker: 'WORKER', Accountant: 'ACCOUNTANT' } as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const UserStatus = { Active: 'ACTIVE', Inactive: 'INACTIVE' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const FarmStatus = { Active: 'ACTIVE', Inactive: 'INACTIVE' } as const;
export type FarmStatus = (typeof FarmStatus)[keyof typeof FarmStatus];
export const ShedStatus = { Active: 'ACTIVE', Inactive: 'INACTIVE' } as const;
export type ShedStatus = (typeof ShedStatus)[keyof typeof ShedStatus];
export const BatchStatus = { Upcoming: 'UPCOMING', Active: 'ACTIVE', Sold: 'SOLD', Closed: 'CLOSED' } as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];
export const PaymentStatus = { Paid: 'PAID', PartiallyPaid: 'PARTIALLY_PAID', Pending: 'PENDING' } as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export const FeedType = { Starter: 'STARTER', Grower: 'GROWER', Finisher: 'FINISHER', Other: 'OTHER' } as const;
export type FeedType = (typeof FeedType)[keyof typeof FeedType];
export const FeedTransactionType = { Purchase: 'PURCHASE', Consumption: 'CONSUMPTION', Adjustment: 'ADJUSTMENT' } as const;
export type FeedTransactionType = (typeof FeedTransactionType)[keyof typeof FeedTransactionType];
export const MedicineTransactionType = { Purchase: 'PURCHASE', Usage: 'USAGE', Adjustment: 'ADJUSTMENT' } as const;
export type MedicineTransactionType = (typeof MedicineTransactionType)[keyof typeof MedicineTransactionType];
export const VaccinationStatus = { Upcoming: 'UPCOMING', Completed: 'COMPLETED', Missed: 'MISSED' } as const;
export type VaccinationStatus = (typeof VaccinationStatus)[keyof typeof VaccinationStatus];
export const ExpenseCategory = {
  Chicks: 'CHICKS', Feed: 'FEED', Medicine: 'MEDICINE', Vaccination: 'VACCINATION', Labour: 'LABOUR',
  Electricity: 'ELECTRICITY', Gas: 'GAS', Transport: 'TRANSPORT', Maintenance: 'MAINTENANCE',
  Equipment: 'EQUIPMENT', Other: 'OTHER'
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];
export const AlertType = {
  HighMortality: 'HIGH_MORTALITY', LowFeed: 'LOW_FEED', LowMedicine: 'LOW_MEDICINE',
  VaccinationDue: 'VACCINATION_DUE', MedicineExpiry: 'MEDICINE_EXPIRY', LowWeight: 'LOW_WEIGHT',
  PaymentOverdue: 'PAYMENT_OVERDUE', SaleDateApproaching: 'SALE_DATE_APPROACHING'
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];
export const AlertSeverity = { Info: 'INFO', Warning: 'WARNING', Critical: 'CRITICAL' } as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];
export const SyncOperationType = { Create: 'CREATE', Update: 'UPDATE', Delete: 'DELETE' } as const;
export type SyncOperationType = (typeof SyncOperationType)[keyof typeof SyncOperationType];
export const SyncOperationStatus = { Pending: 'PENDING', Syncing: 'SYNCING', Synced: 'SYNCED', Failed: 'FAILED' } as const;
export type SyncOperationStatus = (typeof SyncOperationStatus)[keyof typeof SyncOperationStatus];
```

- [ ] **Step 3: Write `api.ts`**

```ts
export interface ApiSuccess<T> { data: T; meta?: Record<string, unknown>; }
export type ApiErrorCode =
  | 'AUTH_INVALID_CREDENTIALS' | 'AUTH_UNAUTHORIZED' | 'FORBIDDEN' | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR' | 'BATCH_BIRD_COUNT_INVALID' | 'STOCK_INSUFFICIENT' | 'PAYMENT_EXCEEDS_TOTAL'
  | 'SYNC_CONFLICT' | 'INTERNAL_ERROR' | 'DUPLICATE_EMAIL' | 'RATE_LIMITED'
  | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'DUPLICATE_DAILY_RECORD' | 'FARM_HAS_DEPENDENCIES'
  | 'SHED_HAS_DEPENDENCIES' | 'RESET_TOKEN_INVALID' | 'EMAIL_NOT_FOUND' | 'ENTITY_NOT_SYNCABLE';
export interface ApiError { error: { code: ApiErrorCode; message: string; details?: unknown }; }
export interface PaginationMeta { page: number; pageSize: number; total: number; totalPages: number; }
export { };
```

- [ ] **Step 4: Write `index.ts`** re-exporting `./enums.js` and `./api.js` (NodeNext requires `.js` extensions on relative imports).

- [ ] **Step 5: Add a smoke test file `packages/shared-types/src/enums.test.ts`** (vitest; add `vitest` devDep + `"test": "vitest run"`):

```ts
import { describe, expect, it } from 'vitest';
import { BatchStatus, UserRole } from './enums.js';
describe('enums', () => {
  it('has the documented role set', () => {
    expect(Object.values(UserRole).sort()).toEqual(['ACCOUNTANT', 'MANAGER', 'OWNER', 'WORKER']);
    expect(Object.values(BatchStatus).sort()).toEqual(['ACTIVE', 'CLOSED', 'SOLD', 'UPCOMING']);
  });
});
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @poultry/shared-types test && pnpm --filter @poultry/shared-types typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): enums and api envelopes"
```

### Task 4: `shared-types` — entities and sync DTOs

**Files:**
- Create: `packages/shared-types/src/entities.ts`, `packages/shared-types/src/sync.ts`; Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/entities.test.ts`

**Interfaces:**
- Produces: `AuthUser`, `Farm`, `Shed`, `Batch`, `DailyRecord`, `FeedItem`, `FeedTransaction`, `Medicine`, `MedicineTransaction`, `Vaccination`, `Expense`, `Sale`, `Alert`, `FarmMember`, `SyncOperationInput`, `SyncPushRequest`, `SyncPushResult`, `SyncPullResponse`.

- [ ] **Step 1: Write `entities.ts`** — interfaces exactly matching the Prisma model (all snake_case→camelCase fields, `Decimal`-backed fields as `string` on the wire, `Date` serialized as ISO strings; entities as described in spec §6). Include every field from DATABASE_AND_API.md §3–16 (e.g. `DailyRecord: { id, batchId, recordDate, birdsAtStart, mortality, birdsRemaining, feedConsumedKg?, waterConsumedLiters?, averageWeightKg?, temperatureC?, humidityPercent?, medicineNotes?, vaccinationNotes?, notes?, createdBy, createdAt, updatedAt }`), plus `FarmMember { id, farmId, userId, role }` and `RefreshToken { id, userId, tokenHash, expiresAt, revokedAt?, createdAt }`.

- [ ] **Step 2: Write `sync.ts`**

```ts
import type { SyncOperationStatus, SyncOperationType } from './enums.js';
export interface SyncOperationInput {
  operationId: string;        // client UUID, idempotency key
  entity: string;             // 'dailyRecord' | 'expense' | 'sale' | ...
  operationType: SyncOperationType;
  entityId?: string;          // client-local UUID for CREATE
  payload: Record<string, unknown>;
  createdAt: string;          // ISO
}
export interface SyncPushRequest { operations: SyncOperationInput[]; }
export interface SyncPushResult {
  operationId: string;
  status: SyncOperationStatus;
  entityId?: string;
  error?: { code: string; message: string };
}
export interface SyncChange<T = Record<string, unknown>> {
  entity: string;
  entityId: string;
  updatedAt: string;
  data: T;
}
export interface SyncPullResponse { changes: SyncChange[]; nextCursor: string | null; }
```

- [ ] **Step 3: Update `index.ts`** to re-export entities + sync.

- [ ] **Step 4: Write `entities.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Batch, DailyRecord } from './entities.js';
describe('entities', () => {
  it('expose camelCase wire fields', () => {
    const daily: DailyRecord = {
      id: 'uuid', batchId: 'uuid', recordDate: '2026-01-01', birdsAtStart: 10000,
      mortality: 100, birdsRemaining: 9900, createdBy: 'uuid', createdAt: '', updatedAt: ''
    };
    expect(daily.birdsRemaining).toBe(9900);
    const b: Batch = { id: 'u', farmId: 'u', shedId: 'u', batchNumber: 'B-001', breed: 'Broiler',
      arrivalDate: '2026-01-01', initialBirds: 10000, status: 'ACTIVE', createdAt: '', updatedAt: '' };
    expect(b.status).toBe('ACTIVE');
  });
});
```

- [ ] **Step 5: Run + commit** (same commands as Task 3; commit `feat(shared-types): entities and sync dto`).

## Phase 1b — Validation Package

### Task 5: `validation` — common primitives

**Files:**
- Create: `packages/validation/package.json`, `packages/validation/tsconfig.json`, `packages/validation/src/schemas/common.ts`, `packages/validation/src/index.ts`
- Test: `packages/validation/src/schemas/common.test.ts`

**Interfaces:**
- Consumes: `@poultry/shared-types` (enums).
- Produces: `uuidSchema`, `dateSchema`, `isoDateSchema`, `decimalSchema`, `nonNegativeDecimalSchema`, `optionalDecimalSchema`, `paginationQuerySchema`, `pidSchema` (farmId/batchId/etc. param helper), `moneySchema` (string, 2dp max).

- [ ] **Step 1: Manifest** — same shape as Task 3 manifest, name `@poultry/validation`, deps `{ "zod": "^3.23.0", "@poultry/shared-types": "workspace:*" }`, scripts `build`, `typecheck`, `test` (vitest).

- [ ] **Step 2: Write `common.ts`**

```ts
import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const isoDateSchema = z.string().datetime({ offset: true });
/** Money/measurement as decimal string, up to 2dp — never float. */
export const moneySchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number with at most 2 decimal places');
export const decimalSchema = z.string().regex(/^\d+(\.\d+)?$/);
export const nonNegativeDecimalSchema = decimalSchema;
export const optionalDecimalSchema = decimalSchema.nullish();
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export const pidSchema = (name: string) => z.object({ [name]: uuidSchema });
export const dateRangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional()
});
```

- [ ] **Step 3: `index.ts`** re-export `./schemas/common.js` and all module schema files (created in Tasks 6–9).

- [ ] **Step 4: Write `common.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { moneySchema, uuidSchema } from './common.js';
describe('common schemas', () => {
  it('accepts 2dp money and rejects 3dp', () => {
    expect(moneySchema.safeParse('123.45').success).toBe(true);
    expect(moneySchema.safeParse('123.456').success).toBe(false);
  });
  it('rejects negative money', () => {
    expect(moneySchema.safeParse('-5').success).toBe(false);
  });
  it('rejects invalid uuid', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
```

- [ ] **Step 5: Run + commit** (`chore(validation): common schemas`).

### Task 6: `validation` — auth schemas

**Files:**
- Create: `packages/validation/src/schemas/auth.ts`; Modify: `packages/validation/src/index.ts`
- Test: `packages/validation/src/schemas/auth.test.ts`

**Interfaces:**
- Produces: `registerSchema`, `loginSchema`, `refreshSchema`, `logoutSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema`, `updateProfileSchema`.

- [ ] **Step 1: Write `auth.ts`**

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(255),
  phone: z.string().min(7).max(20).optional(),
  password: z.string().min(8).max(128)
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const refreshSchema = z.object({ refreshToken: z.string().min(20) });
export const logoutSchema = z.object({ refreshToken: z.string().min(20) });
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128)
});
export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(20).nullable().optional()
});
```

- [ ] **Step 2: Export from `index.ts`**; write `auth.test.ts` asserting: valid register passes; short password fails; invalid email fails; reset with short token fails.

- [ ] **Step 3: Run + commit** (`feat(validation): auth schemas`).

### Task 7: `validation` — farm, shed, batch schemas

**Files:**
- Create: `packages/validation/src/schemas/farm.ts`, `shed.ts`, `batch.ts`; Modify: `index.ts`
- Test: `packages/validation/src/schemas/batch.test.ts`

- [ ] **Step 1: Write `farm.ts`**

```ts
import { z } from 'zod';
import { uuidSchema } from './common.js';

export const createFarmSchema = z.object({
  name: z.string().min(1).max(120),
  location: z.string().min(1).max(255),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  farmType: z.string().max(50).optional(),
  notes: z.string().max(1000).optional()
});
export const updateFarmSchema = createFarmSchema.partial();
export const farmMemberSchema = z.object({ userId: uuidSchema, role: z.enum(['OWNER', 'MANAGER', 'WORKER', 'ACCOUNTANT']) });
export const addFarmMemberSchema = z.object({ members: z.array(farmMemberSchema).min(1) });
```

- [ ] **Step 2: Write `shed.ts`**

```ts
import { z } from 'zod';

export const createShedSchema = z.object({
  name: z.string().min(1).max(120),
  capacity: z.coerce.number().int().min(1).max(1_000_000),
  type: z.string().max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes: z.string().max(1000).optional()
});
export const updateShedSchema = createShedSchema.partial();
```

- [ ] **Step 3: Write `batch.ts`**

```ts
import { z } from 'zod';
import { dateSchema, moneySchema, optionalDecimalSchema } from './common.js';

export const createBatchSchema = z.object({
  shedId: z.string().uuid(),
  batchNumber: z.string().min(1).max(60),
  breed: z.string().min(1).max(120),
  supplier: z.string().max(255).optional(),
  arrivalDate: dateSchema,
  initialBirds: z.coerce.number().int().min(1).max(10_000_000),
  initialAverageWeightKg: optionalDecimalSchema,
  costPerBird: moneySchema.optional(),
  targetSaleDate: dateSchema.optional(),
  notes: z.string().max(1000).optional()
});
export const updateBatchSchema = createBatchSchema.partial();
export const closeBatchSchema = z.object({ reason: z.string().max(500).optional() });
```

- [ ] **Step 4: Test `batch.test.ts`** — valid create passes; `initialBirds: 0` fails; invalid date fails; `initialAverageWeightKg: 'abc'` fails; costPerBird with 3dp fails.

- [ ] **Step 5: Run + commit** (`feat(validation): farm, shed, batch schemas`).

### Task 8: `validation` — daily-record, feed, medicine, vaccination schemas

**Files:**
- Create: `packages/validation/src/schemas/daily-record.ts`, `feed.ts`, `medicine.ts`, `vaccination.ts`; Modify: `index.ts`
- Test: `packages/validation/src/schemas/daily-record.test.ts`

- [ ] **Step 1: Write `daily-record.ts`**

```ts
import { z } from 'zod';
import { dateSchema, decimalSchema } from './common.js';

export const createDailyRecordSchema = z.object({
  recordDate: dateSchema,
  birdsAtStart: z.coerce.number().int().min(0),
  mortality: z.coerce.number().int().min(0),
  feedConsumedKg: decimalSchema.optional(),
  waterConsumedLiters: decimalSchema.optional(),
  averageWeightKg: decimalSchema.optional(),
  temperatureC: decimalSchema.optional(),
  humidityPercent: decimalSchema.optional(),
  medicineNotes: z.string().max(1000).optional(),
  vaccinationNotes: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional()
});
export const updateDailyRecordSchema = createDailyRecordSchema.partial();
```

- [ ] **Step 2: Write `feed.ts`**

```ts
import { z } from 'zod';
import { decimalSchema, moneySchema, dateSchema } from './common.js';

export const createFeedItemSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['STARTER', 'GROWER', 'FINISHER', 'OTHER']),
  supplier: z.string().max(255).optional(),
  unit: z.string().min(1).max(30),
  currentStock: decimalSchema,
  lowStockThreshold: decimalSchema
});
export const feedPurchaseSchema = z.object({
  quantity: decimalSchema,
  unitCost: moneySchema.optional(),
  totalCost: moneySchema.optional(),
  transactionDate: dateSchema.optional(),
  notes: z.string().max(500).optional()
});
export const feedConsumeSchema = z.object({
  quantity: decimalSchema,
  batchId: z.string().uuid().optional(),
  transactionDate: dateSchema.optional(),
  notes: z.string().max(500).optional()
});
```

- [ ] **Step 3: Write `medicine.ts`** — mirror of feed: `createMedicineItemSchema` (name, supplier?, unit, currentStock, lowStockThreshold, expiryDate? date), `medicinePurchaseSchema` (quantity, unitCost?, totalCost?, expiryDate?, transactionDate?, notes?), `medicineUseSchema` (quantity, batchId?, transactionDate?, notes?).

- [ ] **Step 4: Write `vaccination.ts`**

```ts
import { z } from 'zod';
import { dateSchema, decimalSchema } from './common.js';

export const createVaccinationSchema = z.object({
  vaccineName: z.string().min(1).max(120),
  scheduledDate: dateSchema,
  dose: decimalSchema.optional(),
  supplier: z.string().max(255).optional(),
  notes: z.string().max(500).optional()
});
export const updateVaccinationSchema = z.object({
  completedDate: dateSchema.optional(),
  status: z.enum(['UPCOMING', 'COMPLETED', 'MISSED']).optional(),
  notes: z.string().max(500).optional()
});
```

- [ ] **Step 5: Test** — daily-record: valid passes; `mortality: -1` fails; `mortality: 1000` allowed structurally (server business rule rejects vs birdsAtStart); humidity `101` rejected? (keep as plain decimal — business range check is server-side); vaccination: missing scheduledDate fails.

- [ ] **Step 6: Run + commit** (`feat(validation): daily-record, feed, medicine, vaccination schemas`).

### Task 9: `validation` — expense, sale, sync schemas

**Files:**
- Create: `packages/validation/src/schemas/expense.ts`, `sale.ts`, `sync.ts`; Modify: `index.ts`
- Test: `packages/validation/src/schemas/sale.test.ts`

- [ ] **Step 1: Write `expense.ts`**

```ts
import { z } from 'zod';
import { dateSchema, moneySchema } from './common.js';

export const createExpenseSchema = z.object({
  batchId: z.string().uuid().optional(),
  category: z.enum(['CHICKS','FEED','MEDICINE','VACCINATION','LABOUR','ELECTRICITY','GAS','TRANSPORT','MAINTENANCE','EQUIPMENT','OTHER']),
  description: z.string().min(1).max(500),
  amount: moneySchema,
  expenseDate: dateSchema,
  supplier: z.string().max(255).optional(),
  paymentStatus: z.enum(['PAID', 'PARTIALLY_PAID', 'PENDING']).default('PAID'),
  notes: z.string().max(1000).optional()
});
export const updateExpenseSchema = createExpenseSchema.partial();
```

- [ ] **Step 2: Write `sale.ts`**

```ts
import { z } from 'zod';
import { dateSchema, moneySchema, decimalSchema } from './common.js';

export const createSaleSchema = z.object({
  batchId: z.string().uuid(),
  buyer: z.string().min(1).max(255),
  saleDate: dateSchema,
  birdsSold: z.coerce.number().int().min(1),
  totalWeightKg: decimalSchema,
  ratePerKg: moneySchema,
  amountReceived: moneySchema.default('0'),
  notes: z.string().max(1000).optional()
});
/** totalAmount/outstandingAmount deliberately NOT accepted — server computes. */
export const updateSaleSchema = createSaleSchema.partial();
export const updateSalePaymentSchema = z.object({
  amountReceived: moneySchema
});
```

- [ ] **Step 3: Write `sync.ts`**

```ts
import { z } from 'zod';
import { isoDateSchema } from './common.js';

export const syncOperationSchema = z.object({
  operationId: z.string().uuid(),
  entity: z.string().min(1).max(60),
  operationType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  entityId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: isoDateSchema
});
export const syncPushSchema = z.object({ operations: z.array(syncOperationSchema).min(1).max(500) });
export const syncPullQuerySchema = z.object({
  cursor: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});
```

- [ ] **Step 4: Test `sale.test.ts`** — sale with `totalAmount` in body is stripped/rejected (schema parse: unknown key stripped by default → assert `result.data.totalAmount === undefined`); `amountReceived: '100.005'` fails; birdsSold 0 fails.

- [ ] **Step 5: Run + commit** (`feat(validation): expense, sale, sync schemas`).

---

## Phase 2 — Database

### Task 10: Prisma schema, migrations, seed

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`, `apps/api/.env.example`, `apps/api/.env`
- Test: `apps/api/prisma/seed.ts` (idempotent; run via `prisma db seed`)

**Interfaces:**
- Produces: the full Prisma client with models named exactly as in spec §6 — `User, Farm, FarmMember, Shed, Batch, DailyRecord, FeedItem, FeedTransaction, Medicine, MedicineTransaction, Vaccination, Expense, Sale, Alert, RefreshToken, SyncOperation`. Field names camelCase matching `shared-types` entities.

- [ ] **Step 1: Manifest** — `@poultry/api`, `"type": "module"`, deps: `fastify`, `@fastify/jwt`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`, `@prisma/client`, `argon2`, `zod`, `pino`, `pino-pretty` (dev), `dotenv`, `nanoid` (password reset tokens), `@poultry/shared-types`, `@poultry/validation` (both `workspace:*`); devDeps: `prisma`, `tsx`, `vitest`, `typescript`, `@types/node`. Scripts: `dev` (`tsx watch src/server.ts`), `build` (`tsc -p tsconfig.json`), `typecheck`, `test` (`vitest run`), `db:migrate`, `db:seed`.

- [ ] **Step 2: Write `prisma/schema.prisma`** — full model set from spec §6. Key definitions (all monetary/measurement fields `Decimal @db.Decimal(12,2)` except weights `@db.Decimal(12,3)`):

```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  fullName     String
  email        String   @unique
  phone        String?
  passwordHash String
  role         String   @default("OWNER") // UserRole
  status       String   @default("ACTIVE")
  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz
  farms        Farm[]   @relation("FarmOwner")
  memberships  FarmMember[]
  refreshTokens RefreshToken[]
  alerts       Alert[]
  syncOperations SyncOperation[]
}

model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime @db.Timestamptz
  revokedAt DateTime? @db.Timestamptz
  createdAt DateTime @default(now()) @db.Timestamptz
  @@index([userId])
}

model Farm {
  id          String   @id @default(uuid()) @db.Uuid
  ownerId     String   @db.Uuid
  owner       User     @relation("FarmOwner", fields: [ownerId], references: [id])
  name        String
  location    String
  address     String?
  phone       String?
  farmType    String?
  notes       String?
  status      String   @default("ACTIVE")
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz
  members     FarmMember[]
  sheds       Shed[]
  batches     Batch[]
  feedItems   FeedItem[]
  medicines   Medicine[]
  expenses    Expense[]
  sales       Sale[]
  alerts      Alert[]
  @@index([ownerId])
}

model FarmMember {
  id      String @id @default(uuid()) @db.Uuid
  farmId  String @db.Uuid
  farm    Farm   @relation(fields: [farmId], references: [id], onDelete: Cascade)
  userId  String @db.Uuid
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  role    String // UserRole of the membership
  @@unique([farmId, userId])
  @@index([userId])
}

model Shed {
  id        String   @id @default(uuid()) @db.Uuid
  farmId    String   @db.Uuid
  farm      Farm     @relation(fields: [farmId], references: [id], onDelete: Cascade)
  name      String
  capacity  Int
  type      String?
  status    String   @default("ACTIVE")
  notes     String?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz
  batches   Batch[]
  @@index([farmId])
}

model Batch {
  id                    String    @id @default(uuid()) @db.Uuid
  farmId                String    @db.Uuid
  farm                  Farm      @relation(fields: [farmId], references: [id], onDelete: Cascade)
  shedId                String    @db.Uuid
  shed                  Shed      @relation(fields: [shedId], references: [id])
  batchNumber           String
  breed                 String
  supplier              String?
  arrivalDate           DateTime  @db.Date
  initialBirds          Int
  initialAverageWeightKg Decimal? @db.Decimal(12,3)
  costPerBird           Decimal?  @db.Decimal(12,2)
  targetSaleDate        DateTime? @db.Date
  status                String    @default("UPCOMING") // BatchStatus
  notes                 String?
  createdAt             DateTime  @default(now()) @db.Timestamptz
  updatedAt             DateTime  @updatedAt @db.Timestamptz
  dailyRecords          DailyRecord[]
  feedTransactions      FeedTransaction[]
  medicineTransactions  MedicineTransaction[]
  vaccinations          Vaccination[]
  expenses              Expense[]
  sales                 Sale[]
  @@unique([farmId, batchNumber])
  @@index([farmId, status])
  @@index([shedId])
}

model DailyRecord {
  id                 String    @id @default(uuid()) @db.Uuid
  batchId            String    @db.Uuid
  batch              Batch     @relation(fields: [batchId], references: [id], onDelete: Cascade)
  recordDate         DateTime  @db.Date
  birdsAtStart       Int
  mortality          Int
  birdsRemaining     Int
  feedConsumedKg     Decimal?  @db.Decimal(12,3)
  waterConsumedLiters Decimal? @db.Decimal(12,3)
  averageWeightKg    Decimal?  @db.Decimal(12,3)
  temperatureC       Decimal?  @db.Decimal(6,2)
  humidityPercent    Decimal?  @db.Decimal(6,2)
  medicineNotes      String?
  vaccinationNotes   String?
  notes              String?
  createdBy          String    @db.Uuid
  createdAt          DateTime  @default(now()) @db.Timestamptz
  updatedAt          DateTime  @updatedAt @db.Timestamptz
  @@unique([batchId, recordDate])
  @@index([batchId, recordDate])
}

model FeedItem {
  id                String   @id @default(uuid()) @db.Uuid
  farmId            String   @db.Uuid
  farm              Farm     @relation(fields: [farmId], references: [id], onDelete: Cascade)
  name              String
  type              String   // FeedType
  supplier          String?
  unit              String
  currentStock      Decimal  @db.Decimal(12,3)
  lowStockThreshold Decimal  @db.Decimal(12,3)
  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz
  transactions      FeedTransaction[]
  @@index([farmId])
}

model FeedTransaction {
  id              String    @id @default(uuid()) @db.Uuid
  feedItemId      String    @db.Uuid
  feedItem        FeedItem  @relation(fields: [feedItemId], references: [id], onDelete: Cascade)
  batchId         String?   @db.Uuid
  batch           Batch?    @relation(fields: [batchId], references: [id])
  type            String    // FeedTransactionType
  quantity        Decimal   @db.Decimal(12,3)
  unitCost        Decimal?  @db.Decimal(12,2)
  totalCost       Decimal?  @db.Decimal(12,2)
  transactionDate DateTime  @default(now()) @db.Date
  notes           String?
  createdBy       String    @db.Uuid
  createdAt       DateTime  @default(now()) @db.Timestamptz
  @@index([feedItemId, transactionDate])
  @@index([batchId])
}

model Medicine {
  id                String   @id @default(uuid()) @db.Uuid
  farmId            String   @db.Uuid
  farm              Farm     @relation(fields: [farmId], references: [id], onDelete: Cascade)
  name              String
  supplier          String?
  unit              String
  currentStock      Decimal  @db.Decimal(12,3)
  lowStockThreshold Decimal  @db.Decimal(12,3)
  expiryDate        DateTime? @db.Date
  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz
  transactions      MedicineTransaction[]
  @@index([farmId])
}

model MedicineTransaction {
  id              String    @id @default(uuid()) @db.Uuid
  medicineId      String    @db.Uuid
  medicine        Medicine  @relation(fields: [medicineId], references: [id], onDelete: Cascade)
  batchId         String?   @db.Uuid
  batch           Batch?    @relation(fields: [batchId], references: [id])
  type            String    // MedicineTransactionType
  quantity        Decimal   @db.Decimal(12,3)
  transactionDate DateTime  @default(now()) @db.Date
  notes           String?
  createdBy       String    @db.Uuid
  createdAt       DateTime  @default(now()) @db.Timestamptz
  @@index([medicineId, transactionDate])
  @@index([batchId])
}

model Vaccination {
  id            String    @id @default(uuid()) @db.Uuid
  batchId       String    @db.Uuid
  batch         Batch     @relation(fields: [batchId], references: [id], onDelete: Cascade)
  vaccineName   String
  scheduledDate DateTime  @db.Date
  completedDate DateTime? @db.Date
  dose          Decimal?  @db.Decimal(12,3)
  supplier      String?
  status        String    @default("UPCOMING") // VaccinationStatus
  notes         String?
  createdBy     String    @db.Uuid
  createdAt     DateTime  @default(now()) @db.Timestamptz
  updatedAt     DateTime  @updatedAt @db.Timestamptz
  @@index([batchId, scheduledDate])
}

model Expense {
  id              String    @id @default(uuid()) @db.Uuid
  farmId          String    @db.Uuid
  farm            Farm      @relation(fields: [farmId], references: [id], onDelete: Cascade)
  batchId         String?   @db.Uuid
  batch           Batch?    @relation(fields: [batchId], references: [id])
  category        String    // ExpenseCategory
  description     String
  amount          Decimal   @db.Decimal(12,2)
  expenseDate     DateTime  @db.Date
  supplier        String?
  paymentStatus   String    @default("PAID") // PaymentStatus
  receiptObjectKey String?
  notes           String?
  createdBy       String    @db.Uuid
  createdAt       DateTime  @default(now()) @db.Timestamptz
  updatedAt       DateTime  @updatedAt @db.Timestamptz
  @@index([farmId, expenseDate])
  @@index([batchId])
}

model Sale {
  id                String    @id @default(uuid()) @db.Uuid
  farmId            String    @db.Uuid
  farm              Farm      @relation(fields: [farmId], references: [id], onDelete: Cascade)
  batchId           String    @db.Uuid
  batch             Batch     @relation(fields: [batchId], references: [id])
  buyer             String
  saleDate          DateTime  @db.Date
  birdsSold         Int
  totalWeightKg     Decimal   @db.Decimal(12,3)
  ratePerKg         Decimal   @db.Decimal(12,2)
  totalAmount       Decimal   @db.Decimal(12,2)
  amountReceived    Decimal   @db.Decimal(12,2) @default(0)
  outstandingAmount Decimal   @db.Decimal(12,2)
  paymentStatus     String    @default("PENDING") // PaymentStatus
  notes             String?
  createdBy         String    @db.Uuid
  createdAt         DateTime  @default(now()) @db.Timestamptz
  updatedAt         DateTime  @updatedAt @db.Timestamptz
  @@index([farmId, saleDate])
  @@index([batchId])
}

model Alert {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  farmId    String?   @db.Uuid
  batchId   String?   @db.Uuid
  type      String    // AlertType
  severity  String    // AlertSeverity
  title     String
  message   String
  isRead    Boolean   @default(false)
  createdAt DateTime  @default(now()) @db.Timestamptz
  readAt    DateTime? @db.Timestamptz
  @@index([userId, createdAt])
}

model SyncOperation {
  id            String    @id @default(uuid()) @db.Uuid
  operationId   String    @unique // client idempotency key
  userId        String    @db.Uuid
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  entity        String
  entityId      String?   @db.Uuid
  operationType String    // SyncOperationType
  payload       Json
  status        String    @default("SYNCED") // server-side: synced only
  retryCount    Int       @default(0)
  lastError     String?
  createdAt     DateTime  @default(now()) @db.Timestamptz
  processedAt   DateTime? @db.Timestamptz
  @@index([userId, status])
}
```

- [ ] **Step 3: Write `.env.example` / `.env`**

```
DATABASE_URL="postgresql://poultry:poultry_dev_password@localhost:5432/poultry?schema=public"
JWT_ACCESS_SECRET="dev-only-access-secret-change-me"
JWT_REFRESH_SECRET="dev-only-refresh-secret-change-me"
PORT=4000
```

- [ ] **Step 4: Migrate + generate client**

```bash
cd apps/api && pnpm add -D prisma && pnpm add @prisma/client
pnpm prisma migrate dev --name init
```

Expected: migration applied to local docker postgres (start it first: `pnpm db:up`). If Docker is unavailable, run with a locally installed postgres or note the blocker — the schema file is the deliverable; migration validated when Task 27 integration tests run.

- [ ] **Step 5: Write `prisma/seed.ts`** — deterministic dev fixture: 1 owner user (email `owner@farm.test`, password `Password123!`, argon2-hashed), 2 farms, 3 sheds, 2 batches (one ACTIVE with 50 daily records), 2 feed items, 2 medicines, 1 vaccination, 2 expenses, 1 sale; idempotent (upsert by email, clean children first). Add `"prisma": { "seed": "tsx prisma/seed.ts" }` to package.json. Additionally expose `pnpm db:seed:perf` running `prisma/seed-perf.ts` (10 farms / 50 sheds / 100 batches / 365 daily records per batch) so the TESTING.md §10 realistic-scale dataset exists for performance checks.

- [ ] **Step 6: Run seed** `pnpm prisma db seed`. Expected: fixtures created, rerun creates no duplicates.

- [ ] **Step 7: Commit** (`feat(api): prisma schema, migration, seed`).

### Task 11: API scaffold — config, app, server, core plugins

**Files:**
- Create: `apps/api/src/config/env.ts`, `apps/api/src/utils/errors.ts`, `apps/api/src/utils/pagination.ts`, `apps/api/src/utils/decimal.ts`, `apps/api/src/plugins/error-handler.ts`, `apps/api/src/plugins/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Test: `apps/api/tests/health.test.ts`

**Interfaces:**
- Produces:
  - `env` (validated, from dotenv): `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PORT`.
  - `ApiError` class with `code/message/details/statusCode`; `errorToResponse`.
  - `buildApp()` → configured Fastify instance (plugins + health/ready routes registered; app modules registered later).
  - `authenticate` fastify hook decorator (`request.user = { id, role, email }` from JWT claim), `authorize(...roles)` guard.
  - `jwtSign(jwt, payload)` typing for access token (`{ sub, role, email, type: 'access' }`).
  - `paginate(meta)` helper for envelope `meta` object.

- [ ] **Step 1: `env.ts`** — read `process.env` with Zod validation, throw at boot if missing, export typed `env`.

- [ ] **Step 2: `errors.ts`**

```ts
import type { ApiErrorCode } from '@poultry/shared-types';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) { super(message); }
}
export const notFound = (msg = 'Resource not found') => new ApiError('RESOURCE_NOT_FOUND', msg, 404);
export const forbidden = (msg = 'Forbidden') => new ApiError('FORBIDDEN', msg, 403);
export const unauthorized = (msg = 'Unauthorized') => new ApiError('AUTH_UNAUTHORIZED', msg, 401);
```

- [ ] **Step 3: `error-handler.ts`** — fastify `setErrorHandler`: if `ApiError` → statusCode + envelope; if zod `ZodError` → `VALIDATION_ERROR` with `details` = issue map; else log error (pino), reply `INTERNAL_ERROR` 500 (never stack). Also `setNotFoundHandler` → `RESOURCE_NOT_FOUND` envelope.

- [ ] **Step 4: `auth.ts` plugin** — register `@fastify/jwt` with `secret: env.JWT_ACCESS_SECRET`; `decorateRequest('user')`; `authenticate`: verify header, reject expired/invalid with `TOKEN_EXPIRED`/`TOKEN_INVALID`, set `request.user = { id: payload.sub, role: payload.role, email }`; `authorize(...roles)` returns a preHandler that calls authenticate then checks `roles.includes(request.user.role)` → `FORBIDDEN`. Include helper `signAccessToken(user)` and `verifyRefresh` using `JWT_REFRESH_SECRET`.

- [ ] **Step 5: `app.ts`**

```ts
import Fastify from 'fastify';
import { env } from './config/env.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerAuth } from './plugins/auth.js';

export function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  registerErrorHandler(app);
  registerAuth(app);
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  });
  return app;
}
```

(Register `prisma` as a decorated instance property in `app.ts`: `app.decorate('prisma', new PrismaClient())`.)

- [ ] **Step 6: `server.ts`** — `buildApp()`, listen on `env.PORT`, graceful shutdown on SIGINT/SIGTERM (`app.close()` + `prisma.$disconnect()`).

- [ ] **Step 7: Write `tests/health.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('health', () => {
  const app = buildApp();
  beforeAll(async () => { await app.ready(); });
  afterAll(async () => { await app.close(); });
  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
  it('unknown route returns error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
```

- [ ] **Step 8: Run + commit** (`feat(api): app scaffold, error handling, auth plugin`). Verify test passes; add `src/types/fastify.d.ts` augmentations for `request.user` + `app.prisma`.

### Task 12: Auth module — register, login, refresh, logout, me, forgot/reset

**Files:**
- Create: `apps/api/src/modules/auth/{routes.ts,service.ts,schema.ts,types.ts}`, `apps/api/src/modules/users/{routes.ts,service.ts,schema.ts,types.ts}`, `apps/api/src/utils/audit.ts`
- Test: `apps/api/tests/auth.test.ts`

**Interfaces:**
- Consumes: `env`, `ApiError`, `signAccessToken`, `registerSchema`, `loginSchema`, `refreshSchema`, etc.
- Produces: `authService.register`, `authService.login`, `authService.refresh`, `authService.logout`, `authService.forgotPassword`, `authService.resetPassword`; routes mounted at `/api/v1/auth/*` and `/api/v1/users/me`; `AuthUser` response shape `{ id, fullName, email, phone, role, status, createdAt }`; `TokenPair = { accessToken, refreshToken, expiresIn }`.

- [ ] **Step 1: `service.ts`**

```ts
import argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../../config/prisma.js'; // shared PrismaClient singleton
import { ApiError } from '../../utils/errors.js';

export async function register(input: { fullName: string; email: string; phone?: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new ApiError('DUPLICATE_EMAIL', 'An account with this email already exists', 409);
  const passwordHash = await argon2.hash(input.password);
  const user = await prisma.user.create({
    data: { fullName: input.fullName, email: input.email.toLowerCase(), phone: input.phone, passwordHash }
  });
  return user;
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401);
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401);
  return user;
}
```

  Refresh lifecycle: `issueTokenPair(userId)` → access JWT (15 min) + opaque refresh (32-byte random, stored `sha256` hashed in `RefreshToken`, 30-day expiry). `refresh(refreshToken)` → hash, find unrevoked unexpired → rotate in transaction (revoke old, create new) → new pair. `logout(refreshToken)` → revoke. `forgotPassword(email)` → generate 32-byte reset token, store hashed with 1h expiry on `User`? No — keep a `PasswordResetToken` inline: store tokenHash + expiresAt on the User row via… simpler: create `ResetToken` rows is overkill for MVP — use JWT signed with `JWT_REFRESH_SECRET` (type `reset`, 1h) delivered in the email body (dev: returned in response payload, clearly marked dev-only). `resetPassword(token, password)` → verify JWT, update hash.

- [ ] **Step 2: `routes.ts`** — register `POST /register` (public, rate-limited), `POST /login` (public, rate-limited), `POST /refresh` (public), `POST /logout` (public, body has refreshToken), `POST /forgot-password` (public, rate-limited — always returns 200: "If the email exists, a reset link was sent"; no account enumeration), `POST /reset-password` (public). All validated with schemas from `@poultry/validation`. Response: register/login/refresh → `{ data: { user, tokens } }`; me → `{ data: AuthUser }` (protected, from JWT).

- [ ] **Step 3: `users/routes.ts`** — `GET /users/me` (protected) returns `AuthUser`; `PATCH /users/me` (protected, `updateProfileSchema`).

- [ ] **Step 4: `routes.ts` registration in app.ts** — `app.register(authRoutes, { prefix: '/api/v1/auth' })`, same for users. Enable `@fastify/rate-limit` (max 10/min on auth routes, 100/min global).

- [ ] **Step 5: `tests/auth.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

describe('auth', () => {
  const app = buildApp();
  beforeAll(async () => { await app.ready(); await prisma.user.deleteMany({ where: { email: { endsWith: '@test.dev' } } }); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('registers, logs in, refreshes, and logs out', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {
      fullName: 'Test Owner', email: 't1@test.dev', password: 'Password123!' } });
    expect(reg.statusCode).toBe(200);
    expect(reg.json().data.user.email).toBe('t1@test.dev');

    const dup = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {
      fullName: 'X', email: 't1@test.dev', password: 'Password123!' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('DUPLICATE_EMAIL');

    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {
      email: 't1@test.dev', password: 'Password123!' } });
    expect(login.statusCode).toBe(200);
    const { accessToken, refreshToken } = login.json().data.tokens;

    const me = await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(me.statusCode).toBe(200);

    const badLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {
      email: 't1@test.dev', password: 'wrong' } });
    expect(badLogin.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const refresh = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });
    expect(refresh.statusCode).toBe(200);
    const newToken = refresh.json().data.tokens.refreshToken;
    expect(newToken).not.toBe(refreshToken); // rotated

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken: newToken } });
    expect(logout.statusCode).toBe(200);
    const reuse = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: newToken } });
    expect(reuse.json().error.code).toBe('TOKEN_INVALID'); // revoked
  });

  it('rejects requests without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 6: Run tests + commit** (`feat(api): auth module with refresh rotation`).

---

## Phase 3 — Domain Modules

### Task 13: Farms module (+ members)

**Files:**
- Create: `apps/api/src/modules/farms/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/farms.test.ts`

**Interfaces:**
- Consumes: `authenticate`/`authorize`, `createFarmSchema`, `updateFarmSchema`, `addFarmMemberSchema`, `uuidSchema`.
- Produces: `farmsService.list(userId)`, `farmsService.get(farmId, user)` (throws `notFound` if not owner/member), `farmsService.create(ownerId, input)`, `farmsService.update(farmId, user, input)`, `farmsService.remove(farmId, user)` (409 `FARM_HAS_DEPENDENCIES` if sheds/batches exist), `farmsService.listMembers(farmId, user)`, `farmsService.addMembers(farmId, user, members)`. Routes: `GET/POST /api/v1/farms`, `GET/PATCH/DELETE /api/v1/farms/:farmId`, `GET/POST /api/v1/farms/:farmId/members` (owner only).

- [ ] **Step 1: Service** — `isFarmAccessible(farmId, user)` helper in `utils/farm-access.ts` (shared by all farm-scoped modules): returns farm if `farm.ownerId === user.id` OR membership exists, else `notFound()`. Put it in `apps/api/src/utils/farm-access.ts` so sheds/batches/etc. reuse it.

- [ ] **Step 2: Routes + schemas** — authorization: farm mutation routes require `authorize('OWNER')` or (for members) `authorize('MANAGER')` roles; members add requires OWNER.

- [ ] **Step 3: Test `farms.test.ts`** — registration helper `createUser(app, email)`; User A creates farm → sees it; User B `GET /farms/:id` → 404; PATCH/DELETE by non-owner → 404 (not 403, no existence leak); owner adds member role; member GET succeeds; farm with shed → DELETE 409.

- [ ] **Step 4: Run + commit** (`feat(api): farms module with ownership enforcement`).

### Task 14: Sheds module

**Files:**
- Create: `apps/api/src/modules/sheds/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/sheds.test.ts`

**Interfaces:**
- Consumes: `isFarmAccessible`, `createShedSchema`, `updateShedSchema`.
- Produces: `shedsService.list(farmId, user, page)`, `.get(shedId, user)`, `.create(farmId, user, input)`, `.update(shedId, user, input)`, `.remove(shedId, user)` (409 `SHED_HAS_DEPENDENCIES` if batches exist). Routes: `GET/POST /api/v1/farms/:farmId/sheds`, `GET/PATCH/DELETE /api/v1/sheds/:shedId`. Authorization: create/update/delete `authorize('OWNER','MANAGER')`; list/get any accessible role.

- [ ] **Step 1: Service** — all lookups resolve `shed.farmId` through `isFarmAccessible` first; batch count check via `prisma.batch.count({ where: { shedId } })` before delete.

- [ ] **Step 2: Test** — owner creates shed under farm; worker on farm sees list (member) but PATCH → 403 `FORBIDDEN`; shed under farm B 404 for user A; delete shed with batch → 409.

- [ ] **Step 3: Commit** (`feat(api): sheds module`).

### Task 15: Batches module + batch calculations

**Files:**
- Create: `apps/api/src/modules/batches/{routes.ts,service.ts,schema.ts,types.ts}` and `apps/api/src/modules/batches/calculations.ts`
- Test: `apps/api/tests/batches.test.ts`, `apps/api/tests/calculations.test.ts`

**Interfaces:**
- Consumes: `isFarmAccessible`, `createBatchSchema`, `updateBatchSchema`, `closeBatchSchema`.
- Produces:
  - `batchesService.list(farmId, user, {status, page})`, `.get(batchId, user)`, `.create(farmId, user, input)` (validates shed belongs to farm, batchNumber unique per farm, status `UPCOMING`), `.update(batchId, user, input)`, `.close(batchId, user)` → `CLOSED` (allowed from `ACTIVE`/`SOLD`; other transitions rejected with `VALIDATION_ERROR`), `.open(batchId, user)` → `ACTIVE` (allowed only from `UPCOMING`).
  - `batchCalculations.summary(batch)` — aggregate from `prisma.dailyRecord` + `prisma.sale`: `currentBirds = initialBirds - Σmortality - ΣbirdsSold` (floor 0), `mortalityPct`, `totalFeedConsumed`, `fcr` (documented method), per spec §5.6.
  - `fcr(batch, dailyRecords)` — `Σ feedConsumedKg ÷ ((currentBirds × currentAvgWeightKg) − (initialBirds × initialAverageWeightKg))`, returns `null` + `incomplete: true` when any required weight field missing.

- [ ] **Step 1: `calculations.ts`** — pure functions, exported for tests AND for mobile parity:

```ts
export function currentBirds(initialBirds: number, cumulativeMortality: number, cumulativeSold: number): number {
  return Math.max(0, initialBirds - cumulativeMortality - cumulativeSold);
}
export function mortalityPercent(cumulativeMortality: number, initialBirds: number): number {
  if (initialBirds <= 0) return 0;
  return (cumulativeMortality / initialBirds) * 100;
}
```

- [ ] **Step 2: `calculations.test.ts`** — currentBirds(10000,100,0)=9900; floor(0,20000,100)=0; mortalityPercent(100,10000)=1; mortalityPercent with 0 birds → 0 (no div-by-zero); fcr with missing weight → `{value: null, incomplete: true}`; fcr happy path: feed 10000kg, gain=(9500×1.8)−(10000×0.05)=16600 → 0.6024.

- [ ] **Step 3: Service** — create: verify `shed.farmId === farmId` else `VALIDATION_ERROR`; `@@unique(farmId, batchNumber)` catch → `VALIDATION_ERROR` "batch number already exists"; status `UPCOMING`. get: include shed + last 7 dailyRecords.

- [ ] **Step 4: Test `batches.test.ts`** — owner creates batch (valid); batchNumber duplicate → 400 VALIDATION_ERROR; batch on shed of another farm → 400; `GET /batches/:id` cross-user → 404; close ACTIVE → CLOSED; open CLOSED (with records) → 400; summary aggregates (seed 50 records → currentBirds matches).

- [ ] **Step 5: Commit** (`feat(api): batches module with calculations`).

### Task 16: Daily-records module

**Files:**
- Create: `apps/api/src/modules/daily-records/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/daily-records.test.ts`

**Interfaces:**
- Consumes: `isFarmAccessible`, `createDailyRecordSchema`, `updateDailyRecordSchema`.
- Produces: `dailyRecordsService.list(batchId, user, {from,to,page})`, `.get(recordId, user)`, `.create(batchId, user, input)`, `.update(recordId, user, input)`, `.remove(recordId, user)`. Business rules enforced in service:
  - `mortality <= birdsAtStart` → else `BATCH_BIRD_COUNT_INVALID`.
  - `birdsRemaining` computed server-side: `birdsAtStart - mortality`; client-sent `birdsRemaining` ignored.
  - `unique(batchId, recordDate)` on create (and on update when the date changes) → `DUPLICATE_DAILY_RECORD` 409.
  - create/update inside `prisma.$transaction`; when the batch is `UPCOMING` and this is its first record, transition batch to `ACTIVE`.

- [ ] **Step 1: Service** — implement rules above; `birdsRemaining` always `birdsAtStart - mortality`; also reject mortality that would drive cumulative birds `<= 0`.

- [ ] **Step 2: Create `alerts/generator.ts`** (first consumer — Task 17/18/23 import it). Exports `alertGenerator.evaluate(farmId)`, implementing now: high-mortality (`daily mortality % > 5 → CRITICAL`), `lowFeed` (`currentStock <= lowStockThreshold → WARNING`), `lowMedicine` (same). Dedupe by `(userId, type, farmId, batchId, title)` unread within 7 days. It catches all errors and logs — never breaks the caller. Put the file at `apps/api/src/modules/alerts/generator.ts` now so Tasks 17–22 can import it; do NOT create the alerts module/routes yet (Task 23 does).

- [ ] **Step 3: Test** — create valid (birdsRemaining computed 9900); mortality > birdsAtStart → 400 `BATCH_BIRD_COUNT_INVALID`; duplicate (batchId, recordDate) → 409 `DUPLICATE_DAILY_RECORD`; cross-user batch → 404; update recomputes birdsRemaining; delete allowed by OWNER/MANAGER. A daily record with 10% mortality creates a HIGH_MORTALITY alert for owner + members.

- [ ] **Step 4: Commit** (`feat(api): daily-records module, alert generator core`).

### Task 17: Feed module (inventory + transactions)

**Files:**
- Create: `apps/api/src/modules/feed/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/feed.test.ts`

**Interfaces:**
- Consumes: `isFarmAccessible`, `createFeedItemSchema`, `feedPurchaseSchema`, `feedConsumeSchema`.
- Produces: `feedService.list(farmId,user)`, `.create(farmId,user,input)`, `.update(feedId,user,input)`, `.purchase(feedId,user,input)`, `.consume(feedId,user,input)`, `.transactions(feedId,user,{from,to,page})`.
- Routes: `GET/POST /api/v1/farms/:farmId/feed`, `PATCH /api/v1/feed/:feedId`, `POST /api/v1/feed/:feedId/purchase`, `POST /api/v1/feed/:feedId/consume`, `GET /api/v1/feed/:feedId/transactions`.
- Authorization: inventory create/update/purchase/consume `authorize('OWNER','MANAGER')`; list/get any accessible role.

- [ ] **Step 1: Stock math (transaction)** — purchase: `currentStock += quantity`, create `FeedTransaction(type: PURCHASE, unitCost?, totalCost?)`; when `unitCost` given and `totalCost` absent, server computes `totalCost = unitCost × quantity` in `Prisma.Decimal`. consume: reject if `quantity > currentStock` with `STOCK_INSUFFICIENT`; else decrement + create CONSUMPTION tx (links `batchId`). Both wrapped in `prisma.$transaction` (sequential read-then-write; `SELECT ... FOR UPDATE` via `$queryRaw` on the feed item row when available — at minimum rely on the transaction for MVP).

- [ ] **Step 2: Alerts** — after any stock move, if `currentStock <= lowStockThreshold` → generate `LOW_FEED` alert (WARNING) for owner + members via `alerts/generator.ts` (imported lazily to avoid circular dep; generator catches errors).

- [ ] **Step 3: Test** — purchase 500 → stock 500; consume 300 → 200; consume 300 → 400 `STOCK_INSUFFICIENT` (stock unchanged at 200); negative quantity rejected at schema; low-stock alert created when crossing threshold; purchase sets totalCost when unitCost given.

- [ ] **Step 4: Commit** (`feat(api): feed module with transactional stock`).

### Task 18: Medicine module (inventory + usage)

**Files:**
- Create: `apps/api/src/modules/medicine/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/medicine.test.ts`

**Interfaces:**
- Produces: mirror of feed: `medicineService.list/create/update/purchase/use/transactions`; routes `GET/POST /api/v1/farms/:farmId/medicines`, `PATCH /api/v1/medicines/:medicineId`, `POST /api/v1/medicines/:medicineId/purchase|use`, `GET /api/v1/medicines/:medicineId/transactions`. Rules identical: usage cannot exceed stock (`STOCK_INSUFFICIENT`), `LOW_MEDICINE` alert, `MEDICINE_EXPIRY` alert when `expiryDate` within 30 days (checked in `list`).

- [ ] **Step 1: Service** — same transactional pattern as feed; add expiry check → `MEDICINE_EXPIRY` alert.

- [ ] **Step 2: Test** — purchase/use/insufficient/alert parity with feed; expiry within 30 days creates `MEDICINE_EXPIRY` alert.

- [ ] **Step 3: Commit** (`feat(api): medicine module`).

### Task 19: Vaccinations module

**Files:**
- Create: `apps/api/src/modules/vaccinations/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/vaccinations.test.ts`

**Interfaces:**
- Produces: `vaccinationsService.list(batchId,user)`, `.create(batchId,user,input)` (status `UPCOMING`), `.update(vaccinationId,user,input)` (setting `completedDate` → status `COMPLETED`; on `list`, rows with `scheduledDate < today && status === 'UPCOMING'` are auto-marked `MISSED`), `.remove(vaccinationId,user)`.
- Routes: `GET/POST /api/v1/batches/:batchId/vaccinations`, `PATCH/DELETE /api/v1/vaccinations/:vaccinationId`. Authorization: create/update/delete OWNER/MANAGER; PATCH restricted to completion fields also allowed for WORKER (spec matrix: worker records completion).

- [ ] **Step 1: Service + MISSED auto-mark** — implement; `VACCINATION_DUE` alert when `scheduledDate` within 3 days (checked in list).

- [ ] **Step 2: Test** — create UPCOMING; mark complete → COMPLETED; auto-MISSED on stale; due alert created; cross-farm batch → 404.

- [ ] **Step 3: Commit** (`feat(api): vaccinations module`).

### Task 20: Expenses module

**Files:**
- Create: `apps/api/src/modules/expenses/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/expenses.test.ts`

**Interfaces:**
- Produces: `expensesService.list(farmId,user,{from,to,category,batchId,page})`, `.get`, `.create(farmId,user,input)`, `.update`, `.remove`. Routes `GET/POST /api/v1/farms/:farmId/expenses`, `GET/PATCH/DELETE /api/v1/expenses/:expenseId`. Authorization: create/update/delete `authorize('OWNER','ACCOUNTANT')` (matrix: finance is OWNER+ACCOUNTANT, manager NO).

- [ ] **Step 1: Service** — batchId (if given) must belong to farm (else `VALIDATION_ERROR`); `receiptObjectKey` accepted when provided (Task 25 wires it); amount Decimal passthrough (already validated); paymentStatus default PAID.

- [ ] **Step 2: Test** — accountant creates expense; manager PATCH → 403; cross-farm 404; filter by category + date range works.

- [ ] **Step 3: Commit** (`feat(api): expenses module`).

### Task 21: Sales module (server-computed totals)

**Files:**
- Create: `apps/api/src/modules/sales/{routes.ts,service.ts,schema.ts,types.ts}`
- Test: `apps/api/tests/sales.test.ts`

**Interfaces:**
- Produces: `salesService.list(farmId,user,{from,to,batchId,page})`, `.get`, `.create(farmId,user,input)`, `.updatePayment(saleId,user,{amountReceived})`, `.remove`. Routes `GET/POST /api/v1/farms/:farmId/sales`, `GET/PATCH/DELETE /api/v1/sales/:saleId`, `POST /api/v1/sales/:saleId/payment`. Authorization: OWNER/ACCOUNTANT.

- [ ] **Step 1: Service** — on create: server computes `totalAmount = totalWeightKg × ratePerKg` (`Prisma.Decimal`), rejects `amountReceived > totalAmount` → `PAYMENT_EXCEEDS_TOTAL`; `outstanding = totalAmount - amountReceived`; `paymentStatus` derived: `outstanding == 0 → PAID`, `0 < outstanding < total → PARTIALLY_PAID`, else `PENDING`. `updatePayment` recomputes in transaction. `birdsSold` must not exceed the batch's current birds → else `BATCH_BIRD_COUNT_INVALID`.

- [ ] **Step 2: Test** — weight 1000 × rate 250 = 250000 total; received 100000 → PARTIALLY_PAID, outstanding 150000; received 300000 → 400 `PAYMENT_EXCEEDS_TOTAL`; updatePayment → PAID; sold > currentBirds → 400; cross-farm 404.

- [ ] **Step 3: Commit** (`feat(api): sales module`).

### Task 22: Reports + Dashboard module

**Files:**
- Create: `apps/api/src/modules/reports/{routes.ts,service.ts,dashboard.ts,growth.ts,mortality.ts,feed.ts,medicine.ts,vaccination.ts,expenses.ts,sales.ts,profit-loss.ts,batch-comparison.ts}`
- Test: `apps/api/tests/reports.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/dashboard?farmId=` and `GET /api/v1/reports/{growth,mortality,feed,medicine,vaccination,expenses,sales,profit-loss,batch-comparison}?farmId=&batchId=&from=&to=`. Every result includes `labels` (`actual`/`estimated`/`incomplete`) and `meta.isComplete: boolean`. Authorization: OWNER/MANAGER/ACCOUNTANT (WORKER excluded).

- [ ] **Step 1: Dashboard** — one aggregated set from authorized farms: `farms` count, `activeBatches`, `totalBirds` (Σ latest-record birdsRemaining per ACTIVE batch), `mortalityPercent`, `feedConsumedKg`, `expenses` (Σ amount), `revenue` (Σ totalAmount), `profit` (revenue − expenses; flagged `estimated` when any active batch incomplete).

- [ ] **Step 2: Growth/mortality/feed reports** — per-batch time series from daily records (avg-weight curve, mortality count, feed consumption) filtered by `from`/`to`. Batch-comparison: table of batches with currentBirds, mortalityPct, FCR (or incomplete), total expenses, revenue, profit.

- [ ] **Step 3: Profit-loss** — Σ expenses by category + Σ sales; profit (or `estimated`/`incomplete` label).

- [ ] **Step 4: Test** — seed deterministic farm/batch/records → assert exact dashboard numbers; profit flagged `estimated` when daily records incomplete; WORKER → 403.

- [ ] **Step 5: Commit** (`feat(api): reports and dashboard`).

### Task 23: Alerts module (routes/service + extended generator)

**Files:**
- Create: `apps/api/src/modules/alerts/{routes.ts,service.ts,schema.ts,types.ts}`; Modify: `apps/api/src/modules/alerts/generator.ts` (extend — core created in Task 16)
- Test: `apps/api/tests/alerts.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/alerts?unread=&type=` (own alerts), `PATCH /api/v1/alerts/:alertId/read`, `POST /api/v1/alerts/read-all`. Extend `alertGenerator.evaluate(farmId)` (created Task 16) with remaining alerts: vaccination due (≤3d), medicine expiry (≤30d), low weight (avg below 50% of batch max → WARNING), payment overdue (sale PARTIALLY_PAID/PENDING older than 30 days), sale date approaching (≤7d). Dedupe (from Task 16) preserves `(userId, type, farmId, batchId, title)` unread-within-7-days rule.

- [ ] **Step 1: Routes + service** — `alertsService.list(user, {unread, type, page})`, `.markRead(alertId, user)` (only own alerts), `.markAllRead(user)`; each triggers a lazy `evaluate` refresh then returns.

- [ ] **Step 2: Wire generator into stock moves already calling it (Tasks 17/18)** — confirm the `void alertGenerator.evaluate(...)` calls exist and are safe (catch + log); add sale-payment wiring (`salesService.updatePayment`) for `PAYMENT_OVERDUE`/`SALE_DATE_APPROACHING` re-evaluation.

- [ ] **Step 3: Test** — daily record with 10% mortality → HIGH_MORTALITY alert for owner; low feed threshold crossed → LOW_FEED (dedupe asserted — second cross creates no duplicate unread within 7 days); vaccination due ≤3d → VACCINATION_DUE; medicine expiry ≤30d → MEDICINE_EXPIRY; sale pending >30d → PAYMENT_OVERDUE; mark single read; read-all.

- [ ] **Step 4: Commit** (`feat(api): alerts module routes + extended generator`).

### Task 24: Sync module (push/pull, idempotent)

**Files:**
- Create: `apps/api/src/modules/sync/{routes.ts,service.ts,schema.ts,types.ts}`, `apps/api/src/modules/sync/handlers.ts`
- Test: `apps/api/tests/sync.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/sync/push` (protected) — body `{ operations: SyncOperationInput[] }`; dispatch per-op through `handlers` map: `dailyRecord`, `expense`, `sale`, `vaccination` (create/complete) — each applies the entity-create DTO via the owning module's service (reusing authorization + integrity rules). Response `{ data: { results: SyncPushResult[] } }`.
- `GET /api/v1/sync/pull?cursor=&limit=` — changes since cursor (`updatedAt > cursor`) across the user's accessible farms for: batches, dailyRecords, feedItems, feedTransactions, medicines, medicineTransactions, vaccinations, expenses, sales; merged, sorted by `updatedAt`, sliced; `meta.nextCursor` = last updatedAt + 1ms (null if fewer than limit).
- Idempotency: if `SyncOperation.operationId` exists → return stored `{ status: 'SYNCED', entityId }` WITHOUT re-applying; else apply + insert `SyncOperation` row in the same `$transaction`.

- [ ] **Step 1: `handlers.ts`** — one entry per syncable entity mapping `operationType` → service call; entityId from op is the client's local UUID (stored, not used as server PK).

```ts
import type { SyncOperationInput, UserRole } from '@poultry/shared-types';
import { dailyRecordsService } from '../daily-records/service.js';
import { expensesService } from '../expenses/service.js';
import { salesService } from '../sales/service.js';
import { vaccinationsService } from '../vaccinations/service.js';

export interface SyncHandler {
  create: (user: { id: string; role: UserRole }, payload: Record<string, unknown>) => Promise<string>;
  update?: (user: { id: string; role: UserRole }, entityId: string, payload: Record<string, unknown>) => Promise<string>;
  delete?: (user: { id: string; role: UserRole }, entityId: string) => Promise<void>;
}
export const syncHandlers: Record<string, SyncHandler> = {
  dailyRecord: {
    create: (u, p) => dailyRecordsService.create(p.batchId as string, u, p).then(r => r.id),
    update: (u, id, p) => dailyRecordsService.update(id, u, p).then(r => r.id)
  },
  expense: { create: (u, p) => expensesService.create(p.farmId as string, u, p).then(r => r.id) },
  sale: { create: (u, p) => salesService.create(p.farmId as string, u, p).then(r => r.id) },
  vaccination: { create: (u, p) => vaccinationsService.create(p.batchId as string, u, p).then(r => r.id) }
};
```

  (`entityId` from the op is the client's local UUID — recorded on `SyncOperation.entityId` but never used as the server PK; the services validate authorization and farm access exactly as in Tasks 13–21.)

- [ ] **Step 2: Push service** — loop ops; each: idempotency check → handler dispatch (catch `ApiError` → per-op `FAILED` with code; continue) → insert `SyncOperation`; whole batch in one transaction. Verify user stays authenticated; farm ownership enforced by the underlying service.

- [ ] **Step 3: Pull service** — accessible farms query; union of tables; cursor filtering; envelope shape `{ data: { changes, nextCursor } }`.

- [ ] **Step 4: Test `sync.test.ts`** — push a daily-record op → record created on server; push SAME op again → `count == 1` (no duplicate), result `SYNCED` with same entityId; push expense with bad category → `FAILED` result with `VALIDATION_ERROR`, other ops in same batch still applied; pull with cursor returns only newer changes; cross-user pull never exposes other farm data.

- [ ] **Step 5: Commit** (`feat(api): sync module with idempotent push`).

### Task 25: Files module (presigned upload, minimal)

**Files:**
- Create: `apps/api/src/modules/files/{routes.ts,service.ts,schema.ts,types.ts}`, `apps/api/src/config/minio.ts`
- Test: `apps/api/tests/files.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/files/presign` (protected, OWNER/ACCOUNTANT) — body `{ fileName, contentType, farmId? }` → `{ data: { objectKey, uploadUrl, method: 'PUT' } }`; `GET /api/v1/files/:objectKey` → temporary GET URL (ownership check: objectKey prefix embeds farmId; authorizes against it). Env: `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`.

- [ ] **Step 1: MinIO client** — `minio` package; `presignedPutObject` (7d) + `presignedGetObject` (60s). Wire `receiptObjectKey` into expense create/update when present.

- [ ] **Step 2: Test** — presign returns PUT URL; GET presign requires ownership; malformed objectKey → 400. (If MinIO container isn't running in CI, mock the client in tests via dependency injection — `filesService(client)`.)

- [ ] **Step 3: Commit** (`feat(api): presigned file upload`).

### Task 26: Integration — authorization + integrity suites

**Files:**
- Create: `apps/api/tests/authorization.test.ts`, `apps/api/tests/integrity.test.ts`, `apps/api/tests/helpers.ts`

- [ ] **Step 1: `helpers.ts`** — `createUser(app, email, role?)`, `registerAndLogin(app, email)` → token, `createFarm(app, token)`, `createShed(app, token, farmId)`, `createBatch(app, token, farmId, shedId)`; `beforeEach` cleanup children→parents. DB through interface.

- [ ] **Step 2: `authorization.test.ts`** — the TESTING.md §5 matrix:
  - User A farm → User B GET farm/shed/batch/daily-record/expense/sale → all 404.
  - WORKER cannot PATCH farm; can create daily-record on own-farm batch (as member); cannot access other farm's batch.
  - ACCOUNTANT can create expense/sale; cannot PATCH farm or delete batch.
  - MANAGER can create batch; cannot create sale.
  - Expired access token → 401 `TOKEN_EXPIRED`; garbage token → 401 `TOKEN_INVALID`; missing token → 401.
  - Invalid body → 400 `VALIDATION_ERROR`.

- [ ] **Step 3: `integrity.test.ts`** — mortality > birdsAtStart rejected; birds cannot go negative (currentBirds guard); feed consume over stock rejected + stock unchanged; medicine use over stock rejected; sale over-payment rejected; duplicate daily record rejected; sale birdsSold > currentBirds rejected; feed purchase computes totalCost.

- [ ] **Step 4: Run full API suite** — `pnpm --filter @poultry/api test`. Expected: all green. Commit (`test(api): authorization and integrity suites`).

---

## Phase 4 — Mobile App

### Task 27: Mobile scaffold — Expo + Router + NativeWind + core services

**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/tsconfig.json`, `apps/mobile/babel.config.js`, `apps/mobile/tailwind.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/store/auth-store.ts`, `apps/mobile/src/services/api-client.ts`
- Test: impossible to run Expo in CI — verify `tsc --noEmit` passes.

**Interfaces:**
- Consumes: `@poultry/shared-types`, `@poultry/validation`.
- Produces: `apiClient.request<T>(path, opts)` — base URL from `EXPO_PUBLIC_API_URL`, attaches `Authorization: Bearer <accessToken>` from auth-store, on 401 attempts refresh once via `POST /auth/refresh`, on refresh failure signs out. `authStore` (zustand + persist to SecureStore): `{ user, accessToken, refreshToken, status, setTokens, setUser, signOut }`.

- [ ] **Step 1: Scaffold** — `pnpm dlx create-expo-app@latest apps/mobile --template blank-typescript` (SDK current), then add deps: `expo-router`, `nativewind@^4`, `tailwindcss@^3.4`, `react-hook-form`, `zod`, `@hookform/resolvers`, `zustand`, `@tanstack/react-query`, `expo-sqlite`, `expo-secure-store`, `expo-crypto`, `expo-sharing`, `expo-file-system`, `@poultry/shared-types`, `@poultry/validation`. Configure `main: "expo-router/entry"` in package.json.

- [ ] **Step 2: Router layout** — `app/_layout.tsx`: `<Stack>` with `(auth)` and `(app)` groups; `(app)/_layout.tsx` gates on `authStore.status === 'authenticated'` (redirect to `/login`); tabs via `(tabs)/_layout.tsx`.

- [ ] **Step 3: `api-client.ts`** — fetch wrapper with JSON envelope unpacking: on success return `res.data`; on error throw normalized `ApiClientError { code, message }` from `res.json().error`. Export typed helpers `get/post/patch/del`.

- [ ] **Step 4: Typecheck** — `pnpm --filter @poultry/mobile typecheck`. Expected: PASS. Commit (`chore(mobile): scaffold expo router + core services`).

### Task 28: Mobile DB layer — SQLite schema, repositories, migration runner

**Files:**
- Create: `apps/mobile/src/database/{db.ts,schema.ts,migrations.ts,repositories.ts,sync-queue.ts,sync-engine.ts}`
- Test: `apps/mobile/src/database/migrations.test.ts` + `sync-queue.test.ts` (vitest with `expo-sqlite` mocked via `mock` — run under Node with a pure in-memory shim in these two test files).

**Interfaces:**
- Produces: `openDb()` → SQLite conn (WAL mode); `migrate(db)` uses `PRAGMA user_version` with an ordered array of migration SQL strings (v1 = all tables below, v2+ = future); `syncTable` `INSERT OR REPLACE`; `sync_operations` table; `syncQueue = { enqueue(db, op), listPending(db), markSynced(db, operationId), markFailed(db, operationId, error), pruneSynced(db) }`; `repositories = { upsertRecord(db, table, row), getRecord(db, table, id), queryRecords(db, table, where), latestDailyRecord(db, batchId, date) }`.
- Local schema (tables): `users`, `farms`, `sheds`, `batches`, `daily_records`, `feed_items`, `feed_transactions`, `medicines`, `medicine_transactions`, `vaccinations`, `expenses`, `sales`, `alerts`, `sync_operations`. All with camelCase→snake_case columns + `id TEXT PRIMARY KEY`, `syncStatus TEXT DEFAULT 'synced'`, `updatedAt TEXT`.

- [ ] **Step 1: migrations** — v1 SQL creating all tables above; test: migrate on fresh db sets `user_version=1`; re-running `migrate` is a no-op.

- [ ] **Step 2: sync queue** — test: enqueue → pending; markSynced removes from pending; markFailed sets `retryCount++` and `lastError`, stays pending; `listPending` ordered by `createdAt`.

- [ ] **Step 3: repositories** — upsert semantics for pull (`INSERT OR REPLACE`); `latestDailyRecord` for pre-fill.

- [ ] **Step 4: Run vitest** — `pnpm --filter @poultry/mobile test` for these files. Commit (`feat(mobile): sqlite layer + migrations`).

### Task 29: Mobile sync engine

**Files:**
- Create: `apps/mobile/src/services/sync-engine.ts`, `apps/mobile/src/hooks/useSync.ts`
- Test: `apps/mobile/src/services/sync-engine.test.ts` (pure logic with mocked apiClient + db).

**Interfaces:**
- Produces: `syncEngine = { runOnce(api, db, authStore): Promise<SyncSummary>, enqueueLocal(db, input): void }`; `enqueueLocal(db, input)` — builds op `{ operationId: crypto.randomUUID(), entity, operationType: 'CREATE', entityId: localUuid, payload, createdAt: new Date().toISOString() }`, inserts `sync_operations` (status `pending`); `runOnce(api, db)` — if no network or no tokens → return `{ pushed: 0, pulled: 0 }`; else push `listPending` batch (order by createdAt, chunk ≤ 100 via `POST /sync/push`) → for each result: `synced` → markSynced + upsert returned entity mapping (server entityId → local map), `failed` → markFailed; then pull with stored cursor (`_syncCursor` in meta table) → upsert each `change` via repositories; `useSync()` — runs `runOnce` on app foreground + on connectivity change + manual refresh, exposes `{ syncing, lastSyncAt, pendingCount, failedCount }`.

- [ ] **Step 1: Push** — test (mocked): 3 pending ops → api returns 2 synced + 1 failed → queue has 1 pending left with lastError; same op called twice → api invoked once (queue drained before retry); entityId mapping stored (`meta` table key `server:<opId>`).

- [ ] **Step 2: Pull** — test (mocked): cursor saved after pull; upsert called per change; `nextCursor: null` → cursor unchanged.

- [ ] **Step 3: Hook** — wire into root layout + retry button on OfflineBanner.

- [ ] **Step 4: Commit** (`feat(mobile): sync engine`).

### Task 30: Mobile UI primitives + screen states

**Files:**
- Create: `apps/mobile/src/components/ui/{ScreenState.tsx,Button.tsx,Input.tsx,Card.tsx,Select.tsx,ConfirmDialog.tsx,Badge.tsx,EmptyState.tsx,OfflineBanner.tsx,FormField.tsx,DateField.tsx}`

**Interfaces:**
- Produces: `ScreenState { loading | error | empty | children, retry? }` wrapping the 5 required states (AGENTS.md §14); `FormField` = label + React Hook Form error text; `DateField` (native date picker via `@react-native-community/datetimepicker`); `Select` (segmented or bottom-sheet for enums); `ConfirmDialog` (destructive confirm); all styled with NativeWind tokens (spacing scale, `bg-background`, `text-foreground`, `rounded-xl`), consistent across app.

- [ ] **Step 1: Write components** — small, typed, strict TS; each renders children/slot API.

- [ ] **Step 2: Typecheck + visual (manual)** — `npx expo start` on device/emulator, verify states render (use storybook-less manual QA: temporarily render each state in `more.tsx` toggle — commit only the components, not the toggle).

- [ ] **Step 3: Commit** (`feat(mobile): ui primitives`).

### Task 31: Mobile auth screens

**Files:**
- Create: `apps/mobile/app/(auth)/{login.tsx,register.tsx,forgot-password.tsx,reset-password.tsx}`, `apps/mobile/src/features/auth/auth-queries.ts`
- Test: typecheck + manual flow.

**Interfaces:**
- Produces: login/register forms (React Hook Form + zod resolvers from `@poultry/validation`), `authApi.login/register/refresh/logout/forgotPassword/resetPassword` in `auth-queries.ts`, token persistence via SecureStore, route guard redirect (`authenticated` → `/(tabs)`; else → `/login`). Errors surface inline + `ScreenState` error. Loading disabled during submit. Forgot-password success state ("If an account exists, a reset link was sent").

- [ ] **Step 1: forms** — `registerSchema`/`loginSchema` resolvers; submit → `authStore.setTokens` + navigate.

- [ ] **Step 2: guard** — `(app)/_layout.tsx` redirect logic + splash while restoring tokens from SecureStore.

- [ ] **Step 3: Manual QA** — register → login → logout loop on emulator. Commit (`feat(mobile): auth screens`).

### Task 32: Mobile dashboard + farms/sheds/batches management

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/index.tsx` (dashboard), `apps/mobile/app/(app)/farms/{index.tsx,new.tsx,[farmId].tsx}`, `apps/mobile/app/(app)/sheds/[shedId].tsx`, `apps/mobile/src/features/{farms,batches}/`
- Test: typecheck + manual.

**Interfaces:**
- Produces: farm list (create/edit/archive), shed list under farm (create/edit), batch list under farm (create with shed picker), uses `useQuery` + `ScreenState`; dashboard reads `GET /dashboard?farmId=` with farm picker and shows the 10 headline metrics from spec (farms, activeBatches, totalBirds, mortalityPct, feedConsumedKg, expenses, revenue, profit) with `estimated`/`incomplete` badges.

- [ ] **Step 1: farms/sheds/batches screens** — CRUD against api + offline enqueue for create (Task 29 integration).

- [ ] **Step 2: dashboard** — aggregated endpoint + refresh + pull-to-refresh.

- [ ] **Step 3: Manual QA** — E2E-01 (register→farm→shed→batch→dashboard) on emulator. Commit (`feat(mobile): dashboard and farm management`).

### Task 33: Mobile daily entry (core UX)

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/batches.tsx`, `apps/mobile/app/(app)/batch/[batchId].tsx`, `apps/mobile/app/(app)/daily-entry/[batchId].tsx`, `apps/mobile/src/features/daily-entry/`, `apps/mobile/src/hooks/useDailyEntry.ts`
- Test: typecheck + manual; calculations live in `src/utils/calculations/` (Task 34).

**Interfaces:**
- Produces: batch list (filter by status, search), batch detail (info card + summary + records list + latest 7-day weight curve), daily-entry screen pre-filled with yesterday's values as hints (feed/weight/humidity), mortality local guard (`mortality` cannot exceed `birdsAtStart`, inline error), save → local upsert + `enqueueLocal` (CREATE/UPDATE) + optimistic UI, offline indicator when queue non-empty. Fast path: dashboard → active batch → entry in ≤3 taps.

- [ ] **Step 1: batches + detail screens** — query + ScreenState.

- [ ] **Step 2: daily-entry form** — RHF + zod resolver; prefill; numeric keyboards; save ✅.

- [ ] **Step 3: Manual QA** — E2E-02 offline: airplane mode → enter record → reopen app → record persists → reconnect → sync → server record exists. Commit (`feat(mobile): daily entry`).

### Task 34: Mobile calculations parity + mobile tests

**Files:**
- Create: `apps/mobile/src/utils/calculations/{birds.ts,mortality.ts,feed.ts,fcr.ts,profit.ts,sales.ts,index.ts}`
- Test: `apps/mobile/src/utils/calculations/*.test.ts`

**Interfaces:**
- Produces: mirrors of API `calculations.ts` (same function names/signatures as Task 15/16 outputs — `currentBirds`, `mortalityPercent`, `feedClosingStock`, `fcr`, `profitWithLabel`, `saleTotals`) — imported from a shared location if possible else duplicated with cross-verified fixtures.

- [ ] **Step 1: Implement + test** — port the API tests; assert identical numeric outputs for identical inputs (shared fixtures file `src/utils/calculations/fixtures.ts` used by both API and mobile tests where practical).

- [ ] **Step 2: Run mobile vitest suite** (calculations + migrations + sync queue + sync engine). Commit (`feat(mobile): calculations parity + tests`).

### Task 35: Mobile feed, health, vaccination screens

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/feed.tsx`, `apps/mobile/app/(app)/(tabs)/health.tsx`, `apps/mobile/app/(app)/vaccination/new.tsx`, `apps/mobile/src/features/{feed,health,vaccinations}/`
- Test: typecheck + manual.

**Interfaces:**
- Produces: feed list (stock, unit, threshold badge), feed detail (transactions, purchase/consume numeric forms → api + offline enqueue), medicine list (stock + expiry badge) with purchase/use forms, vaccination list per batch with add + mark-complete. All async screens wrapped in `ScreenState`; destructive actions (delete) confirm via `ConfirmDialog`.

- [ ] **Step 1: screens** — wire forms; optimistic local stock updates after enqueue.

- [ ] **Step 2: Manual QA** — feed consume crossing threshold → alert visible in Alerts tab (server-generated) + offline consumption enqueued. Commit (`feat(mobile): feed, health, vaccinations`).

### Task 36: Mobile finance screens — expenses + sales

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/finance.tsx`, `apps/mobile/app/(app)/expense/{new.tsx,[expenseId].tsx}`, `apps/mobile/app/(app)/sale/{new.tsx,[saleId].tsx}`, `apps/mobile/src/features/{expenses,sales}/`
- Test: typecheck + manual.

**Interfaces:**
- Produces: expense list (filter by category/date, total by category), expense form (category select, amount money-input with 2dp guard, payment status), sale form (batch picker showing current birds, `birdsSold` guard ≤ current birds, weight/rate → client computes preview total + outstanding, server recomputes on sync), sale detail with payment-update form (`updateSalePaymentSchema`).

- [ ] **Step 1: screens** — RHF forms; money keyboard `decimal-pad`; client preview uses `saleTotals` calc.

- [ ] **Step 2: Manual QA** — E2E-03: expense → sale → payment → profit report reflects. Commit (`feat(mobile): finance screens`).

### Task 37: Mobile alerts, reports, profile, settings

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/alerts.tsx`, `apps/mobile/app/(app)/(tabs)/more.tsx`, `apps/mobile/app/(app)/reports/{index.tsx,growth.tsx,mortality.tsx,feed.tsx,expenses.tsx,sales.tsx,profit-loss.tsx,batch-comparison.tsx}`, `apps/mobile/app/(app)/profile.tsx`, `apps/mobile/app/(app)/settings.tsx`, `apps/mobile/src/services/export-csv.ts`
- Test: typecheck + manual.

**Interfaces:**
- Produces: alerts list + mark-read + read-all + `OfflineBanner`; reports screens hitting `GET /reports/*` (filters farm/batch/from/to; simple list + badge rendering; profit/loss with completeness labels); More → profile (PATCH `/users/me`), settings (server URL display, clear local data, export CSV via `expo-sharing`/`expo-file-system`), role-based visibility (WORKER hidden finance/reports per matrix; ACCOUNTANT hidden farm ops).

- [ ] **Step 1: screens** — queries + state containers.

- [ ] **Step 2: CSV export** — export batches/daily records/finance via share sheet; verify file strings contain commas-escaped rows.

- [ ] **Step 3: Commit** (`feat(mobile): alerts, reports, profile, settings`).

### Task 38: Mobile offline indicator + polish

**Files:**
- Modify: `apps/mobile/app/_layout.tsx` (Mount OfflineBanner), `apps/mobile/src/store/sync-store.ts`, `apps/mobile/app/(app)/settings.tsx`

**Interfaces:**
- Produces: global offline banner when `!network` or `pendingCount > 0` or `failedCount > 0` — tap → retry `syncEngine.runOnce`; sync status chip per screen footer; logout clears SecureStore + SQLite (except nothing).

- [ ] **Step 1: Wire** connectivity hook (`@react-native-community/netinfo`) + sync store.

- [ ] **Step 2: Manual QA** — airplane-mode banner, reconnect auto-sync, failed-op banner persists with retry. Commit (`feat(mobile): offline banner and sync status`).

### Task 39: Full verification + polish gate

**Files:** none (verification)

- [ ] **Step 1: Root typecheck** — `pnpm typecheck` (all packages+apps). Expected: PASS, zero errors.

- [ ] **Step 2: Root tests** — `pnpm test` (shared + api + mobile unit suites). Expected: all green.

- [ ] **Step 3: Lint** — `pnpm -r lint` where configured (skip mobile if not configured; api via eslint). Expected: clean.

- [ ] **Step 4: Docker smoke** — `pnpm db:up` → `pnpm --filter @poultry/api dev` → curl `/health` + `/ready` + register/login round-trip on `localhost:4000`. Expected: 200; database reachable.

- [ ] **Step 5: Docs** — README at root updated with run instructions (env setup, db up, migrate, seed, dev servers, expo start).

- [ ] **Step 6: Final commit** — `chore: finalize mvp scaffold` if anything uncommitted.

### Task 40: Deployment assets — API Dockerfile, backup cron, Coolify notes

**Files:**
- Create: `apps/api/Dockerfile`, `apps/api/.dockerignore`, `backup/docker-backup.sh`, `README.md` (root — extend Task 39 step 5 if already written)

**Interfaces:**
- Produces: production container image for the API (multi-stage: `node:22-alpine` build with pnpm, then slim runtime, non-root user, `CMD ["node", "dist/server.js"]`); Coolify-ready — listens on `PORT`, reads `DATABASE_URL` + `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` from env, `/health` + `/ready` as healthchecks; a daily pg_dump backup script with retention of 7 snapshots, invoked from docker-compose (or documented cron on the VPS) and writing to a mounted volume (off-server copy documented in README).

- [ ] **Step 1: Dockerfile**

```dockerfile
# build stage
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @poultry/api build
# runtime stage
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /app/node_modules node_modules
COPY --from=build --chown=app:app /app/apps/api/dist apps/api/dist
COPY --from=build --chown=app:app /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build --chown=app:app /app/packages/validation/dist packages/validation/dist
USER app
EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/server.js"]
```

- [ ] **Step 2: `docker-backup.sh`** — `pg_dump` to dated file, prune keeping 7 newest, exit 1 on failure; document cron line `0 2 * * * /path/to/docker-backup.sh` in README plus off-server copy (rclone/rsync) note.

- [ ] **Step 3: Verify build** — `docker build -f apps/api/Dockerfile -t poultry-api .` builds (if Docker available). Commit (`chore(api): deployment assets`).

---

## Execution Notes

- Tasks are ordered by dependency. Tasks 1–26 are the API (independent of mobile); 27–38 are mobile (after shared packages + API contract is fixed by Tasks 3–9).
- Verify each commit's `pnpm typecheck` on `apps/api` (and packages) — `apps/mobile` typecheck requires Expo toolchain, use `pnpm --filter @poultry/mobile typecheck` once available.
- Anything from spec §9 that requires a real device (native date picker, share sheet, keyboard avoidance) is manually QA'd; automated checks cover db/sync/calculations only.
- If a task's test discovers a spec contradiction, stop and flag it (AGENTS.md §2), don't silently invent.