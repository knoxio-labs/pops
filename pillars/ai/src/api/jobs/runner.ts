/**
 * How the ai pillar's two maintenance jobs get run.
 *
 * With Redis configured they are BullMQ repeatable jobs: the schedule lives
 * in Redis, so it survives a restart, and reconciliation on boot neither
 * duplicates an existing schedule nor leaves one behind when a gate is turned
 * off. Without Redis — the default for this pillar — the pre-existing
 * `setInterval` loops run instead, so the feature degrades rather than
 * disappearing.
 *
 * The worker runs IN the API process rather than in its own container: both
 * tasks read and write this pillar's own SQLite handle, which a separate
 * process could not share safely, and they are two cheap periodic passes
 * rather than a throughput concern.
 */
import { createPillarWorker, reconcileJobSchedules } from '@pops/pillar-jobs';

import { type AiDb } from '../../db/index.js';
import { runEvaluation } from '../modules/ai-alerts/evaluator.js';
import { startAlertsScheduler } from '../modules/ai-alerts/scheduler.js';
import { runRetention } from '../modules/ai-observability/retention.js';
import { startObservabilityScheduler } from '../modules/ai-observability/scheduler.js';
import { runSummary } from '../modules/ai-observability/summary.js';
import { logger } from '../shared/logger.js';
import { getAiMaintenanceQueues } from './queue.js';
import {
  AI_MAINTENANCE_QUEUE_NAME,
  AI_MANAGED_SCHEDULE_IDS,
  desiredAiSchedules,
  type AiMaintenanceJobData,
  type AiMaintenanceTask,
} from './schedules.js';

/** Runs one maintenance task against the pillar's own DB. */
export async function runMaintenanceTask(db: AiDb, task: AiMaintenanceTask): Promise<void> {
  if (task === 'evaluate-alerts') {
    await runEvaluation(db);
    return;
  }
  runSummary(db);
  runRetention(db);
}

/** A started scheduler, and how it is running. */
export interface AiSchedulerHandle {
  /** `true` when schedules live in Redis, `false` on the interval fallback. */
  readonly durable: boolean;
  stop(): Promise<void>;
}

function startIntervalFallback(db: AiDb): AiSchedulerHandle {
  const stopObservability = startObservabilityScheduler(db);
  const stopAlerts = startAlertsScheduler(db);
  return {
    durable: false,
    stop() {
      stopObservability();
      stopAlerts();
      return Promise.resolve();
    },
  };
}

/**
 * Starts the pillar's maintenance schedulers, durable where it can be.
 *
 * Reconciliation runs on every boot, including when both gates are off: that
 * is what removes a schedule a previous boot registered, so a disabled
 * feature stops firing instead of ticking forever with a worker that ignores
 * it.
 */
export async function startAiSchedulers(db: AiDb): Promise<AiSchedulerHandle> {
  const queues = getAiMaintenanceQueues();
  if (queues === null) return startIntervalFallback(db);

  const desired = desiredAiSchedules();
  const result = await reconcileJobSchedules(queues.queue, {
    desired,
    managedIds: AI_MANAGED_SCHEDULE_IDS,
  });
  logger.info(
    { queue: AI_MAINTENANCE_QUEUE_NAME, ...result },
    '[ai-jobs] reconciled durable schedules'
  );

  const worker = createPillarWorker<AiMaintenanceJobData>({
    queueName: AI_MAINTENANCE_QUEUE_NAME,
    deadLetterQueue: queues.deadLetterQueue,
    logger,
    processor: async (job) => {
      await runMaintenanceTask(db, job.data.task);
    },
  });

  return {
    durable: true,
    async stop() {
      await worker?.close();
    },
  };
}
