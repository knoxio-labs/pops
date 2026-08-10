# POPS — Personal Operations System

Self-hosted personal operations platform. Finance, media tracking, home inventory, food, lists, memory/retrieval, and AI operations — a monorepo of independent REST **pillars**, deployed to a home server behind Cloudflare Tunnel.

Each pillar owns its own SQLite database (there is no shared store). Claude API handles categorization, entity matching, and retrieval. Pops ships one Docker image per pillar on GHCR with a public `infra/docker-compose.yml`; deployers run them however they like (the knoxio home lab uses ansible + Watchtower in [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra)).

## Architecture

POPS is a set of independent **REST pillars**. Each pillar is a standalone service that owns its own SQLite database, serves a [ts-rest](https://ts-rest.com) contract built from zod, projects an OpenAPI document, exports a `./manifest`, and self-registers with the `registry` pillar on boot. The frontend is one SPA (the `shell` pillar) that lazy-loads per-domain feature apps, each talking to its pillar over a generated REST client. Cross-pillar calls go through the REST `@pops/pillar-sdk` `pillar()` client.

```
Interfaces
  iPhone (PWA)  |  Telegram (Moltbot)  |  Metabase dashboards
       │
  Cloudflare Tunnel + Zero Trust
       │
pops-shell (UI pillar) ── React SPA, Vite + nginx reverse proxy (fronts every service)
       │
REST pillars (one SQLite DB each, ts-rest + OpenAPI, self-registering)
  registry  :3001  registry / settings / users / service-accounts / entities / features
  inventory :3002  items, locations, warranties, insurance
  media     :3003  movies & TV, watchlist, watch history, Plex/Radarr/Sonarr sync
  finance   :3004  transactions, budgets, wishlists, entities, CSV import
  food      :3005  food domain (+ ingest worker)
  lists     :3006  lists
  cerebrum  :3007  memory / retrieval / ego (+ worker)
       │
Standalone services
  orchestrator :3009  federated search + AI-tool registry (GET /ai/tools), owns no DB
  mcp                 MCP gateway
  moltbot             Telegram AI assistant
  metabase            dashboards & analytics
  paperless-ngx       document archive + OCR
       │
External APIs
  Finance: Up Bank (webhooks) | ANZ/Amex/ING (CSV import)
  Media:   Plex (local + Discover) | TMDB | TheTVDB | Radarr | Sonarr
```

### Pillars

A pillar is any service registered with the `registry` pillar that exposes `/manifest.json` (ADR-035). Three kinds:

- **Data pillars** — each owns a SQLite DB under `pillars/<id>/src/db`, streamed to backup via `infra/litestream/<id>.yml`.
- **Bridge pillars** — adapters that mirror an external system into the platform (e.g. the Home Assistant bridge).
- **UI pillars** — the `shell` pillar registers as `id: 'shell'` and hosts the SPA.

`registry` is the registry/platform pillar; every other pillar registers itself against it at startup.

### Adding a pillar

A new data pillar needs: a `pillars/<id>/` package with its own SQLite DB and zod-backed ts-rest contract, an OpenAPI snapshot under `pillars/<id>/openapi/`, a `./manifest` export that self-registers with the `registry` pillar, a unique port, a `pillars/<id>/Dockerfile`, an `infra/litestream/<id>.yml` backup config, and a compose service in `infra/docker-compose.yml` + `infra/docker-compose.dev.yml`. On the frontend, add a `pillars/<id>/app` feature app that consumes the pillar through its generated Hey API client (`openapi-ts`), and wire it into the `shell` pillar.

### Wire Format

Pillar-to-pillar and consumer-to-pillar communication uses a versioned JSON-over-HTTP wire format. See [ADR-033](docs/architecture/adr-033-cross-language-pillar-contracts.md) for how that contract holds across languages, and the `contacts` pillar for the Rust proof.

### Docker Networks

| Network          | Services                                                    | Purpose                      |
| ---------------- | ----------------------------------------------------------- | ---------------------------- |
| `pops-frontend`  | pops-shell, every pillar, orchestrator, metabase, pops-docs | Public-facing (via nginx)    |
| `pops-backend`   | every pillar, redis, workers, orchestrator, moltbot, mcp    | Internal pillar-to-pillar    |
| `pops-documents` | paperless-ngx, paperless-redis                              | Isolated document processing |

`pops-shell` (frontend network only) is the nginx reverse proxy that fronts every public service. Pillars sit on both networks: `frontend` for browser/proxy traffic, `backend` for cross-pillar REST calls and Redis.

## Domains

| Domain            | Pillar      | Frontend app            | What it does                                                                                                                      |
| ----------------- | ----------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Finance**       | `finance`   | `pillars/finance/app`   | Transactions, budgets, wishlists, entities, CSV import wizard with multi-stage entity matching + AI fallback, learned corrections |
| **Media**         | `media`     | `pillars/media/app`     | Movies & TV library, watchlist, watch history, ELO comparison arena, discovery, Plex/Radarr/Sonarr sync                           |
| **Inventory**     | `inventory` | `pillars/inventory/app` | Items, hierarchical locations, connections graph, warranties, insurance reports, Paperless-ngx document linking                   |
| **Food**          | `food`      | `pillars/food/app`      | Food domain with an ingest worker                                                                                                 |
| **Lists**         | `lists`     | `pillars/lists/app`     | Lists                                                                                                                             |
| **Cerebrum**      | `cerebrum`  | `pillars/cerebrum/app`  | Memory / retrieval / ego — engram storage, semantic retrieval, curation (+ worker)                                                |
| **AI Operations** | `ai`        | `pillars/ai/app`        | Usage tracking, model config, rules browser, prompt viewer, cache management (served by the `ai` pillar)                          |

## Tech Stack

| Layer      | Technology                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime    | Node.js 24, pnpm 10 workspaces, mise per-unit tasks, cargo (Rust `contacts` pillar)                                                                                                                                                                    |
| Database   | One SQLite DB per pillar via Drizzle ORM                                                                                                                                                                                                               |
| API        | Per-pillar REST: zod → ts-rest contracts → OpenAPI; frontend consumes generated Hey API (`@hey-api/openapi-ts`) clients; cross-pillar via the `@pops/pillar-sdk` `pillar()` client                                                                     |
| Frontend   | React, Vite, React Router, Tailwind v4, shadcn/ui                                                                                                                                                                                                      |
| State      | React Query (server), Zustand (client)                                                                                                                                                                                                                 |
| Validation | Zod                                                                                                                                                                                                                                                    |
| AI         | Claude API (Haiku for categorization, entity matching)                                                                                                                                                                                                 |
| Testing    | Vitest (unit), Playwright (E2E), Storybook                                                                                                                                                                                                             |
| Infra      | Docker Compose + Watchtower auto-rollout. Deployer-side host setup (ansible, Cloudflare Tunnel) lives in [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra) for the knoxio lab; other deployers run the same compose however they like. |
| CI         | GitHub Actions (lint, typecheck, format, test, E2E, security)                                                                                                                                                                                          |

## Roadmap

Unfinished work lives in Huly, project `POPS` at https://projects.knoxiolabs.com. Each pillar's own README describes what it does.

## Quick Start

Prerequisites: [mise](https://mise.jdx.dev). Run `mise tasks` to see the current task list — the pillar-based workflow is task-driven and the exact names evolve, so check `mise.toml` rather than memorising them.

```bash
mise setup             # Install dependencies + tools
mise tasks             # Discover the available dev/test/db tasks
```

For local development, the dev Docker Compose stack (`infra/docker-compose.dev.yml`) builds and runs every pillar plus the shell from source. Each pillar applies its own migrations on startup and owns its own SQLite file:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```

The shell fronts the stack via its nginx reverse proxy and routes browser traffic to each pillar by port: `registry :3001`, `inventory :3002`, `media :3003`, `finance :3004`, `food :3005`, `lists :3006`, `cerebrum :3007`, `ai :3008`, `contacts :3010`, with the orchestrator on `:3009`. Run a single pillar directly with `cd pillars/<id> && pnpm dev`.

## Development

See [`AGENTS.md`](AGENTS.md) for the full command reference, repo structure, data flows, and coding standards.

### Key Commands

Run `mise tasks` for the authoritative list. The common cross-repo gates:

```bash
mise typecheck         # Type check all packages
mise lint              # Lint all packages
mise test              # All tests
mise build             # Build all packages
```

### Per-pillar databases

Each pillar owns and migrates its own SQLite database under `pillars/<id>/src/db`. There is no shared database step — a pillar provisions and migrates itself on startup (and in its own tests). Database tasks are scoped per pillar; see that pillar's `package.json` scripts and `mise tasks`.

### Quality Gate (pre-push)

```bash
mise lint && mise typecheck    # Must pass before every push
```

### Format drift on `main`

`lint-staged` only formats _staged_ files, so a file written and committed in one step can land unformatted, and a change to `oxfmt`'s output rules can leave untouched files drifted. Left alone that compounds, and the whole-tree `Format` check starts failing on work that did not cause it.

The catch is [`quality.yml`](.github/workflows/quality.yml)'s `Format` job on a push to `main`: it drops the per-PR unit scoping and runs `pnpm format:check` over the whole tree, on every merge. It is the only _unscoped_ formatter run in CI, so it is what catches drift in paths no PR-scoped `oxfmt --check` maps into scope — `clients/`, which sits outside the unit-discovery model (ADR-043), among them.

### E2E Tests

Playwright with two modes: **mocked** (fast, no real DB) and **integration** (real SQLite via named env system). Named envs auto-skip external API calls — safe to run in CI without credentials.

```bash
cd pillars/shell && pnpm test:e2e
```

## Deploy

POPS ships as Docker images on GHCR. Anyone can self-host with the compose file in this repo:

```bash
git clone https://github.com/knoxio-labs/pops.git && cd pops
cp .env.example .env                  # then edit: POPS_DOMAIN, image tag, watchtower settings

# Create one file per secret. Replace each placeholder with the real value
# (or leave the file empty if the corresponding integration is unused).
mkdir -p secrets && cd secrets
for name in claude_api_key up_bank_token up_webhook_secret notion_api_token \
            telegram_bot_token finance_api_key pops_api_key pops_api_internal_token \
            instagram_cookies tmdb_api_key thetvdb_api_key \
            paperless_secret_key paperless_admin_password; do
  : > "$name"
  chmod 600 "$name"
done
# Now write each value, e.g.:
#   printf '%s' 'sk-ant-…'      > claude_api_key
#   printf '%s' 'up:yeah:xxx…'  > up_bank_token
cd ..

docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
```

### GHCR access

The pops images may be public or private depending on package settings on the repository. Check at <https://github.com/knoxio?tab=packages>. If a package shows as **private**, every host pulling it (including Watchtower) needs GHCR credentials before `docker compose pull` will succeed:

```bash
# On the host that runs pops, with a GitHub PAT that has `read:packages` scope
echo "$GHCR_PAT" | docker login ghcr.io -u <your-github-username> --password-stdin
```

This writes `~/.docker/config.json` (or `/root/.docker/config.json` for root). The compose file mounts that path read-only into Watchtower (`DOCKER_CONFIG_DIR` in `.env` controls where).

If the packages are public there is no setup needed.

### Secrets and rollout

The compose file mounts each `secrets/<name>` file into containers via Docker file-based secrets (`/run/secrets/<name>`). All thirteen secret files must exist for `docker compose up` to succeed; leave a file empty if the corresponding integration is unused.

Pushing to `main` builds and publishes one image per pillar — `ghcr.io/knoxio-labs/pops-<id>` (e.g. `pops-registry`, `pops-finance`, `pops-media`, …) plus `ghcr.io/knoxio/pops-shell` and `ghcr.io/knoxio/pops-docs`. The [`publish-images.yml`](.github/workflows/publish-images.yml) workflow discovers each pillar's `pillars/<id>/Dockerfile` and publishes it. The compose file ships a Watchtower service that polls GHCR every 60s and rolls out new digests for any container labelled `com.centurylinklabs.watchtower.enable=true`.

Override `POPS_IMAGE_TAG` in `.env` to pin a release. Track stability over freshness by pinning a semver tag (`POPS_IMAGE_TAG=v0.1.0`, `v0.1`, or `v0`) — see the [release runbook](docs/runbooks/cut-release.md) — or pin to a specific build with `POPS_IMAGE_TAG=sha-abc1234`. Use the dev compose for local builds:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```

Server provisioning (Docker, secrets, Cloudflare Tunnel, backups, github runner) lives in the private [knoxio/homelab-infra](https://github.com/knoxio/homelab-infra) repo. You don't need it to run pops — only to reproduce the full home-lab host setup.

## Repo Structure

There are exactly **three unit kinds**: `pillars/` (services), `libs/` (shared libraries) and `clients/` (distributable end-user binaries that consume the federation over HTTP and are imported by nothing here — [ADR-043](docs/architecture/adr-043-clients-as-a-unit-kind.md)). No `apps/`, no `packages/`, no turbo, no central API monolith.

```
pillars/<id>/              # One pillar per folder. Run `ls pillars/` for the current fleet.
├── src/contract/          #   PUBLIC: zod → ts-rest contract, types, manifest
├── src/api/               #   PRIVATE: server, handlers, registry wiring
├── src/db/                #   PRIVATE: drizzle schema + services (a pillar owns its own SQLite DB)
├── app/                   #   its frontend feature module, mounted by the shell
├── openapi/<id>.openapi.json
└── Dockerfile, mise.toml

libs/<name>/               # Shared libraries — no service, no DB, and never imports a pillar.
                           #   Each carries a README saying what it is and who depends on it.

clients/<name>/            # Distributable end-user binaries — outside the pnpm and cargo
                           #   workspaces, so nothing here builds, imports or deploys one.
                           #   Distributed through a store, not rolled forward by an operator.

infra/
├── docker-compose.yml     # Production (ghcr.io/knoxio-labs/pops-<id> images + Watchtower)
├── docker-compose.dev.yml # Local development with build: contexts
└── litestream/            # One <id>.yml backup-stream config per pillar SQLite DB

docs/architecture/         # ADRs. Everything else lives beside the code it describes.
```

Not every pillar fits that shape, and the exceptions matter: `contacts` is Rust (axum, `src/entities/`, `Cargo.toml`); `orchestrator`, `mcp` and `documents` own no database; `shell` and `docs` serve no contract of their own; `moltbot` ships no Dockerfile and runs an upstream image.
