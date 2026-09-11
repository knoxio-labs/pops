/**
 * Integration tests for the `search.*` REST surface — inventory's slice of
 * unified search.
 *
 * The suite seeds items through the pillar's own CRUD endpoint, then asserts
 * the TIERED ranking: exact assetId (1.0) > assetId prefix (0.9)
 * > itemName exact (0.85) / prefix (0.7) / contains (0.5), with the
 * `/inventory/items/<id>` uri shape, the dedup between asset and name tiers,
 * and descending score sort. An empty / whitespace query short-circuits to an
 * empty hit list.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-search-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
    })
  );
}

describe('search — inventory items adapter', () => {
  it('returns an exact-assetId hit scored 1.0 with the legacy uri shape', async () => {
    const created = await client().items.create({ itemName: 'Laptop', assetId: 'AST-001' });

    const { hits } = await client().search.run({ query: { text: 'ast-001' } });
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit?.uri).toBe(`/inventory/items/${created.data.id}`);
    expect(hit?.score).toBe(1.0);
    expect(hit?.matchField).toBe('assetId');
    expect(hit?.matchType).toBe('exact');
    expect(hit?.data).toMatchObject({ itemName: 'Laptop', assetId: 'AST-001' });
  });

  it('orders asset-exact (1.0) > asset-prefix (0.9) and dedups the same row across tiers', async () => {
    const exact = await client().items.create({ itemName: 'Router', assetId: 'AST-100' });
    const prefixed = await client().items.create({ itemName: 'Switch', assetId: 'AST-1000' });

    const { hits } = await client().search.run({ query: { text: 'ast-100' } });
    expect(hits.map((h) => h.uri)).toEqual([
      `/inventory/items/${exact.data.id}`,
      `/inventory/items/${prefixed.data.id}`,
    ]);
    expect(hits.map((h) => h.score)).toEqual([1.0, 0.9]);
    expect(hits.map((h) => h.matchType)).toEqual(['exact', 'prefix']);
  });

  it('ranks itemName matches exact (0.85) > prefix (0.7) > contains (0.5)', async () => {
    await client().items.create({ itemName: 'Drill' });
    await client().items.create({ itemName: 'Drill bit set' });
    await client().items.create({ itemName: 'Cordless Drill' });

    const { hits } = await client().search.run({ query: { text: 'drill' } });
    expect(hits.map((h) => h.data['itemName'])).toEqual([
      'Drill',
      'Drill bit set',
      'Cordless Drill',
    ]);
    expect(hits.map((h) => h.score)).toEqual([0.85, 0.7, 0.5]);
    expect(hits.every((h) => h.matchField === 'itemName')).toBe(true);
  });

  it('places an asset match above any name match', async () => {
    const asset = await client().items.create({ itemName: 'Camera', assetId: 'CAM-1' });
    await client().items.create({ itemName: 'CAM-1 spare battery' });

    const { hits } = await client().search.run({ query: { text: 'cam-1' } });
    expect(hits[0]?.uri).toBe(`/inventory/items/${asset.data.id}`);
    expect(hits[0]?.score).toBe(1.0);
    expect(hits[0]?.matchField).toBe('assetId');
  });

  it('returns an empty list for an empty or whitespace query', async () => {
    await client().items.create({ itemName: 'Anything', assetId: 'AST-9' });
    expect((await client().search.run({ query: { text: '' } })).hits).toEqual([]);
    expect((await client().search.run({ query: { text: '   ' } })).hits).toEqual([]);
  });
});

/**
 * `query.filters`: the contract advertises structured filters and the
 * handler must apply them, not silently drop them. Each case plants a row a
 * naive text match would return, then proves a filter that should exclude it
 * actually does — the shape of failure this suite is written against is a
 * filter that arrives and changes nothing.
 */
