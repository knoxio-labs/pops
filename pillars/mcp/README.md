# @pops/mcp

MCP (Model Context Protocol) HTTP gateway for POPS. Exposes inventory, finance, media, and Cerebrum data — read and write — as tools that AI agents (Claude Desktop, Claude Code, any MCP client) call over the local network. Each tool dispatches to the owning pillar over REST through `@pops/pillar-sdk`; the gateway owns no database and no business logic.

- **Transport:** Streamable HTTP (`POST /mcp`), stateless — a fresh server + transport per request
- **Port:** 3011 (configurable via `MCP_PORT`), listens on `0.0.0.0` inside the container; internal-only (`expose:`), reached through the shell proxy / Cloudflare Access rather than a host port
- **Inbound auth:** `POST /mcp` requires `Authorization: Bearer <MCP_INBOUND_TOKEN>` when `MCP_INBOUND_TOKEN` is set. If it is unset the route stays open and logs a loud warning (fail-open rollout so live access is never locked out before clients are updated). `/health` and `/ready` stay open.
- **Outbound auth:** Authenticates to pillars with a service-account key (`POPS_INTERNAL_API_KEY`, legacy `POPS_API_KEY`, or the `POPS_API_KEY_FILE` Docker-secret pattern).

See the [MCP Server PRD](../../docs/themes/platform/prds/mcp-server.md) for the gateway spec and the [Tool Inventory](docs/prds/tool-inventory.md) for the per-tool surface.

## Prerequisites

1. **Target pillars reachable** — the gateway is a REST client, not a standalone data source. Inventory, finance, contacts, media, cerebrum, and the registry must be running.
2. **A service-account key** — supplied via `POPS_INTERNAL_API_KEY` / `POPS_API_KEY` / `POPS_API_KEY_FILE` (the compose secret `pops_api_key`).

## Running locally (dev)

```bash
mise dev
```

Per-pillar base URLs default to the Docker-network hostnames; override any with its `POPS_<PILLAR>_API_URL` env var. Set the service-account key in `pillars/mcp/.env` (or the root `.env`):

```env
POPS_INTERNAL_API_KEY=sa_your_service_account_key_here
MCP_PORT=3011
# Optional inbound bearer secret. Set it to require `Authorization: Bearer <token>`
# on POST /mcp; leave unset for an open (loudly-warned) local route.
MCP_INBOUND_TOKEN=
```

## Running via Docker Compose

`pops-mcp` is opt-in via the `mcp` compose profile:

```bash
# Dev compose (builds from source)
docker compose -f infra/docker-compose.dev.yml --profile mcp up -d pops-mcp

# Production compose (pulls from GHCR)
docker compose -f infra/docker-compose.yml --profile mcp up -d pops-mcp
```

The `secrets/pops_api_key` file must exist on the host.

## Connecting Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pops": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://pops.example.com/mcp",
        "--header",
        "Authorization: Bearer ${MCP_INBOUND_TOKEN}"
      ],
      "env": { "MCP_INBOUND_TOKEN": "sa_your_inbound_token_here" }
    }
  }
}
```

Point the URL at the proxied gateway host (the container is not host-published). Drop the `Authorization` header only when the server runs without `MCP_INBOUND_TOKEN`.

## Health & readiness

```bash
curl http://localhost:3011/health
# {"status":"ok","tools":30}

curl http://localhost:3011/ready
# {"status":"ready","apiKeyConfigured":true,"tools":30}  (503/degraded if no key)
```
