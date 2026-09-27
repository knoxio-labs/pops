import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { registerPersistedItemTypesMigrationFunctions } from '../migrations/persisted-item-types-bootstrap.js';
import { openInventoryDb } from '../open-inventory-db.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

const BASELINE_TAG = '0023_item_type_parent';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inventory-compact-photo-positions-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function migratedBeforeCompaction(path: string): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(directory, 'staged-migrations'),
  });
  const raw = new Database(path);
  raw.pragma('foreign_keys = ON');
  registerPersistedItemTypesMigrationFunctions(raw);
  migrate(drizzle(raw), { migrationsFolder: staged });
  raw.exec(`
    INSERT INTO items (id, name, placement_kind, last_edited_time, seq)
    VALUES ('lamp', 'Lamp', 'hand', '2026-09-22T00:00:00Z', 1),
           ('box', 'Box', 'hand', '2026-09-22T00:00:00Z', 2);
    INSERT INTO item_photos (id, item_id, file_path, position)
    VALUES (11, 'lamp', 'lamp-a.jpg', 4),
           (12, 'lamp', 'lamp-b.jpg', 1),
           (13, 'lamp', 'lamp-c.jpg', 1),
           (21, 'box', 'box-a.jpg', 3),
           (22, 'box', 'box-b.jpg', 7);
  `);
  raw.close();
}

describe('0024_compact_item_photo_positions', () => {
  it('compacts each item independently and breaks tied positions by row id', () => {
    const path = join(directory, 'inventory.db');
    migratedBeforeCompaction(path);

    const opened = openInventoryDb(path);
    const rows = opened.raw
      .prepare('SELECT id, item_id, position FROM item_photos ORDER BY id')
      .all() as { id: number; item_id: string; position: number }[];

    expect(rows).toEqual([
      { id: 11, item_id: 'lamp', position: 2 },
      { id: 12, item_id: 'lamp', position: 0 },
      { id: 13, item_id: 'lamp', position: 1 },
      { id: 21, item_id: 'box', position: 0 },
      { id: 22, item_id: 'box', position: 1 },
    ]);

    opened.raw.close();
  });
});
