# DO NOT EDIT — hand-written for the ai pillar.
# Keep it narrow: only @pops/ai and its transitive @pops/* deps
# (@pops/ai-telemetry, @pops/contract-openapi, @pops/pillar-jobs, @pops/pillar-sdk,
# @pops/pillar-settings, @pops/types), queried via
# `pnpm m ls --filter "@pops/ai..." --json --depth -1`.
#
# Mirrors pillars/core/Dockerfile with the ai dep set + port 3008, plus the
# @pops/ai-telemetry COPY block (the ingest route imports its record-schema).

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

# Phase 1: package.json of @pops/ai + its transitive @pops/* deps.
COPY pillars/ai/package.json ./pillars/ai/
COPY libs/ai-telemetry/package.json ./libs/ai-telemetry/
COPY libs/contract-openapi/package.json ./libs/contract-openapi/
COPY libs/jobs/package.json ./libs/jobs/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/settings/package.json ./libs/settings/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/ai..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.

COPY libs/ai-telemetry/src ./libs/ai-telemetry/src
COPY libs/ai-telemetry/tsconfig.json ./libs/ai-telemetry/tsconfig.json
COPY libs/ai-telemetry/tsconfig.build.json ./libs/ai-telemetry/tsconfig.build.json

COPY libs/contract-openapi/src ./libs/contract-openapi/src
COPY libs/contract-openapi/tsconfig.json ./libs/contract-openapi/tsconfig.json
COPY libs/contract-openapi/tsconfig.build.json ./libs/contract-openapi/tsconfig.build.json

COPY libs/jobs/src ./libs/jobs/src
COPY libs/jobs/tsconfig.json ./libs/jobs/tsconfig.json
COPY libs/jobs/tsconfig.build.json ./libs/jobs/tsconfig.build.json

COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json

COPY libs/settings/src ./libs/settings/src
COPY libs/settings/tsconfig.json ./libs/settings/tsconfig.json
COPY libs/settings/tsconfig.build.json ./libs/settings/tsconfig.build.json

COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json

COPY pillars/ai/src ./pillars/ai/src
COPY pillars/ai/scripts ./pillars/ai/scripts
COPY pillars/ai/openapi ./pillars/ai/openapi
COPY pillars/ai/migrations ./pillars/ai/migrations
COPY pillars/ai/tsconfig.json ./pillars/ai/tsconfig.json
COPY pillars/ai/tsconfig.build.json ./pillars/ai/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/ai^..." build
RUN pnpm --filter "@pops/ai" build

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/ai --config.inject-workspace-packages=true deploy --prod /app/deploy

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
# pillars/ai/src/api/ai-sqlite-path.ts), so compose's per-pillar AI_SQLITE_PATH
# still wins; on its own it lands on /data/sqlite/ai.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/ai/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/ai/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3008
USER node
CMD ["node", "dist/api/server.js"]
