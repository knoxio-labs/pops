# lists contract

Two unrelated surfaces live in this directory and both call themselves "the
contract". Only one of them is real.

## The live wire contract

`rest.ts` is the source of truth for the wire format — its header covers how the
sub-routers and the generated projections fit together. CI reruns every
`generate:*` script the package defines and fails on any diff, so
`openapi/lists.openapi.json` and `api-types.generated.ts` cannot drift from it.

`rest.ts` does export `ListsContract = typeof listsContract`, and the pillar's
own server imports `listsContract` directly (`../api/app.ts`,
`../api/rest/handlers.ts`) — but
neither is reachable from outside the package: `index.ts` never re-exports
`rest.ts`, and the `exports` map in `pillars/lists/package.json` exposes only
`.`, `./manifest`, `./api-types`, and `./openapi`.

Two conventions to know before reading the route files:

- `refKind`/`refId` are opaque to lists. `ingredient`, `variant`, and `recipe`
  name entities another pillar owns; lists stores and matches on them but never
  dereferences them.
- `dueAt` is on `ListItemRowSchema` but on no request body. It is written only
  by the db service (`AddItemInput` / `UpdateItemInput` in
  `../db/services/list-items.ts`), so no REST call can set it.

## The vestigial entity surface

`types/` and `schemas/` describe four entities — `ListItem`, `AgendaItem`,
`Project`, `Tag` — plus a `ListsError` union in `errors.ts`. None of them
corresponds to a table, a route, or a handler:

- The `ListItem` in `types/` is not the list item this pillar stores. The real
  one is `ListItemRowSchema` in `rest-schemas.ts`; the two share a name and
  nothing else.
- `AgendaItem`, `Project`, and `Tag` have no table in `../db/schema/` (which
  holds only `lists.ts` and `lists-row-schemas.ts`) and no endpoint.
- `errors.ts` is unused by the routes, which return `ErrorBodySchema` instead.
  The live domain errors are `ListNotFoundError` / `ListItemNotFoundError` in
  `../db/errors.ts` — a different file with a similar name.
- `manifest.generated.ts` exports a second type also named `ListsContract`
  (an entities snapshot). `index.ts` re-exports **that** one, so a consumer
  writing `import type { ListsContract } from '@pops/lists'` gets the snapshot,
  not `typeof listsContract` from `rest.ts`.

Their round-trip test (`__tests__/schemas.test.ts`) only checks each type against
its own zod schema, so the pair stays self-consistent while describing nothing.
Nothing in the repo imports the `@pops/lists` root export today.
