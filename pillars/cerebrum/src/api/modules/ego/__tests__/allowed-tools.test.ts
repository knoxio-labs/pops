import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import { ConversationPersistence } from '../persistence.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
let persistence: ConversationPersistence;
let conversationId: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ego-allowed-tools-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
  persistence = new ConversationPersistence({ db: cerebrumDb.db });
  conversationId = persistence.createConversation({ model: 'm' }).id;
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('conversation allowed tools', () => {
  it('merges names once each in first-seen order', () => {
    expect(
      persistence.addAllowedTools(conversationId, ['inventory_items_list', 'media_movies_search'])
    ).toEqual(['inventory_items_list', 'media_movies_search']);
    expect(
      persistence.addAllowedTools(conversationId, [
        'inventory_items_create',
        'inventory_items_list',
        'media_movies_search',
      ])
    ).toEqual(['inventory_items_list', 'media_movies_search', 'inventory_items_create']);
    expect(persistence.getAllowedTools(conversationId)).toEqual([
      'inventory_items_list',
      'media_movies_search',
      'inventory_items_create',
    ]);
  });

  it('keeps lists isolated to their conversation', () => {
    const otherConversationId = persistence.createConversation({ model: 'm' }).id;
    persistence.addAllowedTools(conversationId, ['inventory_items_list']);

    expect(persistence.getAllowedTools(otherConversationId)).toEqual([]);
    expect(persistence.addAllowedTools(otherConversationId, ['media_movies_search'])).toEqual([
      'media_movies_search',
    ]);
    expect(persistence.getAllowedTools(conversationId)).toEqual(['inventory_items_list']);
  });

  it('returns an empty list for an unknown conversation', () => {
    expect(persistence.addAllowedTools('missing', ['inventory_items_list'])).toBeNull();
    expect(persistence.getAllowedTools('missing')).toEqual([]);
  });

  it('returns an empty list for malformed JSON and non-string arrays', () => {
    const invalidId = persistence.createConversation({ model: 'm' }).id;
    const wrongShapeId = persistence.createConversation({ model: 'm' }).id;
    const update = cerebrumDb.raw.prepare(
      'UPDATE conversations SET allowed_tools = ? WHERE id = ?'
    );
    update.run('{not json', invalidId);
    update.run('{"a":1}', wrongShapeId);

    expect(persistence.getAllowedTools(invalidId)).toEqual([]);
    expect(persistence.getAllowedTools(wrongShapeId)).toEqual([]);
  });

  it('does not include allowed tools in the conversation response shape', () => {
    persistence.addAllowedTools(conversationId, ['inventory_items_list']);

    expect(persistence.getConversation(conversationId)?.conversation).not.toHaveProperty(
      'allowedTools'
    );
  });
});
