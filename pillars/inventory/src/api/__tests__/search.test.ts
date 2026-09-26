/**
 * Integration tests for the `search.*` REST surface — inventory's slice of
 * unified search (Inventory ADR-002, POPS-3329).
 *
 * The suite seeds items through the pillar's own CRUD endpoint, then asserts
 * the three-tier ranking the phone's own search uses (a name that starts
 * with the query, then a name that merely contains it, then a match on some
 * other indexed field), mapped onto the shared cross-pillar search score
 * scale, with `bm25` breaking ties inside a tier. Several cases are ported
 * from `InventoryReplicaTests/ReplicaSearchTests.swift` so the two rankers
 * agree on which tier a hit falls into.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { publishItemTypeTree } from '../../catalogue/__tests__/type-tree-fixture.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { mutation } from '../../domain/commands/__tests__/test-utils.js';
import { runMutation } from '../../domain/commands/index.js';
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
  it('ranks a name prefix above a name that contains, above any other field, matching the phone', async () => {
    await client().items.create({ itemName: 'Adapter', notes: 'spare drill bits' });
    await client().items.create({ itemName: 'Cordless drill' });
    const prefix = await client().items.create({ itemName: 'Drill press' });
    await client().items.create({ itemName: 'Hammer' });

    const { hits } = await client().search.run({ query: { text: 'drill' } });
    expect(hits.map((h) => h.data['itemName'])).toEqual([
      'Drill press',
      'Cordless drill',
      'Adapter',
    ]);
    expect(hits[0]?.uri).toBe(`/inventory/items/${prefix.data.id}`);
    expect(hits.map((h) => h.matchType)).toEqual(['prefix', 'contains', 'contains']);
    expect(hits.map((h) => h.matchField)).toEqual(['itemName', 'itemName', 'fts']);
    // The shared cross-pillar 0-1 search scale (finance/purchases `classify()`):
    // a name-prefix hit outranks a name-contains hit, which outranks any hit
    // that only matched some other field.
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(hits[1]!.score).toBeGreaterThan(hits[2]!.score);
  });

  it('finds a match in the middle of a word, not only at a word start', async () => {
    await client().items.create({ itemName: 'Sledgehammer' });

    expect((await client().search.run({ query: { text: 'HAMMER' } })).hits).toHaveLength(1);
    expect((await client().search.run({ query: { text: 'dgeh' } })).hits).toHaveLength(1);
  });

  it('matches a query shorter than a trigram, case-insensitively, via the LIKE fallback', async () => {
    await client().items.create({ itemName: 'TV stand' });
    await client().items.create({ itemName: 'Lamp' });

    const { hits } = await client().search.run({ query: { text: 'tv' } });
    expect(hits.map((h) => h.data['itemName'])).toEqual(['TV stand']);
  });

  it('treats LIKE wildcards in a short query as literal characters', async () => {
    await client().items.create({ itemName: '50% off' });
    await client().items.create({ itemName: 'Lamp' });

    expect((await client().search.run({ query: { text: '%' } })).hits).toHaveLength(1);
    expect((await client().search.run({ query: { text: '_' } })).hits).toEqual([]);
  });

  it('finds an asset id match only among other fields, ranked below any name match', async () => {
    const asset = await client().items.create({ itemName: 'Camera', assetId: 'CAM-1' });
    const named = await client().items.create({ itemName: 'CAM-1 spare battery' });

    const { hits } = await client().search.run({ query: { text: 'cam-1' } });
    expect(hits.map((h) => h.uri)).toEqual([
      `/inventory/items/${named.data.id}`,
      `/inventory/items/${asset.data.id}`,
    ]);
    expect(hits[1]?.matchField).toBe('fts');
  });

  it('excludes an inactive item from the default (federated) search', async () => {
    const active = await client().items.create({ itemName: 'New kettle' });
    const retired = await client().items.create({ itemName: 'Old kettle' });
    // The legacy `/items` REST surface has no lifecycle transition of its
    // own (that is the command layer's `item.retire` and friends, reached
    // through the sync protocol); set it directly for this integration test.
    inventoryDb.raw
      .prepare(`UPDATE items SET lifecycle = 'discarded' WHERE id = ?`)
      .run(retired.data.id);

    const { hits } = await client().search.run({ query: { text: 'kettle' } });
    expect(hits.map((h) => h.uri)).toEqual([`/inventory/items/${active.data.id}`]);
  });

  it('returns an empty list for an empty or whitespace query', async () => {
    await client().items.create({ itemName: 'Anything', assetId: 'AST-9' });
    expect((await client().search.run({ query: { text: '' } })).hits).toEqual([]);
    expect((await client().search.run({ query: { text: '   ' } })).hits).toEqual([]);
  });

  it('finds a sheet item by the label of its inherited Material option', () => {
    const catalogue = publishItemTypeTree(inventoryDb.db);
    const itemId = '90000000-0000-4000-8000-000000000001';
    const outcome = runMutation(
      inventoryDb.db,
      mutation(
        'item.create',
        itemId,
        {
          item: {
            name: 'Sheet',
            typeId: catalogue.sheetTypeId,
            values: [
              {
                fieldId: catalogue.materialFieldId,
                values: [{ optionId: catalogue.materialCottonOptionId }],
              },
            ],
          },
        },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      ),
      { kind: 'service', id: 'search-test' }
    );
    expect(outcome).toMatchObject({ status: 'applied' });

    return expect(client().search.run({ query: { text: 'Cotton' } })).resolves.toMatchObject({
      hits: [expect.objectContaining({ uri: `/inventory/items/${itemId}`, matchField: 'fts' })],
    });
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

  it('narrows by includeInactive, parsed to a boolean, defaulting to active-only', async () => {
    const active = await client().items.create({ itemName: 'Kettle standard' });
    const retired = await client().items.create({ itemName: 'Kettle retired' });
    inventoryDb.raw
      .prepare(`UPDATE items SET lifecycle = 'retired' WHERE id = ?`)
      .run(retired.data.id);

    const defaultResult = await client().search.run({ query: { text: 'kettle' } });
    expect(defaultResult.hits.map((h) => h.uri)).toEqual([`/inventory/items/${active.data.id}`]);

    const explicitFalse = await client().search.run({
      query: {
        text: 'kettle',
        filters: [{ field: 'includeInactive', operator: 'eq', value: 'false' }],
      },
    });
    expect(explicitFalse.hits.map((h) => h.uri)).toEqual([`/inventory/items/${active.data.id}`]);

    const included = await client().search.run({
      query: {
        text: 'kettle',
        filters: [{ field: 'includeInactive', operator: 'eq', value: 'true' }],
      },
    });
    expect(included.hits.map((h) => h.uri).sort()).toEqual(
      [`/inventory/items/${active.data.id}`, `/inventory/items/${retired.data.id}`].sort()
    );
  });

  it('never returns a tombstoned (deleted) item, even with includeInactive', async () => {
    const kept = await client().items.create({ itemName: 'Toaster kept' });
    const deleted = await client().items.create({ itemName: 'Toaster deleted' });
    await client().items.delete(deleted.data.id);

    const { hits } = await client().search.run({
      query: {
        text: 'toaster',
        filters: [{ field: 'includeInactive', operator: 'eq', value: 'true' }],
      },
    });
    expect(hits.map((h) => h.uri)).toEqual([`/inventory/items/${kept.data.id}`]);
  });
});
