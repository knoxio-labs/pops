# bfm secrets

Template for the Docker secret file the bfm pillar mounts. Committed as
`.example` so the structure is discoverable; the live file lives in the
gitignored **repo-root** `secrets/` on each deployer host — compose writes
`file: ../secrets/<name>` and resolves it from `infra/`, so `infra/secrets/`
is not where it looks.

The compose service that mounts it lands with POPS-1385; the top-level
`pops_bfm_api_key` secret is already declared in `infra/docker-compose.yml` so
the value can be provisioned on the host first.

## First-run

Run from the repo root:

```sh
mkdir -p secrets && cp -n infra/secrets.example/bfm/pops_bfm_api_key.example secrets/pops_bfm_api_key && chmod 600 secrets/pops_bfm_api_key
```

Then paste the minted key in, replacing the placeholder line.

## What goes in the file

| File               | Source                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pops_bfm_api_key` | The `plaintextKey` from minting the `bfm` service account — see the runbook in [`pillars/bfm/README.md`](../../../pillars/bfm/README.md). |

**Not the same value as `pops_api_key`.** That one belongs to moltbot and the
MCP gateway. bfm gets its own account so revoking one consumer does not take
the others down with it, and so `last_used_at` attributes traffic to a single
process.

The plaintext is shown exactly once at creation. Newlines are fine — bfm trims
the file contents before use.
