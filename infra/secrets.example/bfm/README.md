# bfm secrets

Templates for the Docker secret files the bfm pillar uses. Committed as
`.example` so the structure is discoverable; the live files live in the
gitignored **repo-root** `secrets/` on each deployer host — compose writes
`file: ../secrets/<name>` and resolves it from `infra/`, so `infra/secrets/` is
not where it looks.

## First-run

Run from the repo root:

```sh
mkdir -p secrets && for f in infra/secrets.example/bfm/*.example; do n=$(basename "$f" .example); [ -f "secrets/$n" ] || { cp "$f" "secrets/$n"; chmod 600 "secrets/$n"; }; done
```

Then replace the placeholder line in each.

## What goes in each file

| File                  | Source                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pops_bfm_api_key`    | The `plaintextKey` from minting the `bfm` service account — runbook in [`pillars/bfm/README.md`](../../../pillars/bfm/README.md). |
| `bfm_jwt_signing_key` | 32 bytes of CSPRNG output, base64: `openssl rand -base64 32`. Not a passphrase, not reused from anything else.                    |

`pops_bfm_api_key` is **not the same value as `pops_api_key`**. That one belongs
to moltbot and the MCP gateway. bfm gets its own account so revoking one
consumer does not take the others down with it, and so `last_used_at` attributes
traffic to a single process. Its plaintext is shown exactly once at creation —
save it before it scrolls off.

Newlines are fine in either file — both are trimmed before use.

## Which of these is live

Only `pops_bfm_api_key` is mounted today, by the `bfm-api` service at
`/run/secrets/pops_bfm_api_key`.

`bfm_jwt_signing_key` is declared in `infra/docker-compose.yml` but mounted
nowhere: the access-token minting path and the `requireDevice` guard that
verifies against it are POPS-1370, and no process reads the file until then.
Compose materialises a secret only for services that reference it, so the
declaration is inert — which is the point. It lets the value be provisioned on
the host ahead of the release that starts needing it, rather than during it.

Rotating `bfm_jwt_signing_key` invalidates every access token signed with the
old one. Those are minutes-lived by design, so the blast radius is one refresh
round-trip per handset rather than a re-pair — unlike losing `bfm.db`, which
revokes every device at once and cannot be undone from the phones.
