/**
 * The job-management operations behind every pillar's `/jobs` surface:
 * list, get, retry, cancel, drain and stats.
 *
 * These are functions over {@link JobQueuePort}, not a class over a bullmq
 * `Queue`, so the same code serves a pillar's REST handlers, a worker's
 * maintenance path and the unit tests. Timestamps are projected to ISO 8601
 * strings on the way out, matching the wire convention every other pillar
 * surface uses; bullmq holds them as epoch millis.
 */
import { JOB_STATES, type JobQueuePort, type JobRecord, type JobState } from './ports.js';

/**
 * Raised when an operation names a job the queue does not hold. Carries the
 * queue and id as fields, not only in the message, so a mounting pillar can
 * map it onto its own 404 envelope without parsing prose.
 */
export class JobNotFoundError extends Error {
  constructor(
    readonly queueName: string,
    readonly jobId: string
  ) {
    super(`No job '${jobId}' on queue '${queueName}'`);
    this.name = 'JobNotFoundError';
  }
}

/** Raised when a job's current state forbids the requested transition. */
export class JobStateConflictError extends Error {
  constructor(
    readonly queueName: string,
    readonly jobId: string,
    readonly state: string,
    action: string
  ) {
    super(`Job '${jobId}' on queue '${queueName}' is ${state} and cannot be ${action}`);
    this.name = 'JobStateConflictError';
  }
}

/** One job as the management surface reports it. */
export interface JobSummary {
  readonly id: string | null;
  readonly name: string;
  readonly queue: string;
  readonly state: string;
  readonly attemptsMade: number;
  readonly data: unknown;
  readonly progress: unknown;
  readonly failedReason: string | null;
  /** Mutable so a ts-rest handler can return it against a zod array schema. */
  readonly stacktrace: string[];
  readonly createdAt: string;
  readonly processedAt: string | null;
  readonly finishedAt: string | null;
}

function toIso(epochMs: number | undefined): string | null {
  if (epochMs === undefined) return null;
  return new Date(epochMs).toISOString();
}

/** Projects a job + its already-resolved state onto the wire shape. */
export function toJobSummary(queue: string, job: JobRecord, state: string): JobSummary {
  return {
    id: job.id ?? null,
    name: job.name,
    queue,
    state,
    attemptsMade: job.attemptsMade,
    data: job.data,
    progress: job.progress ?? null,
    failedReason: job.failedReason ?? null,
    stacktrace: [...(job.stacktrace ?? [])],
    createdAt: new Date(job.timestamp).toISOString(),
    processedAt: toIso(job.processedOn),
    finishedAt: toIso(job.finishedOn),
  };
}

async function summarise(queue: JobQueuePort, job: JobRecord): Promise<JobSummary> {
  return toJobSummary(queue.name, job, await job.getState());
}

/** Filters and window for a list read. */
export interface ListJobsInput {
  readonly states?: readonly JobState[];
  readonly offset?: number;
  readonly limit?: number;
}

/** A page of jobs plus the per-state counts the page was drawn from. */
export interface ListJobsResult {
  readonly jobs: JobSummary[];
  readonly total: number;
}

const DEFAULT_LIST_LIMIT = 50;

/**
 * Reads one page of jobs. `total` is the sum of the counts for the states
 * asked for — bullmq has no cursor, so a caller paginates by offset over a
 * total that can move underneath it.
 */
export async function listJobs(
  queue: JobQueuePort,
  input: ListJobsInput = {}
): Promise<ListJobsResult> {
  const states =
    input.states === undefined || input.states.length === 0 ? JOB_STATES : input.states;
  const offset = input.offset ?? 0;
  const limit = input.limit ?? DEFAULT_LIST_LIMIT;
  // bullmq's range is inclusive on both ends, unlike a SQL LIMIT/OFFSET.
  const jobs = await queue.getJobs([...states], offset, offset + limit - 1, false);
  const counts = await queue.getJobCounts(...states);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    jobs: await Promise.all(jobs.map((job) => summarise(queue, job))),
    total,
  };
}

