# MCP tool adapters

A tool reads the raw MCP argument bag, calls the owning pillar through
`getPillar<TRouter>(id).<domain>.<op>(...)`, and returns the normalised result.
Nothing here owns data or business logic — that stays in the pillar, and the
gateway never touches a database.

`index.ts` concatenates the per-family arrays into one flat `allTools`. Most
names are `<pillar>.<domain>.<op>`; `finance.search`, `cerebrum.search` and
`purchases.search` are `<pillar>.<op>`. The server lists them verbatim and routes a call by exact name
lookup, so a name is the whole routing table.

## Invariants every handler upholds

These hold across all 82 tools; a new adapter that breaks one is a bug even
though nothing enforces it mechanically.

- **Required args are checked before the pillar is called.** `reqStr` (or an
  inline equivalent) returns `null` on a missing or empty value and the handler
  returns `toolError` itself, so a malformed call never becomes a network
  round-trip.
- **Pillar responses go through `mapCallResult`.** Every SDK failure kind
  becomes `isError: true` with a reason the model can read and act on.
- **A non-applied inventory mutation is an error.** Every inventory tool that
  sends a sync mutation returns its outcome through `itemMutationResult`:
  `applied` is a normal result, while `rejected`, `conflict` and `deferred` set
  `isError: true` and include the whole outcome in the text.
- **Constrained args coerce, they do not reject.** An unrecognised `type`,
  `mode`, `period`, `active`, or `matchType` falls back to the documented
  default (or is dropped) rather than forwarding an unknown value downstream.
  `purchases.*` deviates on `statuses` and says so in the code: dropping an
  unknown status would silently widen a filtered query to every order, so the
  value is forwarded and the pillar's contract answers `400`. Coercion is safe
  where the fallback is the documented default and wrong where it is "no
  filter".
- **Patch tools forward only keys present in the args.** `0` is a value, not an
  absence. The comment above the `copyNull*` / `copyOpt*` helpers in `utils.ts`
  says which one matches a column's nullability.
