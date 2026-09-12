/**
 * Invariant tests for the containers service against an in-memory SQLite
 * seeded with the canonical `locations` migration plus a trimmed
 * `containers` + `home_inventory` shape covering the columns this slice
 * exercises — same convention `locations.test.ts` uses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ContainerDestinationLocationNotFoundError,
  ContainerNotFoundError,
  ContainerOriginLocationNotFoundError,
} from '../errors.js';
import { homeInventory } from '../schema.js';
import {
  createContainer,
  deleteContainer,
  getContainer,
  getContainerCurrentLocationId,
  getContainerItems,
  listContainers,
  moveContainer,
  sealContainer,
  unpackContainer,
  updateContainer,
} from '../services/containers.js';
import { createLocation } from '../services/locations.js';

import type { InventoryDb } from '../services/internal.js';

const LOCATIONS_MIGRATION = join(__dirname, '../../../migrations/0005_fancy_crystal.sql');

const CONTAINERS_DDL = `
CREATE TABLE containers (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  code text,
  state text DEFAULT 'open' NOT NULL,
  origin_location_id text REFERENCES locations(id) ON DELETE set null,
  destination_location_id text REFERENCES locations(id) ON DELETE set null,
  notes text,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  updated_at text DEFAULT (datetime('now')) NOT NULL,
  CONSTRAINT ck_containers_state CHECK(state IN ('open','sealed','moved','unpacked'))
);

CREATE TABLE home_inventory (
  id text PRIMARY KEY NOT NULL,
  notion_id text UNIQUE,
  item_name text NOT NULL,
  brand text,
  model text,
  item_id text,
  room text,
  location text,
  type text,
  condition text DEFAULT 'Good',
  in_use integer,
  deductible integer,
  purchase_date text,
  warranty_expires text,
  replacement_value real,
  resale_value real,
  purchase_transaction_id text,
  purchase_transaction_uri text,
  purchase_transaction_stale_at text,
  purchased_from_id text,
  purchased_from_name text,
  purchase_price real,
  owner_uri text,
  owner_stale_at text,
  asset_id text UNIQUE,
  source_ref text UNIQUE,
  notes text,
  location_id text REFERENCES locations(id) ON DELETE set null,
  container_id text REFERENCES containers(id) ON DELETE set null,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  last_edited_time text NOT NULL
);
`;

function freshDb(): InventoryDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(LOCATIONS_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  raw.exec(CONTAINERS_DDL);
  return drizzle(raw);
}

function seedItem(db: InventoryDb, id: string, name: string, containerId: string | null): void {
  db.insert(homeInventory)
    .values({ id, itemName: name, containerId, lastEditedTime: new Date().toISOString() })
    .run();
}

function findItem(db: InventoryDb, id: string) {
  return db
    .select()
    .from(homeInventory)
    .all()
    .find((row) => row.id === id);
}

describe('listContainers', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty result when no rows', () => {
    expect(listContainers(db)).toEqual({ rows: [], total: 0 });
  });

  it('filters by state', () => {
    const a = createContainer(db, { label: 'Box A' });
    sealContainer(db, a.id);
    createContainer(db, { label: 'Box B' });

    expect(listContainers(db, { state: 'sealed' }).rows.map((r) => r.label)).toEqual(['Box A']);
    expect(listContainers(db).total).toBe(2);
  });
});

describe('createContainer', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('creates a container in the open state with no location', () => {
    const row = createContainer(db, { label: 'Kitchen box 1' });
    expect(row.label).toBe('Kitchen box 1');
    expect(row.state).toBe('open');
    expect(row.originLocationId).toBeNull();
    expect(row.destinationLocationId).toBeNull();
  });

  it('records the origin location', () => {
    const kitchen = createLocation(db, { name: 'Kitchen' });
    const row = createContainer(db, { label: 'Box', originLocationId: kitchen.id });
    expect(row.originLocationId).toBe(kitchen.id);
  });

  it('throws ContainerOriginLocationNotFoundError for a missing origin', () => {
    expect(() => createContainer(db, { label: 'Box', originLocationId: 'nope' })).toThrowError(
      ContainerOriginLocationNotFoundError
    );
  });
});

describe('getContainer', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('throws ContainerNotFoundError when missing', () => {
    expect(() => getContainer(db, 'nope')).toThrowError(ContainerNotFoundError);
  });
});

describe('updateContainer', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('updates label, code and notes', () => {
    const created = createContainer(db, { label: 'Old label' });
    const updated = updateContainer(db, created.id, {
      label: 'New label',
      code: 'BOX-001',
      notes: 'fragile',
    });
    expect(updated.label).toBe('New label');
    expect(updated.code).toBe('BOX-001');
    expect(updated.notes).toBe('fragile');
  });

  it('throws ContainerNotFoundError for missing id', () => {
    expect(() => updateContainer(db, 'nope', { label: 'X' })).toThrowError(ContainerNotFoundError);
  });

  it('throws ContainerOriginLocationNotFoundError for a bad origin', () => {
    const created = createContainer(db, { label: 'Box' });
    expect(() => updateContainer(db, created.id, { originLocationId: 'nope' })).toThrowError(
      ContainerOriginLocationNotFoundError
    );
  });
});

describe('sealContainer / unpackContainer', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('seals an open container', () => {
    const created = createContainer(db, { label: 'Box' });
    const sealed = sealContainer(db, created.id);
    expect(sealed.state).toBe('sealed');
  });

  it('unpacks a container', () => {
    const created = createContainer(db, { label: 'Box' });
    const unpacked = unpackContainer(db, created.id);
    expect(unpacked.state).toBe('unpacked');
  });

  it('throws ContainerNotFoundError for missing id', () => {
    expect(() => sealContainer(db, 'nope')).toThrowError(ContainerNotFoundError);
    expect(() => unpackContainer(db, 'nope')).toThrowError(ContainerNotFoundError);
  });
});

describe('getContainerCurrentLocationId', () => {
  it('is the origin before a move', () => {
    expect(
      getContainerCurrentLocationId({ originLocationId: 'l-a', destinationLocationId: null })
    ).toBe('l-a');
  });

  it('is the destination once moved', () => {
    expect(
      getContainerCurrentLocationId({ originLocationId: 'l-a', destinationLocationId: 'l-b' })
    ).toBe('l-b');
  });
});

describe('moveContainer — the cascade this ticket exists for', () => {
  let db: InventoryDb;
  let garage: { id: string };
  let storageUnit: { id: string };

  beforeEach(() => {
    db = freshDb();
    garage = createLocation(db, { name: 'Garage' });
    storageUnit = createLocation(db, { name: 'Storage unit' });
  });

  it('sets state to moved and records the destination', () => {
    const box = createContainer(db, { label: 'Box', originLocationId: garage.id });
    const moved = moveContainer(db, box.id, storageUnit.id);
    expect(moved.state).toBe('moved');
    expect(moved.destinationLocationId).toBe(storageUnit.id);
    expect(getContainerCurrentLocationId(moved)).toBe(storageUnit.id);
  });

  it("relocates every item inside it in one write — every contained item's locationId changes", () => {
    const box = createContainer(db, { label: 'Box', originLocationId: garage.id });
    seedItem(db, 'i-kettle', 'Kettle', box.id);
    seedItem(db, 'i-toaster', 'Toaster', box.id);
    seedItem(db, 'i-unrelated', 'Unrelated lamp', null);

    moveContainer(db, box.id, storageUnit.id);

    const { rows } = getContainerItems(db, box.id, 50, 0);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.locationId).toBe(storageUnit.id);
    }

    expect(findItem(db, 'i-unrelated')?.locationId).toBeNull();
  });

  it('throws ContainerNotFoundError for a missing container', () => {
    expect(() => moveContainer(db, 'nope', storageUnit.id)).toThrowError(ContainerNotFoundError);
  });

  it('throws ContainerDestinationLocationNotFoundError for a missing destination', () => {
    const box = createContainer(db, { label: 'Box' });
    expect(() => moveContainer(db, box.id, 'nope')).toThrowError(
      ContainerDestinationLocationNotFoundError
    );
  });

  it('does not touch items belonging to a different container', () => {
    const boxA = createContainer(db, { label: 'Box A', originLocationId: garage.id });
    const boxB = createContainer(db, { label: 'Box B', originLocationId: garage.id });
    seedItem(db, 'i-a', 'In box A', boxA.id);
    seedItem(db, 'i-b', 'In box B', boxB.id);

    moveContainer(db, boxA.id, storageUnit.id);

    expect(findItem(db, 'i-b')?.locationId).toBeNull();
  });
});

describe('deleteContainer — empties it, never deletes its items', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('deletes the container row', () => {
    const created = createContainer(db, { label: 'Box' });
    deleteContainer(db, created.id);
    expect(() => getContainer(db, created.id)).toThrowError(ContainerNotFoundError);
  });

  it("leaves the container's items in place with containerId cleared", () => {
    const box = createContainer(db, { label: 'Box' });
    seedItem(db, 'i-kettle', 'Kettle', box.id);
    seedItem(db, 'i-toaster', 'Toaster', box.id);

    deleteContainer(db, box.id);

    const remaining = db.select().from(homeInventory).all();
    expect(remaining).toHaveLength(2);
    for (const row of remaining) {
      expect(row.containerId).toBeNull();
    }
  });

  it('throws ContainerNotFoundError when missing', () => {
    expect(() => deleteContainer(db, 'nope')).toThrowError(ContainerNotFoundError);
  });
});

describe('getContainerItems', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns only items in the given container', () => {
    const box = createContainer(db, { label: 'Box' });
    seedItem(db, 'i-a', 'A', box.id);
    seedItem(db, 'i-b', 'B', null);

    const { rows, total } = getContainerItems(db, box.id, 50, 0);
    expect(total).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(['i-a']);
  });

  it('throws ContainerNotFoundError when the container is missing', () => {
    expect(() => getContainerItems(db, 'nope', 50, 0)).toThrowError(ContainerNotFoundError);
  });
});
