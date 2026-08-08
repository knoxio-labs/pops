# DO NOT EDIT blindly — hand-written for the documents bridge pillar
# (@pops/documents, ADR-035 bridge kind, ADR-039 workstream 13). Mirrors the
# collapsed-pillar build shape (pillars/orchestrator/Dockerfile): scope the
# install + build to the @pops/documents subgraph so unrelated pillars never
# enter this image's context.
#
# This is a source-only scaffold build — it does not wire paperless-ngx /
# paperless-redis containers, networks, volumes, or secrets. That is a
# separate, later, prod-gated step (ADR-039 workstream 22).

FROM node:24-slim AS builder
WORKDIR /app

# Workspace root manifests — needed for pnpm install to resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

# Phase 1: package.json of @pops/documents + its transitive @pops/* deps.
# `pnpm install --filter "@pops/documents..."` scopes lockfile resolution to
# that subgraph; unrelated pillars never need to exist in this image's build
# context.
COPY pillars/documents/package.json ./pillars/documents/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/documents..."

# Phase 2: source for the transitive @pops/* deps + the app itself.
# @pops/pillar-sdk
COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json
# @pops/types
COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json
# @pops/documents (the pillar itself)
COPY pillars/documents/src ./pillars/documents/src
COPY pillars/documents/scripts ./pillars/documents/scripts
COPY pillars/documents/openapi ./pillars/documents/openapi
COPY pillars/documents/tsconfig.json ./pillars/documents/tsconfig.json

# Phase 3: build shared deps in pnpm topology order, then the app.
RUN pnpm --filter "@pops/documents^..." build
RUN pnpm --filter "@pops/documents" build

# Standalone deployment (production deps only, no symlinks).
RUN pnpm --filter @pops/documents deploy --prod --legacy /app/deploy

FROM node:24-slim
WORKDIR /app

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/documents/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/documents/openapi ./openapi

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

EXPOSE 3012
USER node
CMD ["node", "dist/api/server.js"]
