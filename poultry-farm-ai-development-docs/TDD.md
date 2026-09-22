# Technical Design Document (TDD)

## 1. Architecture Overview

The system is a mobile-first, offline-capable, REST-based application.

```text
┌─────────────────────────────┐
│ React Native + Expo Mobile  │
│ TypeScript + Expo Router    │
└──────────────┬──────────────┘
               │ HTTPS REST
               ▼
┌─────────────────────────────┐
│ Node.js + Fastify API       │
│ Auth / Business Logic       │
│ Validation / Authorization  │
└──────┬──────────┬───────────┘
       │          │
       ▼          ▼
 PostgreSQL     Redis
  + Prisma      Cache/Jobs
       │
       ▼
     MinIO
  File Storage

Infrastructure:
VPS → Docker → Coolify → HTTPS
```

---

# 2. Architectural Principles

### Mobile

The mobile application is a client, not the source of truth for authorization or persistent business logic.

### API

The API is the security and business boundary.

### Database

PostgreSQL is the primary source of persistent business data.

### Offline Store

SQLite stores pending and locally cached mobile data.

### Storage

MinIO stores files; PostgreSQL stores metadata and object references.

---

# 3. Recommended Monorepo

```text
poultry-farm/
├── apps/
│   ├── mobile/
│   └── api/
├── packages/
│   ├── shared-types/
│   └── validation/
├── docs/
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

A monorepo is recommended so shared TypeScript types can be reused safely.

If this adds unnecessary complexity during initial development, mobile and API can be separate repositories while keeping API contracts documented.

---

# 4. Mobile Architecture

```text
Screens
 ↓
Feature Components
 ↓
Hooks
 ↓
State / Query Layer
 ↓
API Client + Offline Repository
 ↓
SQLite
 ↓
Sync Engine
 ↓
REST API
```

Use Expo Router for navigation.

Use Zustand only for client/global state that truly needs it.

Use TanStack Query for server-state caching if adopted by the project.

---

# 5. Backend Architecture

```text
HTTP Request
 ↓
Fastify Route
 ↓
Authentication
 ↓
Authorization
 ↓
Request Validation
 ↓
Service
 ↓
Repository / Prisma
 ↓
PostgreSQL
```

Services own business operations.

Repositories/data-access code owns persistence details.

---

# 6. Background Jobs

Redis/BullMQ-style job processing can be introduced for:

- Notification generation
- Scheduled reminders
- Report generation
- Large exports
- Cleanup tasks

Do not make Redis a mandatory dependency for simple CRUD in the first implementation unless needed.

---

# 7. Authentication Design

Registration:

```text
Mobile
 ↓
POST /api/v1/auth/register
 ↓
Validate
 ↓
Hash password
 ↓
Create user
 ↓
Issue tokens
```

Login:

```text
Mobile
 ↓
POST /api/v1/auth/login
 ↓
Verify password
 ↓
Issue access + refresh tokens
```

Refresh:

```text
Refresh Token
 ↓
POST /api/v1/auth/refresh
 ↓
Validate/revoke/rotate
 ↓
New access token
```

---

# 8. Authorization Design

Every protected request has:

```text
userId
role
organization/farm scope
```

For MVP, ownership can be user/farm based.

Design the database so a future organization/company layer can be added.

---

# 9. Offline Synchronization

Every locally created mutation receives a client operation ID.

Example:

```json
{
  "operationId": "uuid",
  "entity": "dailyRecord",
  "operation": "CREATE",
  "payload": {},
  "createdAt": "ISO_DATE"
}
```

Sync algorithm:

```text
SQLite pending queue
 ↓
Network available
 ↓
Send operation
 ↓
API validates
 ↓
Transaction
 ↓
Return operation result
 ↓
Mark local operation synced
```

If the same operation is sent twice, the backend should not create duplicate business records.

---

# 10. Conflict Strategy

For MVP:

- Server remains authoritative.
- Records use `createdAt` and `updatedAt`.
- Immutable event-like records should generally not be silently overwritten.
- User edits should return conflict information when necessary.
- Avoid blind last-write-wins for financial/stock-critical data.

A detailed conflict-resolution mechanism can be expanded later.

---

# 11. PostgreSQL Design Principles

Use relational foreign keys.

Use:

- UUID primary keys
- Numeric/decimal types for money and measured values
- Timestamps with timezone
- Indexes on common filters
- Foreign key constraints
- Unique constraints where needed

Money should not be stored as floating-point values.

Use decimal/numeric.

---

# 12. File Storage

Mobile:

```text
Request signed upload / API upload
 ↓
MinIO
 ↓
Object key stored in PostgreSQL
```

Do not store large binary files directly in PostgreSQL.

Validate:

- MIME type
- File size
- Ownership
- Extension

---

# 13. API Versioning

All API routes:

`/api/v1/...`

Future breaking versions:

`/api/v2/...`

Do not silently break existing mobile clients.

---

# 14. Error Handling

Use stable error codes.

Examples:

```text
AUTH_INVALID_CREDENTIALS
AUTH_UNAUTHORIZED
FORBIDDEN
RESOURCE_NOT_FOUND
VALIDATION_ERROR
BATCH_BIRD_COUNT_INVALID
STOCK_INSUFFICIENT
PAYMENT_EXCEEDS_TOTAL
SYNC_CONFLICT
INTERNAL_ERROR
```

---

# 15. Observability

Production should have:

- Structured server logs
- Error logging
- Health endpoint
- Database health check
- Basic request timing
- Backup monitoring

Health:

`GET /health`

Readiness:

`GET /ready`

Never expose sensitive configuration through health endpoints.

---

# 16. VPS / Coolify Deployment

Recommended services:

```text
coolify
 ├── poultry-api
 ├── poultry-postgres
 ├── poultry-redis (optional initially)
 └── poultry-minio
```

Use persistent volumes for:

- PostgreSQL
- MinIO

Do not rely on container filesystem for persistent business data.

Use a managed DNS/domain pointing to the VPS.

Use HTTPS.

---

# 17. Database Backups

At minimum:

- Automated daily PostgreSQL backup
- Retention policy
- Periodic restore test
- Off-server backup destination

A backup that has never been restored should not be considered verified.

---

# 18. Scalability

Start simple.

One VPS can run the initial stack.

If usage grows:

```text
Load Balancer
    ↓
API Instance 1
API Instance 2
    ↓
PostgreSQL
Redis
MinIO
```

The application should avoid storing critical session state only in API memory so multiple API instances can eventually run.

---

# 19. Security

Required:

- HTTPS
- Secure password hashing
- JWT rotation/revocation strategy
- Rate limiting for auth endpoints
- Request validation
- CORS configuration
- Secure headers
- Authorization checks
- Database least privilege
- Secrets through environment variables
- Regular dependency updates
- VPS firewall
- SSH key authentication
- Database not exposed publicly unless required

---

# 20. Future Subscription Boundary

Subscription functionality is deliberately excluded from MVP.

Future architecture can add:

```text
subscription/
billing/
plans/
entitlements/
payments/
```

without putting subscription logic inside farm/batch calculations.

The core domain must remain usable without payment state.

---

# 21. Key Architectural Decision

Do not use Firebase Firestore as the core database.

The selected backend is:

**Node.js + Fastify + PostgreSQL + Prisma + optional Redis + MinIO, deployed through Coolify on the user's VPS.**
