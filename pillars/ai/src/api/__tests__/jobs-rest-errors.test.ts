/**
 * The mounted `/jobs` surface once a queue exists — every branch of
 * `translate()` in `../rest/jobs-handlers.ts` other than the no-Redis 503,
 * which `jobs-rest.test.ts` already pins.
 *
 * `getAiMaintenanceQueues` is mocked rather than pointed at a real Redis:
 * `JobsHandlerDeps.queues` (see `../rest/jobs-handlers.ts`) reads it through a
 * getter evaluated on every request, and a fake `JobQueuePort` can raise each
 * `@pops/pillar-jobs` error on demand. Every case is driven through the real
 * express app via the shared supertest transport, exactly like the 503 suite.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { AI_MAINTENANCE_QUEUE_NAME } from '../jobs/schedules.js';
import { createTestTransport } from './test-http.js';

import type { DeadLetterJobData, JobQueuePort, JobRecord } from '@pops/pillar-jobs';

interface FakeQueues {
  readonly queue: JobQueuePort;
  readonly deadLetterQueue: JobQueuePort<DeadLetterJobData> | null;
}

const mocks = vi.hoisted(() => ({ current: null as FakeQueues | null }));

vi.mock('../jobs/queue.js', () => ({
  getAiMaintenanceQueues: () => mocks.current,
  closeAiMaintenanceQueues: async () => {},
}));

function fakeJob<Data>(
  overrides: Partial<JobRecord<Data>> & { id: string; data: Data }
): JobRecord<Data> {
  return {
    name: 'job',
    attemptsMade: 0,
    timestamp: Date.now(),
    getState: async () => 'waiting',
    remove: async () => {},
    retry: async () => {},
    ...overrides,
  };
}

function fakeQueue<Data = unknown>(
  name: string,
  overrides: Partial<JobQueuePort<Data>> = {}
): JobQueuePort<Data> {
  return {
    name,
    add: async () => {
      throw new Error('fakeQueue.add is not implemented for this test');
    },
    getJob: async () => undefined,
    getJobs: async () => [],
    getJobCounts: async () => ({}),
    drain: async () => {},
    ...overrides,
  };
}

const OTHER_QUEUE_NAME = 'ai.other';

let tmpDir: string;
let aiDb: OpenedAiDb;
let app: ReturnType<typeof createAiApiApp>;

const { requestOn } = createTestTransport();

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-jobs-rest-errors-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  mocks.current = null;
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('UnknownQueueError -> 404', () => {
  it('names the queue the caller asked for, not the one it owns', async () => {
    mocks.current = { queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME), deadLetterQueue: null };

    const res = await requestOn(app).get('/jobs').query({ queue: 'bogus-queue' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Queue 'bogus-queue' not found", code: 'NotFoundError' });
  });
});

describe('NoDeadLetterQueueError -> 404', () => {
  it('reports the owning queue when it has no dead-letter sibling', async () => {
    mocks.current = { queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME), deadLetterQueue: null };

    const res = await requestOn(app).get('/jobs/dead-letter');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      message: `Dead-letter queue for '${AI_MAINTENANCE_QUEUE_NAME}' not found`,
      code: 'NotFoundError',
    });
  });
});

describe('JobNotFoundError -> 404', () => {
  it('names the bare job id, not a sentence', async () => {
    mocks.current = { queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME), deadLetterQueue: null };

    const res = await requestOn(app).get('/jobs/missing-job-id');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Job 'missing-job-id' not found", code: 'NotFoundError' });
  });
});

describe('JobStateConflictError -> 409', () => {
  it('refuses to retry a job that is still waiting', async () => {
    const job = fakeJob({ id: 'job-1', data: {}, getState: async () => 'waiting' });
    mocks.current = {
      queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME, { getJob: async () => job }),
      deadLetterQueue: null,
    };

    const res = await requestOn(app).post('/jobs/job-1/retry').send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: `Job 'job-1' on queue '${AI_MAINTENANCE_QUEUE_NAME}' is waiting and cannot be retried`,
      code: 'ConflictError',
    });
  });

  it('refuses to cancel a job that is already active', async () => {
    const job = fakeJob({ id: 'job-2', data: {}, getState: async () => 'active' });
    mocks.current = {
      queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME, { getJob: async () => job }),
      deadLetterQueue: null,
    };

    const res = await requestOn(app).post('/jobs/job-2/cancel').send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: `Job 'job-2' on queue '${AI_MAINTENANCE_QUEUE_NAME}' is active and cannot be cancelled`,
      code: 'ConflictError',
    });
  });
});

describe('DeadLetterReplayError -> missing is 404, malformed/foreign are 409', () => {
  it('answers 404 with the bare identifier when no such dead-letter job exists', async () => {
    mocks.current = {
      queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME),
      deadLetterQueue: fakeQueue<DeadLetterJobData>(`${AI_MAINTENANCE_QUEUE_NAME}.dead-letter`),
    };

    const res = await requestOn(app).post('/jobs/dead-letter/absent-id/replay').send({});

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      message: "Dead-letter job 'absent-id' not found",
      code: 'NotFoundError',
    });
  });

  it('answers 409, not 400, when the parked payload fails validation', async () => {
    // Type-valid but schema-invalid: `originJobName` violates `.min(1)` and
    // `attemptsMade` violates `.nonnegative()` — constraints zod enforces at
    // parse time that the static `DeadLetterJobData` type cannot express.
    const malformed: DeadLetterJobData = {
      originQueue: AI_MAINTENANCE_QUEUE_NAME,
      originJobId: null,
      originJobName: '',
      originData: null,
      failedReason: null,
      stacktrace: [],
      attemptsMade: -1,
      failedAt: '',
    };
    const job = fakeJob<DeadLetterJobData>({ id: 'dlq-1', data: malformed });
    mocks.current = {
      queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME),
      deadLetterQueue: fakeQueue<DeadLetterJobData>(`${AI_MAINTENANCE_QUEUE_NAME}.dead-letter`, {
        getJob: async () => job,
      }),
    };

    const res = await requestOn(app).post('/jobs/dead-letter/dlq-1/replay').send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: "Dead-letter job 'dlq-1' does not carry a replayable payload",
      code: 'ConflictError',
    });
  });

  it('answers 409 when the dead-letter job belongs to a different origin queue', async () => {
    const foreign: DeadLetterJobData = {
      originQueue: OTHER_QUEUE_NAME,
      originJobId: 'origin-1',
      originJobName: 'do-thing',
      originData: {},
      failedReason: null,
      stacktrace: [],
      attemptsMade: 3,
      failedAt: new Date().toISOString(),
    };
    const job = fakeJob<DeadLetterJobData>({ id: 'dlq-2', data: foreign });
    mocks.current = {
      queue: fakeQueue(AI_MAINTENANCE_QUEUE_NAME),
      deadLetterQueue: fakeQueue<DeadLetterJobData>(`${AI_MAINTENANCE_QUEUE_NAME}.dead-letter`, {
        getJob: async () => job,
      }),
    };

    const res = await requestOn(app).post('/jobs/dead-letter/dlq-2/replay').send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: `Dead-letter job 'dlq-2' belongs to queue '${OTHER_QUEUE_NAME}', not '${AI_MAINTENANCE_QUEUE_NAME}'`,
      code: 'ConflictError',
    });
  });
});
