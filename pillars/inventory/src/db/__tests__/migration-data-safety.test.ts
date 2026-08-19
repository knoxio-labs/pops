/**
 * What the migration chain does to inventory rows that were already stored.
 *
 * Every other test in this pillar opens a database that was empty when the
 * migrations ran, so a chain that drops rows, mangles a backfill or breaks a
 * foreign key passes all of them and is discovered against the live file —
 * where inventory keeps the one dataset nobody can re-derive.
 *
 * The shape: bring a database up to `0007_locations_parent_sort_index` from a
 * truncated journal, write representative rows through raw SQL, then reopen
 * it with the real opener, which applies every entry after that point. The
 * entry under test is `0008_cross_pillar_uri_denorm`, which adds four columns
 * to `home_inventory` and backfills `purchase_transaction_uri` from the
 * legacy `purchase_transaction_id` column for rows that have one.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openInventoryDb } from '../open-inventory-db.js';

import type { OpenedInventoryDb } from '../open-inventory-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The last entry that exists before `0008_cross_pillar_uri_denorm` runs. */
const BASELINE_TAG = '0007_locations_parent_sort_index';

interface SeededItem {
  readonly id: string;
  readonly itemName: string;
  readonly locationId: string | null;
  readonly purchaseTransactionId: string | null;
}

const ITEMS: readonly SeededItem[] = [
  {
    id: 'i-couch',
    itemName: 'Sectional couch',
    locationId: 'l-living-room',
    purchaseTransactionId: 'txn-1234',
  },
  {
    id: 'i-heirloom-clock',
    itemName: 'Grandfather clock',
    locationId: 'l-living-room',
    purchaseTransactionId: null,
  },
  {
    id: 'i-orphan-fan',
    itemName: 'Ceiling fan',
    locationId: null,
    purchaseTransactionId: '',
  },
];

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
       VALUES ('l-living-room', 'Living Room', NULL, 0, '2026-01-01T00:00:00Z')`
    )
    .run();

  for (const item of ITEMS) {
    raw
      .prepare(
        `INSERT INTO home_inventory
           (id, item_name, location_id, purchase_transaction_id, last_edited_time)
         VALUES (?, ?, ?, ?, '2026-01-05T00:00:00Z')`
      )
      .run(item.id, item.itemName, item.locationId, item.purchaseTransactionId);
  }

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inventory-migration-safety-'));
  dbPath = join(dir, 'inventory.db');
  seedThroughBaseline();
  opened = openInventoryDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying the rest of the journal to a populated inventory database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows from any seeded table', () => {
    expect(count('home_inventory')).toBe(ITEMS.length);
    expect(count('locations')).toBe(1);
  });

  it('removes the pre-migration snapshot it took on the way through', () => {
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('backfills the URI from the legacy id for a row that has one', () => {
    const stored = opened.raw
      .prepare(`SELECT purchase_transaction_uri FROM home_inventory WHERE id = ?`)
      .get('i-couch') as { purchase_transaction_uri: string | null };
    expect(stored.purchase_transaction_uri).toBe('pops://finance/transaction/txn-1234');
  });

  it('leaves the URI null rather than inventing one, for both null and empty legacy ids', () => {
    const stored = new Map(
      rows<{ id: string; purchase_transaction_uri: string | null }>(
        `SELECT id, purchase_transaction_uri FROM home_inventory`
      ).map((row) => [row.id, row.purchase_transaction_uri])
    );
    expect(stored.get('i-heirloom-clock')).toBeNull();
    expect(stored.get('i-orphan-fan')).toBeNull();
  });

  it('leaves the new staleness markers null for every seeded row', () => {
    const stored = rows<{
      purchase_transaction_stale_at: string | null;
      owner_uri: string | null;
      owner_stale_at: string | null;
    }>(`SELECT purchase_transaction_stale_at, owner_uri, owner_stale_at FROM home_inventory`);
    for (const row of stored) {
      expect(row.purchase_transaction_stale_at).toBeNull();
      expect(row.owner_uri).toBeNull();
      expect(row.owner_stale_at).toBeNull();
    }
  });

  it('keeps every original column untouched', () => {
    const stored = rows<{
      id: string;
      item_name: string;
      location_id: string | null;
      purchase_transaction_id: string | null;
    }>(
      `SELECT id, item_name, location_id, purchase_transaction_id FROM home_inventory ORDER BY id`
    );
    expect(stored).toEqual(
      [...ITEMS]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => ({
          id: item.id,
          item_name: item.itemName,
          location_id: item.locationId,
          purchase_transaction_id: item.purchaseTransactionId,
        }))
    );
  });

  it('keeps every item attached to its location, and tolerates one with none', () => {
    const stored = rows<{ id: string; location_name: string | null }>(
      `SELECT i.id, l.name AS location_name FROM home_inventory i
       LEFT JOIN locations l ON l.id = i.location_id ORDER BY i.id`
    );
    const byId = new Map(stored.map((row) => [row.id, row.location_name]));
    expect(byId.get('i-couch')).toBe('Living Room');
    expect(byId.get('i-heirloom-clock')).toBe('Living Room');
    expect(byId.get('i-orphan-fan')).toBeNull();
  });

  it('leaves no broken foreign key anywhere in the database', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });
});
