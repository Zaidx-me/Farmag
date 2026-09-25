# syntax=docker/dockerfile:1
#
# Production image for the Expo web client (@poultry/mobile).
# EXPO_PUBLIC_* variables are inlined at bundle time, so EXPO_PUBLIC_API_URL
# is a build arg -- setting it at runtime has no effect on the bundle.

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Every workspace package.json must exist before install so pnpm can match
# the lockfile against the workspace globs.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validation/package.json ./packages/validation/
RUN pnpm install --frozen-lockfile --filter "@poultry/mobile..."

COPY packages/ ./packages/
COPY apps/mobile/ ./apps/mobile/

ARG EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
RUN pnpm --filter @poultry/mobile exec expo export --platform web --clear

# --- runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine AS runner
COPY apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mobile/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
