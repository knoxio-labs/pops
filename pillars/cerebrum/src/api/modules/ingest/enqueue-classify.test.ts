import { describe, expect, it, vi } from 'vitest';

import { enqueueClassify } from './pipeline-stages.js';

import type { Queue } from 'bullmq';

import type { ClassifyEngramJobData } from './queue.js';

vi.mock('bullmq', () => ({
  Queue: class {
    constructor() {
      throw new Error('Payload fixtures must not construct a BullMQ Queue');
    }
  },
}));
vi.mock('ioredis', () => {
  class Redis {
    constructor() {
      throw new Error('Payload fixtures must not construct a Redis client');
    }
  }
  return { Redis, default: Redis };
});

describe('enqueueClassify', () => {
  it('omits force by default and preserves enqueue failure as a soft result', async () => {
    const add = vi.fn<Queue<ClassifyEngramJobData>['add']>().mockRejectedValue(new Error('stop'));
    expect(await enqueueClassify(() => ({ add }), 'eng_1')).toBe(false);
    expect(add).toHaveBeenCalledExactlyOnceWith('classifyEngram', {
      type: 'classifyEngram',
      engramId: 'eng_1',
    });
  });

  it('sets force when asked without allocating a Queue lifecycle', async () => {
    const add = vi.fn<Queue<ClassifyEngramJobData>['add']>().mockRejectedValue(new Error('stop'));
    expect(await enqueueClassify(() => ({ add }), 'eng_1', { force: true })).toBe(false);
    expect(add).toHaveBeenCalledExactlyOnceWith('classifyEngram', {
      type: 'classifyEngram',
      engramId: 'eng_1',
      force: true,
    });
  });

  it('awaits a rejected enqueue and reports its diagnostic before returning', async () => {
    let reject: (error: Error) => void = () => {
      throw new Error('Missing pending enqueue');
    };
    const pending = new Promise<Awaited<ReturnType<Queue<ClassifyEngramJobData>['add']>>>(
      (_, fail) => {
        reject = fail;
      }
    );
    const add = vi.fn<Queue<ClassifyEngramJobData>['add']>().mockReturnValue(pending);
    const warning = vi.spyOn(console, 'warn');
    let completed = false;
    const outcome = enqueueClassify(() => ({ add }), 'eng_1').then((result) => {
      completed = true;
      return result;
    });
    try {
      await Promise.resolve();
      expect(completed).toBe(false);
      reject(new Error('controlled enqueue refusal'));
      expect(await outcome).toBe(false);
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        '[IngestService] Failed to enqueue classify job for eng_1: controlled enqueue refusal'
      );
    } finally {
      reject(new Error('settle fixture'));
      await outcome;
      warning.mockRestore();
    }
  });

  it('reports false when there is no queue', async () => {
    expect(await enqueueClassify(() => null, 'eng_1', { force: true })).toBe(false);
  });
});
