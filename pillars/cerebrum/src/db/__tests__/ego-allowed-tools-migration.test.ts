/** The allowed-tools migration must preserve conversations created before it runs. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { conversationAllowedToolsService, openCerebrumDb } from '../index.js';

import type { OpenedCerebrumDb } from '../open-cerebrum-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);
const BASELINE_TAG = '0059_ego_parts_actions';
const CONVERSATION_ID = 'conv-before-allowed-tools';

let dir: string;
let dbPath: string;
let existingConversationCount: number;
let opened: OpenedCerebrumDb;

function seedThroughBaseline(): number {
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
  const count = raw.prepare('SELECT count(*) AS count FROM conversations').get() as {
    count: number;
  };
  raw.close();
  return count.count;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cerebrum-ego-allowed-tools-'));
  dbPath = join(dir, 'cerebrum.db');
  existingConversationCount = seedThroughBaseline();
  opened = openCerebrumDb(dbPath, { loadVec: false });
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('0060_ego_allowed_tools on a populated database', () => {
  it('adds the nullable column without changing existing conversations', () => {
    const columns = opened.raw.prepare('PRAGMA table_info(conversations)').all() as {
      name: string;
    }[];
    const row = opened.raw
      .prepare('SELECT allowed_tools FROM conversations WHERE id = ?')
      .get(CONVERSATION_ID);

    expect(columns.map((column) => column.name)).toContain('allowed_tools');
    expect(row).toEqual({ allowed_tools: null });
    expect(conversationAllowedToolsService.getAllowedTools(opened.db, CONVERSATION_ID)).toEqual([]);
    expect(
      (
        opened.raw.prepare('SELECT count(*) AS count FROM conversations').get() as {
          count: number;
        }
      ).count
    ).toBe(existingConversationCount);
  });
});
