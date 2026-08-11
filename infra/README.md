# infra

Two Docker Compose files, the Litestream reference configs, an rclone+age backup
reference config, and committed templates for the moltbot and bfm secret files.

## `docker-compose.yml` is a public API

Deployers consume this file directly. Service names, network names, volume names,
secret file names and env var names are load-bearing — renaming any one is a
breaking change for every downstream deployer.

**Networks** — three, all `driver: bridge`:

| Key         | Docker name      | On it                                                                                                                |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `frontend`  | `pops-frontend`  | Every pillar API except `documents-api`, plus `pops-orchestrator`, `pops-shell`, `pops-docs`, `metabase`             |
| `backend`   | `pops-backend`   | Every pillar API, both workers, `pops-orchestrator`, `pops-redis`, `pops-mcp`, `moltbot`, the 11 Litestream sidecars |
| `documents` | `pops-documents` | `documents-api`, `paperless-ngx`, `paperless-redis` — paperless is on this network only                              |

`registry-api` carries the extra alias `core-api` on both `frontend` and
`backend`.

**Volumes** — 21, each explicitly `name:`d: `pops-sqlite-data`,
`pops-redis-data`, `pops-metabase-data`, `pops-paperless-{data,media,consume}`,
`pops-paperless-redis`, `pops-food-ingest-data`, `pops-cerebrum-engrams-data`,
`pops-media-images-data`, plus 11 per-pillar `pops-<id>-data`. Of those 11 only
`pops-bfm-data` is mounted by an API container; the other 10 exist for the
Litestream sidecars and the pillars they belong to still write to the shared
`pops-sqlite-data`.

**Secrets** — 15, each `file: ../secrets/<name>`, resolved from `infra/` (so the
gitignored repo-root `secrets/`): `bfm_jwt_signing_key`, `claude_api_key`,
`finance_api_key`, `instagram_cookies`, `notion_api_token`,
`paperless_admin_password`, `paperless_secret_key`, `pops_api_internal_token`,
`pops_api_key`, `pops_bfm_api_key`, `telegram_bot_token`, `thetvdb_api_key`,
`tmdb_api_key`, `up_bank_token`, `up_webhook_secret`. Only 9 are mounted into a
service (`pops-worker-food`, `paperless-ngx`, `pops-mcp`, `moltbot`,
`moltbot-validator`, `bfm-api`); the other 6 are declared and mounted nowhere.
A declared secret is inert — compose materialises one only for services that
reference it — which is what lets a value be provisioned on the host before the
release that starts reading it.

**Host env vars** — `POPS_IMAGE_TAG`, `POPS_DOMAIN`, `POPS_REGISTRY_URL`,
`BUILD_VERSION`, `MCP_BIND_ADDR`, `MCP_INBOUND_TOKEN`, `PAPERLESS_BASE_URL`,
`PAPERLESS_API_TOKEN`, `ANTHROPIC_API_KEY`, the `EMBEDDING_*` / `FOOD_*` /
`*_LITESTREAM_REPLICA_URL` sets, `DOCKER_CONFIG_DIR`, `DOCKER_API_VERSION`, `TZ`.
Each pillar's `*_SQLITE_PATH` and `*_SELF_BASE_URL` are inline, not host env.

## prod vs dev

Dev builds the same services from `pillars/<id>/Dockerfile` and pins no GHCR
image except on `media-api`. Prod defines 36 services, dev 21. Profiles keep
`litestream` / `moltbot` / `mcp` out of a plain `up` in prod, `moltbot` / `mcp`
in dev. 15 services carry
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

Eleven configs — `ai`, `bfm`, `cerebrum`, `contacts`, `finance`, `food`,
`inventory`, `lists`, `media`, `purchases`, `registry` — each mounted
read-only at `/etc/litestream.yml` into the matching `<id>-litestream`
sidecar. `check-litestream-sidecar-parity.mjs` (wired into `Infra Lint`)
fails the build if a config ever loses its sidecar or a sidecar its config; it
matches ids only, and does not check which file a sidecar mounts. Every config
replicates `/data/sqlite/<id>.db` with `sync-interval: 1s`, `retention: 24h`,
`snapshot-interval: 1h`, `validation-interval: 12h`, and interpolates one
`<ID>_LITESTREAM_REPLICA_URL` — except that `registry-litestream` passes
`CORE_LITESTREAM_REPLICA_URL` while `registry.yml` reads
`REGISTRY_LITESTREAM_REPLICA_URL`, so the reference wiring for `registry` does
not work as written until one side is renamed to match the other (POPS-1778).

Each sidecar mounts `pops-<id>-data:/data/sqlite:ro`. Only `bfm` has an API
container writing to that volume; the other ten pillars still write to
`pops-sqlite-data`, so their sidecars would replicate an empty volume and the
configs are reference-only until the per-pillar split lands.

`backup/cerebrum-engrams.yml` is the rclone+age counterpart for the cerebrum
engram Markdown tree, which is files rather than SQLite.
