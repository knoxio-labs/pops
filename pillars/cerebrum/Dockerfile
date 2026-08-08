# DO NOT EDIT — hand-written for the collapsed cerebrum pillar.
# The pillar Dockerfile generator (scripts/generate-pillar-dockerfile.mjs)
# does not yet understand the collapsed shape — until it does, this file
# is maintained manually. Keep it narrow: only @pops/cerebrum and its
# transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/cerebrum..." --json --depth -1`).

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

# Phase 1: package.json of @pops/cerebrum + its transitive @pops/* deps.
# `pnpm install --filter "@pops/cerebrum..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist
# in this image's build context.
COPY pillars/cerebrum/package.json ./pillars/cerebrum/
COPY libs/ai-telemetry/package.json ./libs/ai-telemetry/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/settings/package.json ./libs/settings/
COPY libs/types/package.json ./libs/types/

# Install pnpm + only the deps of the @pops/cerebrum subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/cerebrum..."

# Phase 2: source for the transitive @pops/* deps of @pops/cerebrum.
# @pops/ai-telemetry
COPY libs/ai-telemetry/src ./libs/ai-telemetry/src
COPY libs/ai-telemetry/tsconfig.json ./libs/ai-telemetry/tsconfig.json
COPY libs/ai-telemetry/tsconfig.build.json ./libs/ai-telemetry/tsconfig.build.json
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
# @pops/cerebrum (the pillar itself)
COPY pillars/cerebrum/src ./pillars/cerebrum/src
COPY pillars/cerebrum/scripts ./pillars/cerebrum/scripts
COPY pillars/cerebrum/openapi ./pillars/cerebrum/openapi
COPY pillars/cerebrum/migrations ./pillars/cerebrum/migrations
COPY pillars/cerebrum/tsconfig.json ./pillars/cerebrum/tsconfig.json
COPY pillars/cerebrum/tsconfig.build.json ./pillars/cerebrum/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/cerebrum^..." build
RUN pnpm --filter "@pops/cerebrum" build

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/cerebrum --config.inject-workspace-packages=true deploy --prod /app/deploy

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Both data volume mount points this pillar declares in compose, created here
# and owned by the runtime user. Docker seeds an empty named volume from the
# image's contents at the mount point, ownership included — so a directory
# missing here arrives root-owned on the volume's FIRST EVER mount and the
# pillar cannot write there. `cerebrum-engrams-data` fails the same way as the
# database volume, just later: at the first engram write rather than at boot.
RUN mkdir -p /data/sqlite /data/cerebrum/engrams && chown -R node:node /data

# The image's own database default, so it boots with no environment at all.
# `SQLITE_PATH` is the lowest-precedence path the resolver reads (see
# pillars/cerebrum/src/api/cerebrum-sqlite-path.ts), so compose's per-pillar
# CEREBRUM_SQLITE_PATH still wins; on its own it lands on
# /data/sqlite/cerebrum.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/cerebrum/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/cerebrum/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3007
USER node
CMD ["node", "dist/api/server.js"]
