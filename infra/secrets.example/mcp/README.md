# MCP secrets

The MCP gateway uses its own registry service-account key. The live file is
the gitignored repo-root `secrets/pops_mcp_api_key`; this directory only keeps
the setup discoverable.

## First-run

```sh
mkdir -p secrets && chmod 700 secrets
[ -f secrets/pops_mcp_api_key ] || cp infra/secrets.example/mcp/pops_mcp_api_key.example secrets/pops_mcp_api_key
chmod 600 secrets/pops_mcp_api_key
```

Mint the account through the registry's operator endpoint and replace the
placeholder with the one-time `plaintextKey`. Give it the scopes required by
the MCP tools in the deployment, including `bfm.operator.issuePairingCode`.
Do not reuse `pops_api_key`: that credential belongs to moltbot, while this
one is the MCP gateway's complete outbound authority and can be revoked
independently.

The production and dev compose files mount this file at
`/run/secrets/pops_mcp_api_key` and point `POPS_API_KEY_FILE` at it.
