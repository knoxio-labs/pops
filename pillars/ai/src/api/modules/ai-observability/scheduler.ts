/**
 * The DEGRADED scheduler for the AI observability summary and inference-log
 * retention jobs: a self-contained `setInterval` loop calling the idempotent
 * `runSummary` / `runRetention` service functions directly against the
 * pillar's own DB handle. OFF unless `AI_OBSERVABILITY_SCHEDULER_ENABLED=true`.
 *
 * With Redis configured the pillar runs these as durable repeatable jobs
 * instead (`src/api/jobs/runner.ts`), which is what survives a restart. This
 * loop is what remains when there is no Redis — it fires on a relative
 * interval from process start, so a deploy resets its clock.
 */
import { type AiDb } from '../../../db/index.js';
import { logger } from '../../shared/logger.js';
import { runRetention } from './retention.js';
import { runSummary } from './summary.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Default cadence: hourly. Both jobs are idempotent so a coarse interval
 * is safe — the summary refreshes the cached envelope and the retention
 * pass is a no-op when nothing has aged out. */
export const OBSERVABILITY_SCHEDULER_INTERVAL_MS = ONE_HOUR_MS;

export interface ObservabilitySchedulerOptions {
  /** Override the tick cadence (used by tests). */
  intervalMs?: number;
}

/**
 * Start the env-gated observability scheduler. Returns a stop function.
 * When the env gate is off, returns a no-op stop function and never
 * arms a timer.
 */
export function startObservabilityScheduler(
  db: AiDb,
  opts: ObservabilitySchedulerOptions = {}
): () => void {
  if (process.env['AI_OBSERVABILITY_SCHEDULER_ENABLED'] !== 'true') {
    return () => {};
  }

  const intervalMs = opts.intervalMs ?? OBSERVABILITY_SCHEDULER_INTERVAL_MS;

  const tick = (): void => {
    try {
      runSummary(db);
      runRetention(db);
    } catch (err) {
      logger.error({ err }, '[ai-observability-scheduler] tick failed');
    }
  };

  const timer = setInterval(tick, intervalMs);
  // Don't keep the event loop alive on account of the scheduler.
  timer.unref();

  logger.info(
    { intervalMs },
    '[ai-observability-scheduler] started (AI_OBSERVABILITY_SCHEDULER_ENABLED=true)'
  );

  return () => {
    clearInterval(timer);
  };
}
