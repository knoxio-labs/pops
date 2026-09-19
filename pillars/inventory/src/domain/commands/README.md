# Command layer

The write path for `items` and `locations`: every change made here gets a
revision, a `seq` and a history event, and is checked for conflicts
([ADR-002](../../../docs/architecture/adr-002-inventory-technical-design.md),
D6 and D8). `runMutation` in `engine.ts` is the entry point.
`POST /sync/mutations` (`src/api/rest/sync-handlers.ts`, POPS-4052) calls it,
and so do the legacy `/items` and `/locations` routes
(`../../api/rest/items-handlers.ts`, `items-write-handlers.ts`,
`locations-handlers.ts`), recorded against actor `web` (POPS-4053).

Every op the pillar defines is registered here: `item.move`, `item.setAccess`,
`item.setFull`, `item.setLifecycle`, `item.restoreDeleted`, `event.revert`
(the engine, POPS-4050), `item.create`, `item.edit`, `item.changeType`,
`item.setCode`, `item.setQuantity`, `item.split`, `item.attachPhoto`,
`item.removePhoto`, `item.reorderPhotos`, `location.create`,
`location.rename`, `location.move`, `location.delete` (POPS-4051), and
`item.delete` (POPS-4053, added for the legacy `DELETE /items/:id` route,
which the new model had not needed until then). `search-index.ts` keeps
`items_fts` (migration `0013_items_fts`) current as those ops change a
searchable field; `command-vectors.ts` runs one fixture per op against the
real engine and `scripts/generate-command-vectors.ts` writes the result to
`contracts/command-vectors-v1.json`, which a test regenerates and diffs on
every run.

`legacy-item-fields.ts` holds the provenance and value columns the new model
has no field for (`brand`, `purchaseDate`, `replacementValue`, and the rest
`db/schema/items.ts` calls out as carried unchanged from `home_inventory`).
`item.create`'s `legacy` argument and `item.edit`'s `legacy` patch are the
only callers; `entities.ts` merges its codecs into the ones `item.edit`
writes through, so the same conflict checking and event recording as every
other field applies to them.

Every op the pillar defines is registered here: `item.move`, `item.setAccess`,
`item.setFull`, `item.setLifecycle`, `item.restoreDeleted`, `event.revert`
(the engine, POPS-4050), plus `item.create`, `item.edit`, `item.changeType`,
`item.setCode`, `item.setQuantity`, `item.split`, `item.attachPhoto`,
`item.removePhoto`, `item.reorderPhotos`, `location.create`,
`location.rename`, `location.move` and `location.delete` (POPS-4051).
`search-index.ts` keeps `items_fts` (migration `0013_items_fts`) current as
those ops change a searchable field; `command-vectors.ts` runs one fixture per
op against the real engine and `scripts/generate-command-vectors.ts` writes
the result to `contracts/command-vectors-v1.json`, which a test regenerates
and diffs on every run.

## One mutation

Each mutation runs in its own immediate transaction:

1. **Replay.** A `mutationId` already in `mutations` returns its stored
   outcome and writes nothing. The same id with another op or entity is
   `rejected: invalid`.
2. **Deferral.** A `dependsOn` entry that has not applied here gives
   `deferred`. It is not stored, so the retry is judged afresh.
3. **Dispatch**, inside a savepoint: the op is looked up in the registry, its
   args validated, and its target loaded. A tombstoned target is a `deleted`
   conflict unless the op allows it. The op's plan states the value it wants
   for every field it sets. The engine validates where those values point
   (`validation.ts`), then compares them with the events after the mutation's
   `baseRevision`: disjoint fields apply; shared fields that already hold the
   wanted value apply with `converged: true`; anything else is a `field`
   conflict naming the latest event that changed that field.
4. **Record.** Only the fields that change are written: one event with
   `before` and `after`, then the row with the next revision and that event's
   `seq`. A plan that changes nothing writes nothing.
5. **Store.** The outcome goes into `mutations` in the same transaction.

An op that refuses (`CommandRejected`) or finds a conflict itself
(`CommandConflict`) after writing has its writes rolled back with the
savepoint; the outcome is still stored. Any other error propagates and
nothing is written.

Event and conflict field names are the wire's camelCase names. `placement` is
one field, so two moves of the same item are compared as a whole.

## Adding an op

Declare it with `defineOp` in its own file and add it to `COMMAND_REGISTRY` in
`registry.ts`. A field the engine has not written before also needs a codec in
`item-fields.ts` or `location-fields.ts`, which is how the engine reads its
current value and writes it back. `mode: 'create'` ops insert their own row
with the stamp the engine hands them; `effects` covers ops that also change
other rows, which record each change with `recordUpdate` from `write.ts`.

`effects` receives the same `PlanContext` its `plan` saw (not a bare `db`),
because recording a further change needs the actor and `mutationId` that
change is attributed to (`changeContextFrom` in `write.ts` derives the
`ChangeContext` `recordUpdate`/`recordCreate`/`recordSideEffect` take from
it). The engine calls `effects` whether or not the primary op wrote a field
change, so an op whose real change lives entirely in a related table (an
item's photos live in `item_photos`, not a column of `items`) can still run
one; when `effects` itself calls `recordSideEffect` to bump the row's own
revision, it returns the `Written` that left, which becomes the mutation's
outcome instead of the (no-op) primary write's.

`revisionCheck: 'op'` is for ops that are not judged against a base revision:
`event.revert` compares against the event it reverts, `item.restoreDeleted`
exists to undo a change the client had not seen, and the photo ops
(`item.attachPhoto`, `item.removePhoto`, `item.reorderPhotos`) are additive
enough that there is nothing to compare a base revision against.
