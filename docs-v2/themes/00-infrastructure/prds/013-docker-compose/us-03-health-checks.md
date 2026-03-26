# PRD-013 US-03: Configure Health Checks

**GH Issue:** #369
**Status:** done

## Audit Findings

Health check directives are configured for both custom services in `infra/docker-compose.yml`:

**pops-api** (line 26):
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)})"]
  interval: 30s
  timeout: 5s
  retries: 3
```

**pops-shell** (line 43):
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80"]
  interval: 30s
  timeout: 5s
  retries: 3
```

Both custom services (pops-api and pops-shell) have healthcheck directives. Third-party services (metabase, paperless, etc.) use upstream images with built-in health monitoring.
