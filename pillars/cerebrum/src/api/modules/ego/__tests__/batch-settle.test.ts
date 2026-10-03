import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  fixture.close();
});

function settleNewMessage() {
  return settleConversation(fixture, fixture.conversationId, { reason: 'new-message' });
}

function actionRows(batch: SeededBatch) {
  return fixture.store.listForBatch(batch.id);
}

describe('settleConversation', () => {
  it('supersedes pending actions and closes the batch before a decision can win', async () => {
    const batch = seedBatch(fixture, { id: 'pending', status: 'pending' });

    const result = await settleNewMessage();

    expect(fixture.store.getBatch(batch.id)).toMatchObject({
      status: 'continued',
      decidedAt: expect.any(String),
    });
    expect(actionRows(batch).map(({ status, result: text }) => [status, text])).toEqual(
      batch.actionIds.map(() => ['rejected', SUPERSEDED_RESULT])
    );
    expect(
      await decideBatch(fixture, batch.id, {
        approve: [],
        reject: batch.actionIds,
        alwaysAllow: [],
      })
    ).toBe('not-pending');
    expect(actionsPart(fixture, batch)?.actions.map(({ status }) => status)).toEqual(
      batch.actionIds.map(() => 'rejected')
    );
    expect(result.parts.map(({ batchId }) => batchId)).toEqual([batch.id]);
    expect(
      result.actions.map(({ batchId, content, isError }) => [batchId, content, isError])
    ).toEqual(batch.actionIds.map(() => [batch.id, SUPERSEDED_RESULT, false]));
  });

  it('interrupts confirmed and pending rows in a decided batch but preserves rejections', async () => {
    const batch = seedBatch(fixture, {
      id: 'decided',
      status: 'decided',
      actionStatuses: ['confirmed', 'rejected', 'confirmed'],
    });

    const result = await settleNewMessage();

    expect(fixture.store.getBatch(batch.id)?.status).toBe('continued');
    expect(actionRows(batch).map(({ status, result: text }) => [status, text])).toEqual([
      ['failed', INTERRUPTED_RESULT],
      ['rejected', DECLINED_RESULT],
      ['failed', INTERRUPTED_RESULT],
    ]);
    expect(actionsPart(fixture, batch)?.actions.map(({ status }) => status)).toEqual([
      'failed',
      'rejected',
      'failed',
    ]);
    expect(result.actions.map(({ content, isError }) => [content, isError])).toEqual([
      [INTERRUPTED_RESULT, true],
      [DECLINED_RESULT, false],
      [INTERRUPTED_RESULT, true],
    ]);
  });

  it('fails pending rows left in a decided batch while decision recording was interrupted', async () => {
    const batch = seedBatch(fixture, {
      id: 'crashed',
      status: 'decided',
      actionStatuses: ['pending'],
      actionCount: 1,
    });

    const result = await settleNewMessage();

    expect(actionRows(batch).map(({ status, result: text }) => [status, text])).toEqual([
      ['failed', INTERRUPTED_RESULT],
    ]);
    expect(result.actions[0]).toMatchObject({ actionId: firstActionId(batch), isError: true });
  });

  it('fails only open rows in a continued batch and keeps the batch continued', async () => {
    const batch = seedBatch(fixture, {
      id: 'continued',
      status: 'continued',
      actionStatuses: ['executed', 'confirmed'],
      actionCount: 2,
    });

    const result = await settleNewMessage();

    expect(fixture.store.getBatch(batch.id)?.status).toBe('continued');
    expect(actionRows(batch).map(({ status, result: text }) => [status, text])).toEqual([
      ['executed', 'Existing result.'],
      ['failed', INTERRUPTED_RESULT],
    ]);
    expect(result.actions.map(({ isError }) => isError)).toEqual([false, true]);
  });

  it('does not report already resolved or auto batches', async () => {
    const done = seedBatch(fixture, {
      id: 'done',
      status: 'continued',
      actionStatuses: ['executed', 'failed'],
      actionCount: 2,
    });
    const automatic = seedBatch(fixture, {
      id: 'auto',
      status: 'auto',
      actionStatuses: ['executed', 'executed'],
    });

    expect(await settleNewMessage()).toEqual({ actions: [], parts: [] });
    expect(fixture.store.getBatch(done.id)?.status).toBe('continued');
    expect(fixture.store.getBatch(automatic.id)?.status).toBe('auto');
  });

  it('settles multiple batches oldest first and returns their parts in order', async () => {
    const older = seedBatch(fixture, {
      id: 'older',
      status: 'decided',
      actionStatuses: ['confirmed'],
      actionCount: 1,
    });
    const newer = seedBatch(fixture, { id: 'newer', status: 'pending' });

    const result = await settleNewMessage();

    expect(result.parts.map(({ batchId }) => batchId)).toEqual([older.id, newer.id]);
    expect(result.actions.map(({ batchId }) => batchId)).toEqual([
      older.id,
      newer.id,
      newer.id,
      newer.id,
    ]);
    expect(fixture.store.getBatch(older.id)?.status).toBe('continued');
    expect(fixture.store.getBatch(newer.id)?.status).toBe('continued');
  });
});
