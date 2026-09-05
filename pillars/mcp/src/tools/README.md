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

These hold across all 45 tools; a new adapter that breaks one is a bug even
though nothing enforces it mechanically.

- **Required args are checked before the pillar is called.** `reqStr` (or an
  inline equivalent) returns `null` on a missing or empty value and the handler
  returns `toolError` itself, so a malformed call never becomes a network
  round-trip.
- **Pillar responses go through `mapCallResult`.** Every SDK failure kind
  becomes `isError: true` with a reason the model can read and act on.
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

## Routing that does not follow the name

- `finance.entities.list` dispatches to the **`contacts`** pillar, which owns
  the entity table. Finance only owns the transaction usage rollup.
- `finance.accounts.checkpoints` calls the finance pillar's `checkpoints.list`
  operation (`GET /accounts/:id/checkpoints`), not `accounts.*` — checkpoints
  and accounts are separate contract sub-routers even though the tool name
  groups them under `accounts` for discoverability.
- The `finance.*` family is read-only on purpose: no create/update/delete tool
  is wired, and `finance.test.ts` asserts no mutation-shaped name ever appears.
- The `purchases.*` family is read-only for a sharper reason, asserted the same
  way in `purchases.test.ts`. Every write on that pillar is an ingest (which
  needs a checksum only an adapter can compute) or a classification decision —
  and `PATCH /purchases/:id/items/:itemId` is the single place a machine
  proposal becomes a human assertion. A tool that could call it would erase the
  distinction `kindConfirmedAt` exists to hold.
- `purchases.*` needs a grant. That pillar admits an uncredentialled caller but
  holds a caller presenting an `X-API-Key` to that key's scopes, and MCP always
  presents one. Without `purchases.purchase`, `purchases.analytics` and
  `purchases.search` on the MCP service account, all five tools return `403`.

## Not here

No tools exist for `ai`, `food`, `lists`, `registry`, `orchestrator`, or
`documents` — those pillars are unreachable through MCP until an adapter is
added. There is also no cross-pillar orchestration: one tool call is one
pillar call, and nothing is retained between calls.
