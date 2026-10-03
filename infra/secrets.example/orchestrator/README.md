# orchestrator secret

`pops-orchestrator` uses its own registry service-account key for federated
search. On a production host, save the plaintext key for the `orchestrator`
account in the gitignored repo-root file
`secrets/pops_orchestrator_api_key` and restrict it to the owner (`chmod 600`).
Production Compose mounts it at `/run/secrets/pops_orchestrator_api_key` and
sets `POPS_INTERNAL_API_KEY_FILE` to that path.

Grant only the operations declared in
[`pillars/orchestrator/src/service-account.ts`](../../../pillars/orchestrator/src/service-account.ts):
`contacts.search.search`, `purchases.search.search`, `tags.tags`,
`finance.tagged`, and `purchases.tagged`. Add a matching scope when a new
federated search or tag-facet operation is introduced.

Development Compose maps the optional host variable
`POPS_ORCHESTRATOR_API_KEY` to the process's `POPS_INTERNAL_API_KEY`.
