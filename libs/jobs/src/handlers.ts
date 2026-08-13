/**
 * The transport-agnostic `/jobs` handlers a pillar mounts.
 *
 * A pillar injects the queues it owns and wraps these in its own ts-rest
 * adapter (see `contract.ts` for the matching route declarations), the same
 * split `@pops/pillar-settings` uses. Ownership stays with the pillar — there
 * is deliberately no central job service; the orchestrator or the shell fans
 * out across these per-pillar surfaces instead.
 *
 * A pillar running without Redis registers no queues at all. Every handler
 * then raises {@link JobsUnavailableError}, which the mounting pillar maps to
 * 503 — the same degraded-mode answer its enqueue paths already give.
 */
import {
  cancelJob,
  drainQueue,
  getJobSummary,
  listJobs,
  queueStats,
  retryJob,
  type JobSummary,
  type ListJobsResult,
  type QueueStats,
} from './admin.js';
import {
  replayDeadLetterJob,
  type DeadLetterJobData,
  type DeadLetterReplayResult,
} from './dead-letter.js';

import type { JobQueuePort, JobState } from './ports.js';

/** Raised when the pillar has no Redis, so it owns no queues to manage. */
export class JobsUnavailableError extends Error {
  constructor() {
    super('Job management is unavailable: this pillar has no Redis connection configured');
    this.name = 'JobsUnavailableError';
  }
}

/** Raised when a request names a queue this pillar does not own. */
export class UnknownQueueError extends Error {
  constructor(
    readonly queueName: string,
    known: readonly string[]
  ) {
    super(`Unknown queue '${queueName}'; this pillar owns: ${known.join(', ')}`);
    this.name = 'UnknownQueueError';
  }
}

/** Raised when a dead-letter operation targets a queue that has none. */
export class NoDeadLetterQueueError extends Error {
  constructor(readonly queueName: string) {
    super(`Queue '${queueName}' has no dead-letter queue`);
    this.name = 'NoDeadLetterQueueError';
  }
}

/** One queue a pillar exposes for management, with its dead-letter sibling. */
export interface ManagedJobQueue {
  readonly queue: JobQueuePort;
  readonly deadLetterQueue?: JobQueuePort<DeadLetterJobData> | null;
}

/**
 * The queues a pillar exposes. The FIRST entry is the pillar's primary queue:
 * a request that omits the `queue` selector is answered by it, and every
 * response names the queue that answered so an omitted selector is never
 * ambiguous to the caller. Empty ⇒ no Redis ⇒ every handler 503s.
 */
export interface JobsHandlerDeps {
  readonly queues: readonly ManagedJobQueue[];
}

