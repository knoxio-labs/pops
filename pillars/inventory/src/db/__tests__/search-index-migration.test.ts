/**
 * What `0015_items_fts_trigram` does to a database that already carries
 * `items` rows (POPS-4158).
 *
 * `0013_items_fts` was edited in place, after production had already applied
 * it, to add `tokenize = 'trigram'`. drizzle's sqlite migrator compares only
 * each journal entry's recorded timestamp against the newest one it has
 * applied (`open-inventory-db.ts`), never the file's contents, so that edit
 * was silently ignored: production kept the plain `unicode61` index while the
 * ranking code started assuming trigram substring matches. `0013` is reverted
 * to what it was on `main`; `0015_items_fts_trigram` is the real fix, and
 * needs its own coverage because `search.test.ts` only ever opens a database
 * that was empty before the whole journal ran.
 *
 * Shape follows `items-migration.test.ts`: stage a database through
 * `0012_items_single_identity` (the last entry before `items_fts` exists),
 * write `items` rows directly, then reopen with the real opener, which
 * applies `0013` through `0015` and, per `open-inventory-db.ts`, rebuilds
 * `items_fts` from those rows immediately after `0015` recreates it empty.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { makeClient } from '../../api/__tests__/test-utils.js';
import { createInventoryApiApp } from '../../api/app.js';
import { openInventoryDb } from '../open-inventory-db.js';
import { items } from '../schema.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

import type { OpenedInventoryDb } from '../open-inventory-db.js';

const BASELINE_TAG = '0012_items_single_identity';

let dir: string;
let dbPath: string;

interface SeedItem {
  id: string;
  name: string;
  code?: string | null;
  typeKey?: string | null;
  fields?: Record<string, unknown>;
  seq: number;
}

function seedItems(rows: readonly SeedItem[]): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });
  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw);
  migrate(db, { migrationsFolder: staged });

  for (const row of rows) {
    db.insert(items)
      .values({
        id: row.id,
        name: row.name,
        code: row.code ?? null,
        typeKey: row.typeKey ?? null,
        fields: JSON.stringify(row.fields ?? {}),
        placementKind: 'hand',
        lastEditedTime: '2026-01-01T00:00:00Z',
        seq: row.seq,
      })
      .run();
  }
  raw.close();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inventory-search-index-migration-'));
  dbPath = join(dir, 'inventory.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function ftsTokenizer(opened: OpenedInventoryDb): string {
  const row = opened.raw
    .prepare(`SELECT sql FROM sqlite_master WHERE name = 'items_fts'`)
    .get() as { sql: string };
  return row.sql;
}

describe('0015_items_fts_trigram on a database that already has items', () => {
  let opened: OpenedInventoryDb;

  beforeEach(() => {
    seedItems([
      { id: 'i-sledge', name: 'Sledgehammer', seq: 1 },
      {
        id: 'i-cable',
        name: 'HDMI cable',
        code: 'CBL-1',
        typeKey: 'cable',
        fields: { 'End A': 'USB-C', 'End B': 'HDMI' },
        seq: 2,
      },
      { id: 'i-lamp', name: 'Desk lamp', seq: 3 },
    ]);
    opened = openInventoryDb(dbPath);
  });

  afterEach(() => {
    opened.raw.close();
  });

  it('recreates items_fts with the trigram tokenizer', () => {
    expect(ftsTokenizer(opened)).toMatch(/tokenize\s*=\s*'trigram'/);
  });

  it('carries every live item into items_fts, one row each', () => {
    const rows = opened.raw
      .prepare(`SELECT id, name, code, external_ids FROM items_fts ORDER BY id`)
      .all() as { id: string; name: string; code: string; external_ids: string }[];
    expect(rows).toEqual([
      { id: 'i-cable', name: 'HDMI cable', code: 'CBL-1', external_ids: '' },
      { id: 'i-lamp', name: 'Desk lamp', code: '', external_ids: '' },
      { id: 'i-sledge', name: 'Sledgehammer', code: '', external_ids: '' },
    ]);
  });

  it("builds field_text from the item's type fields, same as the command layer's own row shape", () => {
    const row = opened.raw
      .prepare(`SELECT field_text FROM items_fts WHERE id = 'i-cable'`)
      .get() as { field_text: string };
    expect(row.field_text).toBe('USB-C HDMI');
  });

  it('finds a mid-word substring that only the trigram tokenizer can match', () => {
    const hits = opened.raw
      .prepare(`SELECT id FROM items_fts WHERE items_fts MATCH '"dgeh"' ORDER BY bm25(items_fts)`)
      .all() as { id: string }[];
    expect(hits).toEqual([{ id: 'i-sledge' }]);
  });

  it('serves that same substring through POST /search once the pillar boots on the upgraded database', async () => {
    const client = makeClient(
      createInventoryApiApp({
        inventoryDb: opened,
        version: '0.0.1-test',
        selfBaseUrl: 'http://localhost:3006',
      })
    );
    const { hits } = await client.search.run({ query: { text: 'dgeh' } });
    expect(hits.map((h) => h.data['itemName'])).toEqual(['Sledgehammer']);
  });
});

describe('0015_items_fts_trigram on a database with no items yet', () => {
  it('applies cleanly and leaves an empty, trigram-tokenized items_fts', () => {
    seedItems([]);
    const opened = openInventoryDb(dbPath);
    try {
      expect(ftsTokenizer(opened)).toMatch(/tokenize\s*=\s*'trigram'/);
      expect(opened.raw.prepare(`SELECT count(*) AS n FROM items_fts`).get()).toEqual({ n: 0 });
    } finally {
      opened.raw.close();
    }
  });
});

describe('0015_items_fts_trigram on a fresh database', () => {
  it('creates a trigram-tokenized items_fts with no rows', () => {
    const opened = openInventoryDb(dbPath);
    try {
      expect(ftsTokenizer(opened)).toMatch(/tokenize\s*=\s*'trigram'/);
      expect(opened.raw.prepare(`SELECT count(*) AS n FROM items_fts`).get()).toEqual({ n: 0 });
    } finally {
      opened.raw.close();
    }
  });
});
