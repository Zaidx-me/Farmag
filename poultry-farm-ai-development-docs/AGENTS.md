# AGENTS.md — AI Coding Instructions

This file is the primary development context for AI coding assistants.

## 1. Project

Project name: Poultry Farm Management

Purpose: Offline-first mobile application for managing poultry farms, sheds, batches/flocks, daily records, feed, medicine, vaccination, expenses, sales, reports, and alerts.

MVP is completely free.

There is NO subscription system in the MVP.

---

# 2. Source of Truth

Before writing code, read:

1. `PRD.md`
2. `TDD.md`
3. `DATABASE_AND_API.md`
4. `TESTING.md`

If implementation conflicts with these documents, stop and identify the conflict instead of silently inventing an architecture.

Do not create a new architecture without a documented reason.

---

# 3. Technology Stack

## Mobile

- React Native
- Expo
- TypeScript
- Expo Router
- NativeWind
- React Hook Form
- Zod
- Zustand
- Expo SQLite for offline persistence/sync queue

## Backend

- Node.js
- Fastify
- TypeScript
- Prisma
- PostgreSQL
- Redis when required for caching/background jobs
- MinIO/S3-compatible storage for files
- JWT access tokens + refresh tokens
- Argon2 or bcrypt for password hashing
- OpenAPI/Swagger

## Infrastructure

- Private VPS
- Docker
- Coolify
- HTTPS
- PostgreSQL backups
- MinIO backups if files are business-critical

---

# 4. Architecture

Use:

```text
Mobile UI
  ↓
Hooks / State
  ↓
API Client
  ↓
Fastify REST API
  ↓
Services
  ↓
Repositories / Prisma
  ↓
PostgreSQL
```

Offline path:

```text
Mobile UI
  ↓
Local SQLite
  ↓
Sync Queue
  ↓
API
  ↓
PostgreSQL
```

Do not connect the mobile app directly to PostgreSQL.

Do not put database credentials in the mobile app.

---

# 5. Coding Rules

- TypeScript strict mode.
- Avoid `any`.
- Prefer small focused modules.
- Keep business logic out of React screen components.
- Use reusable components.
- Use service/repository boundaries on the backend.
- Validate all external input.
- Never trust client-provided authorization.
- Never calculate security permissions only on the client.
- Never expose secrets in source code.
- Use environment variables for server secrets.
- Use Prisma migrations; do not manually mutate production schema.
- Use transactions for multi-step critical financial/stock operations.

---

# 6. Naming

Use:

- `camelCase` for variables/functions
- `PascalCase` for React components/classes/types where appropriate
- `kebab-case` for API route files/modules where appropriate
- Database naming convention should be consistent with Prisma schema

Examples:

```text
dailyRecordService.ts
BatchCard.tsx
useDailyEntry.ts
```

---

# 7. Mobile Structure

Preferred:

```text
apps/mobile/
  app/
  src/
    components/
    features/
    hooks/
    services/
    store/
    database/
    utils/
    types/
    validation/
    constants/
```

Use feature-oriented organization where practical.

Do not create one giant `utils.ts` or `api.ts`.

---

# 8. Backend Structure

Preferred:

```text
apps/api/
  src/
    config/
    plugins/
    middleware/
    modules/
      auth/
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
    utils/
    app.ts
    server.ts
  prisma/
    schema.prisma
    migrations/
```

Each module should contain its route/controller, schema/validation, service, and relevant types where practical.

---

# 9. API Rules

All API routes should be versioned:

`/api/v1/...`

Use consistent responses.

Success:

```json
{
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Never return raw stack traces to clients.

---

# 10. Authentication Rules

- Store passwords only as secure hashes.
- Never log passwords.
- Never log access/refresh tokens.
- Access tokens should be short-lived.
- Refresh tokens should be revocable.
- Check user status on protected requests.
- Authorization must happen on the backend.

---

# 11. Authorization

Roles:

```text
OWNER
MANAGER
WORKER
ACCOUNTANT
```

Authorization must be enforced server-side.

A user must not access another user's farm by changing an ID in the URL.

Example:

`GET /api/v1/farms/other-user-farm-id`

must return unauthorized/not found according to the chosen security strategy.

---

# 12. Offline Rules

Offline operations must have:

- Local ID / UUID
- Operation type
- Created timestamp
- Sync status
- Retry count
- Last error

Example:

```text
pending
syncing
synced
failed
```

Do not silently discard failed synchronization.

Avoid duplicate writes by using idempotency keys or client-generated operation IDs where appropriate.

---

# 13. Data Integrity

Critical operations include:

- Feed consumption
- Feed purchase
- Medicine usage
- Expense creation
- Sale creation
- Payment update
- Bird count changes

Use database transactions where multiple records must change together.

Never allow:

- Negative stock
- Negative bird count
- Payment greater than sale amount unless explicitly supported
- Mortality greater than available birds
- Unauthorized batch/farm access

---

# 14. UI Rules

Every asynchronous screen must support:

- Loading
- Success
- Error
- Empty
- Retry

Use consistent:

- Spacing
- Typography
- Buttons
- Inputs
- Cards
- Alerts
- Confirmation dialogs

Do not use placeholder buttons.

Every visible action must work.

---

# 15. UX Rules

Daily farm entry is the highest-frequency workflow.

Optimize:

```text
Open app
→ Select batch
→ Today's entry
→ Enter values
→ Save
```

Avoid unnecessary confirmation screens.

For destructive actions, require confirmation.

---

# 16. Business Calculation Rules

Never duplicate formulas in multiple screens.

Centralize calculations.

Suggested:

```text
src/utils/calculations/
  birds.ts
  mortality.ts
  feed.ts
  fcr.ts
  profit.ts
  sales.ts
```

The backend remains authoritative for persisted business results.

Client-side calculations are for immediate UX feedback only.

---

# 17. Subscriptions

Do NOT implement subscriptions in MVP.

Do NOT add:

- Stripe
- Payment gateways
- Plan selection
- Upgrade buttons
- Premium labels
- Feature locks
- Trial limits

A future subscription module may exist architecturally, but it must remain disabled and invisible.

---

# 18. Security Rules for AI

Never:

- Disable authentication to "make it work"
- Set unrestricted database permissions
- Commit `.env`
- Hard-code production passwords
- Hard-code JWT secrets
- Return sensitive records without authorization
- Bypass validation
- Delete tests to make builds pass

If a secure implementation is difficult, explain the issue and implement the secure version.

---

# 19. Dependencies

Before adding a dependency:

1. Check whether the existing stack already solves the problem.
2. Prefer mature, maintained packages.
3. Avoid packages that duplicate existing functionality.
4. Explain why a new dependency is needed.

Do not add large libraries for trivial functionality.

---

# 20. AI Workflow

Before modifying code:

1. Inspect relevant files.
2. Read applicable documentation.
3. Identify dependencies.
4. State the intended change briefly.
5. Make the smallest coherent change.
6. Run relevant tests/type checks/lint.
7. Report changed files and verification results.

Do not rewrite unrelated files.

---

# 21. Definition of Done

A feature is not complete until:

- UI exists
- API exists if required
- Database schema exists if required
- Validation exists
- Authorization exists
- Loading/error/empty states exist
- Offline behavior is addressed where applicable
- Tests exist for critical logic
- TypeScript passes
- Relevant tests pass
- No placeholder implementation remains

---

# 22. Important Instruction

When requirements are ambiguous, prefer:

1. Existing project documentation
2. Existing code patterns
3. Established architecture
4. Smallest safe implementation

Do not invent features merely to fill gaps.
