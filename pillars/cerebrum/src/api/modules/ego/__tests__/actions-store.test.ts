import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { egoActionStatusSchema } from '../../../../contract/rest-ego-parts.js';
import {
  EgoBatchTransitionError,
  EGO_ACTION_STATUSES,
  openCerebrumDb,
  type OpenedCerebrumDb,
} from '../../../../db/index.js';
import { EgoActionStore, generateActionId, generateBatchId } from '../actions-store.js';

import type { CreateEgoActionInput } from '../actions-store.js';

const CLOCK = new Date('2026-06-01T10:00:00.000Z');

let dir: string;
let opened: OpenedCerebrumDb;
let store: EgoActionStore;

function input(id: string, overrides: Partial<CreateEgoActionInput> = {}): CreateEgoActionInput {
  return {
    id,
    batchId: 'batch-1',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    toolUseId: `tu-${id}`,
    position: 0,
    tool: 'inventory.items.create',
    args: { name: 'Drill' },
    summary: 'Add a drill',
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cerebrum-actions-store-'));
  opened = openCerebrumDb(join(dir, 'cerebrum.db'), { loadVec: false });
  opened.raw
    .prepare(
      `INSERT INTO conversations (id, title, active_scopes, model, created_at, updated_at)
       VALUES ('conv-1', 'Planning', '[]', 'm', '2026-06-01T10:00:00Z', '2026-06-01T10:00:00Z')`
    )
    .run();
  opened.raw
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ('msg-1', 'conv-1', 'assistant', 'hi', '2026-06-01T10:00:00Z')`
    )
    .run();
  opened.raw
    .prepare(
      `INSERT INTO ego_action_batches (id, conversation_id, message_id, created_at)
       VALUES ('batch-1', 'conv-1', 'msg-1', '2026-06-01T10:00:00Z')`
    )
    .run();
  store = new EgoActionStore({ db: opened.db, now: () => CLOCK });
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('generateActionId', () => {
  it('prefixes a UUID with act_ and does not repeat', () => {
    const id = generateActionId();
    expect(id).toMatch(/^act_[0-9a-f-]{36}$/);
    expect(generateActionId()).not.toBe(id);
  });
});

describe('generateBatchId', () => {
  it('prefixes a UUID with bat_ and does not repeat', () => {
    const id = generateBatchId();
    expect(id).toMatch(/^bat_[0-9a-f-]{36}$/);
    expect(generateBatchId()).not.toBe(id);
  });
});

describe('EgoActionStore', () => {
  it('creates a pending batch and lists it by conversation', () => {
    store.createBatch({
      id: 'batch-2',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      loopState: { round: 2 },
    });
    expect(store.getBatch('batch-2')).toEqual({
      id: 'batch-2',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      status: 'pending',
      loopState: { round: 2 },
      createdAt: CLOCK.toISOString(),
      decidedAt: null,
    });
    expect(store.listBatchesForConversation('conv-1').map(({ id }) => id)).toContain('batch-2');
  });

  it('stamps decidedAt from the clock when a batch is decided', () => {
    store.createBatch({ id: 'batch-2', conversationId: 'conv-1', messageId: 'msg-1' });
    expect(store.transitionBatch('batch-2', 'pending', 'decided')).toBe(true);
    expect(store.getBatch('batch-2')).toMatchObject({
      status: 'decided',
      decidedAt: CLOCK.toISOString(),
    });
  });

  it('keeps auto batches state-free and immutable', () => {
    store.createBatch({
      id: 'batch-2',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      status: 'auto',
      loopState: { round: 2 },
    });
    expect(store.getBatch('batch-2')).toMatchObject({ status: 'auto', loopState: null });
    expect(() => store.transitionBatch('batch-2', 'auto', 'decided')).toThrow(
      EgoBatchTransitionError
    );
  });

  it('stamps createdAt from the clock and starts pending', () => {
    store.create(input('a1'));
    expect(store.get('a1')).toMatchObject({
      status: 'pending',
      createdAt: CLOCK.toISOString(),
      resolvedAt: null,
    });
  });

  it('stamps resolvedAt on rejected but not on confirmed', () => {
    store.create(input('a1'));
    store.create(input('a2', { position: 1 }));
    expect(store.transition('a1', 'pending', 'confirmed')).toBe(true);
    expect(store.transition('a2', 'pending', 'rejected')).toBe(true);
    expect(store.get('a1')?.resolvedAt).toBeNull();
    expect(store.get('a2')?.resolvedAt).toBe(CLOCK.toISOString());
  });

  it('stamps resolvedAt and result on execution', () => {
    store.create(input('a1'));
    store.transition('a1', 'pending', 'confirmed');
    expect(store.transition('a1', 'confirmed', 'executed', 'created')).toBe(true);
    expect(store.get('a1')).toMatchObject({
      status: 'executed',
      result: 'created',
      resolvedAt: CLOCK.toISOString(),
    });
  });

  it('sets resolvedAt on a row created as executed or failed', () => {
    store.create(input('a1', { status: 'executed', result: 'ok' }));
    store.create(input('a2', { position: 1, status: 'failed', result: 'boom' }));
    expect(store.get('a1')?.resolvedAt).toBe(CLOCK.toISOString());
    expect(store.get('a2')?.resolvedAt).toBe(CLOCK.toISOString());
  });

  it('lists by batch and by conversation', () => {
    store.create(input('a1', { position: 1 }));
    store.create(input('a0', { position: 0 }));
    expect(store.listForBatch('batch-1').map((row) => row.id)).toEqual(['a0', 'a1']);
    expect(store.listForConversation('conv-1')).toHaveLength(2);
  });
});

describe('status vocabulary', () => {
  it('matches the wire enum', () => {
    expect([...EGO_ACTION_STATUSES]).toEqual(egoActionStatusSchema.options);
  });
});
