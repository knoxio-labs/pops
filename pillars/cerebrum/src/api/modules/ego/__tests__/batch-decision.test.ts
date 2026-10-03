import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import { EgoActionStore } from '../actions-store.js';
import {
  decideBatch,
  syncActionsPart,
  type BatchDecision,
  type BatchDecisionDeps,
} from '../batch-decision.js';
import { DECLINED_RESULT } from '../loop-resume.js';
import { ConversationPersistence } from '../persistence.js';

import type { EgoActionsPart, EgoMessagePart } from '../../../../contract/rest-ego-parts.js';

const CLOCK = new Date('2026-06-01T10:00:00.000Z');
const BATCH_ID = 'batch-1';
const ACTIONS = [
  { id: 'action-1', tool: 'inventory.items.move', summary: 'Move drill' },
  { id: 'action-2', tool: 'finance.transactions.update', summary: 'Update transaction' },
  { id: 'action-3', tool: 'inventory.items.store', summary: 'Store saw' },
] as const;

let dir: string;
let opened: OpenedCerebrumDb;
let persistence: ConversationPersistence;
let store: EgoActionStore;
let deps: BatchDecisionDeps;

interface Fixture {
  batchId: string;
  conversationId: string;
  messageId: string;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cerebrum-batch-decision-'));
  opened = openCerebrumDb(join(dir, 'cerebrum.db'), { loadVec: false });
  let tick = 0;
  const now = () => new Date(CLOCK.getTime() + tick++);
  persistence = new ConversationPersistence({ db: opened.db, now });
  store = new EgoActionStore({ db: opened.db, now: () => CLOCK });
  deps = { store, persistence };
});

