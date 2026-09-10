# The food UI bundle, served as a static ES module.
#
# `pillars/food/app` is mounted by the shell's runtime loader rather than
# imported into its build (POPS-3217), so the bundle needs a URL. This image
# gives it one. It is deliberately NOT part of `pillars/food/Dockerfile`:
# that image is a narrow API container with a hand-curated dependency closure,
# and pulling the frontend toolchain into it would make every pillar API image
# carry a bundler. Same shape as `pillars/design/Dockerfile`, which serves the
# playground the same way.

FROM node:24-alpine AS builder
WORKDIR /app

# The app's workspace closure reaches @pops/ui and the compiled libs beneath
# it, so `libs/` must be in the context as well as `pillars/`. Copying both
# whole and letting the filter scope the install is the trade the shell's and
# the playground's Dockerfiles already make: no hand-listed COPY blocks to
# drift, and the builder stage is discarded anyway.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./
COPY libs/ ./libs/
COPY pillars/ ./pillars/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && pnpm install --frozen-lockfile --filter "@pops/app-food..."

# Compiled libs first (pnpm no-ops the source-only ones), then the bundle.
# `pnpm build` here runs `scripts/build-remote.ts`, which fails the build if
# any shared-runtime package ended up inside the bundle — so an image that
# would have shipped a second React never gets built.
RUN pnpm --filter "@pops/app-food^..." build
RUN pnpm --filter "@pops/app-food" build

# ── Production image ──────────────────────────────────────────────
FROM nginx:1.31.3-alpine
COPY --from=builder /app/pillars/food/app/dist/remote /usr/share/nginx/html
COPY pillars/food/app/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

# This image serves an ES module and its chunks, not a page: `/` is a 404 by
# design, so the smoke harness is told where liveness and freshness actually
# live. `food.js` is the entry whose name is stable across deploys — the
# one a browser must revalidate — and the chunks beside it are hashed and
# immutable. See `resolveHealthPath` / `freshnessProbePaths` in
# scripts/ci/smoke-image.mjs.
LABEL pops.smoke.health="/healthz"
LABEL pops.smoke.freshness="/food.js"
