# infra

Two Docker Compose files, the Litestream reference configs, an rclone+age backup
reference config, and committed templates for the moltbot secret files.

## `docker-compose.yml` is a public API

Deployers consume this file directly. Service names, network names, volume names,
secret file names and env var names are load-bearing — renaming any one is a
breaking change for every downstream deployer.

**Networks** — three, all `driver: bridge`:

| Key         | Docker name      | On it                                                                                                               |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `frontend`  | `pops-frontend`  | Every pillar API except `documents-api`, plus `pops-orchestrator`, `pops-shell`, `pops-docs`, `metabase`            |
| `backend`   | `pops-backend`   | Every pillar API, both workers, `pops-orchestrator`, `pops-redis`, `pops-mcp`, `moltbot`, the 9 Litestream sidecars |
| `documents` | `pops-documents` | `documents-api`, `paperless-ngx`, `paperless-redis` — paperless is on this network only                             |

`registry-api` carries the extra alias `core-api` on both `frontend` and
`backend`.

**Volumes** — 19, each explicitly `name:`d: `pops-sqlite-data`,
`pops-redis-data`, `pops-metabase-data`, `pops-paperless-{data,media,consume}`,
`pops-paperless-redis`, `pops-food-ingest-data`, `pops-cerebrum-engrams-data`,
`pops-media-images-data`, plus 9 per-pillar `pops-<id>-data`.

**Secrets** — 13, each `file: ../secrets/<name>`, resolved from `infra/` (so the
gitignored repo-root `secrets/`): `claude_api_key`, `finance_api_key`,
`instagram_cookies`, `notion_api_token`, `paperless_admin_password`,
`paperless_secret_key`, `pops_api_internal_token`, `pops_api_key`,
`telegram_bot_token`, `thetvdb_api_key`, `tmdb_api_key`, `up_bank_token`,
`up_webhook_secret`. Only 7 are mounted into a service (`pops-worker-food`,
`paperless-ngx`, `pops-mcp`, `moltbot`, `moltbot-validator`); the other 6 are
declared and mounted nowhere.

**Host env vars** — `POPS_IMAGE_TAG`, `POPS_DOMAIN`, `POPS_REGISTRY_URL`,
`BUILD_VERSION`, `MCP_BIND_ADDR`, `MCP_INBOUND_TOKEN`, `PAPERLESS_BASE_URL`,
`PAPERLESS_API_TOKEN`, `ANTHROPIC_API_KEY`, the `EMBEDDING_*` / `FOOD_*` /
`*_LITESTREAM_REPLICA_URL` sets, `DOCKER_CONFIG_DIR`, `DOCKER_API_VERSION`, `TZ`.
Each pillar's `*_SQLITE_PATH` and `*_SELF_BASE_URL` are inline, not host env.

## prod vs dev

Dev builds the same services from `pillars/<id>/Dockerfile` and pins no GHCR
image except on `media-api`. Prod defines 32 services, dev 20. Profiles keep
`litestream` / `moltbot` / `mcp` out of a plain `up` in prod, `moltbot` / `mcp`
in dev. 13 services carry
`com.centurylinklabs.watchtower.enable: 'true'`; `cerebrum-api`,
`cerebrum-worker` and `pops-orchestrator` do not, despite their GHCR pins.

## `pops-redis`

Byte-identical block in both files: `redis:7-alpine` on `backend` only, no host
port, `pops-redis-data:/data`, command `redis-server --save "" --appendonly no
--maxmemory 256mb --maxmemory-policy allkeys-lru`, healthcheck `redis-cli ping`
at 10s / 5s / 3 retries. Prod consumers: `pops-worker-food`
(`REDIS_URL: redis://pops-redis:6379`), `cerebrum-api` and `cerebrum-worker`
(`REDIS_HOST` + `REDIS_PORT`) — also the only three declaring
`depends_on: pops-redis: service_healthy`. `food-api` sets no Redis env and has
no such dependency; dev has no food worker at all.

## `litestream/`

Nine configs — `ai`, `cerebrum`, `contacts`, `finance`, `food`, `inventory`,
`lists`, `media`, `registry` — each mounted read-only at `/etc/litestream.yml`
into the matching `<id>-litestream` sidecar. Every one replicates
`/data/sqlite/<id>.db` with `sync-interval: 1s`, `retention: 24h`,
`snapshot-interval: 1h`, `validation-interval: 12h`, and interpolates one
`<ID>_LITESTREAM_REPLICA_URL` — except that `registry-litestream` passes
`CORE_LITESTREAM_REPLICA_URL` while `registry.yml` reads
`REGISTRY_LITESTREAM_REPLICA_URL`. Each sidecar mounts
`pops-<id>-data:/data/sqlite:ro`, and no API container mounts those volumes —
the pillars all write to `pops-sqlite-data`.

`backup/cerebrum-engrams.yml` is the rclone+age counterpart for the cerebrum
engram Markdown tree, which is files rather than SQLite.
