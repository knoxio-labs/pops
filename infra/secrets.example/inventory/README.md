# inventory secret

`inventory-api` uses its own service-account key for outbound pillar calls.
On a production host, save the plaintext key from the registry account for
`inventory` in the gitignored repo-root file `secrets/pops_inventory_api_key`
and restrict it to the owner (`chmod 600`). Production Compose mounts that
file as `/run/secrets/pops_inventory_api_key` and sets
`POPS_INTERNAL_API_KEY_FILE` to the mount path.

Grant the operations declared in
[`pillars/inventory/src/api/pillars/service-account.ts`](../../../pillars/inventory/src/api/pillars/service-account.ts):
`finance.transactions.get` for purchase-transaction URI reconciliation and
`ai.codes.rank` for code suggestions. Do not add the registry `users.get`
scope while inventory's owner-URI leg is dormant; it has no writer or outbound
call today.

Development Compose passes through the optional `POPS_INTERNAL_API_KEY`
environment value instead. Missing credentials do not prevent inventory from
starting, but a populated transaction URI cannot be reconciled until the key
has the finance read grant.
