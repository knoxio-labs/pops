/**
 * The ai pillar's maintenance queue, pillar-side.
 *
 * Lazy singleton so the REST handlers and the scheduler runner share one
 * connection, and `null` when Redis is unconfigured — which is the default
 * for this pillar. Nothing about importing this file requires Redis; the
 * degraded path is the normal one.
 */
import { createPillarQueues, type PillarQueues } from '@pops/pillar-jobs';

import { AI_MAINTENANCE_QUEUE_NAME, type AiMaintenanceJobData } from './schedules.js';

let queues: PillarQueues<AiMaintenanceJobData> | null = null;
let resolved = false;

/** The queue pair, or `null` when this pillar has no Redis. */
export function getAiMaintenanceQueues(): PillarQueues<AiMaintenanceJobData> | null {
  if (resolved) return queues;
  queues = createPillarQueues<AiMaintenanceJobData>({ name: AI_MAINTENANCE_QUEUE_NAME });
  resolved = true;
  return queues;
}

/** Closes the queue pair and forgets it, so a later call re-resolves. */
export async function closeAiMaintenanceQueues(): Promise<void> {
  await queues?.close();
  queues = null;
  resolved = false;
}
