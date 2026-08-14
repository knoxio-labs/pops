/**
 * Queue and worker construction for pillar job queues.
 *
 * The retry, backoff and retention constants were duplicated verbatim in the
 * food and cerebrum producers, free to drift apart silently; they live here
 * now. Everything is Redis-optional: with no Redis configured the factory
 * returns `null` and the pillar takes its degraded path, so importing this
 * package never makes Redis a hard dependency.
 *
 * A queue is created together with its dead-letter sibling, and
 * {@link createPillarWorker} wires the retry-exhaustion forwarder onto the
 * worker's `failed` event — so a pillar gets dead-lettering by construction
 * rather than by remembering to add a handler.
 */
import { Queue, Worker, type DefaultJobOptions, type Processor } from 'bullmq';

import {
  createDeadLetterForwarder,
  deadLetterQueueName,
  type DeadLetterJobData,
} from './dead-letter.js';
import { createJobsConnection, resolveRedisUrl } from './redis.js';

import type { Redis } from 'ioredis';

const ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 5_000;
const REMOVE_KEEP_COUNT = 1_000;

/**
 * The default retry/retention policy for every POPS pillar queue: three
 * attempts with exponential backoff, and the last thousand terminal jobs of
 * each kind retained for inspection through the `/jobs` surface.
 */
export const POPS_JOB_OPTIONS: DefaultJobOptions = {
  attempts: ATTEMPTS,
  backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
  removeOnComplete: { count: REMOVE_KEEP_COUNT },
  removeOnFail: { count: REMOVE_KEEP_COUNT },
};

/** A dead-lettered job is terminal — it must never retry on its own. */
const DEAD_LETTER_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 1,
  removeOnComplete: { count: REMOVE_KEEP_COUNT },
  removeOnFail: { count: REMOVE_KEEP_COUNT },
};

/** A queue, its dead-letter sibling, and the connection they share. */
export interface PillarQueues<Data> {
  readonly queue: Queue<Data>;
  readonly deadLetterQueue: Queue<DeadLetterJobData>;
  /** Closes both queues and the shared connection. */
  close(): Promise<void>;
}

export interface CreatePillarQueuesOptions {
  /** Queue name, e.g. `ai.maintenance`. The dead-letter sibling derives from it. */
  readonly name: string;
  /** Defaults to {@link resolveRedisUrl} over `process.env`. */
  readonly redisUrl?: string | null;
  /** Overrides merged onto {@link POPS_JOB_OPTIONS}. */
  readonly jobOptions?: DefaultJobOptions;
}

/**
 * Builds a pillar's queue pair, or `null` when this pillar has no Redis.
 *
 * The two queues share one connection: they only issue non-blocking commands,
 * and one connection per queue would double a pillar's Redis client count for
 * no benefit. Workers get their own — see {@link createPillarWorker}.
 */
export function createPillarQueues<Data>(
  options: CreatePillarQueuesOptions
): PillarQueues<Data> | null {
  const url = options.redisUrl === undefined ? resolveRedisUrl() : options.redisUrl;
  if (url === null || url.length === 0) return null;

  const connection: Redis = createJobsConnection(url);
  const queue = new Queue<Data>(options.name, {
    connection,
    defaultJobOptions: { ...POPS_JOB_OPTIONS, ...options.jobOptions },
  });
  const deadLetterQueue = new Queue<DeadLetterJobData>(deadLetterQueueName(options.name), {
    connection,
    defaultJobOptions: DEAD_LETTER_JOB_OPTIONS,
  });

  return {
    queue,
    deadLetterQueue,
    async close() {
      await queue.close();
      await deadLetterQueue.close();
      await connection.quit();
    },
  };
}

/** The minimal logger a worker needs; pino satisfies it. */
export interface JobsLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface CreatePillarWorkerOptions<Data> {
  readonly queueName: string;
  readonly processor: Processor<Data, unknown, string>;
  /** Defaults to {@link resolveRedisUrl} over `process.env`. */
  readonly redisUrl?: string | null;
  readonly concurrency?: number;
  /** Where retry-exhausted jobs are forwarded. Omit to disable dead-lettering. */
  readonly deadLetterQueue?: Queue<DeadLetterJobData> | null;
  readonly logger?: JobsLogger;
}

/**
 * Builds a worker with dead-lettering already attached, or `null` when this
 * pillar has no Redis.
 *
 * The worker takes its OWN connection rather than sharing the producer's: it
 * issues blocking reads, which occupy a connection for the whole wait and
 * would stall every command the producer tried to multiplex onto it.
 */
export function createPillarWorker<Data>(
  options: CreatePillarWorkerOptions<Data>
): Worker<Data, unknown, string> | null {
  const url = options.redisUrl === undefined ? resolveRedisUrl() : options.redisUrl;
  if (url === null || url.length === 0) return null;

  const worker = new Worker<Data, unknown, string>(options.queueName, options.processor, {
    connection: createJobsConnection(url),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });

  const forward = createDeadLetterForwarder({
    originQueue: options.queueName,
    deadLetterQueue: options.deadLetterQueue ?? null,
  });
  const logger = options.logger;

  worker.on('failed', (job, err) => {
    void forward(job, err)
      .then((forwarded) => {
        if (forwarded) {
          logger?.info(
            { queue: options.queueName, jobId: job?.id },
            'job exhausted its retries and was dead-lettered'
          );
        }
      })
      .catch((cause: unknown) => {
        logger?.error(
          { queue: options.queueName, jobId: job?.id, err: cause },
          'failed to dead-letter an exhausted job'
        );
      });
  });

  return worker;
}
