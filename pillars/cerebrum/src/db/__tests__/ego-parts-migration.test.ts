/**
 * The ego parts/actions migration against a database that already holds
 * conversations: the new column must not disturb old rows, the new tables
 * must default to `pending`, and every foreign key must cascade.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openCerebrumDb } from '../open-cerebrum-db.js';

import type { OpenedCerebrumDb } from '../open-cerebrum-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

const BASELINE_TAG = '0058_engram_search';
const CONVERSATION_ID = 'conv-1';

let dir: string;
let dbPath: string;
let opened: OpenedCerebrumDb;

function seedThroughBaseline(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });
  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  raw
    .prepare(
      `INSERT INTO conversations (id, title, active_scopes, model, created_at, updated_at)
       VALUES (?, 'Planning', '[]', 'm', '2026-06-01T10:00:00Z', '2026-06-01T10:00:00Z')`
    )
    .run(CONVERSATION_ID);
  const insertMessage = raw.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, ?, ?, '2026-06-01T10:00:00Z')`
  );
  insertMessage.run('msg-1', CONVERSATION_ID, 'user', 'hello');
  insertMessage.run('msg-2', CONVERSATION_ID, 'assistant', 'hi');
  raw
    .prepare(
      `INSERT INTO conversation_context (conversation_id, engram_id, relevance_score, loaded_at)
       VALUES (?, 'eng-1', 0.5, '2026-06-01T10:00:00Z')`
    )
    .run(CONVERSATION_ID);
  raw.close();
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function insertBatchWithAction(messageId: string): void {
  opened.raw
    .prepare(
      `INSERT INTO ego_action_batches (id, conversation_id, message_id, created_at)
       VALUES ('batch-1', ?, ?, '2026-06-01T10:01:00Z')`
    )
    .run(CONVERSATION_ID, messageId);
  opened.raw
    .prepare(
      `INSERT INTO ego_actions
         (id, batch_id, conversation_id, message_id, tool_use_id, position, tool, args, summary,
          created_at)
       VALUES ('act-1', 'batch-1', ?, ?, 'tu-1', 0, 'inventory_items_create', '{}', 'Add item',
               '2026-06-01T10:01:00Z')`
    )
    .run(CONVERSATION_ID, messageId);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-parts-'));
  dbPath = join(dir, 'cerebrum.db');
  seedThroughBaseline();
  opened = openCerebrumDb(dbPath, { loadVec: false });
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('0059_ego_parts_actions on a populated database', () => {
  it('keeps every existing row and leaves parts NULL', () => {
    expect(count('conversations')).toBe(1);
    expect(count('messages')).toBe(2);
    expect(count('conversation_context')).toBe(1);
    const parts = opened.raw.prepare(`SELECT parts FROM messages ORDER BY id`).all();
    expect(parts).toEqual([{ parts: null }, { parts: null }]);
  });

  it('adds the parts column to messages', () => {
    const columns = opened.raw.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain('parts');
  });

  it('defaults batch and action status to pending', () => {
    insertBatchWithAction('msg-2');
    expect(opened.raw.prepare(`SELECT status FROM ego_action_batches`).get()).toEqual({
      status: 'pending',
    });
    expect(opened.raw.prepare(`SELECT status FROM ego_actions`).get()).toEqual({
      status: 'pending',
    });
  });

  it('removes the batch and its actions when the message is deleted', () => {
    insertBatchWithAction('msg-2');
    opened.raw.prepare(`DELETE FROM messages WHERE id = 'msg-2'`).run();
    expect(count('ego_action_batches')).toBe(0);
    expect(count('ego_actions')).toBe(0);
  });

  it('removes the batch and its actions when the conversation is deleted', () => {
    insertBatchWithAction('msg-2');
    opened.raw.prepare(`DELETE FROM conversations WHERE id = ?`).run(CONVERSATION_ID);
    expect(count('ego_action_batches')).toBe(0);
    expect(count('ego_actions')).toBe(0);
  });

  it('removes the actions when only the batch is deleted', () => {
    insertBatchWithAction('msg-2');
    opened.raw.prepare(`DELETE FROM ego_action_batches WHERE id = 'batch-1'`).run();
    expect(count('ego_actions')).toBe(0);
    expect(count('messages')).toBe(2);
  });
});