- **A scoped tool declares it in `ToolDef.scope`.** `ListTools` appends it to
  the listed description (`describeTool` in `../index.ts`), and a call
  `mapCallResult`/`mapDraftCallResult` maps to `unauthorized` gets the scope
  named in the refusal — MCP does not itself hold the caller's grant to
  pre-empt the call (see `ToolDef.scope`'s docstring), so the actionable step
  is always "grant this scope", never a retry.

- **The BFM pairing tool is metadata-only.** `bfm.devicePairing.issueCode`
  returns the one-time code, pairing URL, and expiry from BFM. It never calls
  device listing or revocation routes and never receives device credentials.

## Routing that does not follow the name

- `finance.entities.list` dispatches to the **`contacts`** pillar, which owns
  the entity table. Finance only owns the transaction usage rollup.
- `tags.things.list` calls the orchestrator's `tagged.query` route. Inspect its
  response's `pillars` status list before treating the returned sections as
  complete; unavailable or unauthorized carrier statuses can mean partial results.
- `finance.accounts.checkpoints` calls the finance pillar's `checkpoints.list`
  operation (`GET /accounts/:id/checkpoints`), not `accounts.*` — checkpoints
  and accounts are separate contract sub-routers even though the tool name
  groups them under `accounts` for discoverability.
- The `finance.*` family is read-only on purpose: no create/update/delete tool
  is wired, and `finance.test.ts` asserts no mutation-shaped name ever appears.
  The separate `tags.assignments.attach` and `.detach` tools change only shared
  tag assignments on Finance transactions, under the `finance.tagged` scope.
- `finance.summary.get` is the tool to reach for on any "where did the money
  go" question. It is one call to an aggregation the finance pillar already
  did, and the alternative — paging `finance.transactions.list` and adding it
  up in context — costs a page per 50 rows and produces an answer nobody can
  check afterwards. Its `costOfCredit` block keeps transaction fees separate
  from spend and net, with totals and account, month and `fee:*` tag breakdowns.
  It is deliberately one tool rather than a family: the
  endpoint returns every breakdown for a window in one response, so splitting
  it per axis would be several calls for data already fetched, and would make
  the mcp package mirror the response shape it currently never has to know.
- The `purchases.*` family is read-only for a sharper reason, asserted the same
  way in `purchases.test.ts`. Its ordinary purchase writes are ingestion
  (which needs a checksum only an adapter can compute) or classification
  decisions —
  and `PATCH /purchases/:id/items/:itemId` is the single place a machine
  proposal becomes a human assertion. A tool that could call it would erase the
  distinction `kindConfirmedAt` exists to hold.
- `purchases.inventoryProposals.accept` is the exception. It records that an
  inventory item which already exists is the asset an order line's unit
  became: a link the user asked for, not a judgement. It takes any line of
  the order, not only one `inventoryProposals.list` offers: that projection
  covers lines classified `durable`, and nothing classifies a line at ingest
  (POPS-3974), while the accept route itself never looks at the kind. It
  checks the item
  exists in inventory first, because purchases stores the URI unchecked and a
  decision cannot be retracted. Declining an offer and creating the asset
  through purchases are not exposed. The link lives in purchases, so
  `inventory.items.get` does not show an item's order (POPS-5755).
- `purchases.*` needs a grant. That pillar admits an uncredentialled caller but
  holds a caller presenting an `X-API-Key` to that key's scopes, and MCP always
  presents one. Without `purchases.purchase`, `purchases.analytics` and
  `purchases.search` on the MCP service account, every tool in the family
  returns `403`.
- `tags.tags.*` manages the shared tag vocabulary under the
  `tags.tags` service-account scope. These tools do not attach or detach
  tags on Finance or Purchases records.
- `tags.assignments.attach` and `.detach` attach or detach one shared tag on a
  Finance transaction or Purchases line item. The selected `pillar` determines
  the required `<pillar>.tagged` scope; these tools do not change the tag
  vocabulary or any other carrier fields.
- `inventory.catalogue.*` completes the persisted type-catalogue authoring
  workflow without database access. The MCP service account needs
  `inventory.types.read` for catalogue and audit reads, and
  `inventory.types.manage` for draft recovery, creation, non-mutating preview,
  editing, publication and abandonment. Preview returns the same revision-bound
  compatibility, issue and affected-item diagnostics as the REST API without
  changing the persisted draft. `put_field`'s `expression` input schema is the
  full v1 computed-field grammar (literal, same-item or bounded reference
  `read`, unary/binary ops, `if`) mirrored from
  `pillars/inventory/src/catalogue/expression-types.ts`, checked for drift by
  `inventory-contract-fidelity.test.ts` — not an unconstrained blob. Write tools
  return revision metadata and changed definition IDs by default; pass
  `include: "catalogue"` to receive the full response. A subtype's items take
  its ancestors' fields and capabilities. Create the parent, read its id from
  `changed`, then create the child in a second patch: ids are server-minted.
  Changing the parent of a published type is refused.
- `inventory.items.*` uses the protocol-2 generic item contract. Reads expose
  stable `typeId`, `catalogueRevision` and field IDs. Create, edit and type
  changes require the caller's observed catalogue revision; edit, type change
  and delete also require the observed item revision. A caller may retain and
  resend `mutationId` after an uncertain response, so retries converge on the
  producer's idempotency boundary instead of creating a second command.
  `provenance` on create and update is the shape `items.get` returns, written
  through the producer's legacy purchase columns (`inventory-item-provenance.ts`).
  `transactionUri` accepts only `pops://finance/transaction/<id>`, the one URI
  inventory can store. An item's purchases order is linked from the purchases
  side, through `purchases.inventoryProposals.accept`.
- `inventory.items.validate` calls the producer's authoritative value validator
  without writing item values, audit rows or sync changes. Read the catalogue
  definition first, send its exact revision and source-tagged values, and use
  the returned field-specific issues to repair enum, reference, cardinality and
  primitive failures before a mutation. It needs `inventory.types.read` — the
  same non-mutating scope as `inventory.catalogue.get`/`getType`/`audit`, not
  `inventory.types.manage` — since it validates against a published revision
  without touching the draft.

## Not here

No tools exist for `ai`, `food`, `lists`, `registry`, or `documents` — those
pillars are unreachable through MCP until an adapter is added. The one
cross-pillar query, `tags.things.list`, makes a single call to the orchestrator,
which fans out to registered tag carriers and reports each carrier's status.
