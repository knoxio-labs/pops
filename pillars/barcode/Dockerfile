FROM node:24-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./

COPY pillars/barcode/package.json ./pillars/barcode/
COPY libs/contract-openapi/package.json ./libs/contract-openapi/
COPY libs/pillar-express/package.json ./libs/pillar-express/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/types/package.json ./libs/types/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/barcode..."

COPY libs/contract-openapi/src ./libs/contract-openapi/src
COPY libs/contract-openapi/tsconfig.json ./libs/contract-openapi/tsconfig.json
COPY libs/contract-openapi/tsconfig.build.json ./libs/contract-openapi/tsconfig.build.json
COPY libs/pillar-express/src ./libs/pillar-express/src
COPY libs/pillar-express/tsconfig.json ./libs/pillar-express/tsconfig.json
COPY libs/pillar-express/tsconfig.build.json ./libs/pillar-express/tsconfig.build.json
COPY libs/sdk/src ./libs/sdk/src
COPY libs/sdk/tsconfig.json ./libs/sdk/tsconfig.json
COPY libs/sdk/tsconfig.build.json ./libs/sdk/tsconfig.build.json
COPY libs/types/src ./libs/types/src
COPY libs/types/tsconfig.json ./libs/types/tsconfig.json
COPY libs/types/tsconfig.build.json ./libs/types/tsconfig.build.json
COPY pillars/barcode/src ./pillars/barcode/src
COPY pillars/barcode/scripts ./pillars/barcode/scripts
COPY pillars/barcode/openapi ./pillars/barcode/openapi
COPY pillars/barcode/migrations ./pillars/barcode/migrations
COPY pillars/barcode/tsconfig.json ./pillars/barcode/tsconfig.json
COPY pillars/barcode/tsconfig.build.json ./pillars/barcode/tsconfig.build.json

RUN pnpm --filter "@pops/barcode^..." build
RUN pnpm --filter "@pops/barcode" build
RUN pnpm --filter @pops/barcode --config.inject-workspace-packages=true deploy --prod /app/deploy

FROM node:24-slim
WORKDIR /app

RUN mkdir -p /data/sqlite && chown -R node:node /data

COPY --from=builder --chown=node:node /app/deploy ./
COPY --from=builder --chown=node:node /app/pillars/barcode/dist ./dist
COPY --from=builder --chown=node:node /app/pillars/barcode/openapi ./openapi
COPY --from=builder --chown=node:node /app/pillars/barcode/migrations ./migrations

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION
ENV BARCODE_SQLITE_PATH=/data/sqlite/barcode.db

EXPOSE 3016
USER node
CMD ["node", "dist/api/server.js"]
