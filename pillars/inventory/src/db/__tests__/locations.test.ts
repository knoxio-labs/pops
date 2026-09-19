/**
 * Invariant tests for the locations service against an in-memory SQLite
 * brought up by the real migration journal. Pure DB + service layer.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { LocationNotFoundError } from '../errors.js';
import {
  getDeleteStats,
  getDescendantLocationIds,
  getLocationItems,
  getLocationPath,
} from '../services/locations-queries.js';
import { getChildren, getLocation, getLocationTree, listLocations } from '../services/locations.js';
import { seedInventoryItem } from './item-fixture.js';
import { seedLocation } from './location-fixture.js';
import { openMigratedTestDb } from './migrated-db.js';

import type { InventoryDb } from '../services/internal.js';

function freshDb(): InventoryDb {
  return openMigratedTestDb().db;
}

function seedItem(
  db: InventoryDb,
  name: string,
  locationId: string | null
): { id: string; locationId: string | null } {
  const row = seedInventoryItem(db, { name, ...(locationId === null ? {} : { locationId }) });
  return { id: row.id, locationId };
}

describe('listLocations', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty result when no rows', () => {
    expect(listLocations(db)).toEqual({ rows: [], total: 0 });
  });

  it('orders by sortOrder then name', () => {
    seedLocation(db, { name: 'Bedroom', sortOrder: 1 });
    seedLocation(db, { name: 'Kitchen', sortOrder: 0 });
    seedLocation(db, { name: 'Living Room', sortOrder: 0 });

    const result = listLocations(db);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.name)).toEqual(['Kitchen', 'Living Room', 'Bedroom']);
  });
});

describe('getLocation', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the row when present', () => {
    const created = seedLocation(db, { name: 'Home' });
    const row = getLocation(db, created.id);
    expect(row.id).toBe(created.id);
    expect(row.name).toBe('Home');
    expect(row.parentId).toBeNull();
  });

  it('throws LocationNotFoundError when missing', () => {
    expect(() => getLocation(db, 'nope')).toThrowError(LocationNotFoundError);
  });
});

describe('getLocationTree', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty tree when no rows', () => {
    expect(getLocationTree(db)).toEqual([]);
  });

  it('returns flat root list when no parent links', () => {
    seedLocation(db, { name: 'Home' });
    seedLocation(db, { name: 'Car' });
    const tree = getLocationTree(db);
    expect(tree).toHaveLength(2);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it('nests children under parents', () => {
    const home = seedLocation(db, { name: 'Home' });
    const kitchen = seedLocation(db, { name: 'Kitchen', parentId: home.id });
    seedLocation(db, { name: 'Pantry', parentId: kitchen.id });
    seedLocation(db, { name: 'Bedroom', parentId: home.id });

    const tree = getLocationTree(db);
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.name).toBe('Home');
    expect(root.children).toHaveLength(2);
    const kitchenNode = root.children.find((c) => c.name === 'Kitchen')!;
    expect(kitchenNode.children).toHaveLength(1);
    expect(kitchenNode.children[0]!.name).toBe('Pantry');
  });
});

describe('getChildren', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns only direct children', () => {
    const home = seedLocation(db, { name: 'Home' });
    seedLocation(db, { name: 'Kitchen', parentId: home.id });
    seedLocation(db, { name: 'Bedroom', parentId: home.id });
    seedLocation(db, { name: 'Car' });

    expect(getChildren(db, home.id)).toHaveLength(2);
  });
});

describe('getLocationPath', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns root-first breadcrumb', () => {
    const home = seedLocation(db, { name: 'Home' });
    const kitchen = seedLocation(db, { name: 'Kitchen', parentId: home.id });
    const pantry = seedLocation(db, { name: 'Pantry', parentId: kitchen.id });

    const path = getLocationPath(db, pantry.id);
    expect(path.map((r) => r.name)).toEqual(['Home', 'Kitchen', 'Pantry']);
  });

  it('throws LocationNotFoundError when location is missing', () => {
    expect(() => getLocationPath(db, 'nope')).toThrowError(LocationNotFoundError);
  });
});

describe('getDescendantLocationIds', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty array for a leaf', () => {
    const leaf = seedLocation(db, { name: 'Leaf' });
    expect(getDescendantLocationIds(db, leaf.id)).toEqual([]);
  });

  it('returns transitive descendants', () => {
    const home = seedLocation(db, { name: 'Home' });
    const kitchen = seedLocation(db, { name: 'Kitchen', parentId: home.id });
    const pantry = seedLocation(db, { name: 'Pantry', parentId: kitchen.id });
    const bedroom = seedLocation(db, { name: 'Bedroom', parentId: home.id });

    const ids = getDescendantLocationIds(db, home.id);
    expect(new Set(ids)).toEqual(new Set([kitchen.id, pantry.id, bedroom.id]));
  });
});

describe('getDeleteStats', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns zeros for an empty leaf', () => {
    const leaf = seedLocation(db, { name: 'Empty' });
    expect(getDeleteStats(db, leaf.id)).toEqual({
      childCount: 0,
      descendantCount: 0,
      itemCount: 0,
      totalItemCount: 0,
    });
  });

  it('counts direct children and transitive descendants', () => {
    const home = seedLocation(db, { name: 'Home' });
    const kitchen = seedLocation(db, { name: 'Kitchen', parentId: home.id });
    seedLocation(db, { name: 'Pantry', parentId: kitchen.id });
    seedLocation(db, { name: 'Bedroom', parentId: home.id });

    const stats = getDeleteStats(db, home.id);
    expect(stats.childCount).toBe(2);
    expect(stats.descendantCount).toBe(3);
  });

  it('counts items in this location and descendants', () => {
    const home = seedLocation(db, { name: 'Home' });
    const kitchen = seedLocation(db, { name: 'Kitchen', parentId: home.id });

    seedItem(db, 'Fridge', kitchen.id);
    seedItem(db, 'Oven', kitchen.id);
    seedItem(db, 'Couch', home.id);

    const stats = getDeleteStats(db, home.id);
    expect(stats.itemCount).toBe(1);
    expect(stats.totalItemCount).toBe(3);
  });

  it('throws LocationNotFoundError for missing id', () => {
    expect(() => getDeleteStats(db, 'nope')).toThrowError(LocationNotFoundError);
  });
});

describe('getLocationItems', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns items directly in the location', () => {
    const kitchen = seedLocation(db, { name: 'Kitchen' });
    seedItem(db, 'Fridge', kitchen.id);
    seedItem(db, 'Oven', kitchen.id);
    seedItem(db, 'Couch', null);

    const result = getLocationItems(db, {
      locationId: kitchen.id,
      includeChildren: false,
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.name).toSorted()).toEqual(['Fridge', 'Oven']);
  });

  it('includes descendant items when includeChildren is true', () => {
    const home = seedLocation(db, { name: 'Home' });
    const kitchen = seedLocation(db, { name: 'Kitchen', parentId: home.id });
    seedItem(db, 'Couch', home.id);
    seedItem(db, 'Fridge', kitchen.id);

    const result = getLocationItems(db, {
      locationId: home.id,
      includeChildren: true,
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(2);
  });

  it('respects limit + offset', () => {
    const kitchen = seedLocation(db, { name: 'Kitchen' });
    for (let i = 0; i < 5; i++) seedItem(db, `Item ${i}`, kitchen.id);

    const page1 = getLocationItems(db, {
      locationId: kitchen.id,
      includeChildren: false,
      limit: 2,
      offset: 0,
    });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = getLocationItems(db, {
      locationId: kitchen.id,
      includeChildren: false,
      limit: 2,
      offset: 2,
    });
    expect(page2.rows).toHaveLength(2);
    expect(page2.rows[0]!.name).not.toBe(page1.rows[0]!.name);
  });

  it('throws LocationNotFoundError when location missing', () => {
    expect(() =>
      getLocationItems(db, {
        locationId: 'nope',
        includeChildren: false,
        limit: 50,
        offset: 0,
      })
    ).toThrowError(LocationNotFoundError);
  });
});
