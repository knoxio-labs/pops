# Hand-written, following the collapsed shape the lists pillar pilots.
# Keep Phase 1 narrow: only @pops/purchases and its transitive @pops/*
# deps (queried via
# `pnpm m ls --filter "@pops/purchases..." --json --depth -1`).

FROM node:22-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/purchases + its transitive @pops/* deps.
# `pnpm install --filter "@pops/purchases..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist in
# this image's build context.
COPY pillars/purchases/package.json ./pillars/purchases/
COPY libs/ai-telemetry/package.json ./libs/ai-telemetry/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/types/package.json ./libs/types/

# Install pnpm + only the deps of the @pops/purchases subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/purchases..."

# Phase 2: source for the transitive @pops/* deps of @pops/purchases.
# @pops/pillar-sdk
COPY libs/ai-telemetry/src ./libs/ai-telemetry/src
COPY libs/ai-telemetry/tsconfig.json ./libs/ai-telemetry/tsconfig.json
COPY libs/ai-telemetry/tsconfig.build.json ./libs/ai-telemetry/tsconfig.build.json

COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json
# @pops/types
COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json
# @pops/purchases (the pillar itself)
COPY pillars/purchases/src ./pillars/purchases/src
COPY pillars/purchases/scripts ./pillars/purchases/scripts
COPY pillars/purchases/openapi ./pillars/purchases/openapi
COPY pillars/purchases/migrations ./pillars/purchases/migrations
COPY pillars/purchases/tsconfig.json ./pillars/purchases/tsconfig.json
COPY pillars/purchases/tsconfig.build.json ./pillars/purchases/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/purchases^..." build
RUN pnpm --filter "@pops/purchases" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/purchases deploy --prod --legacy /app/deploy

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/purchases/dist ./dist
# `openapi/` is NOT copied here: package.json's `files` list includes
# `openapi/purchases.openapi.json`, so `pnpm deploy` already places it at
# /app/openapi/ — which is where app.ts resolves it from relative to
# dist/api/. A second COPY would shadow it with the same bytes.
COPY --from=builder --chown=node:node /app/pillars/purchases/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3013
USER node
CMD ["node", "dist/api/server.js"]
