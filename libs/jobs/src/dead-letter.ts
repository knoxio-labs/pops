/**
 * Dead-letter handling for pillar queues.
 *
 * A job that exhausts its retries is not left to age out of the origin
 * queue's `removeOnFail` window: the worker forwards it to a sibling
 * `<origin>.dead-letter` queue carrying the original payload, the failure
 * reason, the stack and the attempt count, from which it can be replayed
 * back onto the origin queue.
 *
 * The dead-letter queue is a plain BullMQ queue with `attempts: 1` — nothing
 * consumes it, it is a durable inbox that survives a restart because Redis
 * does. Replay is explicit and operator-driven; there is deliberately no
 * automatic re-drive, since the failures that reach here are the ones three
 * attempts could not fix.
 */
import { z } from 'zod';

import type { JobQueuePort, JobRecord } from './ports.js';

/** Suffix appended to an origin queue name to name its dead-letter sibling. */
export const DEAD_LETTER_SUFFIX = '.dead-letter';

/** The dead-letter queue name for `origin`. */
export function deadLetterQueueName(origin: string): string {
  return `${origin}${DEAD_LETTER_SUFFIX}`;
}

/** Whether `name` names a dead-letter queue. */
export function isDeadLetterQueueName(name: string): boolean {
  return name.endsWith(DEAD_LETTER_SUFFIX) && name.length > DEAD_LETTER_SUFFIX.length;
}

/** The origin queue a dead-letter queue name was derived from, or `null`. */
export function originQueueName(deadLetterName: string): string | null {
  if (!isDeadLetterQueueName(deadLetterName)) return null;
  return deadLetterName.slice(0, -DEAD_LETTER_SUFFIX.length);
}

/**
 * What a dead-lettered job carries. Validated on replay rather than trusted:
 * the payload has round-tripped through Redis as JSON and may predate a
 * change to this shape.
 */
export const DeadLetterJobDataSchema = z.object({
  originQueue: z.string().min(1),
  originJobId: z.string().nullable(),
  originJobName: z.string().min(1),
  originData: z.unknown(),
  failedReason: z.string().nullable(),
  stacktrace: z.array(z.string()),
  attemptsMade: z.number().int().nonnegative(),
  failedAt: z.string(),
});

export type DeadLetterJobData = z.infer<typeof DeadLetterJobDataSchema>;

/** Name under which a forwarded failure is enqueued on the dead-letter queue. */
export const DEAD_LETTER_JOB_NAME = 'dead-letter';

/**
 * Whether a failed job has no attempts left. `attempts` defaults to 1 (a job
 * enqueued without the option gets exactly one run), matching BullMQ.
 */
export function isRetryExhausted(job: Pick<JobRecord, 'attemptsMade' | 'opts'>): boolean {
  const attempts = job.opts?.attempts ?? 1;
  return job.attemptsMade >= attempts;
}

/** Projects a failed job + its error into the dead-letter payload. */
export function buildDeadLetterJobData(
  originQueue: string,
  job: JobRecord,
  err: unknown,
  failedAt: Date
): DeadLetterJobData {
  return {
    originQueue,
    originJobId: job.id ?? null,
    originJobName: job.name,
    originData: job.data,
    failedReason: job.failedReason ?? (err instanceof Error ? err.message : null),
    stacktrace: [...(job.stacktrace ?? [])],
    attemptsMade: job.attemptsMade,
    failedAt: failedAt.toISOString(),
  };
}

/** Dependencies of the worker-side forwarder. */
export interface DeadLetterForwarderDeps {
  /** The queue the failing worker consumes. */
  readonly originQueue: string;
  /** The dead-letter queue, or `null` when this pillar has no Redis. */
  readonly deadLetterQueue: JobQueuePort<DeadLetterJobData> | null;
  /** Injected for tests; defaults to the wall clock. */
  readonly now?: () => Date;
}

/**
 * Builds the `worker.on('failed')` handler that forwards retry-exhausted jobs
 * to the dead-letter queue and ignores failures that still have an attempt
 * left. Returns whether it forwarded, so a caller can log the distinction.
 */
export function createDeadLetterForwarder(
  deps: DeadLetterForwarderDeps
): (job: JobRecord | undefined, err: unknown) => Promise<boolean> {
  const now = deps.now ?? ((): Date => new Date());
  return async (job, err) => {
    if (job === undefined) return false;
    if (deps.deadLetterQueue === null) return false;
    if (!isRetryExhausted(job)) return false;
    const payload = buildDeadLetterJobData(deps.originQueue, job, err, now());
    await deps.deadLetterQueue.add(DEAD_LETTER_JOB_NAME, payload, { attempts: 1 });
    return true;
  };
}

/** Raised when a replay names a dead-letter job that is absent or malformed. */
export class DeadLetterReplayError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DeadLetterReplayError';
  }
}

/** What a replay produced. */
export interface DeadLetterReplayResult {
  readonly deadLetterJobId: string;
  readonly originQueue: string;
  readonly replayedJobId: string | null;
}

/**
 * Re-enqueues a dead-lettered job onto its origin queue under the original
 * job name and payload, then drops the dead-letter copy.
 *
 * The origin enqueue happens BEFORE the removal so a crash between the two
 * duplicates a job rather than losing it — the origin handlers are idempotent
 * by construction (every producing pillar's are), a vanished payload is not
 * recoverable.
 */
export async function replayDeadLetterJob(deps: {
  /**
   * Typed loosely on purpose: the parked payload came back from Redis as
   * JSON, so {@link DeadLetterJobDataSchema} — not the static type — is what
   * decides whether it is replayable.
   */
  readonly deadLetterQueue: JobQueuePort<unknown>;
  readonly originQueue: JobQueuePort<unknown>;
  readonly jobId: string;
}): Promise<DeadLetterReplayResult> {
  const job = await deps.deadLetterQueue.getJob(deps.jobId);
  if (job === undefined) {
    throw new DeadLetterReplayError(`No dead-letter job '${deps.jobId}'`);
  }
  const parsed = DeadLetterJobDataSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new DeadLetterReplayError(
      `Dead-letter job '${deps.jobId}' does not carry a replayable payload`,
      { cause: parsed.error }
    );
  }
  const payload = parsed.data;
  if (payload.originQueue !== deps.originQueue.name) {
    throw new DeadLetterReplayError(
      `Dead-letter job '${deps.jobId}' belongs to queue '${payload.originQueue}', not ` +
        `'${deps.originQueue.name}'`
    );
  }
  const replayed = await deps.originQueue.add(payload.originJobName, payload.originData);
  await job.remove();
  return {
    deadLetterJobId: deps.jobId,
    originQueue: payload.originQueue,
    replayedJobId: replayed.id ?? null,
  };
}
