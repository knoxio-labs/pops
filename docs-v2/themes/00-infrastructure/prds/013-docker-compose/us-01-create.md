# PRD-013 US-01: Create Docker Compose File

**GH Issue:** #367
**Status:** done

## Audit Findings

`infra/docker-compose.yml` exists and is fully implemented.

**Services defined:**
- `pops-api` — custom build, backend + frontend networks, sqlite volume (read-only), Docker secrets, healthcheck
- `pops-shell` — custom build, frontend network, healthcheck
- `metabase` — upstream image, sqlite volume (read-only)
- `moltbot` — upstream image, Docker secrets
- `cloudflared` — upstream image, Cloudflare tunnel token
- `paperless-ngx` + `paperless-redis` — upstream images, isolated documents network

**Networks:** `frontend`, `backend`, `documents` (isolated)
**Volumes:** `sqlite-data`, `metabase-data`, `paperless-data`
**Secrets:** file-based secrets pattern using `/run/secrets/` in containers

All services correctly segregated by network. pops-api bridges frontend ↔ backend.
