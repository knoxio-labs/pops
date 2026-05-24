# US-06: Docker image and compose entry

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Package pops-mcp as a Docker image and wire it into both compose files as an opt-in service via the `mcp` profile.

## Acceptance Criteria

- [x] Multi-stage build: builder stage resolves types from shared packages; runtime image contains only compiled output and production dependencies
- [x] Dev compose: `pops-mcp` service under `profiles: [mcp]`; builds from local source; accepts API key via Docker secret; depends on pops-api healthy
- [x] Production compose: `pops-mcp` service under `profiles: [mcp]`; pulls from the GHCR registry; Watchtower auto-rollout enabled
- [x] Port 3002 is bound to `${MCP_BIND_ADDR:-0.0.0.0}:3002` so local network clients can connect
- [x] `GET /health` endpoint passes the Docker healthcheck
- [x] `mise dev:mcp` task starts pops-mcp in dev mode (requires pops-api running separately)
- [x] Runtime container runs as non-root user
