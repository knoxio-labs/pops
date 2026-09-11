# finance secrets

Template and provisioning notes for the Docker secret the finance pillar
authenticates outbound with. Committed as `.example` so the structure is
discoverable; the live file lives in the gitignored **repo-root** `secrets/`
on each deployer host — compose writes `file: ../secrets/<name>` and resolves
it from `infra/`, so `infra/secrets/` is not where it looks (see
[`infra/secrets.example/bfm/README.md`](../bfm/README.md) for the full
explanation).

## First-run

Run from the repo root:

```sh
mkdir -p secrets && chmod 700 secrets && for f in infra/secrets.example/finance/*.example; do n=$(basename "$f" .example); [ -f "secrets/$n" ] || cp "$f" "secrets/$n"; chmod 600 "secrets/$n"; done
```

Then replace the placeholder line.

## What goes in it

| File                   | Source                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pops_finance_api_key` | The `plaintextKey` from minting the `finance` service account — the runbook is bfm's [Provisioning the service account](../../../pillars/bfm/README.md#provisioning-the-service-account), with finance's name and scopes. |

It is **not the same value as `finance_api_key`** (the legacy alias moltbot's
finance skill reads) or `pops_api_key`. finance gets its own account so
revoking one consumer does not take the others down with it, so `last_used_at`
attributes traffic to a single process, and so the grant is exactly the two
domains finance reads — `contacts.entities` and `registry.users`, pinned in
[`service-account.ts`](../../../pillars/finance/src/api/pillars/service-account.ts)
— and nothing wider.

A trailing newline is fine; the value is trimmed before use.

## Which of these is live

`pops_finance_api_key` is mounted by the `finance-api` service at
`/run/secrets/pops_finance_api_key` and read through
`POPS_INTERNAL_API_KEY_FILE`.

**`finance-api` boots without it.** Its own contract surface needs no
credential, so an unset variable is a supported configuration. What the key
costs when absent is every outbound leg — the contacts entity matcher, the
usage rollup, the import commit's pre-create and the registry owner-URI cron —
each of which reports `no-credential`. A variable that is set to a file the
process cannot open is different: the pillar refuses to boot, because that is
always a misconfiguration (POPS-3315).
