import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import { ConversationPersistence } from '../persistence.js';

import type { EgoMessagePart } from '../../../../contract/rest-ego-parts.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
let persistence: ConversationPersistence;
let conversationId: string;

const parts: EgoMessagePart[] = [
  { type: 'text', text: 'Here is what I found.' },
  { type: 'entity', uri: 'pops:inventory/item/abc123', title: 'Drill', subtitle: 'Garage' },
  {
    type: 'actions',
    batchId: 'batch_1',
    actions: [
      { actionId: 'act_1', tool: 'inventory_items_move', summary: 'Move drill', status: 'pending' },
      { actionId: 'act_2', tool: 'inventory_items_store', summary: 'Store saw', status: 'pending' },
    ],
  },
];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ego-parts-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
  let tick = 0;
  persistence = new ConversationPersistence({
    db: cerebrumDb.db,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
  });
  conversationId = persistence.createConversation({ model: 'm' }).id;
});

afterEach(() => {
  vi.restoreAllMocks();
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function storedMessages() {
  return persistence.getConversation(conversationId)?.messages ?? [];
}

describe('message parts persistence', () => {
  it('round-trips text, entity and actions parts', () => {
    const appended = persistence.appendMessage(conversationId, {
      role: 'assistant',
      content: 'Here is what I found.',
      parts,
    });
    expect(appended.parts).toEqual(parts);
    expect(storedMessages()[0]?.parts).toEqual(parts);
  });

  it('reads parts as null when none were appended', () => {
    persistence.appendMessage(conversationId, { role: 'assistant', content: 'plain' });
    expect(storedMessages()[0]?.parts).toBeNull();
  });

  it('reads invalid JSON and wrong-shaped JSON as null without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad = persistence.appendMessage(conversationId, { role: 'assistant', content: 'a' });
    const wrong = persistence.appendMessage(conversationId, { role: 'assistant', content: 'b' });
    const update = cerebrumDb.raw.prepare('UPDATE messages SET parts = ? WHERE id = ?');
    update.run('{not json', bad.id);
    update.run(JSON.stringify([{ type: 'entity', uri: 'not-a-uri' }]), wrong.id);

    const messages = storedMessages();
    expect(messages.map((m) => m.parts)).toEqual([null, null]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('replaces stored parts and reports whether a row changed', () => {
    const msg = persistence.appendMessage(conversationId, {
      role: 'assistant',
      content: 'x',
      parts,
    });
    const next: EgoMessagePart[] = [{ type: 'text', text: 'replaced' }];

    expect(persistence.updateMessageParts(msg.id, next)).toBe(true);
    expect(storedMessages()[0]?.parts).toEqual(next);
    expect(persistence.updateMessageParts('msg_missing', next)).toBe(false);
  });
});
