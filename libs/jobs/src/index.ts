/**
 * `@pops/pillar-jobs` — the shared BullMQ layer behind every pillar's job
 * queues: construction, the `/jobs` management operations, dead-lettering and
 * durable repeatable schedules.
 *
 * The ts-rest route declarations live behind the `./contract` subpath so a
 * contract build does not pull in `bullmq`/`ioredis`.
 */
export {
  JobNotFoundError,
  JobStateConflictError,
  cancelJob,
  drainQueue,
  getJobSummary,
  listJobs,
  queueCounts,
  queueStats,
  retryJob,
  toJobSummary,
  type JobSummary,
  type ListJobsInput,
  type ListJobsResult,
  type QueueCounts,
  type QueueStats,
} from './admin.js';

export {
  DEAD_LETTER_JOB_NAME,
  DEAD_LETTER_SUFFIX,
  DeadLetterJobDataSchema,
  DeadLetterReplayError,
  buildDeadLetterJobData,
  createDeadLetterForwarder,
  deadLetterQueueName,
  isDeadLetterQueueName,
  isRetryExhausted,
  originQueueName,
  replayDeadLetterJob,
  type DeadLetterForwarderDeps,
  type DeadLetterJobData,
  type DeadLetterReplayFailure,
  type DeadLetterReplayResult,
} from './dead-letter.js';

export {
  JobsUnavailableError,
  NoDeadLetterQueueError,
  UnknownQueueError,
  makeJobsHandlers,
  type JobsHandlerDeps,
  type JobsHandlers,
  type JobsListInput,
  type ManagedJobQueue,
} from './handlers.js';

export {
  JOB_STATES,
  type ExistingSchedule,
  type JobEnqueueOptions,
  type JobQueuePort,
  type JobRecord,
  type JobState,
  type ScheduleCadence,
  type SchedulerQueuePort,
} from './ports.js';

export {
  POPS_JOB_OPTIONS,
  createPillarQueues,
  createPillarWorker,
  type CreatePillarQueuesOptions,
  type CreatePillarWorkerOptions,
  type JobsLogger,
  type PillarQueues,
} from './queue.js';

export { createJobsConnection, resolveRedisUrl, type RedisEnv } from './redis.js';

export {
  UnmanagedScheduleError,
  planScheduleReconciliation,
  reconcileJobSchedules,
  type DesiredSchedule,
  type ReconcileResult,
  type SchedulePlan,
} from './scheduler.js';
