/**
 * Integration tests for inventory items and locations — subtree filtering,
 * breadcrumb generation, cascade deletes, assetId uniqueness, and 404 cases.
 *
 * All tests use the real in-memory SQLite database via the tRPC caller.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedInventoryItem, seedLocation, setupTestContext } from '../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';

import type { createCaller } from '../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  ctx.teardown();
});

// ---------------------------------------------------------------------------
// items.list — includeChildren subtree filter
// ---------------------------------------------------------------------------

describe('items.list — includeChildren subtree filter', () => {
  it('returns only items at the exact location when includeChildren is false', async () => {
    const houseId = seedLocation(db, { name: 'House' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: houseId });

    seedInventoryItem(db, { item_name: 'Couch', location_id: houseId });
    seedInventoryItem(db, { item_name: 'Blender', location_id: kitchenId });
    seedInventoryItem(db, { item_name: 'Unlocated' });

    const result = await caller.inventory.items.list({
      locationId: houseId,
      includeChildren: false,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.itemName).toBe('Couch');
    expect(result.pagination.total).toBe(1);
  });

  it('returns items from the location and all descendants when includeChildren is true', async () => {
    // House → Kitchen → Pantry (three levels)
    const houseId = seedLocation(db, { name: 'House' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: houseId });
    const pantryId = seedLocation(db, { name: 'Pantry', parent_id: kitchenId });

    seedInventoryItem(db, { item_name: 'Couch', location_id: houseId });
    seedInventoryItem(db, { item_name: 'Blender', location_id: kitchenId });
    seedInventoryItem(db, { item_name: 'Rice', location_id: pantryId });
    seedInventoryItem(db, { item_name: 'Unlocated' }); // must not appear

    const result = await caller.inventory.items.list({
      locationId: houseId,
      includeChildren: true,
    });

    expect(result.pagination.total).toBe(3);
    const names = result.data.map((i) => i.itemName).toSorted();
    expect(names).toEqual(['Blender', 'Couch', 'Rice']);
  });

  it('includes items from a sibling subtree only when requested on the sibling', async () => {
    const houseId = seedLocation(db, { name: 'House' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: houseId });
    const bedroomId = seedLocation(db, { name: 'Bedroom', parent_id: houseId });

    seedInventoryItem(db, { item_name: 'Blender', location_id: kitchenId });
    seedInventoryItem(db, { item_name: 'Bed', location_id: bedroomId });

    // Requesting Kitchen with includeChildren should NOT return Bed
    const result = await caller.inventory.items.list({
      locationId: kitchenId,
      includeChildren: true,
    });

    expect(result.pagination.total).toBe(1);
    expect(result.data[0]!.itemName).toBe('Blender');
  });

  it('handles four levels of nesting correctly', async () => {
    const l1 = seedLocation(db, { name: 'Home' });
    const l2 = seedLocation(db, { name: 'Floor', parent_id: l1 });
    const l3 = seedLocation(db, { name: 'Room', parent_id: l2 });
    const l4 = seedLocation(db, { name: 'Shelf', parent_id: l3 });

    seedInventoryItem(db, { item_name: 'Book', location_id: l4 });
    seedInventoryItem(db, { item_name: 'Box', location_id: l2 });

    const result = await caller.inventory.items.list({
      locationId: l1,
      includeChildren: true,
    });

    expect(result.pagination.total).toBe(2);
  });

  it('returns empty list when no items exist in the subtree', async () => {
    const parentId = seedLocation(db, { name: 'Empty Room' });
    seedLocation(db, { name: 'Sub Room', parent_id: parentId });

    const result = await caller.inventory.items.list({
      locationId: parentId,
      includeChildren: true,
    });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('paginates correctly when includeChildren returns many items', async () => {
    const parentId = seedLocation(db, { name: 'Warehouse' });
    const childId = seedLocation(db, { name: 'Section A', parent_id: parentId });

    for (let i = 0; i < 5; i++) {
      seedInventoryItem(db, { item_name: `Parent Item ${i}`, location_id: parentId });
    }
    for (let i = 0; i < 5; i++) {
      seedInventoryItem(db, { item_name: `Child Item ${i}`, location_id: childId });
    }

    const page1 = await caller.inventory.items.list({
      locationId: parentId,
      includeChildren: true,
      limit: 4,
      offset: 0,
    });

    expect(page1.data).toHaveLength(4);
    expect(page1.pagination.total).toBe(10);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.inventory.items.list({
      locationId: parentId,
      includeChildren: true,
      limit: 4,
      offset: 4,
    });

    expect(page2.data).toHaveLength(4);

    // No overlap between pages
    const page1Ids = page1.data.map((i) => i.id);
    const page2Ids = page2.data.map((i) => i.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// items.list — locationId filter without includeChildren (exact match)
// ---------------------------------------------------------------------------

describe('items.list — locationId exact filter (includeChildren defaults to false)', () => {
  it('filters by locationId when includeChildren is omitted', async () => {
    const officeId = seedLocation(db, { name: 'Office' });
    const bedroomId = seedLocation(db, { name: 'Bedroom' });

    seedInventoryItem(db, { item_name: 'Desk', location_id: officeId });
    seedInventoryItem(db, { item_name: 'Bed', location_id: bedroomId });

    const result = await caller.inventory.items.list({ locationId: officeId });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.itemName).toBe('Desk');
  });
});

// ---------------------------------------------------------------------------
// items.searchByAssetId
// ---------------------------------------------------------------------------

describe('items.searchByAssetId', () => {
  it('returns the item when asset ID matches exactly', async () => {
    seedInventoryItem(db, { item_name: 'Laptop', asset_id: 'ASSET-001' });

    const result = await caller.inventory.items.searchByAssetId({ assetId: 'ASSET-001' });

    expect(result.data).not.toBeNull();
    expect(result.data!.itemName).toBe('Laptop');
    expect(result.data!.assetId).toBe('ASSET-001');
  });

  it('matches asset ID case-insensitively', async () => {
    seedInventoryItem(db, { item_name: 'Monitor', asset_id: 'MON-42' });

    const lower = await caller.inventory.items.searchByAssetId({ assetId: 'mon-42' });
    expect(lower.data).not.toBeNull();
    expect(lower.data!.itemName).toBe('Monitor');

    const upper = await caller.inventory.items.searchByAssetId({ assetId: 'MON-42' });
    expect(upper.data).not.toBeNull();
  });

  it('returns null when no item matches the asset ID', async () => {
    seedInventoryItem(db, { item_name: 'Laptop', asset_id: 'ASSET-001' });

    const result = await caller.inventory.items.searchByAssetId({ assetId: 'DOES-NOT-EXIST' });

    expect(result.data).toBeNull();
  });

  it('returns null for an empty database', async () => {
    const result = await caller.inventory.items.searchByAssetId({ assetId: 'ANYTHING' });
    expect(result.data).toBeNull();
  });

  it('rejects an empty string asset ID', async () => {
    await expect(caller.inventory.items.searchByAssetId({ assetId: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('does not return a different item that happens to share a prefix', async () => {
    seedInventoryItem(db, { item_name: 'Item A', asset_id: 'ASSET-1' });
    seedInventoryItem(db, { item_name: 'Item B', asset_id: 'ASSET-10' });

    const result = await caller.inventory.items.searchByAssetId({ assetId: 'ASSET-1' });

    expect(result.data).not.toBeNull();
    expect(result.data!.itemName).toBe('Item A');
  });
});

// ---------------------------------------------------------------------------
// locations.getPath — breadcrumb generation
// ---------------------------------------------------------------------------

describe('locations.getPath', () => {
  it('returns a single-element array for a root location', async () => {
    const homeId = seedLocation(db, { name: 'Home' });

    const result = await caller.inventory.locations.getPath({ id: homeId });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe('Home');
    expect(result.data[0]!.parentId).toBeNull();
  });

  it('returns root-first breadcrumb for a two-level hierarchy', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: homeId });

    const result = await caller.inventory.locations.getPath({ id: kitchenId });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.name).toBe('Home');
    expect(result.data[1]!.name).toBe('Kitchen');
  });

  it('returns root-first breadcrumb for a three-level hierarchy', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: homeId });
    const pantryId = seedLocation(db, { name: 'Pantry', parent_id: kitchenId });

    const result = await caller.inventory.locations.getPath({ id: pantryId });

    expect(result.data).toHaveLength(3);
    expect(result.data[0]!.name).toBe('Home');
    expect(result.data[1]!.name).toBe('Kitchen');
    expect(result.data[2]!.name).toBe('Pantry');
  });

  it('returns correct IDs and parentId values along the path', async () => {
    const l1 = seedLocation(db, { name: 'L1' });
    const l2 = seedLocation(db, { name: 'L2', parent_id: l1 });
    const l3 = seedLocation(db, { name: 'L3', parent_id: l2 });

    const result = await caller.inventory.locations.getPath({ id: l3 });

    expect(result.data[0]!.id).toBe(l1);
    expect(result.data[0]!.parentId).toBeNull();
    expect(result.data[1]!.id).toBe(l2);
    expect(result.data[1]!.parentId).toBe(l1);
    expect(result.data[2]!.id).toBe(l3);
    expect(result.data[2]!.parentId).toBe(l2);
  });

  it('throws NOT_FOUND for a non-existent location ID', async () => {
    await expect(
      caller.inventory.locations.getPath({ id: 'does-not-exist' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when location was deleted', async () => {
    const id = seedLocation(db, { name: 'Gone' });
    db.prepare('DELETE FROM locations WHERE id = ?').run(id);

    await expect(caller.inventory.locations.getPath({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// locations.getItems
// ---------------------------------------------------------------------------

describe('locations.getItems', () => {
  it('returns items directly at the location when includeChildren is false', async () => {
    const kitchenId = seedLocation(db, { name: 'Kitchen' });
    const pantryId = seedLocation(db, { name: 'Pantry', parent_id: kitchenId });

    seedInventoryItem(db, { item_name: 'Blender', location_id: kitchenId });
    seedInventoryItem(db, { item_name: 'Rice', location_id: pantryId });

    const result = await caller.inventory.locations.getItems({
      locationId: kitchenId,
      includeChildren: false,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]!.itemName).toBe('Blender');
  });

  it('returns items from the location and all descendants when includeChildren is true', async () => {
    const houseId = seedLocation(db, { name: 'House' });
    const livingRoomId = seedLocation(db, { name: 'Living Room', parent_id: houseId });
    const shelfId = seedLocation(db, { name: 'Shelf', parent_id: livingRoomId });

    seedInventoryItem(db, { item_name: 'Couch', location_id: houseId });
    seedInventoryItem(db, { item_name: 'TV', location_id: livingRoomId });
    seedInventoryItem(db, { item_name: 'Book', location_id: shelfId });
    seedInventoryItem(db, { item_name: 'Unlocated' });

    const result = await caller.inventory.locations.getItems({
      locationId: houseId,
      includeChildren: true,
    });

    expect(result.total).toBe(3);
    const names = result.data.map((i) => i.itemName).toSorted();
    expect(names).toEqual(['Book', 'Couch', 'TV']);
  });

  it('returns an empty list when the location has no items', async () => {
    const id = seedLocation(db, { name: 'Empty' });

    const result = await caller.inventory.locations.getItems({ locationId: id });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('paginates the result correctly', async () => {
    const locId = seedLocation(db, { name: 'Storage' });

    for (let i = 0; i < 6; i++) {
      seedInventoryItem(db, { item_name: `Item ${i}`, location_id: locId });
    }

    const page = await caller.inventory.locations.getItems({
      locationId: locId,
      limit: 3,
      offset: 0,
    });

    expect(page.data).toHaveLength(3);
    expect(page.total).toBe(6);
  });

  it('throws NOT_FOUND for a non-existent location ID', async () => {
    await expect(
      caller.inventory.locations.getItems({ locationId: 'ghost' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// Cascade deletes — location → child locations and items
// ---------------------------------------------------------------------------

describe('cascade deletes', () => {
  it('force-deleting a parent location cascade-deletes all child locations', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: homeId });
    seedLocation(db, { name: 'Pantry', parent_id: kitchenId });
    seedLocation(db, { name: 'Bedroom', parent_id: homeId });

    await caller.inventory.locations.delete({ id: homeId, force: true });

    const list = await caller.inventory.locations.list();
    expect(list.data).toHaveLength(0);
  });

  it('items at deleted child locations become unlocated (locationId = null)', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: homeId });

    const fridgeId = seedInventoryItem(db, { item_name: 'Fridge', location_id: kitchenId });
    const couchId = seedInventoryItem(db, { item_name: 'Couch', location_id: homeId });

    await caller.inventory.locations.delete({ id: homeId, force: true });

    // Both items survive but locationId becomes null
    const fridge = await caller.inventory.items.get({ id: fridgeId });
    expect(fridge.data.locationId).toBeNull();

    const couch = await caller.inventory.items.get({ id: couchId });
    expect(couch.data.locationId).toBeNull();
  });

  it('items at the deleted location itself also become unlocated', async () => {
    const locId = seedLocation(db, { name: 'Garage' });
    const itemId = seedInventoryItem(db, { item_name: 'Bike', location_id: locId });

    await caller.inventory.locations.delete({ id: locId, force: true });

    const item = await caller.inventory.items.get({ id: itemId });
    expect(item.data.locationId).toBeNull();
  });

  it('deleting a leaf location leaves unrelated locations intact', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: homeId });
    seedLocation(db, { name: 'Garage' });

    await caller.inventory.locations.delete({ id: kitchenId, force: true });

    const list = await caller.inventory.locations.list();
    const names = list.data.map((l) => l.name);
    expect(names).toContain('Home');
    expect(names).toContain('Garage');
    expect(names).not.toContain('Kitchen');
  });
});

// ---------------------------------------------------------------------------
// assetId uniqueness constraint
// ---------------------------------------------------------------------------

describe('assetId uniqueness constraint', () => {
  it('prevents creating two items with the same assetId', async () => {
    await caller.inventory.items.create({ itemName: 'Laptop', assetId: 'ASSET-001' });

    await expect(
      caller.inventory.items.create({ itemName: 'Desktop', assetId: 'ASSET-001' })
    ).rejects.toThrow();
  });

  it('allows multiple items with null assetId', async () => {
    await caller.inventory.items.create({ itemName: 'Item A', assetId: null });
    await caller.inventory.items.create({ itemName: 'Item B', assetId: null });

    const result = await caller.inventory.items.list({});
    expect(result.pagination.total).toBe(2);
  });

  it('prevents updating an item to use a duplicate assetId', async () => {
    const idA = (await caller.inventory.items.create({ itemName: 'A', assetId: 'ASSET-A' })).data
      .id;
    await caller.inventory.items.create({ itemName: 'B', assetId: 'ASSET-B' });

    await expect(
      caller.inventory.items.update({ id: idA, data: { assetId: 'ASSET-B' } })
    ).rejects.toThrow();
  });

  it('allows updating an item to keep its own assetId unchanged', async () => {
    const id = (await caller.inventory.items.create({ itemName: 'X', assetId: 'ASSET-X' })).data.id;

    const updated = await caller.inventory.items.update({
      id,
      data: { itemName: 'X Updated', assetId: 'ASSET-X' },
    });

    expect(updated.data.assetId).toBe('ASSET-X');
    expect(updated.data.itemName).toBe('X Updated');
  });
});

// ---------------------------------------------------------------------------
// 404 cases — items
// ---------------------------------------------------------------------------

describe('404 cases — items', () => {
  it('items.get throws NOT_FOUND for a non-existent item', async () => {
    await expect(caller.inventory.items.get({ id: 'ghost-id' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('items.update throws NOT_FOUND for a non-existent item', async () => {
    await expect(
      caller.inventory.items.update({ id: 'ghost-id', data: { itemName: 'New' } })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('items.delete throws NOT_FOUND for a non-existent item', async () => {
    await expect(caller.inventory.items.delete({ id: 'ghost-id' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('items.delete throws NOT_FOUND on second delete (idempotency)', async () => {
    const id = (await caller.inventory.items.create({ itemName: 'Temporary' })).data.id;

    await caller.inventory.items.delete({ id });

    await expect(caller.inventory.items.delete({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// 404 cases — locations
// ---------------------------------------------------------------------------

describe('404 cases — locations', () => {
  it('locations.get throws NOT_FOUND for a non-existent location', async () => {
    await expect(caller.inventory.locations.get({ id: 'ghost' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('locations.update throws NOT_FOUND for a non-existent location', async () => {
    await expect(
      caller.inventory.locations.update({ id: 'ghost', data: { name: 'New' } })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('locations.delete throws NOT_FOUND for a non-existent location', async () => {
    await expect(
      caller.inventory.locations.delete({ id: 'ghost', force: true })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('locations.getItems throws NOT_FOUND for a non-existent location', async () => {
    await expect(
      caller.inventory.locations.getItems({ locationId: 'ghost' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('locations.getPath throws NOT_FOUND for a non-existent location', async () => {
    await expect(caller.inventory.locations.getPath({ id: 'ghost' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('locations.deleteStats throws NOT_FOUND for a non-existent location', async () => {
    await expect(caller.inventory.locations.deleteStats({ id: 'ghost' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('locations.create throws NOT_FOUND when parentId does not exist', async () => {
    await expect(
      caller.inventory.locations.create({ name: 'Child', parentId: 'ghost-parent' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// CRUD — items
// ---------------------------------------------------------------------------

describe('CRUD — items', () => {
  it('creates an item with all supported fields', async () => {
    const locId = seedLocation(db, { name: 'Office' });
    const result = await caller.inventory.items.create({
      itemName: 'Standing Desk',
      brand: 'Flexispot',
      model: 'E7',
      type: 'Furniture',
      condition: 'Excellent',
      room: 'Office',
      inUse: true,
      deductible: false,
      replacementValue: 600,
      resaleValue: 400,
      assetId: 'DESK-001',
      locationId: locId,
      notes: 'Motorized',
    });

    expect(result.data.itemName).toBe('Standing Desk');
    expect(result.data.brand).toBe('Flexispot');
    expect(result.data.type).toBe('Furniture');
    expect(result.data.inUse).toBe(true);
    expect(result.data.assetId).toBe('DESK-001');
    expect(result.data.locationId).toBe(locId);
  });

  it('reads back an item via items.get', async () => {
    const id = (await caller.inventory.items.create({ itemName: 'Chair' })).data.id;

    const result = await caller.inventory.items.get({ id });
    expect(result.data.itemName).toBe('Chair');
    expect(result.data.id).toBe(id);
  });

  it('updates an item and reflects changes', async () => {
    const id = (await caller.inventory.items.create({ itemName: 'Chair' })).data.id;

    const updated = await caller.inventory.items.update({
      id,
      data: { itemName: 'Ergonomic Chair', condition: 'Excellent', inUse: true },
    });

    expect(updated.data.itemName).toBe('Ergonomic Chair');
    expect(updated.data.condition).toBe('Excellent');
    expect(updated.data.inUse).toBe(true);
  });

  it('updates an item to change its location', async () => {
    const loc1 = seedLocation(db, { name: 'Room A' });
    const loc2 = seedLocation(db, { name: 'Room B' });
    const id = (await caller.inventory.items.create({ itemName: 'Box', locationId: loc1 })).data.id;

    const updated = await caller.inventory.items.update({ id, data: { locationId: loc2 } });
    expect(updated.data.locationId).toBe(loc2);
  });

  it('clears nullable fields by setting them to null', async () => {
    const id = (
      await caller.inventory.items.create({ itemName: 'Widget', brand: 'Acme', notes: 'Old note' })
    ).data.id;

    const updated = await caller.inventory.items.update({ id, data: { brand: null, notes: null } });
    expect(updated.data.brand).toBeNull();
    expect(updated.data.notes).toBeNull();
  });

  it('deletes an item and confirms it is gone', async () => {
    const id = (await caller.inventory.items.create({ itemName: 'Disposable' })).data.id;

    const del = await caller.inventory.items.delete({ id });
    expect(del.message).toBe('Inventory item deleted');

    await expect(caller.inventory.items.get({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// CRUD — locations
// ---------------------------------------------------------------------------

describe('CRUD — locations', () => {
  it('creates a root location with default sort order', async () => {
    const result = await caller.inventory.locations.create({ name: 'Home' });

    expect(result.data.name).toBe('Home');
    expect(result.data.parentId).toBeNull();
    expect(result.data.sortOrder).toBe(0);
  });

  it('creates a nested location with an explicit sort order', async () => {
    const parent = await caller.inventory.locations.create({ name: 'Home' });
    const child = await caller.inventory.locations.create({
      name: 'Kitchen',
      parentId: parent.data.id,
      sortOrder: 3,
    });

    expect(child.data.parentId).toBe(parent.data.id);
    expect(child.data.sortOrder).toBe(3);
  });

  it('reads back a location via locations.get', async () => {
    const id = seedLocation(db, { name: 'Garage' });

    const result = await caller.inventory.locations.get({ id });
    expect(result.data.name).toBe('Garage');
  });

  it('renames a location via locations.update', async () => {
    const id = seedLocation(db, { name: 'Bedroo' }); // typo

    const updated = await caller.inventory.locations.update({ id, data: { name: 'Bedroom' } });
    expect(updated.data.name).toBe('Bedroom');
  });

  it('moves a location to a different parent', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const garageId = seedLocation(db, { name: 'Garage' });
    const shelfId = seedLocation(db, { name: 'Shelf', parent_id: homeId });

    const moved = await caller.inventory.locations.update({
      id: shelfId,
      data: { parentId: garageId },
    });

    expect(moved.data.parentId).toBe(garageId);
  });

  it('promotes a child location to root by setting parentId to null', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const roomId = seedLocation(db, { name: 'Room', parent_id: homeId });

    const promoted = await caller.inventory.locations.update({
      id: roomId,
      data: { parentId: null },
    });

    expect(promoted.data.parentId).toBeNull();
  });

  it('deletes an empty location immediately', async () => {
    const id = seedLocation(db, { name: 'Temporary' });

    const result = await caller.inventory.locations.delete({ id });
    expect(result.message).toBe('Location deleted');

    await expect(caller.inventory.locations.get({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns requiresConfirmation before deleting a non-empty location without force', async () => {
    const parentId = seedLocation(db, { name: 'Home' });
    seedLocation(db, { name: 'Kitchen', parent_id: parentId });

    const result = await caller.inventory.locations.delete({ id: parentId });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.stats?.childCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Location tree construction
// ---------------------------------------------------------------------------

describe('location tree construction', () => {
  it('returns an empty tree when no locations exist', async () => {
    const result = await caller.inventory.locations.tree();
    expect(result.data).toEqual([]);
  });

  it('returns root nodes with empty children arrays when no parent-child relationships exist', async () => {
    seedLocation(db, { name: 'Home' });
    seedLocation(db, { name: 'Car' });

    const result = await caller.inventory.locations.tree();
    expect(result.data).toHaveLength(2);
    expect(result.data.every((n) => n.children.length === 0)).toBe(true);
  });

  it('nests children correctly in a three-level tree', async () => {
    const homeId = seedLocation(db, { name: 'Home' });
    const kitchenId = seedLocation(db, { name: 'Kitchen', parent_id: homeId });
    seedLocation(db, { name: 'Pantry', parent_id: kitchenId });
    seedLocation(db, { name: 'Bedroom', parent_id: homeId });

    const result = await caller.inventory.locations.tree();

    expect(result.data).toHaveLength(1);
    const home = result.data[0]!;
    expect(home.name).toBe('Home');
    expect(home.children).toHaveLength(2);

    const kitchen = home.children.find((c) => c.name === 'Kitchen');
    expect(kitchen).toBeDefined();
    expect(kitchen!.children).toHaveLength(1);
    expect(kitchen!.children[0]!.name).toBe('Pantry');
  });
});