/** Reads a single job, or throws {@link JobNotFoundError}. */
export async function getJobSummary(queue: JobQueuePort, jobId: string): Promise<JobSummary> {
  const job = await queue.getJob(jobId);
  if (job === undefined) throw new JobNotFoundError(queue.name, jobId);
  return summarise(queue, job);
}

/**
 * Re-runs a finished job. Only `failed` and `completed` jobs carry the
 * finished state bullmq's `retry` needs; anything else is still in flight and
 * retrying it would either duplicate the run or throw from deep inside the
 * lua script, so it is refused here with a state conflict instead.
 */
export async function retryJob(queue: JobQueuePort, jobId: string): Promise<JobSummary> {
  const job = await queue.getJob(jobId);
  if (job === undefined) throw new JobNotFoundError(queue.name, jobId);
  const state = await job.getState();
  if (state !== 'failed' && state !== 'completed') {
    throw new JobStateConflictError(queue.name, jobId, state, 'retried');
  }
  await job.retry(state);
  return summarise(queue, job);
}

/**
 * Removes a job from the queue. An `active` job is being processed right now
 * and bullmq refuses to remove it; that is reported as a state conflict
 * rather than surfacing as an opaque lock error.
 */
export async function cancelJob(
  queue: JobQueuePort,
  jobId: string
): Promise<{ readonly id: string; readonly cancelled: true }> {
  const job = await queue.getJob(jobId);
  if (job === undefined) throw new JobNotFoundError(queue.name, jobId);
  const state = await job.getState();
  if (state === 'active') {
    throw new JobStateConflictError(queue.name, jobId, state, 'cancelled');
  }
  await job.remove();
  return { id: jobId, cancelled: true };
}

/** Per-state counts for one queue. */
export type QueueCounts = Readonly<Record<JobState, number>>;

function toQueueCounts(raw: Record<string, number>): QueueCounts {
  return {
    waiting: raw['waiting'] ?? 0,
    active: raw['active'] ?? 0,
    completed: raw['completed'] ?? 0,
    failed: raw['failed'] ?? 0,
    delayed: raw['delayed'] ?? 0,
    paused: raw['paused'] ?? 0,
  };
}

/** Reads per-state counts for a queue. */
export async function queueCounts(queue: JobQueuePort): Promise<QueueCounts> {
  return toQueueCounts(await queue.getJobCounts(...JOB_STATES));
}

/**
 * Drops every waiting (and, by default, delayed) job. Counts are read first
 * so the caller learns what it destroyed — bullmq's `drain` returns nothing.
 */
export async function drainQueue(
  queue: JobQueuePort,
  input: { readonly delayed?: boolean } = {}
): Promise<{ readonly queue: string; readonly removed: number }> {
  const delayed = input.delayed ?? true;
  const before = await queueCounts(queue);
  await queue.drain(delayed);
  return {
    queue: queue.name,
    removed: before.waiting + (delayed ? before.delayed : 0),
  };
}

/** Stats for one queue plus its dead-letter sibling, when it has one. */
export interface QueueStats {
  readonly queue: string;
  readonly counts: QueueCounts;
  readonly deadLetter: { readonly queue: string; readonly count: number } | null;
}

/**
 * Counts every state of a queue and, when it has a dead-letter sibling, the
 * jobs parked there. A dead-lettered job is enqueued with `attempts: 1` and
 * never consumed, so it sits in `waiting` — its count is the sum of the
 * pending states rather than `waiting` alone, so a paused dead-letter queue
 * still reports its backlog.
 */
export async function queueStats(
  queue: JobQueuePort,
  deadLetterQueue: JobQueuePort | null = null
): Promise<QueueStats> {
  const counts = await queueCounts(queue);
  if (deadLetterQueue === null) return { queue: queue.name, counts, deadLetter: null };
  const dlqCounts = await queueCounts(deadLetterQueue);
  return {
    queue: queue.name,
    counts,
    deadLetter: {
      queue: deadLetterQueue.name,
      count: dlqCounts.waiting + dlqCounts.paused + dlqCounts.delayed + dlqCounts.active,
    },
  };
}
