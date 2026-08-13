import { describe, expect, it } from 'vitest';

import {
  DEAD_LETTER_JOB_NAME,
  DeadLetterReplayError,
  buildDeadLetterJobData,
  createDeadLetterForwarder,
  deadLetterQueueName,
  isDeadLetterQueueName,
  isRetryExhausted,
  originQueueName,
  replayDeadLetterJob,
  type DeadLetterJobData,
} from '../dead-letter.js';
import { FakeJob, FakeQueue } from './fakes.js';

const AT = new Date('2026-08-13T00:00:00.000Z');

describe('dead-letter queue naming', () => {
  it('round-trips an origin queue name', () => {
    const dlq = deadLetterQueueName('ai.maintenance');
    expect(dlq).toBe('ai.maintenance.dead-letter');
    expect(isDeadLetterQueueName(dlq)).toBe(true);
    expect(originQueueName(dlq)).toBe('ai.maintenance');
  });

  it('does not mistake a plain queue for a dead-letter queue', () => {
    expect(isDeadLetterQueueName('ai.maintenance')).toBe(false);
    expect(originQueueName('ai.maintenance')).toBeNull();
  });

  it('rejects a bare suffix with no origin in front of it', () => {
    expect(isDeadLetterQueueName('.dead-letter')).toBe(false);
    expect(originQueueName('.dead-letter')).toBeNull();
  });
});

describe('isRetryExhausted', () => {
  it('treats a job with no attempts option as single-shot', () => {
    expect(isRetryExhausted({ attemptsMade: 1, opts: {} })).toBe(true);
    expect(isRetryExhausted({ attemptsMade: 0, opts: {} })).toBe(false);
  });

  it('is false while an attempt remains and true on the last one', () => {
    expect(isRetryExhausted({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(false);
    expect(isRetryExhausted({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(true);
  });
});

describe('createDeadLetterForwarder', () => {
  it('forwards an exhausted job with its payload, reason, stack and attempt count', async () => {
    const deadLetterQueue = new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter');
    const forward = createDeadLetterForwarder({
      originQueue: 'ai.maintenance',
      deadLetterQueue,
      now: () => AT,
    });

    const forwarded = await forward(
      new FakeJob({
        id: '42',
        name: 'evaluate-alerts',
        data: { scope: 'all' },
        attempts: 3,
        attemptsMade: 3,
        failedReason: 'boom',
        stacktrace: ['at evaluate'],
      }),
      new Error('boom')
    );

    expect(forwarded).toBe(true);
    expect(deadLetterQueue.adds).toEqual([
      {
        name: DEAD_LETTER_JOB_NAME,
        opts: { attempts: 1 },
        data: {
          originQueue: 'ai.maintenance',
          originJobId: '42',
          originJobName: 'evaluate-alerts',
          originData: { scope: 'all' },
          failedReason: 'boom',
          stacktrace: ['at evaluate'],
          attemptsMade: 3,
          failedAt: AT.toISOString(),
        },
      },
    ]);
  });

  it('leaves a job that still has an attempt left in the origin queue', async () => {
    const deadLetterQueue = new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter');
    const forward = createDeadLetterForwarder({
      originQueue: 'ai.maintenance',
      deadLetterQueue,
    });

    const forwarded = await forward(
      new FakeJob({ id: '1', data: {}, attempts: 3, attemptsMade: 1 }),
      new Error('transient')
    );

    expect(forwarded).toBe(false);
    expect(deadLetterQueue.adds).toEqual([]);
  });

  it('is inert when the pillar has no dead-letter queue', async () => {
    const forward = createDeadLetterForwarder({
      originQueue: 'ai.maintenance',
      deadLetterQueue: null,
    });

    const forwarded = await forward(
      new FakeJob({ id: '1', data: {}, attempts: 1, attemptsMade: 1 }),
      new Error('x')
    );

    expect(forwarded).toBe(false);
  });

  it('ignores a failure event that carries no job', async () => {
    const deadLetterQueue = new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter');
    const forward = createDeadLetterForwarder({
      originQueue: 'ai.maintenance',
      deadLetterQueue,
    });

    expect(await forward(undefined, new Error('worker-level failure'))).toBe(false);
    expect(deadLetterQueue.adds).toEqual([]);
  });

  it('falls back to the error message when bullmq has not stamped failedReason yet', () => {
    const record = buildDeadLetterJobData(
      'ai.maintenance',
      new FakeJob({ id: '7', data: {}, attemptsMade: 1 }),
      new Error('late failure'),
      AT
    );

    expect(record.failedReason).toBe('late failure');
    expect(record.stacktrace).toEqual([]);
  });
});

describe('replayDeadLetterJob', () => {
  const payload: DeadLetterJobData = {
    originQueue: 'ai.maintenance',
    originJobId: '42',
    originJobName: 'evaluate-alerts',
    originData: { scope: 'all' },
    failedReason: 'boom',
    stacktrace: [],
    attemptsMade: 3,
    failedAt: AT.toISOString(),
  };

  it('re-enqueues the original job onto its origin queue and drops the copy', async () => {
    const parked = new FakeJob<DeadLetterJobData>({ id: 'dl-1', data: payload });
    const deadLetterQueue = new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter', [
      parked,
    ]);
    const originQueue = new FakeQueue('ai.maintenance');

    const result = await replayDeadLetterJob({ deadLetterQueue, originQueue, jobId: 'dl-1' });

    expect(originQueue.adds).toEqual([
      { name: 'evaluate-alerts', data: { scope: 'all' }, opts: undefined },
    ]);
    expect(parked.removed).toBe(true);
    expect(result).toEqual({
      deadLetterJobId: 'dl-1',
      originQueue: 'ai.maintenance',
      replayedJobId: 'added-1',
    });
  });

  it('refuses an id the dead-letter queue does not hold', async () => {
    await expect(
      replayDeadLetterJob({
        deadLetterQueue: new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter'),
        originQueue: new FakeQueue('ai.maintenance'),
        jobId: 'missing',
      })
    ).rejects.toThrow(DeadLetterReplayError);
  });

  it('refuses a payload that is not a dead-letter record', async () => {
    // A payload that round-tripped through Redis before this shape existed:
    // the runtime guard is the only thing standing between it and a replay.
    const parked = new FakeJob({ id: 'dl-1', data: { nonsense: true } });

    await expect(
      replayDeadLetterJob({
        deadLetterQueue: new FakeQueue('ai.maintenance.dead-letter', [parked]),
        originQueue: new FakeQueue('ai.maintenance'),
        jobId: 'dl-1',
      })
    ).rejects.toThrow(/does not carry a replayable payload/);
  });

  it('refuses to replay onto a queue the job did not come from', async () => {
    const parked = new FakeJob<DeadLetterJobData>({ id: 'dl-1', data: payload });
    const deadLetterQueue = new FakeQueue<DeadLetterJobData>('ai.maintenance.dead-letter', [
      parked,
    ]);
    const wrongOrigin = new FakeQueue('food.ingest');

    await expect(
      replayDeadLetterJob({ deadLetterQueue, originQueue: wrongOrigin, jobId: 'dl-1' })
    ).rejects.toThrow(/belongs to queue 'ai.maintenance'/);
    expect(wrongOrigin.adds).toEqual([]);
    expect(parked.removed).toBe(false);
  });
});
