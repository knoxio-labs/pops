/**
 * What the ai pillar wants scheduled, derived from the same env gates the
 * interval loops always read.
 *
 * Kept as a pure function of the environment so the gate logic is testable
 * without Redis, and so reconciliation has one place to ask "what should be
 * registered right now" — a gate flipped off produces a shorter desired set,
 * which is what makes the stale schedule get removed rather than orphaned.
 */
import type { DesiredSchedule } from '@pops/pillar-jobs';

/** The queue the pillar's own maintenance work runs on. */
export const AI_MAINTENANCE_QUEUE_NAME = 'ai.maintenance';

/** The tasks a maintenance job can carry. The worker switches on this. */
export const AI_MAINTENANCE_TASKS = ['evaluate-alerts', 'rollup-observability'] as const;

export type AiMaintenanceTask = (typeof AI_MAINTENANCE_TASKS)[number];

/** Payload of every job on {@link AI_MAINTENANCE_QUEUE_NAME}. */
export interface AiMaintenanceJobData {
  readonly task: AiMaintenanceTask;
}

/**
 * Scheduler ids. These are the DURABILITY KEYS — they live in Redis and
 * identify a schedule across restarts, so renaming one strands the old
 * schedule under its old id until a reconciliation that still manages it
 * removes it. Change them only together with a migration.
 */
export const ALERTS_SCHEDULE_ID = 'ai-alerts.evaluate';
export const OBSERVABILITY_SCHEDULE_ID = 'ai-observability.rollup';

/**
 * Every id this pillar may register. Reconciliation removes ids in this set
 * that are no longer wanted, and leaves everything outside it alone.
 */
export const AI_MANAGED_SCHEDULE_IDS = [ALERTS_SCHEDULE_ID, OBSERVABILITY_SCHEDULE_ID];

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Cadences, matching what the interval loops used. */
export const ALERTS_INTERVAL_MS = FIVE_MINUTES_MS;
export const OBSERVABILITY_INTERVAL_MS = ONE_HOUR_MS;

/** Env slice the gates are read from. */
export type SchedulerEnv = Readonly<Record<string, string | undefined>>;

export const ALERTS_GATE_ENV = 'AI_ALERTS_SCHEDULER_ENABLED';
export const OBSERVABILITY_GATE_ENV = 'AI_OBSERVABILITY_SCHEDULER_ENABLED';

/** The schedules the pillar wants given the current gates. */
export function desiredAiSchedules(
  env: SchedulerEnv = process.env
): DesiredSchedule<AiMaintenanceJobData>[] {
  const desired: DesiredSchedule<AiMaintenanceJobData>[] = [];
  if (env[ALERTS_GATE_ENV] === 'true') {
    desired.push({
      id: ALERTS_SCHEDULE_ID,
      cadence: { every: ALERTS_INTERVAL_MS },
      jobName: 'evaluate-alerts',
      data: { task: 'evaluate-alerts' },
    });
  }
  if (env[OBSERVABILITY_GATE_ENV] === 'true') {
    desired.push({
      id: OBSERVABILITY_SCHEDULE_ID,
      cadence: { every: OBSERVABILITY_INTERVAL_MS },
      jobName: 'rollup-observability',
      data: { task: 'rollup-observability' },
    });
  }
  return desired;
}