/** Query shape shared by the two list reads. */
export interface JobsListInput {
  readonly queue?: string | undefined;
  readonly states?: readonly JobState[] | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/** The `/jobs` operations, independent of any HTTP framework. */
export interface JobsHandlers {
  queues(): { readonly queues: string[] };
  list(input: JobsListInput): Promise<ListJobsResult & { readonly queue: string }>;
  get(input: { queue?: string | undefined; id: string }): Promise<JobSummary>;
  retry(input: { queue?: string | undefined; id: string }): Promise<JobSummary>;
  cancel(input: {
    queue?: string | undefined;
    id: string;
  }): Promise<{ readonly id: string; readonly cancelled: true }>;
  drain(input: {
    queue?: string | undefined;
    delayed?: boolean | undefined;
  }): Promise<{ readonly queue: string; readonly removed: number }>;
  stats(): Promise<{ readonly queues: QueueStats[] }>;
  listDeadLetter(
    input: JobsListInput
  ): Promise<ListJobsResult & { readonly queue: string; readonly originQueue: string }>;
  replayDeadLetter(input: {
    queue?: string | undefined;
    id: string;
  }): Promise<DeadLetterReplayResult>;
}

/** A managed queue that is known to have a dead-letter sibling. */
type ManagedWithDeadLetter = ManagedJobQueue & {
  readonly deadLetterQueue: JobQueuePort<DeadLetterJobData>;
};

/** Turns an optional queue selector into the queue that will answer. */
interface QueueResolver {
  (name: string | undefined): ManagedJobQueue;
  readonly withDeadLetter: (name: string | undefined) => ManagedWithDeadLetter;
}

function makeResolver(deps: JobsHandlerDeps): QueueResolver {
  const resolve = (name: string | undefined): ManagedJobQueue => {
    const [primary] = deps.queues;
    if (primary === undefined) throw new JobsUnavailableError();
    if (name === undefined) return primary;
    const found = deps.queues.find((managed) => managed.queue.name === name);
    if (found === undefined) {
      throw new UnknownQueueError(
        name,
        deps.queues.map((managed) => managed.queue.name)
      );
    }
    return found;
  };

  return Object.assign(resolve, {
    withDeadLetter(name: string | undefined): ManagedWithDeadLetter {
      const managed = resolve(name);
      const deadLetterQueue = managed.deadLetterQueue;
      if (deadLetterQueue === undefined || deadLetterQueue === null) {
        throw new NoDeadLetterQueueError(managed.queue.name);
      }
      return { ...managed, deadLetterQueue };
    },
  });
}

/** The list window, with the keys the caller left unset omitted entirely. */
function listOptions(input: JobsListInput): {
  states?: readonly JobState[];
  limit?: number;
  offset?: number;
} {
  return {
    ...(input.states === undefined ? {} : { states: input.states }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.offset === undefined ? {} : { offset: input.offset }),
  };
}

type ReadHandlers = Pick<JobsHandlers, 'queues' | 'list' | 'get' | 'stats' | 'listDeadLetter'>;
type WriteHandlers = Pick<JobsHandlers, 'retry' | 'cancel' | 'drain' | 'replayDeadLetter'>;

function makeReadHandlers(deps: JobsHandlerDeps, resolve: QueueResolver): ReadHandlers {
  return {
    queues() {
      if (deps.queues.length === 0) throw new JobsUnavailableError();
      return { queues: deps.queues.map((managed) => managed.queue.name) };
    },

    async list(input) {
      const { queue } = resolve(input.queue);
      return { ...(await listJobs(queue, listOptions(input))), queue: queue.name };
    },

    async get(input) {
      return getJobSummary(resolve(input.queue).queue, input.id);
    },

    async stats() {
      if (deps.queues.length === 0) throw new JobsUnavailableError();
      return {
        queues: await Promise.all(
          deps.queues.map((managed) => queueStats(managed.queue, managed.deadLetterQueue ?? null))
        ),
      };
    },

    async listDeadLetter(input) {
      const managed = resolve.withDeadLetter(input.queue);
      const result = await listJobs(managed.deadLetterQueue, listOptions(input));
      return { ...result, queue: managed.deadLetterQueue.name, originQueue: managed.queue.name };
    },
  };
}

function makeWriteHandlers(resolve: QueueResolver): WriteHandlers {
  return {
    async retry(input) {
      return retryJob(resolve(input.queue).queue, input.id);
    },

    async cancel(input) {
      return cancelJob(resolve(input.queue).queue, input.id);
    },

    async drain(input) {
      return drainQueue(resolve(input.queue).queue, {
        ...(input.delayed === undefined ? {} : { delayed: input.delayed }),
      });
    },

    async replayDeadLetter(input) {
      const managed = resolve.withDeadLetter(input.queue);
      return replayDeadLetterJob({
        deadLetterQueue: managed.deadLetterQueue,
        originQueue: managed.queue,
        jobId: input.id,
      });
    },
  };
}

export function makeJobsHandlers(deps: JobsHandlerDeps): JobsHandlers {
  const resolve = makeResolver(deps);
  return { ...makeReadHandlers(deps, resolve), ...makeWriteHandlers(resolve) };
}
