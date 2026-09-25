# syntax=docker/dockerfile:1
#
# Production image for @poultry/api.
# Context is the repo root (pnpm workspace); the workspace symlinks that link
# @poultry/api to @poultry/validation and @poultry/shared-types are only
# resolved correctly when the whole tree is carried into the final stage.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --- dependencies -----------------------------------------------------------
FROM base AS deps
# Every workspace package.json must be present before install, or pnpm cannot
# resolve the lockfile against the workspace globs.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validation/package.json ./packages/validation/
RUN pnpm install --frozen-lockfile --filter "@poultry/api..."

# --- build ------------------------------------------------------------------
FROM deps AS build
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
# The shared packages ship compiled output (main -> ./dist/index.js), so they
# must be built before the API's tsc pass resolves their types.
RUN pnpm --filter @poultry/shared-types build \
 && pnpm --filter @poultry/validation build \
 && pnpm --filter @poultry/api exec prisma generate \
 && pnpm --filter @poultry/api build

# --- runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000
# Prisma's query engine needs libssl; argon2 is a prebuilt native addon.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy the built tree wholesale rather than pruning: selective copies break the
# pnpm workspace symlinks and the Prisma engine/CLI that `db:deploy` invokes.
COPY --from=build /app ./

EXPOSE 4000
# Migrations must land before the server accepts traffic.
CMD ["sh", "-c", "pnpm --filter @poultry/api db:deploy && pnpm --filter @poultry/api start"]
