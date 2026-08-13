import { describe, expect, it } from 'vitest';

import {
  JobNotFoundError,
  JobStateConflictError,
  cancelJob,
  drainQueue,
  getJobSummary,
  listJobs,
  queueStats,
  retryJob,
  toJobSummary,
} from '../admin.js';
import { FakeJob, FakeQueue } from './fakes.js';

function job(id: string, state: string): FakeJob {
  return new FakeJob({ id, data: { id }, state });
}

describe('toJobSummary', () => {
  it('projects bullmq epoch millis onto ISO 8601 and nulls the unset ones', () => {
    const summary = toJobSummary(
      'ai.maintenance',
      new FakeJob({
        id: '1',
        name: 'evaluate-alerts',
        data: { scope: 'all' },
        attemptsMade: 2,
        failedReason: 'boom',
        stacktrace: ['at evaluate'],
        timestamp: Date.parse('2026-08-13T00:00:00.000Z'),
        processedOn: Date.parse('2026-08-13T00:00:01.000Z'),
        progress: 50,
      }),
      'failed'
    );

    expect(summary).toEqual({
      id: '1',
      name: 'evaluate-alerts',
      queue: 'ai.maintenance',
      state: 'failed',
      attemptsMade: 2,
      data: { scope: 'all' },
      progress: 50,
      failedReason: 'boom',
      stacktrace: ['at evaluate'],
      createdAt: '2026-08-13T00:00:00.000Z',
      processedAt: '2026-08-13T00:00:01.000Z',
      finishedAt: null,
    });
  });
});

describe('listJobs', () => {
  it('filters by state and reports the total for those states only', async () => {
    const queue = new FakeQueue('ai.maintenance', [
      job('1', 'failed'),
      job('2', 'completed'),
      job('3', 'failed'),
    ]);

    const result = await listJobs(queue, { states: ['failed'] });

    expect(result.jobs.map((j) => j.id)).toEqual(['1', '3']);
    expect(result.total).toBe(2);
    expect(result.jobs.every((j) => j.state === 'failed')).toBe(true);
  });

  it('translates offset/limit into bullmq’s inclusive range', async () => {
    const queue = new FakeQueue(
      'ai.maintenance',
      ['1', '2', '3', '4', '5'].map((id) => job(id, 'waiting'))
    );

    const page = await listJobs(queue, { states: ['waiting'], offset: 1, limit: 2 });

    expect(page.jobs.map((j) => j.id)).toEqual(['2', '3']);
    expect(page.total).toBe(5);
  });

  it('covers every state when none is named', async () => {
    const queue = new FakeQueue('ai.maintenance', [job('1', 'failed'), job('2', 'completed')]);

    const result = await listJobs(queue);

    expect(result.jobs.map((j) => j.id)).toEqual(['1', '2']);
    expect(result.total).toBe(2);
  });
});

describe('getJobSummary', () => {
  it('names the queue and the id when the job is gone', async () => {
    await expect(getJobSummary(new FakeQueue('ai.maintenance'), '404')).rejects.toThrow(
      JobNotFoundError
    );
  });
});

describe('retryJob', () => {
  it('retries a failed job from its finished state', async () => {
    const failed = job('1', 'failed');
    const queue = new FakeQueue('ai.maintenance', [failed]);

    const summary = await retryJob(queue, '1');

    expect(failed.retriedFrom).toBe('failed');
    expect(summary.state).toBe('waiting');
  });

  it('refuses a job that is still waiting — it has not run yet', async () => {
    const queue = new FakeQueue('ai.maintenance', [job('1', 'waiting')]);

    await expect(retryJob(queue, '1')).rejects.toThrow(JobStateConflictError);
  });

  it('refuses a job that is being processed right now', async () => {
    const queue = new FakeQueue('ai.maintenance', [job('1', 'active')]);

    await expect(retryJob(queue, '1')).rejects.toThrow(/is active and cannot be retried/);
  });
});

describe('cancelJob', () => {
  it('removes a waiting job', async () => {
    const waiting = job('1', 'waiting');
    const queue = new FakeQueue('ai.maintenance', [waiting]);

    expect(await cancelJob(queue, '1')).toEqual({ id: '1', cancelled: true });
    expect(waiting.removed).toBe(true);
  });

  it('refuses an active job instead of letting bullmq throw a lock error', async () => {
    const active = job('1', 'active');
    const queue = new FakeQueue('ai.maintenance', [active]);

    await expect(cancelJob(queue, '1')).rejects.toThrow(/is active and cannot be cancelled/);
    expect(active.removed).toBe(false);
  });

  it('reports a missing job rather than succeeding vacuously', async () => {
    await expect(cancelJob(new FakeQueue('ai.maintenance'), 'gone')).rejects.toThrow(
      JobNotFoundError
    );
  });
});

describe('drainQueue', () => {
  it('counts what it destroyed, waiting plus delayed by default', async () => {
    const queue = new FakeQueue('ai.maintenance', [
      job('1', 'waiting'),
      job('2', 'delayed'),
      job('3', 'completed'),
    ]);

    expect(await drainQueue(queue)).toEqual({ queue: 'ai.maintenance', removed: 2 });
    expect(queue.drains).toEqual([true]);
  });

  it('excludes delayed jobs from the count when it was told to leave them', async () => {
    const queue = new FakeQueue('ai.maintenance', [job('1', 'waiting'), job('2', 'delayed')]);

    expect(await drainQueue(queue, { delayed: false })).toEqual({
      queue: 'ai.maintenance',
      removed: 1,
    });
    expect(queue.drains).toEqual([false]);
  });
});

describe('queueStats', () => {
  it('zero-fills every state a queue currently has none of', async () => {
    const stats = await queueStats(new FakeQueue('ai.maintenance', [job('1', 'failed')]));

    expect(stats).toEqual({
      queue: 'ai.maintenance',
      counts: { waiting: 0, active: 0, completed: 0, failed: 1, delayed: 0, paused: 0 },
      deadLetter: null,
    });
  });

  it('counts parked dead-letter jobs, which sit unconsumed in waiting', async () => {
    const stats = await queueStats(
      new FakeQueue('ai.maintenance'),
      new FakeQueue('ai.maintenance.dead-letter', [job('1', 'waiting'), job('2', 'waiting')])
    );

    expect(stats.deadLetter).toEqual({ queue: 'ai.maintenance.dead-letter', count: 2 });
  });

  it('does not count a dead-letter job that has already been replayed away', async () => {
    const stats = await queueStats(
      new FakeQueue('ai.maintenance'),
      new FakeQueue('ai.maintenance.dead-letter', [job('1', 'completed')])
    );

    expect(stats.deadLetter).toEqual({ queue: 'ai.maintenance.dead-letter', count: 0 });
  });
});
