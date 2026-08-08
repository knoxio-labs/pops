# DO NOT EDIT — hand-written for the registry pillar (formerly core).
# The pillar Dockerfile generator does not yet understand the collapsed shape —
# until it does, this file is maintained manually. Keep it narrow: only
# @pops/registry and its transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/registry..." --json --depth -1`).
#
# NOTE: not build-verified in the authoring environment (no Docker available);
# mirrors pillars/finance/Dockerfile with the registry dep set + port 3001.

FROM node:24-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/registry + its transitive @pops/* deps.
COPY pillars/registry/package.json ./pillars/registry/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/settings/package.json ./libs/settings/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/registry..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.

COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json

COPY libs/settings/src ./libs/settings/src
COPY libs/settings/tsconfig.json ./libs/settings/tsconfig.json
COPY libs/settings/tsconfig.build.json ./libs/settings/tsconfig.build.json

COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json

COPY pillars/registry/src ./pillars/registry/src
COPY pillars/registry/scripts ./pillars/registry/scripts
COPY pillars/registry/openapi ./pillars/registry/openapi
COPY pillars/registry/migrations ./pillars/registry/migrations
COPY pillars/registry/tsconfig.json ./pillars/registry/tsconfig.json
COPY pillars/registry/tsconfig.build.json ./pillars/registry/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/registry^..." build
RUN pnpm --filter "@pops/registry" build

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/registry --config.inject-workspace-packages=true deploy --prod /app/deploy

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
# Deliberately the SHARED variable and not REGISTRY_SQLITE_PATH: the pillar is
# mid-rename core→registry and its resolver ranks REGISTRY_SQLITE_PATH above the
# legacy CORE_SQLITE_PATH the live compose still sets (see
# pillars/registry/src/api/core-sqlite-path.ts). Baking the per-pillar variable
# would outrank that compose value and silently point a running deployment at a
# different file. SQLITE_PATH is the lowest precedence of the three, so both
# compose variables still win; on its own it lands on /data/sqlite/registry.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/registry/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/registry/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3001
USER node
CMD ["node", "dist/api/server.js"]
