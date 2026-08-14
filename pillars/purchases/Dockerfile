# Hand-written, following the collapsed shape the lists pillar pilots.
# Keep Phase 1 narrow: only @pops/purchases and its transitive @pops/*
# deps (queried via
# `pnpm m ls --filter "@pops/purchases..." --json --depth -1`).

FROM node:24-slim AS builder
WORKDIR /app

# better-sqlite3 installs as `prebuild-install || node-gyp rebuild`, and this
# base has neither Python nor a compiler — so the second half of that `||`
# cannot run, and any failure to FETCH the prebuilt binary takes the whole
# build down with an error about Python that names neither cause nor fix. The
# prebuild stays the fast path; this is only what makes the fallback real.
# Builder stage only: the runtime image is a separate FROM and gets none of it.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/purchases + its transitive @pops/* deps.
# `pnpm install --filter "@pops/purchases..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist in
# this image's build context.
COPY pillars/purchases/package.json ./pillars/purchases/
COPY libs/ai-telemetry/package.json ./libs/ai-telemetry/
COPY libs/contract-openapi/package.json ./libs/contract-openapi/
COPY libs/pillar-express/package.json ./libs/pillar-express/
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

COPY libs/contract-openapi/src ./libs/contract-openapi/src
COPY libs/contract-openapi/tsconfig.json ./libs/contract-openapi/tsconfig.json
COPY libs/contract-openapi/tsconfig.build.json ./libs/contract-openapi/tsconfig.build.json

COPY libs/pillar-express/src ./libs/pillar-express/src
COPY libs/pillar-express/tsconfig.json ./libs/pillar-express/tsconfig.json
COPY libs/pillar-express/tsconfig.build.json ./libs/pillar-express/tsconfig.build.json

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

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/purchases --config.inject-workspace-packages=true deploy --prod /app/deploy

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# The data volume's mount point, created here and owned by the runtime user.
# Docker seeds an empty named volume from the image's contents at the mount
# point, ownership included — so a directory missing here arrives root-owned on
# the volume's FIRST EVER mount, `mkdirSync` no-ops on it, and the pillar dies
# on SQLITE_CANTOPEN. Same reasoning as pillars/contacts/Dockerfile.
RUN mkdir -p /data/sqlite && chown -R node:node /data

# The image's own database default, so it boots with no environment at all.
# `SQLITE_PATH` is the lowest-precedence path the resolver reads (see
# pillars/purchases/src/api/purchases-sqlite-path.ts), so compose's per-pillar
# PURCHASES_SQLITE_PATH still wins; on its own it lands on
# /data/sqlite/purchases.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

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
