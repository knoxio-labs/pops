import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import {
  clearPillarTables,
  isPreservedTable,
  listClearableTables,
} from '../clear-pillar-tables.js';

function seededDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC);
    INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('abc', 1), ('def', 2);
    CREATE TABLE _litestream_seq (id INTEGER PRIMARY KEY, seq INTEGER);
    INSERT INTO _litestream_seq (id, seq) VALUES (1, 42);
    CREATE TABLE locations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE "home inventory" (
      id INTEGER PRIMARY KEY,
      location_id INTEGER NOT NULL REFERENCES locations(id),
      owner_uri TEXT
    );
    CREATE INDEX home_inventory_owner_uri_idx ON "home inventory" (owner_uri);
    CREATE VIEW live_items AS SELECT id FROM "home inventory";
    INSERT INTO locations (name) VALUES ('kitchen'), ('garage');
    INSERT INTO "home inventory" (id, location_id, owner_uri)
      VALUES (1, 1, 'pops://core/user/a'), (2, 2, NULL);
  `);
  return db;
}

describe('isPreservedTable', () => {
  it.each(['sqlite_sequence', '__drizzle_migrations', '_litestream_seq', '_litestream_lock'])(
    'preserves %s',
    (name: string) => {
      expect(isPreservedTable(name)).toBe(true);
    }
  );

  it.each(['locations', 'home_inventory', 'budgets'])('clears %s', (name: string) => {
    expect(isPreservedTable(name)).toBe(false);
  });
});

describe('listClearableTables', () => {
  it('lists user tables only, excluding the journal and replication bookkeeping', () => {
    const db = seededDatabase();
    expect(listClearableTables(db)).toEqual(['home inventory', 'locations']);
    db.close();
  });
});

describe('clearPillarTables', () => {
  it('deletes every user row and reports per-table counts', () => {
    const db = seededDatabase();
    const cleared = clearPillarTables(db);
    expect(cleared).toEqual([
      { table: 'home inventory', deleted: 2 },
      { table: 'locations', deleted: 2 },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS c FROM locations').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM "home inventory"').get()).toEqual({ c: 0 });
    db.close();
  });

  it('preserves the migration journal so the next boot applies nothing', () => {
    const db = seededDatabase();
    clearPillarTables(db);
    expect(db.prepare('SELECT COUNT(*) AS c FROM __drizzle_migrations').get()).toEqual({ c: 2 });
    db.close();
  });

  it('preserves litestream bookkeeping rows', () => {
    const db = seededDatabase();
    clearPillarTables(db);
    expect(db.prepare('SELECT seq FROM _litestream_seq WHERE id = 1').get()).toEqual({ seq: 42 });
    db.close();
  });

  it('preserves tables, indexes and views', () => {
    const db = seededDatabase();
    clearPillarTables(db);
    const objects = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','index','view') ORDER BY name"
      )
      .all()
      .map((row) => row['name']);
    expect(objects).toContain('home inventory');
    expect(objects).toContain('home_inventory_owner_uri_idx');
    expect(objects).toContain('live_items');
    db.close();
  });

  it('resets AUTOINCREMENT counters so a reseed produces the same ids', () => {
    const db = seededDatabase();
    clearPillarTables(db);
    db.exec("INSERT INTO locations (name) VALUES ('pantry')");
    expect(db.prepare('SELECT id FROM locations').get()).toEqual({ id: 1 });
    db.close();
  });

  it('clears a child table referencing a parent without tripping foreign keys', () => {
    const db = seededDatabase();
    db.exec('PRAGMA foreign_keys = ON');
    expect(() => clearPillarTables(db)).not.toThrow();
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it('is idempotent — a second run deletes nothing', () => {
    const db = seededDatabase();
    clearPillarTables(db);
    expect(clearPillarTables(db)).toEqual([
      { table: 'home inventory', deleted: 0 },
      { table: 'locations', deleted: 0 },
    ]);
    db.close();
  });
});
