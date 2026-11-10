import { describe, expect, it } from 'vitest';

import { readAcceptedTaskId, readPaperlessTask } from './owner-responses';

describe('owner response identity validation', () => {
  it('accepts the published task identity boundary and does not normalize the returned identity', () => {
    const id = 'A_-'.repeat(24);
    expect(readAcceptedTaskId({ data: { taskId: id } })).toBe(id);
  });

  it.each([
    null,
    {},
    { data: null },
    { data: {} },
    { data: { taskId: 12 } },
    { data: { taskId: '' } },
    { data: { taskId: 'has space' } },
    { data: { taskId: 'a'.repeat(73) } },
  ])('rejects malformed upload acceptance without inventing an owner identity: %j', (payload) => {
    expect(() => readAcceptedTaskId(payload)).toThrow('valid upload task identity');
  });

  it.each([
    null,
    {},
    { state: 'unknown', documentId: 12, reason: null },
    { state: 'done', documentId: 0, reason: null },
    { state: 'done', documentId: 1.2, reason: null },
    { state: 'done', documentId: '12', reason: null },
    { state: 'failed', documentId: null, reason: {} },
  ])('rejects unknown task state and invalid original identity: %j', (payload) => {
    expect(() => readPaperlessTask(payload)).toThrow('invalid task status');
  });

  it('retains the actual completed task object and allows an explicit unresolved original', () => {
    const original = { state: 'duplicate', documentId: 12, reason: null };
    expect(readPaperlessTask(original)).toBe(original);
    expect(readPaperlessTask({ state: 'done', documentId: null, reason: null })).toEqual({
      state: 'done',
      documentId: null,
      reason: null,
    });
  });
});
