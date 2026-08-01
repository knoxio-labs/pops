# Reflex

Declarative event→action automation. `reflexes.toml` is both the authoring
surface and the source of truth; this module parses it, holds the result in
memory, exposes a management surface, and records every firing in
`reflex_executions`. A reflex says _when_ something should happen and _which_
subsystem verb to run — it never implements the action.

## Load path

`instance.ts` resolves the config path and caches the service; `reflex-parser.ts`
turns the file into definitions. The watcher in `reflex-io.ts` reloads on disk
change and drops in-memory threshold state for reflexes that disappeared.

## Nothing drives the triggers

- `triggers/event-trigger.ts` — nothing emits engram lifecycle events; the
  engram CRUD path in `../engrams` fires none.
- `triggers/threshold-trigger.ts` — no timer computes the metrics it would
  compare.
- `triggers/scheduled-trigger.ts` — no queue is created and `src/worker`
  contains no reflex code.
- `ReflexService.processEvent`, `evaluateThresholds` and `fireScheduled` have no
  caller anywhere, tests included, and no dispatcher maps an `action.type`
  (`ingest` / `emit` / `glia`) onto a subsystem call.

The only production writer of `reflex_executions` is `POST /reflex/:name/test`,
which synthesises trigger data and logs a `completed` row carrying
`dryRun: true`. Read the management surface with that in mind: `executionCount`
and `lastExecutionAt` count dry runs, and `nextFireTime` is computed on read
from the cron expression rather than reported by a registered job.
