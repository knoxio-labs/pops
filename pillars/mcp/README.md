# @pops/mcp

MCP (Model Context Protocol) HTTP gateway for POPS. Exposes inventory, finance, contacts, shared-tag vocabulary, cross-pillar shared-tag lookup, purchases, media, Cerebrum, and the BFM device-pairing issuer as tools that AI agents (Claude Desktop, Claude Code, any MCP client) call over the local network. Inventory and shared-tag vocabulary tools can write; `tags.things.list` reads across tag carriers through the orchestrator and reports each carrier's status so partial results are visible. `tags.assignments.attach` and `.detach` are the only tools that change shared-tag assignments on Finance or Purchases records; those pillar families are read-only otherwise. The contacts, media, and cerebrum surfaces are read-only from the gateway's perspective. Each tool dispatches to the owning pillar over REST through `@pops/pillar-sdk`; the gateway owns no database and no business logic.

- **Transport:** Streamable HTTP (`POST /mcp`), stateless — a fresh server + transport per request
- **Port:** 3011 (configurable via `MCP_PORT`), listens on `0.0.0.0` inside the container; both compose files publish it on the host as `${MCP_BIND_ADDR:-0.0.0.0}:3011:3011`
- **Inbound auth:** `POST /mcp` always requires `Authorization: Bearer <token>`. Configure `MCP_INBOUND_TOKEN_FILE` or `MCP_INBOUND_TOKEN`; the mounted file takes precedence and must be readable and contain one bearer token. Startup fails when the setting is missing, blank, or malformed. `/health` and `/ready` stay open; `/ready` reports degraded until both inbound auth and the outbound service-account key are configured.
- **Outbound auth:** Authenticates to pillars with a service-account key (`POPS_INTERNAL_API_KEY`, legacy `POPS_API_KEY`, or the `POPS_API_KEY_FILE` Docker-secret pattern).

The tool surface — 80 tools over the `inventory`, `finance`, `contacts`, `tags`, `orchestrator`, `media`, `cerebrum`, `purchases`, and `bfm` pillars — lives in [`src/tools/`](src/tools/README.md). `bfm.devicePairing.issueCode` returns only a short-lived code, pairing URL, and expiry; it never returns device credentials or exposes device listing/revocation.

## Prerequisites

1. **Target pillars reachable** — the gateway is a REST client, not a standalone data source. Inventory, finance, contacts, tags, orchestrator, media, cerebrum, purchases, and the registry must be running. The orchestrator reports carrier availability in the `pillars` status list returned by `tags.things.list`.
2. **A service-account key** — supplied via `POPS_API_KEY_FILE` (the compose secret `pops_mcp_api_key`), `POPS_INTERNAL_API_KEY`, or the legacy `POPS_API_KEY`. Boot fails when none of them yields a key: every tool proxies a pillar, so a keyless server can answer nothing. The production MCP key is separate from moltbot's `pops_api_key` and must include `bfm.operator.issuePairingCode` for the pairing tool, `tags.tags` for shared-tag vocabulary management, and `finance.tagged` and/or `purchases.tagged` for the corresponding assignment tools.
3. **An inbound bearer token** — supplied through `MCP_INBOUND_TOKEN_FILE` (preferred for mounted secrets) or `MCP_INBOUND_TOKEN`. A configured file takes precedence and never falls through to the environment value when unreadable or malformed. This credential authenticates MCP callers and is separate from the outbound service-account key.

## Running locally (dev)

```bash
mise dev
```

Set the service-account key in `pillars/mcp/.env` (the process loads only the `.env` in its own working directory):

```env
POPS_INTERNAL_API_KEY=sa_your_service_account_key_here
MCP_PORT=3011
# Required inbound bearer secret for POST /mcp. A mounted secret file takes precedence.
MCP_INBOUND_TOKEN_FILE=
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

The `secrets/pops_mcp_api_key` file must exist on the host. See
[`infra/secrets.example/mcp/README.md`](../../infra/secrets.example/mcp/README.md).

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

Point the URL at the gateway's published `host:3011`. The server always requires the `Authorization` header; configure the same inbound token in the MCP client and gateway.

HTTP authentication failures use the ADR-054 envelope
`{ code, message, requestId, retryable, details? }`. The registered code is
`mcp.auth.unauthorized`; the response never distinguishes a missing token from
an invalid one. All HTTP responses echo or mint `X-Request-Id`.

## Acceptance suite

`src/acceptance/` is the inventory-types acceptance suite (POPS-4354):
one `*.acceptance.test.ts` per scenario, each booting its own real registry +
inventory (and a paired bfm where the scenario reaches the phone) and driving
the inventory MCP tools against them. The default and live-seam configs
exclude it; `pnpm test:acceptance` runs it, and `mise run
inventory:acceptance` at the repo root runs it with evidence records.

## Health & readiness

```bash
curl http://localhost:3011/health
# {"status":"ok","tools":80}

curl http://localhost:3011/ready
# {"status":"ready","apiKeyConfigured":true,"inboundAuthConfigured":true,"tools":80}
```

`/health` is liveness and makes no upstream calls, so it answers `ok` even with no
service-account key. `/ready` is credential-aware: it calls
`resolveServiceAccountKey()` (`src/service-account-key.ts`), which reads
`POPS_API_KEY_FILE`, then `POPS_INTERNAL_API_KEY`, then `POPS_API_KEY` — so any of
the three counts as configured. It also checks that inbound authentication
resolves a usable token. Missing or malformed configuration reports `503` /
`degraded`; readiness never returns either credential.

The Docker healthcheck probes `/ready`. It used to probe `/health`, which meant a
container that could not read its mounted secret stayed green while every tool call
failed (POPS-2760). A process with missing credentials no longer reaches that
state anyway: `requireServiceAccountKey()` and `requireInboundToken()` run before
`app.listen` and exit the process when either credential is unavailable.
