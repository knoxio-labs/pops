# PRD-015 US-03: Local Dev Environment Secrets

**GH Issue:** #375
**Status:** done

## Audit Findings

`.env.example` exists at repo root with all required keys documented:

```
UP_BANK_TOKEN, UP_WEBHOOK_SECRET
CLAUDE_API_KEY
TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID
FINANCE_API_KEY
CLOUDFLARE_TUNNEL_TOKEN
TMDB_API_KEY, THETVDB_API_KEY
PLEX_URL, PLEX_TOKEN
```

Header comment: "Copy to .env and fill in values. NEVER commit .env. In production, secrets are managed via Ansible Vault -> Docker secrets."

`.env` is in `.gitignore`. Local dev reads from `.env` via `process.env` (with getEnv() fallback to Docker secret files in production).
