import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb } from '../open-cerebrum-db.js';
import {
  EgoBatchTransitionError,
  type InsertEgoActionBatchRow,
} from '../services/ego-action-batches-types.js';
import {
  getBatch,
  insertBatch,
  listBatchesForConversation,
  transitionBatch,
} from '../services/ego-action-batches.js';

import type { OpenedCerebrumDb } from '../open-cerebrum-db.js';

const CREATED_AT = '2026-06-01T10:00:00.000Z';

let dir: string;
let opened: OpenedCerebrumDb;

function batch(
  id: string,
  overrides: Partial<InsertEgoActionBatchRow> = {}
): InsertEgoActionBatchRow {
  return {
    id,
    conversationId: 'conv-1',
    messageId: 'msg-1',
    createdAt: CREATED_AT,
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-action-batches-'));
  opened = openCerebrumDb(join(dir, 'cerebrum.db'), { loadVec: false });
  opened.raw
    .prepare(
      `INSERT INTO conversations (id, title, active_scopes, model, created_at, updated_at)
       VALUES ('conv-1', 'Planning', '[]', 'm', ?, ?)`
    )
    .run(CREATED_AT, CREATED_AT);
  opened.raw
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ('msg-1', 'conv-1', 'assistant', 'hi', ?)`
    )
    .run(CREATED_AT);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('insertBatch and reads', () => {
  it('round-trips loopState as parsed JSON', () => {
    const row = batch('batch-1', { loopState: { round: 2, results: [{ toolUseId: 'u1' }] } });
    insertBatch(opened.db, row);
    expect(getBatch(opened.db, 'batch-1')).toEqual({
      ...row,
      status: 'pending',
      decidedAt: null,
    });
  });

  it('defaults to null loopState when none is provided', () => {
    insertBatch(opened.db, batch('batch-1'));
    expect(getBatch(opened.db, 'batch-1')).toMatchObject({ status: 'pending', loopState: null });
  });

  it('returns null for an invalid stored loopState instead of throwing', () => {
    opened.raw
      .prepare(
        `INSERT INTO ego_action_batches (id, conversation_id, message_id, status, loop_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run('batch-1', 'conv-1', 'msg-1', 'pending', '{invalid-json', CREATED_AT);
    expect(getBatch(opened.db, 'batch-1')?.loopState).toBeNull();
  });

  it('never stores loopState for an auto batch', () => {
    insertBatch(opened.db, batch('batch-1', { status: 'auto', loopState: { round: 1 } }));
    expect(getBatch(opened.db, 'batch-1')).toMatchObject({ status: 'auto', loopState: null });
  });

  it('returns null for an unknown id', () => {
    expect(getBatch(opened.db, 'missing')).toBeNull();
  });

  it('lists a conversation oldest first with id as the tie-break', () => {
    insertBatch(opened.db, batch('later', { createdAt: '2026-06-01T12:00:00Z' }));
    insertBatch(opened.db, batch('same-b', { createdAt: '2026-06-01T09:00:00Z' }));
    insertBatch(opened.db, batch('same-a', { createdAt: '2026-06-01T09:00:00Z' }));
    opened.raw
      .prepare(
        `INSERT INTO conversations (id, title, active_scopes, model, created_at, updated_at)
         VALUES ('conv-2', 'Other', '[]', 'm', ?, ?)`
      )
      .run(CREATED_AT, CREATED_AT);
    opened.raw
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES ('msg-2', 'conv-2', 'assistant', 'hi', ?)`
      )
      .run(CREATED_AT);
    insertBatch(opened.db, batch('other', { conversationId: 'conv-2', messageId: 'msg-2' }));

    expect(listBatchesForConversation(opened.db, 'conv-1').map(({ id }) => id)).toEqual([
      'same-a',
      'same-b',
      'later',
    ]);
    expect(listBatchesForConversation(opened.db, 'conv-2').map(({ id }) => id)).toEqual(['other']);
    expect(listBatchesForConversation(opened.db, 'missing')).toEqual([]);
  });

  it('removes batches when their message is deleted', () => {
    insertBatch(opened.db, batch('batch-1'));
    opened.raw.prepare(`DELETE FROM messages WHERE id = 'msg-1'`).run();
    expect(getBatch(opened.db, 'batch-1')).toBeNull();
  });
});

describe('transitionBatch', () => {
  it('decides a pending batch once and refuses a replay', () => {
    insertBatch(opened.db, batch('batch-1'));
    const input = {
      id: 'batch-1',
      from: 'pending',
      to: 'decided',
      decidedAt: '2026-06-01T10:05:00.000Z',
    } as const;
    expect(transitionBatch(opened.db, input)).toBe(true);
    expect(transitionBatch(opened.db, input)).toBe(false);
    expect(getBatch(opened.db, 'batch-1')).toMatchObject({
      status: 'decided',
      decidedAt: input.decidedAt,
    });
  });

  it('continues a decided batch once', () => {
    insertBatch(opened.db, batch('batch-1', { status: 'decided', decidedAt: CREATED_AT }));
    const input = { id: 'batch-1', from: 'decided', to: 'continued' } as const;
    expect(transitionBatch(opened.db, input)).toBe(true);
    expect(transitionBatch(opened.db, input)).toBe(false);
    expect(getBatch(opened.db, 'batch-1')).toMatchObject({
      status: 'continued',
      decidedAt: CREATED_AT,
    });
  });

  it.each([
    ['continued', 'pending'],
    ['pending', 'continued'],
    ['auto', 'decided'],
  ] as const)('throws for %s to %s and leaves the batch unchanged', (from, to) => {
    insertBatch(opened.db, batch('batch-1', { status: from, decidedAt: CREATED_AT }));
    expect(() => transitionBatch(opened.db, { id: 'batch-1', from, to })).toThrow(
      EgoBatchTransitionError
    );
    expect(getBatch(opened.db, 'batch-1')).toMatchObject({
      status: from,
      decidedAt: CREATED_AT,
    });
  });
});
