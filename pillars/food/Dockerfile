# DO NOT EDIT — hand-written for the collapsed food pillar.
# Same shape as pillars/lists/Dockerfile but compiles to two CMDs:
# `node dist/api/server.js` (HTTP server) and `node dist/worker/worker.js`
# (BullMQ daemon). docker-compose selects the role per container; the
# IMAGE is shared.
#
# Phase 1 is narrow: only @pops/food and its transitive @pops/* deps
# (queried via `pnpm m ls --filter "@pops/food..." --json --depth -1`).
# `pnpm install --filter "@pops/food..."` scopes the lockfile resolution
# so unrelated pillars never need to be present.
#
# `@pops/types` requires tsconfig.build.json (lessons-learned from the
# lists Dockerfile).

FROM node:24-slim AS builder
WORKDIR /app

# Workspace root manifests.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/food + its transitive @pops/* deps.
COPY pillars/food/package.json ./pillars/food/
COPY libs/ai-telemetry/package.json ./libs/ai-telemetry/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/types/package.json ./libs/types/

# Install pnpm + only the deps of the @pops/food subgraph.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/food..."

# Phase 2: source for the transitive @pops/* deps of @pops/food.
# @pops/ai-telemetry
COPY libs/ai-telemetry/src ./libs/ai-telemetry/src
COPY libs/ai-telemetry/tsconfig.json ./libs/ai-telemetry/tsconfig.json
COPY libs/ai-telemetry/tsconfig.build.json ./libs/ai-telemetry/tsconfig.build.json
# @pops/pillar-sdk
COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json
# @pops/types
COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json
# @pops/food (the pillar itself)
COPY pillars/food/src ./pillars/food/src
COPY pillars/food/scripts ./pillars/food/scripts
COPY pillars/food/openapi ./pillars/food/openapi
COPY pillars/food/migrations ./pillars/food/migrations
COPY pillars/food/tsconfig.json ./pillars/food/tsconfig.json
COPY pillars/food/tsconfig.build.json ./pillars/food/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/food^..." build
RUN pnpm --filter "@pops/food" build

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/food --config.inject-workspace-packages=true deploy --prod /app/deploy

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Both data volume mount points this pillar declares in compose, created here
# and owned by the runtime user. Docker seeds an empty named volume from the
# image's contents at the mount point, ownership included — so a directory
# missing here arrives root-owned on the volume's FIRST EVER mount and the
# pillar cannot write there. `food-ingest-data` fails the same way as the
# database volume, just later: at the first ingest rather than at boot.
RUN mkdir -p /data/sqlite /data/food/ingest && chown -R node:node /data

# The image's own database default, so it boots with no environment at all.
# `SQLITE_PATH` is the lowest-precedence path the resolver reads (see
# pillars/food/src/api/food-sqlite-path.ts), so compose's per-pillar
# FOOD_SQLITE_PATH still wins; on its own it lands on /data/sqlite/food.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/food/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/food/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3005
USER node

# Default CMD runs the API server. docker-compose overrides this to
# `["node", "dist/worker/worker.js"]` for the worker container.
CMD ["node", "dist/api/server.js"]
