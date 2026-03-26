# PRD-013 US-02: Build Custom Docker Images

**GH Issue:** #368
**Status:** partial

## Audit Findings

**pops-api:** `apps/pops-api/Dockerfile` exists. Referenced correctly in `infra/docker-compose.yml` as `dockerfile: apps/pops-api/Dockerfile`.

**pops-shell:** `apps/pops-shell/Dockerfile` does NOT exist. `infra/docker-compose.yml` references `dockerfile: apps/pops-shell/Dockerfile` but the file is missing.

**import-tools:** `packages/import-tools/Dockerfile` exists (for the tools service).

## Gap

`apps/pops-shell/Dockerfile` is missing — the docker-compose.yml references it but it has not been created. This will cause `docker compose build` to fail for pops-shell.
