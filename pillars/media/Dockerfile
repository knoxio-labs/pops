# DO NOT EDIT — hand-written for the collapsed media pillar. Every pillar
# Dockerfile is hand-maintained; nothing regenerates them. Keep it narrow:
# only @pops/media and its transitive @pops/* deps (queried via
# `pnpm m ls --filter "@pops/media..." --json --depth -1`).

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

# Phase 1: package.json of @pops/media + its transitive @pops/* deps.
# `pnpm install --filter "@pops/media..."` (below) scopes lockfile
# resolution to that subgraph; unrelated pillars never need to exist in
# this image's build context.
COPY pillars/media/package.json ./pillars/media/
COPY libs/contract-openapi/package.json ./libs/contract-openapi/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/settings/package.json ./libs/settings/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/media..."

# Phase 2: source for the transitive @pops/* deps, then the pillar itself.


COPY libs/contract-openapi/src ./libs/contract-openapi/src
COPY libs/contract-openapi/tsconfig.json ./libs/contract-openapi/tsconfig.json
COPY libs/contract-openapi/tsconfig.build.json ./libs/contract-openapi/tsconfig.build.json

COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json

COPY libs/settings/src ./libs/settings/src
COPY libs/settings/tsconfig.json ./libs/settings/tsconfig.json
COPY libs/settings/tsconfig.build.json ./libs/settings/tsconfig.build.json

COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json

COPY pillars/media/src ./pillars/media/src
COPY pillars/media/scripts ./pillars/media/scripts
COPY pillars/media/openapi ./pillars/media/openapi
COPY pillars/media/migrations ./pillars/media/migrations
COPY pillars/media/tsconfig.json ./pillars/media/tsconfig.json
COPY pillars/media/tsconfig.build.json ./pillars/media/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/media^..." build
RUN pnpm --filter "@pops/media" build

# Standalone deployment: --config.inject-workspace-packages=true inlines the
# @pops/* workspace deps into /app/deploy. The --legacy path instead writes
# relative symlinks that escape the deploy dir and 404 in the runtime stage.
RUN pnpm --filter @pops/media --config.inject-workspace-packages=true deploy --prod /app/deploy

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Both data volume mount points this pillar declares in compose, created here
# and owned by the runtime user. Docker seeds an empty named volume from the
# image's contents at the mount point, ownership included — so a directory
# missing here arrives root-owned on the volume's FIRST EVER mount and the
# pillar cannot write there. `media-images-data` fails the same way as the
# database volume, just later: at the first poster write rather than at boot.
RUN mkdir -p /data/sqlite /data/media/images && chown -R node:node /data

# The image's own database default, so it boots with no environment at all.
# `SQLITE_PATH` is the lowest-precedence path the resolver reads (see
# pillars/media/src/api/media-sqlite-path.ts), so compose's per-pillar
# MEDIA_SQLITE_PATH still wins; on its own it lands on /data/sqlite/media.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

# The image-cache root, for the same reason: the code default
# (`./data/media/images`, see pillars/media/src/api/clients/env.ts) is relative
# to the working directory, and /app is root-owned, so an unset
# MEDIA_IMAGES_DIR makes every cache write EACCES on `mkdir 'data'` — poster
# requests 404 and adding a movie 500s. Compose may still override it.
ENV MEDIA_IMAGES_DIR=/data/media/images

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/media/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/media/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3003
USER node
CMD ["node", "dist/api/server.js"]
