/**
 * The narrow slices of BullMQ this package drives, restated as structural
 * interfaces.
 *
 * Every operation here is written against these ports rather than against
 * `Queue`/`Job` directly, which is what lets the reconciliation, admin and
 * dead-letter logic be unit-tested with in-memory doubles while the pillars
 * pass real BullMQ objects. `conformance.ts` asserts at compile time that a
 * real `Queue` still satisfies them, so a bullmq upgrade that changes the
 * shape fails typecheck here rather than at every call site.
 *
 * The methods are declared in method syntax deliberately: TypeScript checks
 * method parameters bivariantly, so a port can name a wider parameter type
 * (`readonly string[]`) than bullmq's own (`JobType[]`) without the real
 * class ceasing to satisfy it.
 */

/** Job lifecycle states this package exposes; a subset of bullmq's `JobType`. */
export const JOB_STATES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
] as const;

export type JobState = (typeof JOB_STATES)[number];

/** The read surface of a single job. `bullmq`'s `Job` satisfies this. */
export interface JobRecord<Data = unknown> {
  readonly id?: string | undefined;
  readonly name: string;
  readonly data: Data;
  readonly opts?: { readonly attempts?: number | undefined } | undefined;
  readonly attemptsMade: number;
  readonly failedReason?: string | undefined;
  readonly stacktrace?: readonly string[] | null | undefined;
  readonly timestamp: number;
  readonly processedOn?: number | undefined;
  readonly finishedOn?: number | undefined;
  readonly progress?: unknown;
  getState(): Promise<string>;
  remove(): Promise<void>;
  retry(state?: 'completed' | 'failed'): Promise<void>;
}

/** Options accepted when enqueuing; a subset of bullmq's `JobsOptions`. */
export interface JobEnqueueOptions {
  readonly attempts?: number;
  readonly jobId?: string;
}

/** The read/admin surface of a queue. `bullmq`'s `Queue` satisfies this. */
export interface JobQueuePort<Data = unknown> {
  readonly name: string;
  add(name: string, data: Data, opts?: JobEnqueueOptions): Promise<JobRecord<Data>>;
  getJob(id: string): Promise<JobRecord<Data> | undefined>;
  getJobs(
    types?: readonly string[] | string,
    start?: number,
    end?: number,
    asc?: boolean
  ): Promise<JobRecord<Data>[]>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  drain(delayed?: boolean): Promise<void>;
}

/** A repeat cadence: either a fixed interval or a cron pattern, never both. */
export type ScheduleCadence =
  | { readonly every: number; readonly pattern?: undefined; readonly tz?: string }
  | { readonly pattern: string; readonly every?: undefined; readonly tz?: string };

/** A job scheduler as bullmq reports it back. `JobSchedulerJson` satisfies this. */
export interface ExistingSchedule {
  readonly key: string;
  readonly name: string;
  readonly every?: number | string | null | undefined;
  readonly pattern?: string | null | undefined;
  readonly tz?: string | null | undefined;
}

/** The job-scheduler surface of a queue. `bullmq`'s `Queue` satisfies this. */
export interface SchedulerQueuePort<Data = unknown> {
  readonly name: string;
  upsertJobScheduler(
    id: string,
    repeat: ScheduleCadence,
    template?: { name?: string; data?: Data }
  ): Promise<unknown>;
  getJobSchedulers(start?: number, end?: number, asc?: boolean): Promise<ExistingSchedule[]>;
  removeJobScheduler(id: string): Promise<boolean>;
}
