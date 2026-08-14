/**
 * The shared `/jobs` ts-rest routes every producing pillar mounts.
 *
 * Declared once here so the management surface is identical across pillars —
 * an aggregator (the orchestrator, or the shell) can fan out over them
 * without a per-pillar client shape. The pillar keeps ownership: it composes
 * this router into its own contract and supplies the handlers.
 *
 * Imported through the `@pops/pillar-jobs/contract` subpath, which pulls in
 * only `@ts-rest/core` and `zod` — a pillar can declare the surface without
 * its contract build reaching for `bullmq` or `ioredis`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** Job lifecycle states accepted as a list filter. Mirrors `JOB_STATES`. */
export const JobStateSchema = z.enum([
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
]);

/** One job on the wire. Mirrors `JobSummary`. */
export const JobSummarySchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
  queue: z.string(),
  state: z.string(),
  attemptsMade: z.number(),
  data: z.unknown(),
  progress: z.unknown(),
  failedReason: z.string().nullable(),
  stacktrace: z.array(z.string()),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

/** Per-state counts for one queue. Mirrors `QueueCounts`. */
export const QueueCountsSchema = z.object({
  waiting: z.number(),
  active: z.number(),
  completed: z.number(),
  failed: z.number(),
  delayed: z.number(),
  paused: z.number(),
});

/** One queue's stats. Mirrors `QueueStats`. */
export const QueueStatsSchema = z.object({
  queue: z.string(),
  counts: QueueCountsSchema,
  deadLetter: z.object({ queue: z.string(), count: z.number() }).nullable(),
});

/**
 * Repeated as a query string rather than an array so the surface projects to
 * OpenAPI 3.0 cleanly and reads the same from curl: `?state=failed`.
 */
const ListQuery = z.object({
  queue: z.string().min(1).optional(),
  state: JobStateSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const JobIdParam = z.object({ id: z.string().min(1) });
const QueueSelector = z.object({ queue: z.string().min(1).optional() });

const ListResponse = z.object({
  queue: z.string(),
  jobs: z.array(JobSummarySchema),
  total: z.number(),
});

const DeadLetterListResponse = ListResponse.extend({ originQueue: z.string() });

const ReplayResponse = z.object({
  deadLetterJobId: z.string(),
  originQueue: z.string(),
  replayedJobId: z.string().nullable(),
});

/**
 * A map of HTTP error status → response body schema, injected so this package
 * carries no dependency on any pillar's shared error set (the pillar passes
 * its own `ERR_RESPONSES`).
 */
export type ContractErrorResponses = Readonly<Record<number, z.ZodType>>;

/** Queue-level routes, all on literal paths. */
const queueRoutes = (err: ContractErrorResponses) =>
  ({
    queues: {
      method: 'GET',
      path: '/jobs/queues',
      responses: { 200: z.object({ queues: z.array(z.string()) }), ...err },
      summary: 'List the job queues this pillar owns',
    },
    stats: {
      method: 'GET',
      path: '/jobs/stats',
      responses: { 200: z.object({ queues: z.array(QueueStatsSchema) }), ...err },
      summary: 'Per-state job counts for every queue, including dead-letter depth',
    },
    drain: {
      method: 'POST',
      path: '/jobs/drain',
      body: QueueSelector.extend({ delayed: z.boolean().optional() }),
      responses: { 200: z.object({ queue: z.string(), removed: z.number() }), ...err },
      summary: 'Remove every waiting (and by default delayed) job from a queue',
    },
  }) as const;

/** The dead-letter inbox: read what is parked, put one back. */
const deadLetterRoutes = (err: ContractErrorResponses) =>
  ({
    listDeadLetter: {
      method: 'GET',
      path: '/jobs/dead-letter',
      query: ListQuery,
      responses: { 200: DeadLetterListResponse, ...err },
      summary: 'List jobs parked in a queue’s dead-letter sibling',
    },
    replayDeadLetter: {
      method: 'POST',
      path: '/jobs/dead-letter/:id/replay',
      pathParams: JobIdParam,
      body: QueueSelector,
      responses: { 200: ReplayResponse, ...err },
      summary: 'Re-enqueue a dead-lettered job onto its origin queue',
    },
  }) as const;

/** Per-job routes. Everything from `get` down carries a `:id` path param. */
const jobRoutes = (err: ContractErrorResponses) =>
  ({
    list: {
      method: 'GET',
      path: '/jobs',
      query: ListQuery,
      responses: { 200: ListResponse, ...err },
      summary: 'List jobs on a queue, optionally filtered by state',
    },
    get: {
      method: 'GET',
      path: '/jobs/:id',
      pathParams: JobIdParam,
      query: QueueSelector,
      responses: { 200: JobSummarySchema, ...err },
      summary: 'Read a single job',
    },
    retry: {
      method: 'POST',
      path: '/jobs/:id/retry',
      pathParams: JobIdParam,
      body: QueueSelector,
      responses: { 200: JobSummarySchema, ...err },
      summary: 'Re-run a finished job',
    },
    cancel: {
      method: 'POST',
      path: '/jobs/:id/cancel',
      pathParams: JobIdParam,
      body: QueueSelector,
      responses: { 200: z.object({ id: z.string(), cancelled: z.literal(true) }), ...err },
      summary: 'Remove a job that is not currently being processed',
    },
  }) as const;

/** The composed `/jobs` route map. */
export type JobsContract = ReturnType<typeof queueRoutes> &
  ReturnType<typeof deadLetterRoutes> &
  ReturnType<typeof jobRoutes>;

/**
 * Builds the `/jobs` router.
 *
 * Route ORDER is load-bearing: ts-rest registers routes in contract-key
 * order, so every literal path (`/jobs/queues`, `/jobs/stats`,
 * `/jobs/drain`, `/jobs/dead-letter`) is declared ahead of the `/jobs/:id`
 * param route, which would otherwise swallow them.
 */
export function makeJobsContract(errorResponses: ContractErrorResponses): JobsContract {
  return c.router({
    ...queueRoutes(errorResponses),
    ...deadLetterRoutes(errorResponses),
    ...jobRoutes(errorResponses),
  });
}
