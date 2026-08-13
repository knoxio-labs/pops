# DO NOT EDIT blindly — hand-written for the Backend-for-Mobile pillar
# (@pops/bfm, ADR-035 data kind). Mirrors the collapsed-pillar build shape
# (pillars/documents/Dockerfile): scope the install + build to the @pops/bfm
# subgraph so unrelated pillars never enter this image's context.
#
# The subgraph is whatever
# `pnpm m ls --filter "@pops/bfm..." --json --depth -1` reports — today
# @pops/pillar-sdk and @pops/types. Adding a workspace dependency to
# pillars/bfm/package.json without adding it to Phase 1 and Phase 2 below
# breaks this image and nothing else: no local check catches it, only the
# Docker Build CI job.

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

# Phase 1: package.json of @pops/bfm + its transitive @pops/* deps.
# `pnpm install --filter "@pops/bfm..."` scopes lockfile resolution to that
# subgraph; unrelated pillars never need to exist in this image's build
# context.
COPY pillars/bfm/package.json ./pillars/bfm/
COPY libs/contract-openapi/package.json ./libs/contract-openapi/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/bfm..."

# Phase 2: source for the transitive @pops/* deps + the pillar itself.
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
# @pops/bfm (the pillar itself). `migrations/` is not optional: openBfmDb
# resolves the journal relative to its own module, so a missing folder is a
# boot crash rather than a pillar that starts un-migrated.
COPY pillars/bfm/src ./pillars/bfm/src
COPY pillars/bfm/scripts ./pillars/bfm/scripts
COPY pillars/bfm/openapi ./pillars/bfm/openapi
COPY pillars/bfm/migrations ./pillars/bfm/migrations
COPY pillars/bfm/tsconfig.json ./pillars/bfm/tsconfig.json
COPY pillars/bfm/tsconfig.build.json ./pillars/bfm/tsconfig.build.json

# Phase 3: build shared deps in pnpm topology order, then the pillar.
RUN pnpm --filter "@pops/bfm^..." build
RUN pnpm --filter "@pops/bfm" build

# Standalone deployment — production deps only, with the workspace @pops/*
# packages INJECTED (copied into the deploy's own store) rather than linked
# back at the workspace.
#
# `--legacy`, which every other pillar image still uses, produces
# `node_modules/@pops/pillar-sdk -> ../../../libs/sdk`: a relative link three
# levels up, out of `/app/deploy` and therefore out of the runtime stage
# entirely. Nothing fails at build time — the link is created, the COPY
# succeeds, the image is exported — and `node dist/api/server.js` then dies on
# ERR_MODULE_NOT_FOUND at the first import. `--config.inject-workspace-packages`
# is the flag pnpm's own error text names as the non-legacy path, and it is
# what makes the "standalone" in standalone deployment true.
RUN pnpm --filter @pops/bfm --config.inject-workspace-packages=true deploy --prod /app/deploy

FROM node:24-slim
WORKDIR /app

# The mount point for the pillar's own volume, created here and owned by the
# runtime user. Docker seeds an EMPTY named volume from the image's contents at
# that path, ownership included — so this line is what makes `pops-bfm-data`
# writable on its first ever mount. Without it the volume arrives root-owned,
# `mkdirSync` no-ops on the existing directory, and the pillar dies on
# SQLITE_CANTOPEN. Same reasoning as pillars/contacts/Dockerfile.
RUN mkdir -p /data/sqlite && chown -R node:node /data

# The image's own database default, so it boots with no environment at all.
# `SQLITE_PATH` is the lowest-precedence path resolveSqlitePath reads (see
# pillars/bfm/src/api/boot-env.ts), so compose's BFM_SQLITE_PATH still wins; on
# its own it lands on /data/sqlite/bfm.db.
ENV SQLITE_PATH=/data/sqlite/pops.db

COPY --from=builder --chown=node:node /app/deploy ./
# `dist/` in full: package.json's `files` list narrows the deploy to
# `dist/contract/**`, which is the published contract surface and not the
# server this image runs.
COPY --from=builder --chown=node:node /app/pillars/bfm/dist ./dist
# `openapi/` is NOT copied here: `files` already includes
# `openapi/bfm.openapi.json`, so `pnpm deploy` places it at /app/openapi/ —
# which is where app.ts resolves it from relative to dist/api/. A second COPY
# would shadow it with the same bytes.
COPY --from=builder --chown=node:node /app/pillars/bfm/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3014
USER node
CMD ["node", "dist/api/server.js"]