afterEach(() => {
  vi.restoreAllMocks();
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

function createFixture(options: { withActionsPart?: boolean; batchId?: string } = {}): Fixture {
  const batchId = options.batchId ?? BATCH_ID;
  const conversationId = persistence.createConversation({ model: 'm' }).id;
  const parts: EgoMessagePart[] = [{ type: 'text', text: 'I can make these changes.' }];
  if (options.withActionsPart !== false) {
    parts.push({
      type: 'actions',
      batchId,
      actions: ACTIONS.map(({ id, tool, summary }) => ({
        actionId: id,
        tool,
        summary,
        status: 'pending',
      })),
    });
  }
  const message = persistence.appendMessage(conversationId, {
    role: 'assistant',
    content: 'I can make these changes.',
    parts,
  });
  store.createBatch({ id: batchId, conversationId, messageId: message.id });
  ACTIONS.forEach(({ id, tool, summary }, position) => {
    store.create({
      id,
      batchId,
      conversationId,
      messageId: message.id,
      toolUseId: `tool-use-${id}`,
      position,
      tool,
      args: { id },
      summary,
    });
  });
  return { batchId, conversationId, messageId: message.id };
}

function allApproved(): BatchDecision {
  return { approve: ACTIONS.map(({ id }) => id), reject: [], alwaysAllow: [] };
}

function storedMessage(fixture: Fixture) {
  return persistence
    .getConversation(fixture.conversationId)
    ?.messages.find((message) => message.id === fixture.messageId);
}

function snapshot(fixture: Fixture) {
  return {
    batch: store.getBatch(fixture.batchId),
    actions: store.listForBatch(fixture.batchId),
    message: storedMessage(fixture),
  };
}

describe('decideBatch', () => {
  it('approves every action and synchronizes the batch part', async () => {
    const fixture = createFixture();

    const outcome = await decideBatch(deps, fixture.batchId, allApproved());

    expect(outcome).not.toBe('not-found');
    expect(outcome).not.toBe('not-pending');
    expect(outcome).not.toBe('invalid');
    if (typeof outcome === 'string') throw new Error(`Unexpected result: ${outcome}`);
    expect(outcome.batch).toMatchObject({ status: 'decided', decidedAt: CLOCK.toISOString() });
    expect(outcome.actions.map((action) => [action.status, action.result])).toEqual([
      ['confirmed', null],
      ['confirmed', null],
      ['confirmed', null],
    ]);
    expect(actionsPart(outcome.updatedMessage?.parts)).toMatchObject({
      actions: ACTIONS.map(({ id }) => ({ actionId: id, status: 'confirmed' })),
    });
    expect(outcome.updatedMessage).toEqual(storedMessage(fixture));
  });

  it('rejects only selected actions and records the declined result', async () => {
    const fixture = createFixture();

    const outcome = await decideBatch(deps, fixture.batchId, {
      approve: ['action-3', 'action-1'],
      reject: ['action-2'],
      alwaysAllow: [],
    });

    expect(outcome).not.toBe('not-found');
    expect(outcome).not.toBe('not-pending');
    expect(outcome).not.toBe('invalid');
    if (typeof outcome === 'string') throw new Error(`Unexpected result: ${outcome}`);
    expect(outcome.actions.map(({ id, status, result }) => [id, status, result])).toEqual([
      ['action-1', 'confirmed', null],
      ['action-2', 'rejected', DECLINED_RESULT],
      ['action-3', 'confirmed', null],
    ]);
    expect(actionsPart(outcome.updatedMessage?.parts)?.actions.map(({ status }) => status)).toEqual(
      ['confirmed', 'rejected', 'confirmed']
    );
  });

  it('rejects every action and decides the batch', async () => {
    const fixture = createFixture();

    const outcome = await decideBatch(deps, fixture.batchId, {
      approve: [],
      reject: ACTIONS.map(({ id }) => id),
      alwaysAllow: [],
    });

    expect(outcome).not.toBe('not-found');
    expect(outcome).not.toBe('not-pending');
    expect(outcome).not.toBe('invalid');
    if (typeof outcome === 'string') throw new Error(`Unexpected result: ${outcome}`);
    expect(outcome.batch.status).toBe('decided');
    expect(outcome.actions.map(({ status, result }) => [status, result])).toEqual(
      ACTIONS.map(() => ['rejected', DECLINED_RESULT])
    );
  });

  it('does not change actions or allow-list when the batch was already decided', async () => {
    const fixture = createFixture();
    expect(await decideBatch(deps, fixture.batchId, allApproved())).not.toBe('not-pending');
    const before = snapshot(fixture);
    const allowedBefore = persistence.getAllowedTools(fixture.conversationId);

    const outcome = await decideBatch(deps, fixture.batchId, {
      approve: ACTIONS.map(({ id }) => id),
      reject: [],
      alwaysAllow: ['inventory.items.move'],
    });

    expect(outcome).toBe('not-pending');
    expect(snapshot(fixture)).toEqual(before);
    expect(persistence.getAllowedTools(fixture.conversationId)).toEqual(allowedBefore);
  });

  it('uses the batch compare-and-set to allow only one racing decision', async () => {
    const fixture = createFixture();
    const decisions = await Promise.all([
      decideBatch(deps, fixture.batchId, allApproved()),
      decideBatch(deps, fixture.batchId, {
        approve: [],
        reject: ACTIONS.map(({ id }) => id),
        alwaysAllow: [],
      }),
    ]);

    expect(decisions.filter((decision) => decision === 'not-pending')).toHaveLength(1);
    expect(decisions.filter((decision) => typeof decision !== 'string')).toHaveLength(1);
    expect(store.getBatch(fixture.batchId)?.status).toBe('decided');
    expect(store.listForBatch(fixture.batchId).every(({ status }) => status !== 'pending')).toBe(
      true
    );
  });

  it('remembers an approved tool for this conversation only', async () => {
    const fixture = createFixture();
    const otherConversationId = persistence.createConversation({ model: 'm' }).id;

    const outcome = await decideBatch(deps, fixture.batchId, {
      approve: ['action-1'],
      reject: ['action-2', 'action-3'],
      alwaysAllow: ['inventory.items.move'],
    });

    expect(outcome).not.toBe('not-found');
    expect(outcome).not.toBe('not-pending');
    expect(outcome).not.toBe('invalid');
    expect(persistence.getAllowedTools(fixture.conversationId)).toEqual(['inventory.items.move']);
    expect(persistence.getAllowedTools(otherConversationId)).toEqual([]);
  });

  it.each([
    ['a missing action id', { approve: ['action-1'], reject: ['action-2'], alwaysAllow: [] }],
    [
      'an id selected for both outcomes',
      { approve: ['action-1', 'action-2'], reject: ['action-2', 'action-3'], alwaysAllow: [] },
    ],
    [
      'an id outside the batch',
      { approve: ['action-1', 'action-2', 'other-action'], reject: ['action-3'], alwaysAllow: [] },
    ],
    [
      'a duplicated approved id',
      { approve: ['action-1', 'action-1', 'action-2'], reject: ['action-3'], alwaysAllow: [] },
    ],
    [
      'an always-allowed tool that is only rejected',
      {
        approve: ['action-1', 'action-3'],
        reject: ['action-2'],
        alwaysAllow: ['finance.transactions.update'],
      },
    ],
  ] satisfies Array<[string, BatchDecision]>)(
    'leaves persistence untouched for %s',
    async (_label, decision) => {
      const fixture = createFixture();
      const before = snapshot(fixture);
      const allowedBefore = persistence.getAllowedTools(fixture.conversationId);

      const outcome = await decideBatch(deps, fixture.batchId, decision);

      expect(outcome).toBe('invalid');
      expect(snapshot(fixture)).toEqual(before);
      expect(persistence.getAllowedTools(fixture.conversationId)).toEqual(allowedBefore);
    }
  );

  it('returns not-found for an unknown batch', async () => {
    expect(await decideBatch(deps, 'batch-missing', allApproved())).toBe('not-found');
  });

  it('records a decision when the message has no matching actions part', async () => {
    const fixture = createFixture({ withActionsPart: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const outcome = await decideBatch(deps, fixture.batchId, allApproved());

    expect(outcome).not.toBe('not-found');
    expect(outcome).not.toBe('not-pending');
    expect(outcome).not.toBe('invalid');
    if (typeof outcome === 'string') throw new Error(`Unexpected result: ${outcome}`);
    expect(outcome.batch.status).toBe('decided');
    expect(outcome.actions.every(({ status }) => status === 'confirmed')).toBe(true);
    expect(outcome.updatedMessage).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('syncActionsPart', () => {
  it('preserves action display fields and other parts while updating statuses', async () => {
    const fixture = createFixture();
    const batch = store.getBatch(fixture.batchId);
    if (batch === null) throw new Error('Fixture batch was not created');
    store.transition('action-1', 'pending', 'confirmed');
    store.transition('action-2', 'pending', 'rejected', DECLINED_RESULT);

    const result = await syncActionsPart(deps, batch);

    expect(result).not.toBeNull();
    const expectedPart = actionsPart(result?.message.parts);
    const expectedStatuses = ['confirmed', 'rejected', 'pending'];
    expect(expectedPart?.actions).toEqual(
      ACTIONS.map(({ id, tool, summary }, index) => ({
        actionId: id,
        tool,
        summary,
        status: expectedStatuses[index],
      }))
    );
    expect(result?.message.parts?.[0]).toEqual({ type: 'text', text: 'I can make these changes.' });
    expect(result?.part).toEqual(expectedPart);
  });
});

function actionsPart(parts: EgoMessagePart[] | null | undefined): EgoActionsPart | undefined {
  return parts?.find((part): part is EgoActionsPart => part.type === 'actions');
}
