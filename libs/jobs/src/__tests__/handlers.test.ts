import { describe, expect, it } from 'vitest';

import {
  JobsUnavailableError,
  NoDeadLetterQueueError,
  UnknownQueueError,
  makeJobsHandlers,
} from '../handlers.js';
import { FakeJob, FakeQueue } from './fakes.js';

import type { DeadLetterJobData } from '../dead-letter.js';

const PARKED: DeadLetterJobData = {
  originQueue: 'ai.maintenance',
  originJobId: '1',
  originJobName: 'evaluate-alerts',
  originData: { scope: 'all' },
  failedReason: 'boom',
  stacktrace: [],
  attemptsMade: 3,
  failedAt: '2026-08-13T00:00:00.000Z',
};

function primaryQueue(): FakeQueue {
  return new FakeQueue('ai.maintenance', [
    new FakeJob({ id: '1', data: {}, state: 'failed' }),
    new FakeJob({ id: '2', data: {}, state: 'waiting' }),
  ]);
}

describe('makeJobsHandlers with no Redis', () => {
  const handlers = makeJobsHandlers({ queues: [] });

  it('503-signals every read rather than reporting an empty, healthy queue', async () => {
    expect(() => handlers.queues()).toThrow(JobsUnavailableError);
    await expect(handlers.stats()).rejects.toThrow(JobsUnavailableError);
    await expect(handlers.list({})).rejects.toThrow(JobsUnavailableError);
    await expect(handlers.get({ id: '1' })).rejects.toThrow(JobsUnavailableError);
  });
});

describe('makeJobsHandlers queue selection', () => {
  it('answers an omitted selector from the primary queue and says which answered', async () => {
    const handlers = makeJobsHandlers({
      queues: [{ queue: primaryQueue() }, { queue: new FakeQueue('ai.secondary') }],
    });

    const result = await handlers.list({});

    expect(result.queue).toBe('ai.maintenance');
    expect(result.jobs.map((job) => job.id)).toEqual(['1', '2']);
  });

  it('routes to a named queue', async () => {
    const handlers = makeJobsHandlers({
      queues: [{ queue: primaryQueue() }, { queue: new FakeQueue('ai.secondary') }],
    });

    expect((await handlers.list({ queue: 'ai.secondary' })).queue).toBe('ai.secondary');
  });

  it('names the queues it does own when asked for one it does not', async () => {
    const handlers = makeJobsHandlers({ queues: [{ queue: primaryQueue() }] });

    await expect(handlers.list({ queue: 'food.ingest' })).rejects.toThrow(UnknownQueueError);
    await expect(handlers.list({ queue: 'food.ingest' })).rejects.toThrow(/owns: ai.maintenance/);
  });

  it('lists the queues this pillar owns, primary first', () => {
    const handlers = makeJobsHandlers({
      queues: [{ queue: primaryQueue() }, { queue: new FakeQueue('ai.secondary') }],
    });

    expect(handlers.queues()).toEqual({ queues: ['ai.maintenance', 'ai.secondary'] });
  });
});

describe('makeJobsHandlers stats', () => {
  it('reports every queue, with dead-letter depth where there is one', async () => {
    const handlers = makeJobsHandlers({
      queues: [
        {
          queue: primaryQueue(),
          deadLetterQueue: new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter', [
            new FakeJob({ id: 'dl-1', data: PARKED, state: 'waiting' }),
          ]),
        },
        { queue: new FakeQueue('ai.secondary') },
      ],
    });

    const { queues } = await handlers.stats();

    expect(queues.map((stats) => stats.queue)).toEqual(['ai.maintenance', 'ai.secondary']);
    expect(queues[0]?.deadLetter).toEqual({ queue: 'ai.maintenance.dead-letter', count: 1 });
    expect(queues[0]?.counts.failed).toBe(1);
    expect(queues[1]?.deadLetter).toBeNull();
  });
});

describe('makeJobsHandlers dead-letter surface', () => {
  it('lists parked jobs and names both the dead-letter and the origin queue', async () => {
    const handlers = makeJobsHandlers({
      queues: [
        {
          queue: primaryQueue(),
          deadLetterQueue: new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter', [
            new FakeJob({ id: 'dl-1', data: PARKED, state: 'waiting' }),
          ]),
        },
      ],
    });

    const result = await handlers.listDeadLetter({});

    expect(result.queue).toBe('ai.maintenance.dead-letter');
    expect(result.originQueue).toBe('ai.maintenance');
    expect(result.jobs.map((job) => job.id)).toEqual(['dl-1']);
  });

  it('replays a parked job back onto its origin queue', async () => {
    const origin = primaryQueue();
    const handlers = makeJobsHandlers({
      queues: [
        {
          queue: origin,
          deadLetterQueue: new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter', [
            new FakeJob({ id: 'dl-1', data: PARKED, state: 'waiting' }),
          ]),
        },
      ],
    });

    const result = await handlers.replayDeadLetter({ id: 'dl-1' });

    expect(result.originQueue).toBe('ai.maintenance');
    expect(origin.adds).toEqual([
      { name: 'evaluate-alerts', data: { scope: 'all' }, opts: undefined },
    ]);
  });

  it('refuses a dead-letter read on a queue that has no dead-letter sibling', async () => {
    const handlers = makeJobsHandlers({ queues: [{ queue: primaryQueue() }] });

    await expect(handlers.listDeadLetter({})).rejects.toThrow(NoDeadLetterQueueError);
    await expect(handlers.replayDeadLetter({ id: 'dl-1' })).rejects.toThrow(NoDeadLetterQueueError);
  });
});

describe('makeJobsHandlers mutations', () => {
  it('cancels through to the selected queue', async () => {
    const queue = primaryQueue();
    const handlers = makeJobsHandlers({ queues: [{ queue }] });

    expect(await handlers.cancel({ id: '2' })).toEqual({ id: '2', cancelled: true });
  });

  it('drains the selected queue and forwards the delayed flag', async () => {
    const queue = primaryQueue();
    const handlers = makeJobsHandlers({ queues: [{ queue }] });

    expect(await handlers.drain({ delayed: false })).toEqual({
      queue: 'ai.maintenance',
      removed: 1,
    });
    expect(queue.drains).toEqual([false]);
  });
});
