import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb } from '../open-cerebrum-db.js';
import {
  EgoActionTransitionError,
  type InsertEgoActionRow,
} from '../services/ego-actions-types.js';
import {
  getAction,
  insertAction,
  listActionsForBatch,
  listActionsForConversation,
  transitionAction,
} from '../services/ego-actions.js';

import type { OpenedCerebrumDb } from '../open-cerebrum-db.js';

let dir: string;
let opened: OpenedCerebrumDb;

function action(id: string, overrides: Partial<InsertEgoActionRow> = {}): InsertEgoActionRow {
  return {
    id,
    batchId: 'batch-1',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    toolUseId: `tu-${id}`,
    position: 0,
    tool: 'inventory.items.create',
    args: { name: 'Drill', qty: 2 },
    summary: 'Add a drill',
    createdAt: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-actions-'));
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
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('insertAction and reads', () => {
  it('round-trips args as a parsed object and defaults to pending', () => {
    insertAction(opened.db, action('a1'));
    expect(getAction(opened.db, 'a1')).toEqual({
      ...action('a1'),
      status: 'pending',
      result: null,
      resolvedAt: null,
    });
  });

  it('returns null for an unknown id', () => {
    expect(getAction(opened.db, 'missing')).toBeNull();
  });

  it('lists a batch in position order whatever the insert order', () => {
    insertAction(opened.db, action('a2', { position: 2 }));
    insertAction(opened.db, action('a0', { position: 0 }));
    insertAction(opened.db, action('a1', { position: 1 }));
    expect(listActionsForBatch(opened.db, 'batch-1').map((row) => row.id)).toEqual([
      'a0',
      'a1',
      'a2',
    ]);
  });

  it('lists a conversation oldest first', () => {
    insertAction(opened.db, action('late', { createdAt: '2026-06-01T12:00:00Z' }));
    insertAction(opened.db, action('early', { createdAt: '2026-06-01T09:00:00Z' }));
    expect(listActionsForConversation(opened.db, 'conv-1').map((row) => row.id)).toEqual([
      'early',
      'late',
    ]);
  });

  it('reads back a row inserted as executed with its result', () => {
    insertAction(opened.db, action('a1', { status: 'executed', result: 'done' }));
    expect(getAction(opened.db, 'a1')).toMatchObject({ status: 'executed', result: 'done' });
  });

  it('removes actions when the conversation is deleted', () => {
    insertAction(opened.db, action('a1'));
    opened.raw.prepare(`DELETE FROM conversations WHERE id = 'conv-1'`).run();
    expect(getAction(opened.db, 'a1')).toBeNull();
  });
});

describe('transitionAction', () => {
  it('confirms a pending action once and refuses the replay', () => {
    insertAction(opened.db, action('a1'));
    const input = { id: 'a1', from: 'pending', to: 'confirmed' } as const;
    expect(transitionAction(opened.db, input)).toBe(true);
    expect(transitionAction(opened.db, input)).toBe(false);
    expect(getAction(opened.db, 'a1')?.status).toBe('confirmed');
  });

  it('does not reject an action that is already confirmed', () => {
    insertAction(opened.db, action('a1'));
    transitionAction(opened.db, { id: 'a1', from: 'pending', to: 'confirmed' });
    expect(transitionAction(opened.db, { id: 'a1', from: 'pending', to: 'rejected' })).toBe(false);
    expect(getAction(opened.db, 'a1')?.status).toBe('confirmed');
  });

  it('stores the result when a confirmed action executes', () => {
    insertAction(opened.db, action('a1'));
    transitionAction(opened.db, { id: 'a1', from: 'pending', to: 'confirmed' });
    const ok = transitionAction(opened.db, {
      id: 'a1',
      from: 'confirmed',
      to: 'executed',
      result: 'created',
      resolvedAt: '2026-06-01T10:05:00Z',
    });
    expect(ok).toBe(true);
    expect(getAction(opened.db, 'a1')).toMatchObject({
      status: 'executed',
      result: 'created',
      resolvedAt: '2026-06-01T10:05:00Z',
    });
  });

  it('fails a pending action once and stamps the result', () => {
    insertAction(opened.db, action('a1'));
    const input = { id: 'a1', from: 'pending', to: 'failed', result: 'interrupted' } as const;
    expect(transitionAction(opened.db, input)).toBe(true);
    expect(transitionAction(opened.db, input)).toBe(false);
    expect(getAction(opened.db, 'a1')).toMatchObject({ status: 'failed', result: 'interrupted' });
  });

  it('returns false for an unknown id', () => {
    expect(transitionAction(opened.db, { id: 'nope', from: 'pending', to: 'confirmed' })).toBe(
      false
    );
  });

  it.each([
    ['rejected', 'executed'],
    ['executed', 'pending'],
    ['pending', 'executed'],
    ['failed', 'confirmed'],
  ] as const)('throws for %s to %s and leaves the row unchanged', (from, to) => {
    insertAction(opened.db, action('a1', { status: from, result: 'before' }));
    expect(() => transitionAction(opened.db, { id: 'a1', from, to, result: 'after' })).toThrow(
      EgoActionTransitionError
    );
    expect(getAction(opened.db, 'a1')).toMatchObject({ status: from, result: 'before' });
  });
});
