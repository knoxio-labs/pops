import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decideBatch } from '../batch-decision.js';
import { settleConversation, SUPERSEDED_RESULT } from '../batch-settle.js';
import { DECLINED_RESULT, INTERRUPTED_RESULT } from '../loop-resume.js';
import {
  actionsPart,
  createSettleFixture,
  firstActionId,
  seedBatch,
  type SeededBatch,
  type SettleFixture,
} from './batch-settle-test-utils.js';

let fixture: SettleFixture;

beforeEach(() => {
  fixture = createSettleFixture();
});

afterEach(() => {
  vi.restoreAllMocks();
  fixture.close();
});

function actionRows(batch: SeededBatch) {
  return fixture.store.listForBatch(batch.id);
}

describe('settleConversation races', () => {
  it('re-reads a decision that won the pending-batch claim', async () => {
    const batch = seedBatch(fixture, { id: 'pending', status: 'pending' });
    const list = fixture.store.listBatchesForConversation.bind(fixture.store);
    let decision: ReturnType<typeof decideBatch> | undefined;
    vi.spyOn(fixture.store, 'listBatchesForConversation').mockImplementationOnce((id) => {
      const rows = list(id);
      decision = decideBatch(fixture, batch.id, {
        approve: [firstActionId(batch)],
        reject: batch.actionIds.slice(1),
        alwaysAllow: [],
      });
      return rows;
    });

    const result = await settleConversation(fixture, fixture.conversationId, {
      reason: 'new-message',
    });
    if (decision === undefined) throw new Error('The competing decision did not run.');
    await decision;

    expect(fixture.store.getBatch(batch.id)?.status).toBe('continued');
    expect(actionRows(batch).map(({ status, result: text }) => [status, text])).toEqual([
      ['failed', INTERRUPTED_RESULT],
      ['rejected', DECLINED_RESULT],
      ['rejected', DECLINED_RESULT],
    ]);
    expect(actionRows(batch).some(({ result: text }) => text === SUPERSEDED_RESULT)).toBe(false);
    expect(actionsPart(fixture, batch)?.actions.map(({ status }) => status)).toEqual([
      'failed',
      'rejected',
      'rejected',
    ]);
    expect(result.actions.map(({ content, isError }) => [content, isError])).toEqual([
      [INTERRUPTED_RESULT, true],
      [DECLINED_RESULT, false],
      [DECLINED_RESULT, false],
    ]);
  });

  it('leaves a decided batch alone when another resume wins its claim', async () => {
    const batch = seedBatch(fixture, {
      id: 'decided',
      status: 'decided',
      actionStatuses: ['confirmed'],
      actionCount: 1,
    });
    const list = fixture.store.listBatchesForConversation.bind(fixture.store);
    vi.spyOn(fixture.store, 'listBatchesForConversation').mockImplementationOnce((id) => {
      const rows = list(id);
      fixture.store.transitionBatch(batch.id, 'decided', 'continued');
      return rows;
    });

    const result = await settleConversation(fixture, fixture.conversationId, {
      reason: 'new-message',
    });

    expect(result).toEqual({ actions: [], parts: [] });
    expect(fixture.store.getBatch(batch.id)?.status).toBe('continued');
    expect(actionRows(batch).map(({ status }) => status)).toEqual(['confirmed']);
  });
});
