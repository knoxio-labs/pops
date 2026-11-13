FROM node:24-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./
COPY patches/ ./patches/
COPY libs/ ./libs/
COPY pillars/ ./pillars/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/app-trips..."

COPY scripts/codegen/ ./scripts/codegen/
RUN node scripts/codegen/generate.mjs --pkg @pops/app-trips --pkg @pops/trips-workspace

RUN pnpm --filter "@pops/app-trips^..." build
RUN pnpm --filter "@pops/app-trips" build

FROM nginx:1.31.3-alpine
COPY --from=builder /app/pillars/trips/app/dist/remote /usr/share/nginx/html
COPY pillars/trips/app/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

LABEL pops.smoke.health="/healthz"
LABEL pops.smoke.freshness="/trips.js"
