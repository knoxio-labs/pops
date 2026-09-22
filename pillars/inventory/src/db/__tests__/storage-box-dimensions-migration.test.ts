import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openInventoryDb } from '../open-inventory-db.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

import type { OpenedInventoryDb } from '../open-inventory-db.js';

const BASELINE_TAG = '0015_items_fts_trigram';

let directory: string;
let databasePath: string;
let opened: OpenedInventoryDb;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inventory-storage-box-migration-'));
  databasePath = join(directory, 'inventory.db');
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(directory, 'staged-migrations'),
  });
  const raw = new Database(databasePath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });
  raw
    .prepare(
      `INSERT INTO locations (id, name, sort_order, last_edited_time)
       VALUES ('garage', 'Garage', 0, '2026-09-22T00:00:00Z')`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO items (
         id, name, type_key, fields, placement_kind, location_id, is_container, access,
         last_edited_time, revision, seq
       ) VALUES (
         'box', 'Garage crate', 'storage_box',
         '{"Capacity":{"value":52,"unit":"L"},"Footprint":"600 x 400 x 320","Load limit":{"value":30,"unit":"kg"},"Stackable":true}',
         'location', 'garage', 1, 'open', '2026-09-22T00:00:00Z', 1, 1
       )`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO items_fts (id, name, code, note, type_label, field_text, external_ids)
       VALUES ('box', 'Garage crate', '', '', 'Storage box', '600 x 400 x 320', '')`
    )
    .run();
  raw.close();

  opened = openInventoryDb(databasePath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('0016_storage_box_dimensions', () => {
  it('removes only the superseded footprint and records the catalogue migration', () => {
    const item = opened.raw
      .prepare(`SELECT fields, revision, seq FROM items WHERE id = 'box'`)
      .get() as { fields: string; revision: number; seq: number };
    const event = opened.raw
      .prepare(
        `SELECT seq, before, after, actor_kind, actor_id
         FROM events WHERE entity_id = 'box' ORDER BY seq DESC LIMIT 1`
      )
      .get() as {
      seq: number;
      before: string;
      after: string;
      actor_kind: string;
      actor_id: string;
    };

    expect(JSON.parse(item.fields)).toEqual({
      Capacity: { value: 52, unit: 'L' },
      'Load limit': { value: 30, unit: 'kg' },
      Stackable: true,
    });
    expect(item.revision).toBe(2);
    expect(item.seq).toBe(event.seq);
    expect(JSON.parse(event.before)).toHaveProperty('fields.Footprint', '600 x 400 x 320');
    expect(JSON.parse(event.after)).not.toHaveProperty('fields.Footprint');
    expect(event).toMatchObject({
      actor_kind: 'migration',
      actor_id: '0016_storage_box_dimensions',
    });
  });

  it('rebuilds search without the removed footprint', () => {
    const indexed = opened.raw
      .prepare(`SELECT field_text FROM items_fts WHERE id = 'box'`)
      .get() as { field_text: string };

    expect(indexed.field_text).toBe('');
  });
});
