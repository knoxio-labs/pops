import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { settleConversation } from '../batch-settle.js';
import {
  createSettleFixture,
  seedBatch,
  type SeededBatch,
  type SettleFixture,
} from './batch-settle-test-utils.js';

let fixture: SettleFixture;

beforeEach(() => {
  fixture = createSettleFixture();
});

afterEach(() => {
  fixture.close();
});

function settleResume(exceptBatchId: string) {
  return settleConversation(fixture, fixture.conversationId, { reason: 'resume', exceptBatchId });
}

function settleNewMessage() {
  return settleConversation(fixture, fixture.conversationId, { reason: 'new-message' });
}

function actionRows(batch: SeededBatch) {
  return fixture.store.listForBatch(batch.id);
}

describe('settleConversation resume exclusions and idempotence', () => {
  it('leaves a pending batch alone when settling another resume', async () => {
    const batch = seedBatch(fixture, { id: 'pending', status: 'pending' });

    const result = await settleResume('another-batch');

    expect(result).toEqual({ actions: [], parts: [] });
    expect(fixture.store.getBatch(batch.id)?.status).toBe('pending');
    expect(actionRows(batch).every(({ status }) => status === 'pending')).toBe(true);
  });

  it('skips the batch currently being resumed', async () => {
    const batch = seedBatch(fixture, {
      id: 'resuming',
      status: 'decided',
      actionStatuses: ['confirmed'],
      actionCount: 1,
    });

    expect(await settleResume(batch.id)).toEqual({ actions: [], parts: [] });
    expect(fixture.store.getBatch(batch.id)?.status).toBe('decided');
    expect(actionRows(batch).map(({ status }) => status)).toEqual(['confirmed']);
  });

  it('is idempotent', async () => {
    seedBatch(fixture, { id: 'pending', status: 'pending' });

    expect((await settleNewMessage()).actions).toHaveLength(3);
    expect(await settleNewMessage()).toEqual({ actions: [], parts: [] });
  });
});
