# Moltbot secrets

Templates for the Docker secret files moltbot mounts. These are committed
under `.example` so the structure is discoverable; the live files live in the
gitignored **repo-root** `secrets/` on each deployer host — compose writes
`file: ../secrets/<name>` and resolves it from `infra/`, so `infra/secrets/`
is not where it looks (see [`infra/secrets.example/bfm/README.md`](../bfm/README.md)
for the full explanation).

## First-run

Run from the repo root:

```sh
mkdir -p secrets
chmod 700 secrets
for f in infra/secrets.example/moltbot/*.example; do
  name=$(basename "$f" .example)
  [ -f "secrets/$name" ] || cp "$f" "secrets/$name"
  chmod 600 "secrets/$name"
done
$EDITOR secrets/telegram_bot_token secrets/claude_api_key secrets/pops_api_key
```

## What goes in each file

| File                     | Source                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `telegram_bot_token`     | Output of `/newbot` from [@BotFather](https://t.me/BotFather) on Telegram. One line, no quotes, no `bot` prefix.                                                                                                               |
| `telegram_bot_token_dev` | A second `/newbot` for staging. Use a different name (`pops-staging-bot`) so you can A/B against prod.                                                                                                                         |
| `claude_api_key`         | Anthropic console → API keys.                                                                                                                                                                                                  |
| `pops_api_key`           | Mint via the registry pillar's admin REST endpoint `POST /service-accounts` (reachable externally through the shell at `/registry-api/service-accounts`). Plaintext is shown exactly once — paste it here, then close the tab. |
| `finance_api_key`        | Same value as `pops_api_key` (legacy alias still referenced by the finance skill template).                                                                                                                                    |

## Provisioning the `pops_api_key`

Service accounts are owned by the `registry` pillar; they are minted via its
admin-only REST endpoint (a human session, e.g. a Cloudflare Access login — not
a service-account scope). From a logged-in shell:

```bash
curl -sS -X POST https://pops.local/registry-api/service-accounts \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "moltbot",
    "scopes": ["cerebrum.ingest", "cerebrum.query", "cerebrum.retrieval"]
  }'
```

The `name` must be lowercase (`^[a-z][a-z0-9_-]*$`, 3–64 chars). The three
cerebrum scopes cover both skills' read/write paths (`/capture` → `ingest`,
`/ask` → `query` + `retrieval` for citations and search-mode). Add
`finance.transactions`, `finance.budgets`, etc. only if you actually run the
finance skill.

The `201` response contains `plaintextKey` (`pops_sa_<prefix>.<secret>`) — copy
that exact string into `secrets/pops_api_key`. Newlines are fine; the validator
trims them. The plaintext is shown exactly once, so save it before it scrolls
off. Revoke and reissue (`POST /service-accounts/:id/revoke`, externally
`/registry-api/service-accounts/:id/revoke`) if the key ever leaks.

See `pillars/moltbot/README.md` (step 3 of the first-run runbook) for the full
end-to-end secret-provisioning flow.
