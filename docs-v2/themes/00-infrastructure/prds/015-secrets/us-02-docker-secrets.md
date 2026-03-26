# PRD-015 US-02: Configure Docker Secrets

**GH Issue:** #374
**Status:** done

## Audit Findings

`infra/docker-compose.yml` uses file-based Docker secrets throughout — no API tokens in environment variables.

**Secrets defined** (lines 173+):
- `notion_api_token`, `up_bank_token`, `up_webhook_secret`, `claude_api_key`
- `telegram_bot_token`, `finance_api_key`
- `paperless_secret_key`, `paperless_admin_password`

All secrets use `file: ../secrets/<name>` pattern (read from `/opt/pops/secrets/` in production via Ansible).

**Services using secrets:**
- `pops-api`: up_webhook_secret, finance_api_key, claude_api_key, notion_api_token, up_bank_token
- `moltbot`: telegram_bot_token, finance_api_key
- `paperless-ngx`: paperless_secret_key (via `PAPERLESS_SECRET_KEY_FILE: /run/secrets/paperless_secret_key`)

Secrets are mounted at `/run/secrets/<name>` in containers. Implementation follows Docker secrets best practices.
