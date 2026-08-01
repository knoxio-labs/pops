# @pops/mcp

MCP (Model Context Protocol) HTTP gateway for POPS. Exposes inventory, finance, media, and Cerebrum data as tools that AI agents (Claude Desktop, Claude Code, any MCP client) call over the local network. Writes exist only for `inventory`; the finance, media, and cerebrum surfaces are read-only. Each tool dispatches to the owning pillar over REST through `@pops/pillar-sdk`; the gateway owns no database and no business logic.

- **Transport:** Streamable HTTP (`POST /mcp`), stateless — a fresh server + transport per request
- **Port:** 3011 (configurable via `MCP_PORT`), listens on `0.0.0.0` inside the container; both compose files publish it on the host as `${MCP_BIND_ADDR:-0.0.0.0}:3011:3011`
- **Inbound auth:** `POST /mcp` requires `Authorization: Bearer <MCP_INBOUND_TOKEN>` when `MCP_INBOUND_TOKEN` is set; `/health` and `/ready` stay open. See `src/auth.ts` for the unset-token behaviour.
- **Outbound auth:** Authenticates to pillars with a service-account key (`POPS_INTERNAL_API_KEY`, legacy `POPS_API_KEY`, or the `POPS_API_KEY_FILE` Docker-secret pattern).

The tool surface — 38 tools over the `inventory`, `finance`, `contacts`, `media`, and `cerebrum` pillars — lives in [`src/tools/`](src/tools/README.md).

## Prerequisites

1. **Target pillars reachable** — the gateway is a REST client, not a standalone data source. Inventory, finance, contacts, media, cerebrum, and the registry must be running.
2. **A service-account key** — supplied via `POPS_INTERNAL_API_KEY` / `POPS_API_KEY` / `POPS_API_KEY_FILE` (the compose secret `pops_api_key`).

## Running locally (dev)

```bash
mise dev
```

Set the service-account key in `pillars/mcp/.env` (the process loads only the `.env` in its own working directory):

```env
POPS_INTERNAL_API_KEY=sa_your_service_account_key_here
MCP_PORT=3011
# Optional inbound bearer secret for POST /mcp (see src/auth.ts).
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
        "http://pops-host.example:3011/mcp",
        "--header",
        "Authorization: Bearer ${MCP_INBOUND_TOKEN}"
      ],
      "env": { "MCP_INBOUND_TOKEN": "sa_your_inbound_token_here" }
    }
  }
}
```

Point the URL at the gateway's published `host:3011`. Drop the `Authorization` header only when the server runs without `MCP_INBOUND_TOKEN`.

## Health & readiness

```bash
curl http://localhost:3011/health
# {"status":"ok","tools":38}

curl http://localhost:3011/ready
# {"status":"ready","apiKeyConfigured":true,"tools":38}
```

`/ready` checks `POPS_API_KEY` only. With just `POPS_INTERNAL_API_KEY` set it reports `503` / `degraded` while tool calls still work, since `resolveApiKey()` in `src/pillar-client.ts` accepts either variable.
