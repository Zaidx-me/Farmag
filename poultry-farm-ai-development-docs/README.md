# Poultry Farm Management — AI Development Documentation

This folder contains the planning documents that should be read before generating application code.

## Reading order

1. `PRD.md` — what the product must do
2. `AGENTS.md` — how AI assistants must modify the code
3. `TDD.md` — architecture and technical decisions
4. `DATABASE_AND_API.md` — data model and API contract
5. `TESTING.md` — quality requirements
6. `RESEARCH.md` — product/technical research assumptions

## MVP commercial rule

The MVP is completely free.

There are:

- no subscriptions
- no payment gateway
- no paywall
- no premium restrictions
- no artificial usage limits

## Backend decision

Firebase is not the core backend.

The planned stack is:

- Node.js + Fastify
- PostgreSQL + Prisma
- SQLite for mobile offline storage
- Redis when required
- MinIO for files
- Docker + Coolify
- Private VPS

## AI workflow

AI coding assistants should read these documents before making significant architectural changes.

If code and documentation conflict, do not silently choose one. Identify the conflict and update the relevant documentation intentionally.
