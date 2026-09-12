/**
 * What `0010_inventory_containers` does to a database that predates it.
 *
 * Mirrors `migration-data-safety.test.ts`: bring a database up to
 * `0009_settings_baseline` from a truncated journal, write representative
 * `home_inventory`/`locations` rows through raw SQL exactly as the
 * pre-containers schema shaped them, then reopen it with the real opener,
 * which applies `0010_inventory_containers`. POPS-3581's "done when" names
 * this explicitly: "Migration applies cleanly on a database that already
 * holds items with a `locationId`."
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openInventoryDb } from '../open-inventory-db.js';
import { homeInventory } from '../schema.js';
import { createContainer, moveContainer } from '../services/containers.js';

import type { OpenedInventoryDb } from '../open-inventory-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

const BASELINE_TAG = '0009_settings_baseline';

let dir: string;
let dbPath: string;
let opened: OpenedInventoryDb;

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
      `INSERT INTO locations (id, name, parent_id, sort_order, last_edited_time)
       VALUES ('l-garage', 'Garage', NULL, 0, '2026-01-01T00:00:00Z')`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO home_inventory (id, item_name, location_id, last_edited_time)
       VALUES ('i-drill', 'Cordless drill', 'l-garage', '2026-01-05T00:00:00Z')`
    )
    .run();

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inventory-containers-migration-safety-'));
  dbPath = join(dir, 'inventory.db');
  seedThroughBaseline();
  opened = openInventoryDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying 0010_inventory_containers to a populated inventory database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows and keeps the pre-existing locationId untouched', () => {
    expect(count('home_inventory')).toBe(1);
    const item = opened.raw
      .prepare(`SELECT location_id, container_id FROM home_inventory WHERE id = 'i-drill'`)
      .get() as { location_id: string | null; container_id: string | null };
    expect(item.location_id).toBe('l-garage');
    expect(item.container_id).toBeNull();
  });

  it('leaves no broken foreign key anywhere in the database', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });

  it('the new containers table is fully usable after migrating: assign the pre-existing item and move it', () => {
    const db = opened.db;
    const box = createContainer(db, { label: 'Garage box 1', originLocationId: 'l-garage' });

    db.update(homeInventory)
      .set({ containerId: box.id })
      .where(eq(homeInventory.id, 'i-drill'))
      .run();

    const moved = moveContainer(db, box.id, 'l-garage');
    expect(moved.state).toBe('moved');

    const item = opened.raw
      .prepare(`SELECT location_id, container_id FROM home_inventory WHERE id = 'i-drill'`)
      .get() as { location_id: string | null; container_id: string | null };
    expect(item.container_id).toBe(box.id);
    expect(item.location_id).toBe('l-garage');
  });
});
