# @pops/mcp

MCP (Model Context Protocol) HTTP gateway for POPS. Exposes inventory, Documents/Paperless originals and item associations, finance, contacts, shared-tag vocabulary, cross-pillar shared-tag lookup, purchases, media, Cerebrum, the BFM device-pairing issuer, and canonical Trips operations as tools that AI agents (Claude Desktop, Claude Code, any MCP client) call over the local network. Inventory, canonical Contacts creation, Trips, document ingestion and shared-tag vocabulary tools can write; `tags.things.list` reads across tag carriers through the orchestrator and reports each carrier's status so partial results are visible. `tags.assignments.attach` and `.detach` are the only tools that change shared-tag assignments on Finance or Purchases records; those pillar families are read-only otherwise. The media and cerebrum surfaces remain read-only from the gateway's perspective. Each tool dispatches to the owning pillar over REST through `@pops/pillar-sdk`; the gateway owns no database and no business logic.

- **Transport:** Streamable HTTP (`POST /mcp`), stateless — a fresh server + transport per request
- **Port:** 3011 (configurable via `MCP_PORT`), listens on `0.0.0.0` inside the container; both compose files publish it on the host as `${MCP_BIND_ADDR:-0.0.0.0}:3011:3011`
- **Inbound auth:** `POST /mcp` always requires `Authorization: Bearer <token>`. Configure `MCP_INBOUND_TOKEN_FILE` or `MCP_INBOUND_TOKEN`; the mounted file takes precedence and must be readable and contain one bearer token. Startup fails when the setting is missing, blank, or malformed. `/health` and `/ready` stay open; `/ready` reports degraded until both inbound auth and the outbound service-account key are configured.
- **Uploads:** `PUT /uploads/:token` takes one file for a URL minted by a `createUpload` tool; the token records whether it is for a photo or a document. A photo URL (`inventory.photos.createUpload`) accepts one JPEG or HEIC up to 8 MB and stores it in inventory's media store. A document URL (`inventory.documents.createUpload`) streams the body, with its `Content-Type`, to inventory's item document upload and on to Paperless, under the size cap and MIME allow-list documents states at mint time. A file of the wrong kind for its URL gets a `415` naming the other tool. The single-use token is the credential, so the route takes no bearer token. URLs are built from `MCP_PUBLIC_URL`, else from the `/mcp` request's `Host`; set it when a proxy changes the address clients dial. The service account needs `inventory.media.upload` for photos, and `inventory.documents.upload` plus `inventory.paperless.status` (documents' limits, relayed by inventory) for documents.
- **Direct Documents ingestion:** `documents.createUpload` reads limits directly from Documents, then issues a single-use streamed URL without an Inventory target or association. It requires `documents.paperless.status` and `documents.write.upload`. Keep the returned `uploadId`; `documents.uploadStatus` recovers the accepted task even when the uploader loses its HTTP reply. Poll that task with `documents.task`, then use the actual done/duplicate `documentId` with the owning association command. A pending task is not a document. Unknown outcomes must not be uploaded again automatically. URL and settled receipt retention is ten minutes; active streams retain their slot until settlement. Receipts are bounded process-local memory, not restart-durable. After expiry or restart, unavailable does not prove nonacceptance. File content travels only through the URL, never MCP arguments or a gateway-local file path. Raw document POSTs never follow redirects, even within the same origin; a 3xx response is an unknown sent upload, not a receipt or a safe-to-retry refusal. This redirect boundary also applies to the legacy Inventory document stream.
- **Outbound auth:** Authenticates to pillars with a service-account key (`POPS_INTERNAL_API_KEY`, legacy `POPS_API_KEY`, or the `POPS_API_KEY_FILE` Docker-secret pattern).

The tool surface — 203 tools over the `inventory`, `documents`, `finance`, `contacts`, `tags`, `orchestrator`, `media`, `cerebrum`, `purchases`, `bfm`, and `trips` pillars — lives in [`src/tools/`](src/tools/README.md). `bfm.devicePairing.issueCode` returns only a short-lived code, pairing URL, and expiry; it never returns device credentials or exposes device listing/revocation.

The 89 `trips.*` tools read and edit the same canonical trips, ideas, captures,
visits, route, bookings, alternatives and coordination references used by web
and mobile. Each advertises its exact `trips.<operationId>` service-account
scope. The gateway does not grant credentials or invent itinerary records;
Contacts identities are created only through the canonical Contacts owner tool;
Documents uploads remain operations of their own owner. Receipt-backed commands retain caller-supplied operation UUIDs,
revision guards and full producer outcomes. `trips.trips.createOperation` uses the published durable creation route and retains its original acknowledgement beside the current Trip; an unavailable capability never falls back to the legacy non-idempotent create. Unknown non-receipted writes
must be reconciled before a new command, never automatically retried.

The five `contacts.entities.*` tools expose the owner's catalogue, list, get,
create and reference operations. Read the actual catalogue for allowed entity
types and its default before creating. A canonical reference comes only from
Contacts, including historical-ID resolution; the gateway creates no local
person or guessed URI. The exact scopes are `contacts.entities.catalogue`,
`contacts.entities.list`, `contacts.entities.get`, `contacts.entities.create`
and `contacts.entities.reference`. Tool publication does not itself grant these
scopes or establish deployment availability.

## Prerequisites

1. **Target pillars reachable** — the gateway is a REST client, not a standalone data source. Inventory, finance, contacts, tags, orchestrator, media, cerebrum, purchases, and the registry must be running. The orchestrator reports carrier availability in the `pillars` status list returned by `tags.things.list`.
2. **A service-account key** — supplied via `POPS_API_KEY_FILE` (the compose secret `pops_mcp_api_key`), `POPS_INTERNAL_API_KEY`, or the legacy `POPS_API_KEY`. Boot fails when none of them yields a key: every tool proxies a pillar, so a keyless server can answer nothing. The production MCP key is separate from moltbot's `pops_api_key` and must include `bfm.operator.issuePairingCode` for the pairing tool, `tags.tags` for shared-tag vocabulary management, `finance.tagged` and/or `purchases.tagged` for the corresponding assignment tools, and `documents.write.delete` for the document deletion tool. Direct Documents reads use `documents.paperless.status`, `.search`, `.get` and `.task`; direct file ingestion also requires `documents.write.upload`. These declarations do not grant scopes.
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
# {"status":"ok","tools":203}

curl http://localhost:3011/ready
# {"status":"ready","apiKeyConfigured":true,"inboundAuthConfigured":true,"tools":203}
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
