# DO NOT EDIT — hand-written for the collapsed lists pillar pilot. Every
# pillar Dockerfile is hand-maintained; nothing regenerates them. Keep
# Phase 1 narrow: only @pops/lists and its transitive @pops/* deps (queried
# via `pnpm m ls --filter "@pops/lists..." --json --depth -1`).

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

# Phase 1: package.json of @pops/lists + its transitive @pops/* deps.
# `pnpm install --filter "@pops/lists..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist
# in this image's build context.
COPY pillars/lists/package.json ./pillars/lists/
COPY libs/contract-openapi/package.json ./libs/contract-openapi/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/types/package.json ./libs/types/

# Install pnpm + only the deps of the @pops/lists subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/lists..."

# Phase 2: source for the transitive @pops/* deps of @pops/lists.
# @pops/contract-openapi
COPY libs/contract-openapi/src ./libs/contract-openapi/src
COPY libs/contract-openapi/tsconfig.json ./libs/contract-openapi/tsconfig.json
COPY libs/contract-openapi/tsconfig.build.json ./libs/contract-openapi/tsconfig.build.json
# @pops/pillar-sdk
COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json
# @pops/types
COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json
# @pops/lists (the pillar itself)
COPY pillars/lists/src ./pillars/lists/src
COPY pillars/lists/scripts ./pillars/lists/scripts
COPY pillars/lists/openapi ./pillars/lists/openapi
COPY pillars/lists/migrations ./pillars/lists/migrations
COPY pillars/lists/tsconfig.json ./pillars/lists/tsconfig.json
COPY pillars/lists/tsconfig.build.json ./pillars/lists/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/lists^..." build
RUN pnpm --filter "@pops/lists" build

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/lists --config.inject-workspace-packages=true deploy --prod /app/deploy

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
# pillars/lists/src/api/lists-sqlite-path.ts), so compose's per-pillar
# LISTS_SQLITE_PATH still wins; on its own it lands on /data/sqlite/lists.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/lists/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/lists/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3006
USER node
CMD ["node", "dist/api/server.js"]
