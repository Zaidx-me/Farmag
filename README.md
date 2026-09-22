# Poultry Farm

Monorepo for the poultry-farm MVP, managed with pnpm workspaces.

- `apps/*` — deployable applications (API, web, mobile)
- `packages/*` — shared libraries (db, config, types, utils)

```bash
pnpm install   # install all workspace dependencies
pnpm db:up     # start postgres, postgres-test, and minio via docker compose
pnpm db:down   # stop all docker compose services
```

Run per-app scripts with `pnpm --filter <name> <script>`; `pnpm typecheck` and `pnpm test` run across all workspaces.

Docs: `docs/superpowers/specs/2026-09-22-poultry-farm-mvp-design.md` (design) and `docs/superpowers/plans/2026-09-22-poultry-farm-mvp.md` (plan).
