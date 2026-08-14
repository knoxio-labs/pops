/**
 * The two claims this package makes that no in-memory double can prove, taken
 * against a real Redis in a throwaway `redis:7-alpine` container:
 *
 *   1. A repeatable schedule is DURABLE — it outlives the process that
 *      registered it, and re-running reconciliation after that "restart"
 *      neither duplicates it nor loses it.
 *   2. A job that exhausts its retries lands in the dead-letter queue by
 *      itself, carrying its payload and failure, and replays back onto the
 *      origin queue from there.
 *
 * Excluded from the default `pnpm test` run (see `vitest.config.ts`); run with
 * `pnpm test:live-seam`, which requires Docker.
 */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEAD_LETTER_JOB_NAME,
  replayDeadLetterJob,
  type DeadLetterJobData,
} from '../dead-letter.js';
import { createPillarQueues, createPillarWorker } from '../queue.js';
import { createJobsConnection } from '../redis.js';
import { reconcileJobSchedules, type DesiredSchedule } from '../scheduler.js';
import { startEphemeralRedis, type EphemeralRedis } from './ephemeral-redis.js';

const FIVE_MINUTES_MS = 300_000;
const NINE_MINUTES_MS = 540_000;

let redis: EphemeralRedis;

beforeAll(async () => {
  redis = await startEphemeralRedis('live-seam');
});

afterAll(async () => {
  await redis.stop();
});

/** A queue handle standing in for one process's view of the shared Redis. */
function openQueue(name: string): { queue: Queue; close: () => Promise<void> } {
  const connection = createJobsConnection(redis.url);
  const queue = new Queue(name, { connection });
  return {
    queue,
    async close() {
      await queue.close();
      await connection.quit();
    },
  };
}

describe('repeatable schedules survive a restart', () => {
  it('is registered once, survives the process, and never doubles up', async () => {
    const queueName = `jobs-live-${randomUUID()}`;
    const scheduleId = 'ai-alerts.evaluate';
    const managedIds = [scheduleId, 'ai-observability.rollup'];
    const desired: DesiredSchedule = {
      id: scheduleId,
      cadence: { every: FIVE_MINUTES_MS },
      jobName: 'evaluate-alerts',
    };

    // ── first boot ──────────────────────────────────────────────────────
    const first = openQueue(queueName);
    const firstRun = await reconcileJobSchedules(first.queue, { desired: [desired], managedIds });
    expect(firstRun.upserted).toEqual([scheduleId]);
    expect(await first.queue.getJobSchedulers()).toHaveLength(1);

    // The process that registered the schedule goes away entirely.
    await first.close();

    // ── restart ─────────────────────────────────────────────────────────
    const second = openQueue(queueName);
    try {
      const survived = await second.queue.getJobSchedulers();
      expect(survived).toHaveLength(1);
      expect(survived[0]?.key).toBe(scheduleId);
      expect(Number(survived[0]?.every)).toBe(FIVE_MINUTES_MS);

      // Booting again reconciles rather than re-registers: same one schedule.
      const secondRun = await reconcileJobSchedules(second.queue, {
        desired: [desired],
        managedIds,
      });
      expect(secondRun.upserted).toEqual([]);
      expect(secondRun.unchanged).toEqual([scheduleId]);
      expect(await second.queue.getJobSchedulers()).toHaveLength(1);

      // A cadence change replaces in place instead of adding a second.
      const changed = await reconcileJobSchedules(second.queue, {
        desired: [{ ...desired, cadence: { every: NINE_MINUTES_MS } }],
        managedIds,
      });
      expect(changed.upserted).toEqual([scheduleId]);
      const afterChange = await second.queue.getJobSchedulers();
      expect(afterChange).toHaveLength(1);
      expect(Number(afterChange[0]?.every)).toBe(NINE_MINUTES_MS);

      // Turning the feature gate off removes the schedule rather than
      // leaving an orphan firing with nothing listening.
      const disabled = await reconcileJobSchedules(second.queue, { desired: [], managedIds });
      expect(disabled.removed).toEqual([scheduleId]);
      expect(await second.queue.getJobSchedulers()).toHaveLength(0);
    } finally {
      await second.close();
    }
  });

  it('actually enqueues occurrences, not just a scheduler record', async () => {
    const queueName = `jobs-live-fire-${randomUUID()}`;
    const scheduleId = 'fast.tick';
    const opened = openQueue(queueName);

    try {
      await reconcileJobSchedules(opened.queue, {
        desired: [{ id: scheduleId, cadence: { every: 200 }, jobName: 'tick' }],
        managedIds: [scheduleId],
      });

      // The first occurrence is enqueued immediately, the rest every 200ms;
      // a second is many cadences and needs no polling loop to be reliable.
      await sleep(1_000);

      const counts = await opened.queue.getJobCounts('waiting', 'delayed');
      expect((counts['waiting'] ?? 0) + (counts['delayed'] ?? 0)).toBeGreaterThan(0);
    } finally {
      await opened.queue.removeJobScheduler(scheduleId).catch(() => false);
      await opened.close();
    }
  });
});

describe('retry exhaustion dead-letters and replays', () => {
  it('moves an exhausted job into the dead-letter queue and back again', async () => {
    const queueName = `jobs-live-dlq-${randomUUID()}`;
    const queues = createPillarQueues<{ marker: string }>({
      name: queueName,
      redisUrl: redis.url,
      jobOptions: { attempts: 1 },
    });
    if (queues === null) throw new Error('createPillarQueues returned null with a real Redis URL');

    const worker = createPillarWorker<{ marker: string }>({
      queueName,
      redisUrl: redis.url,
      deadLetterQueue: queues.deadLetterQueue,
      processor: () => {
        throw new Error('always fails');
      },
    });
    if (worker === null) throw new Error('createPillarWorker returned null with a real Redis URL');

    try {
      await queues.queue.add('doomed', { marker: 'payload' });

      const parked = await waitForDeadLetter(queues.deadLetterQueue);
      expect(parked.name).toBe(DEAD_LETTER_JOB_NAME);
      expect(parked.data.originQueue).toBe(queueName);
      expect(parked.data.originJobName).toBe('doomed');
      expect(parked.data.originData).toEqual({ marker: 'payload' });
      expect(parked.data.failedReason).toBe('always fails');
      expect(parked.data.attemptsMade).toBe(1);

      // Stop consuming before the replay so the re-enqueued job stays put
      // and can be observed rather than immediately failing again.
      await worker.close();

      const parkedId = parked.id;
      if (parkedId === undefined) throw new Error('dead-lettered job has no id');
      const replay = await replayDeadLetterJob({
        deadLetterQueue: queues.deadLetterQueue,
        originQueue: queues.queue,
        jobId: parkedId,
      });

      expect(replay.originQueue).toBe(queueName);
      expect(await queues.deadLetterQueue.getJob(parkedId)).toBeUndefined();

      const waiting = await queues.queue.getJobs(['waiting'], 0, 10);
      expect(waiting.map((job) => job.name)).toContain('doomed');
    } finally {
      await worker.close().catch(() => {});
      await queues.close();
    }
  });
});

/** Polls the dead-letter queue until the forwarder has written to it. */
async function waitForDeadLetter(
  deadLetterQueue: Queue<DeadLetterJobData>
): Promise<{ id: string | undefined; name: string; data: DeadLetterJobData }> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const [job] = await deadLetterQueue.getJobs(['waiting', 'active', 'delayed'], 0, 0);
    if (job !== undefined) return { id: job.id, name: job.name, data: job.data };
    await sleep(100);
  }
  throw new Error('No job reached the dead-letter queue within 20s');
}
