/**
 * Compile-time proof that a real bullmq `Queue` and `Job` still satisfy the
 * structural ports in `ports.ts`.
 *
 * Nothing imports these types at runtime — they exist so a bullmq upgrade
 * that renames a member, tightens a return type or drops a scheduler method
 * fails `tsc` in this one file, instead of surfacing as a mismatch at every
 * pillar that hands its queue to `makeJobsHandlers` or
 * `reconcileJobSchedulers`.
 */
import type { Job, Queue } from 'bullmq';

import type { JobQueuePort, JobRecord, SchedulerQueuePort } from './ports.js';

interface ProbeData {
  readonly kind: string;
}

/** `true` only while bullmq's `Queue` still satisfies the admin port. */
export type QueueSatisfiesJobQueuePort =
  Queue<ProbeData> extends JobQueuePort<ProbeData> ? true : false;

/** `true` only while bullmq's `Queue` still satisfies the scheduler port. */
export type QueueSatisfiesSchedulerPort =
  Queue<ProbeData> extends SchedulerQueuePort<ProbeData> ? true : false;

/** `true` only while bullmq's `Job` still satisfies the job read port. */
export type JobSatisfiesJobRecord = Job<ProbeData> extends JobRecord<ProbeData> ? true : false;

/**
 * Exported as values so the assertions are checked even under
 * `isolatedModules`, and so a test can assert them without importing bullmq.
 */
export const QUEUE_SATISFIES_JOB_QUEUE_PORT: QueueSatisfiesJobQueuePort = true;
export const QUEUE_SATISFIES_SCHEDULER_PORT: QueueSatisfiesSchedulerPort = true;
export const JOB_SATISFIES_JOB_RECORD: JobSatisfiesJobRecord = true;
