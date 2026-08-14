# @pops/pillar-jobs

The shared BullMQ layer for pillars that run background work: queue
construction, the `/jobs` management operations, dead-lettering, and durable
repeatable schedules.

Consumed by `pillars/ai`. `pillars/food` and `pillars/cerebrum` still declare
their own producers with the same constants duplicated (POPS-2004), and
nothing aggregates the per-pillar surfaces into a fleet-wide view yet
(POPS-2006).

## What it is for

A POPS pillar owns its queues; there is no central job service, and this
package does not add one. What it removes is the per-pillar re-implementation
of the same four things:

- **Construction.** `createPillarQueues` builds a queue, its dead-letter
  sibling and one shared Redis connection under `POPS_JOB_OPTIONS` — three
  attempts, exponential backoff, the last thousand terminal jobs retained.
  It returns `null` when the pillar has no Redis, which is the normal case
  for most of the fleet; the caller branches once, at construction.
- **Management.** `makeJobsHandlers` implements list / get / retry / cancel /
  drain / stats over the queues a pillar injects, and `./contract`'s
  `makeJobsContract` declares the matching ts-rest routes. The pillar composes
  both into its own contract and app, exactly as it does with
  `@pops/pillar-settings`. An aggregator fans out across those per-pillar
  surfaces; nothing here reaches across a pillar boundary.
- **Dead-lettering.** `createPillarWorker` attaches a `failed` listener that
  forwards a job with no attempts left onto `<queue>.dead-letter`, carrying
  the payload, failure reason, stack and attempt count.
  `replayDeadLetterJob` puts it back on the origin queue and drops the parked
  copy. Nothing consumes the dead-letter queue — it is a durable inbox, and
  replay is an operator action.
- **Durable schedules.** `reconcileJobSchedules` diffs the schedules a pillar
  wants against the job schedulers Redis already holds, so a boot is
  idempotent, a cadence change replaces in place, and a schedule whose feature
  gate has since been turned off is removed rather than left orphaned. The
  schedule lives in Redis, so it survives the process that registered it —
  which is the whole reason to prefer it over a `setInterval` loop.

## Shape

Every operation is written against the structural ports in `src/ports.ts`
rather than against bullmq's classes directly. That is what lets the
reconciliation, admin and dead-letter logic be unit-tested with in-memory
doubles. The claim that a real `Queue`/`Job` still fits those ports is a
compile-time assertion in `src/conformance.ts`, so a bullmq upgrade that
changes the shape fails typecheck in one file instead of at every call site.

`src/contract.ts` is reachable through the `@pops/pillar-jobs/contract`
subpath, which pulls in only `@ts-rest/core` and `zod` — a pillar can declare
the wire surface without its contract build reaching for `bullmq` or
`ioredis`.

## Tests

`pnpm test` is the unit suite. The two claims no double can prove — that a
schedule survives a restart without duplicating or vanishing, and that an
exhausted job dead-letters and replays by itself — live in
`src/__tests__/jobs.live-seam.test.ts`, which drives a throwaway
`redis:7-alpine` container. It is excluded from the default run; execute it
with `pnpm test:live-seam`, which requires Docker.
