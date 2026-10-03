import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueueClassify } from './pipeline-stages.js';
import { type ClassifyEngramJobData } from './queue.js';

let redis: Redis;
let queue: Queue<ClassifyEngramJobData>;

beforeEach(() => {
  redis = new Redis({ lazyConnect: true, maxRetriesPerRequest: null });
  queue = new Queue<ClassifyEngramJobData>('enqueue-classify-test', { connection: redis });
});

afterEach(() => {
  redis.disconnect();
});

describe('enqueueClassify', () => {
  it('omits force by default', async () => {
    const add = vi.spyOn(queue, 'add').mockRejectedValue(new Error('stop'));
    await enqueueClassify(() => queue, 'eng_1');
    expect(add).toHaveBeenCalledWith('classifyEngram', {
      type: 'classifyEngram',
      engramId: 'eng_1',
    });
  });

  it('sets force when asked', async () => {
    const add = vi.spyOn(queue, 'add').mockRejectedValue(new Error('stop'));
    await enqueueClassify(() => queue, 'eng_1', { force: true });
    expect(add).toHaveBeenCalledWith('classifyEngram', {
      type: 'classifyEngram',
      engramId: 'eng_1',
      force: true,
    });
  });

  it('reports false when there is no queue', async () => {
    expect(await enqueueClassify(() => null, 'eng_1', { force: true })).toBe(false);
  });
});
