# DO NOT EDIT — hand-written for the collapsed inventory pillar. Every pillar
# Dockerfile is hand-maintained; nothing regenerates them. Keep Phase 1
# narrow: only @pops/inventory and its transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/inventory..." --json --depth -1`).

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

# Phase 1: package.json of @pops/inventory + its transitive @pops/* deps.
# `pnpm install --filter "@pops/inventory..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist
# in this image's build context.
COPY pillars/inventory/package.json ./pillars/inventory/
COPY libs/contract-openapi/package.json ./libs/contract-openapi/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/settings/package.json ./libs/settings/
COPY libs/types/package.json ./libs/types/

# Install pnpm + only the deps of the @pops/inventory subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/inventory..."

# Phase 2: source for the transitive @pops/* deps of @pops/inventory.
# @pops/contract-openapi
COPY libs/contract-openapi/src ./libs/contract-openapi/src
COPY libs/contract-openapi/tsconfig.json ./libs/contract-openapi/tsconfig.json
COPY libs/contract-openapi/tsconfig.build.json ./libs/contract-openapi/tsconfig.build.json
# @pops/pillar-sdk
COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json
# @pops/pillar-settings
COPY libs/settings/src ./libs/settings/src
COPY libs/settings/tsconfig.json ./libs/settings/tsconfig.json
COPY libs/settings/tsconfig.build.json ./libs/settings/tsconfig.build.json
# @pops/types
COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json
# @pops/inventory (the pillar itself)
COPY pillars/inventory/src ./pillars/inventory/src
COPY pillars/inventory/scripts ./pillars/inventory/scripts
COPY pillars/inventory/openapi ./pillars/inventory/openapi
COPY pillars/inventory/migrations ./pillars/inventory/migrations
COPY pillars/inventory/tsconfig.json ./pillars/inventory/tsconfig.json
COPY pillars/inventory/tsconfig.build.json ./pillars/inventory/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/inventory^..." build
RUN pnpm --filter "@pops/inventory" build

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/inventory --config.inject-workspace-packages=true deploy --prod /app/deploy

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
# pillars/inventory/src/api/inventory-sqlite-path.ts), so compose's per-pillar
# INVENTORY_SQLITE_PATH still wins; on its own it lands on
# /data/sqlite/inventory.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/inventory/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/inventory/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3002
USER node
CMD ["node", "dist/api/server.js"]