describe('search — query.filters', () => {
  it('narrows a text query by room, excluding a same-text match in a different room', async () => {
    await client().items.create({ itemName: 'Drill press', room: 'Garage' });
    await client().items.create({ itemName: 'Drill bit set', room: 'Shed' });

    const { hits } = await client().search.run({
      query: { text: 'drill', filters: [{ field: 'room', operator: 'eq', value: 'Shed' }] },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Drill bit set');
  });

  it('narrows by type', async () => {
    await client().items.create({ itemName: 'Camera lens', type: 'Electronics' });
    await client().items.create({ itemName: 'Camera bag', type: 'Accessory' });

    const { hits } = await client().search.run({
      query: { text: 'camera', filters: [{ field: 'type', operator: 'eq', value: 'Accessory' }] },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Camera bag');
  });

  it('narrows by condition', async () => {
    await client().items.create({ itemName: 'Ladder tall', condition: 'Good' });
    await client().items.create({ itemName: 'Ladder short', condition: 'Fair' });

    const { hits } = await client().search.run({
      query: { text: 'ladder', filters: [{ field: 'condition', operator: 'eq', value: 'Fair' }] },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Ladder short');
  });

  it('narrows by inUse', async () => {
    await client().items.create({ itemName: 'Vacuum upright', inUse: true });
    await client().items.create({ itemName: 'Vacuum spare', inUse: false });

    const { hits } = await client().search.run({
      query: { text: 'vacuum', filters: [{ field: 'inUse', operator: 'eq', value: 'false' }] },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Vacuum spare');
  });

  it('narrows by deductible', async () => {
    await client().items.create({ itemName: 'Monitor 4K', deductible: true });
    await client().items.create({ itemName: 'Monitor spare', deductible: false });

    const { hits } = await client().search.run({
      query: {
        text: 'monitor',
        filters: [{ field: 'deductible', operator: 'eq', value: 'true' }],
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Monitor 4K');
  });

  it('narrows by locationId', async () => {
    const kitchen = await client().locations.create({ name: 'Kitchen' });
    const bedroom = await client().locations.create({ name: 'Bedroom' });
    await client().items.create({ itemName: 'Toaster oven', locationId: kitchen.data.id });
    await client().items.create({ itemName: 'Toaster spare', locationId: bedroom.data.id });

    const { hits } = await client().search.run({
      query: {
        text: 'toaster',
        filters: [{ field: 'locationId', operator: 'eq', value: bedroom.data.id }],
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Toaster spare');
  });

  it('narrows by assetId', async () => {
    await client().items.create({ itemName: 'Bike mountain', assetId: 'AST-BIKE-1' });
    await client().items.create({ itemName: 'Bike road', assetId: 'AST-BIKE-2' });

    const { hits } = await client().search.run({
      query: {
        text: 'bike',
        filters: [{ field: 'assetId', operator: 'eq', value: 'AST-BIKE-2' }],
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Bike road');
  });

  it('counts filtered hits against the limit, not the unfiltered scan', async () => {
    for (let i = 0; i < 25; i += 1) {
      await client().items.create({ itemName: `Widget name ${i}`, room: 'Excluded' });
    }
    await client().items.create({ itemName: 'Widget target', room: 'Included' });

    const { hits } = await client().search.run({
      query: { text: 'widget', filters: [{ field: 'room', operator: 'eq', value: 'Included' }] },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.data['itemName']).toBe('Widget target');
  });

  it('rejects an unknown filter field at the schema before any handler runs', async () => {
    await expect(
      client().search.run({
        query: { text: 'x', filters: [{ field: 'notAField', operator: 'eq', value: 'x' }] },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unsupported operator at the schema before any handler runs', async () => {
    await expect(
      client().search.run({
        query: { text: 'x', filters: [{ field: 'room', operator: 'gte', value: 'x' }] },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a value the field cannot hold', async () => {
    await expect(
      client().search.run({
        query: { text: 'x', filters: [{ field: 'inUse', operator: 'eq', value: 'maybe' }] },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects two conflicting equality filters on the same field rather than picking one', async () => {
    await expect(
      client().search.run({
        query: {
          text: 'x',
          filters: [
            { field: 'room', operator: 'eq', value: 'Garage' },
            { field: 'room', operator: 'eq', value: 'Attic' },
          ],
        },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('an empty filter list behaves exactly like no filters', async () => {
    await client().items.create({ itemName: 'Unfiltered widget' });

    const { hits } = await client().search.run({ query: { text: 'widget', filters: [] } });
    expect(hits).toHaveLength(1);
  });
});
