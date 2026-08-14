# purchases secrets

Template for the Docker secret file the purchases pillar uses. Committed as
`.example` so the structure is discoverable; the live file lives in the
gitignored **repo-root** `secrets/` on each deployer host — compose writes
`file: ../secrets/<name>` and resolves it from `infra/`, so `infra/secrets/` is
not where it looks (see [`infra/secrets.example/bfm/README.md`](../bfm/README.md)
for the full explanation).

## First-run

Run from the repo root:

```sh
mkdir -p secrets && chmod 700 secrets && for f in infra/secrets.example/purchases/*.example; do n=$(basename "$f" .example); [ -f "secrets/$n" ] || cp "$f" "secrets/$n"; chmod 600 "secrets/$n"; done
```

Then replace the placeholder line.

## What goes in it

| File                     | Source                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pops_purchases_api_key` | The `plaintextKey` from minting the `purchases` service account — runbook in [`pillars/purchases/README.md`](../../../pillars/purchases/README.md). |

It is **not the same value as `pops_api_key`** (moltbot and the MCP gateway)
or `pops_bfm_api_key`. purchases gets its own account so revoking one consumer
does not take the others down with it, so `last_used_at` attributes traffic to
a single process, and so the grant can be exactly the four domains purchases
reads — `contacts.entities`, `documents.paperless`, `finance.transactions`,
`inventory.items` — and nothing wider. Its plaintext is shown exactly once at
creation.

A trailing newline is fine; the value is trimmed before use.

## Which of these is live

The one, mounted by the `purchases-api` service at
`/run/secrets/pops_purchases_api_key` and read through
`POPS_INTERNAL_API_KEY_FILE`.

**`purchases-api` boots without it**, unlike `bfm-api`. Its own contract
surface is entirely local — reading orders, lines and charges, and ingesting
receipts and exports — so refusing to start would trade a degraded
reconciliation for a dead pillar and an unserved SPA. What the key costs when
absent is every outbound leg: the reconciliation sweep's finance candidate
fetch, the nightly soft-URI checks against `inventory` and `documents`, and
receipt ingest's merchant resolution against `contacts`. Each reports
`no-credential` rather than an outage, and the process says so once at boot,
so a deployment missing the key is visible in the logs rather than in data
that quietly stops updating.
