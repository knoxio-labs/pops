# @pops/app-purchases

The frontend module for the purchases pillar. It registers `/purchases` with
`pillars/shell` and puts the pillar on the app rail.

Frontend-only: this package owns no database. Everything goes over the
purchases pillar's REST contract through the generated
`@hey-api/client-fetch` client in `src/purchases-api/`, served at the shell's
`/purchases-api` proxy path (see `src/purchases-api-runtime-config.ts`).

## The reconcile queue

`/purchases` is the reconciliation inbox: one row per purchase charge awaiting
a decision, with the charge on the left, what the engine proposes on the right,
and `Σ proposed − charge` between them.

**The axes are the shipped endpoint's, not the ticket's.** `GET /reconcile/queue`
returns one entry per charge carrying 0..n proposed transactions, so the charge
is the stable side and the transactions are the plural one. Laying it out the
other way would make every row a different height for no gain.

**It is keyboard-driven, and that is the feature.** The queue arrives focused,
so `j`/`k` move the cursor, `enter` accepts and `x` rejects without a click
first. Arrow keys do what `j`/`k` do, because the queue is one `role="listbox"`
and a listbox is expected to answer them. Nothing inside a row is focusable:
interactive children inside a `role="option"` would take focus off the list and
break the bindings after the first click, so the accept/reject buttons live in
a bar above the list and act on the row under the cursor.

**A decision covers every proposal on the charge.** The solver emits several
links for one charge when the charge was settled by a split across
transactions, so those links are one answer rather than competing ones.
Confirming one and leaving the rest would pin half a partition.

### What accepting and rejecting actually persist

This is narrower than POPS-241 describes, and the page says so in its own copy
rather than implying otherwise.

| the view calls it | it calls                  | which does                                                 |
| ----------------- | ------------------------- | ---------------------------------------------------------- |
| Accept            | `POST /reconcile/confirm` | sets `confirmedAt`, pinning the link against re-derivation |
| Reject            | `POST /reconcile/unlink`  | deletes the link, and remembers nothing                    |

**No `purchase_match_rule` is written.** Nothing in the pillar writes that
table — the ticket's "accepting writes a rule, rejecting feeds it negatively"
is unbuilt on the server, not skipped here, and inventing a client-side stand-in
would put a second rule model in front of the one POPS-1309 has to read. That
half is POPS-1898, which blocks POPS-1309.

**There is no reject endpoint**, by an explicit decision in
`src/contract/rest-reconcile.ts`: a reject the next sweep silently re-derives is
worse than no reject. `unlink` is honest about being temporary, so a rejected
charge comes back as unexplained rather than leaving the queue — which is why
the cursor is keyed by charge id and parks on the successor before the refetch
lands, instead of counting indexes.

An unexplained charge (no proposals) has nothing to confirm or delete, so both
keys refuse rather than firing a request that would 404. Nothing can link it by
hand yet either — POPS-1900.

### Paging

Reads take the server's 50-row default and the view says when the page came
back full. No offset cursor: confirming drains the queue from underneath the
cursor, so an offset over a shrinking list is the wrong shape.

## Layout

```
src/
  index.ts                         entrypoint — re-exports manifest, navConfig, routes
  manifest.ts                      ModuleManifest (id='purchases')
  routes.tsx                       route table + navConfig
  purchases-api/                   generated Hey API client (do not hand-edit)
  purchases-api-runtime-config.ts  client baseUrl ('/purchases-api')
  purchases-api-helpers.ts         unwrap() for the generated {data,error} results
  pages/
    ReconcileQueuePage.tsx         /purchases — the reconciliation queue
    reconcile/
      types.ts                     view types aliased off the generated client
      money.ts                     cents formatting + the delta's three states
      useReconcileQueue.ts         GET /reconcile/queue
      useReconcileDecisions.ts     confirm/unlink, and what they persist
      useQueueCursor.ts            where the keyboard points
      QueueList.tsx                the listbox and its key bindings
      QueueEntryRow.tsx            one row: charge · delta · proposals
      QueueFilters.tsx             kind + includeAuto
      DecisionBar.tsx              accept/reject, the shortcut hint, the caveat
```

The generated client under `src/purchases-api/` is produced from
`pillars/purchases/openapi/purchases.openapi.json` and must not be edited by
hand. Regenerate it with `generate:purchases-client` after the contract
changes; CI diffs the committed output against a fresh run.

## Run

```sh
pnpm --filter @pops/app-purchases typecheck                 # tsc --noEmit
pnpm --filter @pops/app-purchases test                      # vitest run
pnpm --filter @pops/app-purchases test:watch                # vitest (watch)
pnpm --filter @pops/app-purchases test:coverage             # vitest run --coverage
pnpm --filter @pops/app-purchases generate:purchases-client # regen src/purchases-api
```

## Install gate

`@pops/app-purchases` exposes a single `.` export — `manifest`, `navConfig`,
and `routes`, all browser-safe. `pillars/shell` imports the `manifest` and
gates mounting on its `POPS_APPS` selection: adding `purchases` mounts the
module at `/purchases`, removing it hides those routes. No data lives in this
package, so uninstalling only removes the UI — purchase data stays in the
purchases pillar.

## Docs

- Pillar overview: [`pillars/purchases/README.md`](../README.md)
