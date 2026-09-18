/**
 * Integration tests for the `items.*` REST surface in pops-inventory-api.
 *
 * Boots the Express app via the production `createInventoryApiApp`
 * factory against a per-test temp inventory.db and drives every endpoint
 * through supertest (see `makeClient`). Every request here carries no
 * `X-API-Key`, so it is admitted regardless of the inbound service-account
 * gate (`middleware/service-account-scope.ts`) — that gate's own behaviour
 * is covered in `service-account-scope.test.ts`. Service `NotFoundError`s
 * surface as HTTP 404.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INVENTORY_CONDITIONS } from '../../contract/types/condition.js';
import { seedInventoryItem } from '../../db/__tests__/item-fixture.js';
import { crossPillarUrisService, openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { events, items } from '../../db/schema.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';
import { HttpError, makeClient } from './test-utils.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-items-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('items REST — CRUD happy paths', () => {
  it('creates, lists, gets, updates and deletes an item', async () => {
    const api = client();

    const created = await api.items.create({
      itemName: 'MacBook Pro',
      brand: 'Apple',
      replacementValue: 2500,
      purchasePrice: 1999,
    });
    expect(created.data.itemName).toBe('MacBook Pro');
    expect(created.data.brand).toBe('Apple');
    expect(created.data.replacementValue).toBe(2500);
    expect(created.data.purchasePrice).toBe(1999);
    // Unreviewed (POPS-2432): create omitted inUse, so the row — and this
    // response — carries null, not the "reviewed, not in use" false.
    expect(created.data.inUse).toBeNull();
    expect(created.data.deductible).toBe(false);

    const list = await api.items.list();
    expect(list.data).toHaveLength(1);
    expect(list.pagination.total).toBe(1);
    expect(list.pagination.hasMore).toBe(false);
    expect(list.totals.totalReplacementValue).toBe(2500);

    const fetched = await api.items.get(created.data.id);
    expect(fetched.data.itemName).toBe('MacBook Pro');

    const updated = await api.items.update(created.data.id, {
      itemName: 'MacBook Pro 16"',
      inUse: true,
    });
    expect(updated.data.itemName).toBe('MacBook Pro 16"');
    expect(updated.data.inUse).toBe(true);

    const ack = await api.items.delete(created.data.id);
    expect(ack).toEqual({ message: 'Inventory item deleted' });

    const after = await api.items.list();
    expect(after.pagination.total).toBe(0);
  });

  it('preserves null fields on create when omitted', async () => {
    const created = await client().items.create({ itemName: 'Desk' });
    expect(created.data.brand).toBeNull();
    expect(created.data.model).toBeNull();
    expect(created.data.locationId).toBeNull();
    expect(created.data.replacementValue).toBeNull();
  });

  it('writes in_use as NULL — unreviewed — rather than 0, when create omits it (POPS-2432)', async () => {
    const created = await client().items.create({ itemName: 'Fanned-out asset' });

    const row = inventoryDb.db
      .select({ inUse: items.inUse })
      .from(items)
      .where(eq(items.id, created.data.id))
      .get();

    expect(row?.inUse).toBeNull();
  });

  it('writes in_use as 0 — reviewed, not in use — when create sends an explicit false (POPS-2432)', async () => {
    const created = await client().items.create({ itemName: 'Reviewed asset', inUse: false });

    const row = inventoryDb.db
      .select({ inUse: items.inUse })
      .from(items)
      .where(eq(items.id, created.data.id))
      .get();

    expect(row?.inUse).toBe(0);
  });

  it('reports inUse as null over REST, not false, for an unreviewed row (POPS-2432)', async () => {
    // The create response is read by the very caller who just omitted
    // inUse; if it answered false, that caller would see "reviewed, not in
    // use" for a row nobody reviewed — the same collision the fix exists to
    // close, just moved from the write side to the read side.
    const api = client();
    const created = await api.items.create({ itemName: 'Fanned-out asset' });
    expect(created.data.inUse).toBeNull();

    const fetched = await api.items.get(created.data.id);
    expect(fetched.data.inUse).toBeNull();

    const list = await api.items.list();
    expect(list.data.find((item) => item.id === created.data.id)?.inUse).toBeNull();
  });

  it('still reports inUse as a real false when a row was actually reviewed (POPS-2432)', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Reviewed asset', inUse: false });
    expect(created.data.inUse).toBe(false);
  });

  it('applies the column default for condition when create omits it', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Toaster' });

    const [row] = inventoryDb.db
      .select({ condition: items.condition })
      .from(items)
      .where(eq(items.id, created.data.id))
      .all();
    expect(row?.condition).toBe('Good');
  });

  it('defaults condition to a value the edit form can preselect', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Kettle' });

    const [row] = inventoryDb.db
      .select({ condition: items.condition })
      .from(items)
      .where(eq(items.id, created.data.id))
      .all();
    expect(INVENTORY_CONDITIONS).toContain(row?.condition);
  });

  it('clears a nullable field when explicit null is supplied', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Chair', brand: 'Herman Miller' });
    const cleared = await api.items.update(created.data.id, { brand: null });
    expect(cleared.data.brand).toBeNull();
  });

  it('leaves untouched fields unchanged on partial update', async () => {
    const api = client();
    const created = await api.items.create({
      itemName: 'Bike',
      brand: 'Specialized',
      resaleValue: 1000,
    });
    const updated = await api.items.update(created.data.id, {
      resaleValue: 1200,
      purchasePrice: 800,
    });
    expect(updated.data.brand).toBe('Specialized');
    expect(updated.data.resaleValue).toBe(1200);
    expect(updated.data.purchasePrice).toBe(800);
  });

  it('sums replacement and resale totals across the filtered set', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', replacementValue: 100, resaleValue: 60 });
    await api.items.create({ itemName: 'B', replacementValue: 250, resaleValue: 120 });

    const list = await api.items.list();
    expect(list.totals.totalReplacementValue).toBe(350);
    expect(list.totals.totalResaleValue).toBe(180);
  });
});

describe('items REST — idempotent create via sourceRef (POPS-2433)', () => {
  it('returns the first row rather than minting a second one for a repeated sourceRef', async () => {
    const api = client();
    const sourceRef = 'pops://purchases/order/p-1/item/i-1';

    const first = await api.items.create({ itemName: 'Cordless Drill', sourceRef });
    const second = await api.items.create({ itemName: 'Cordless Drill', sourceRef });

    expect(second.data.id).toBe(first.data.id);

    const list = await api.items.list();
    expect(list.data).toHaveLength(1);
  });

  it('lets two different sourceRefs each mint their own row', async () => {
    const api = client();

    const first = await api.items.create({
      itemName: 'Drill',
      sourceRef: 'pops://purchases/order/p-1/item/i-1',
    });
    const second = await api.items.create({
      itemName: 'Sander',
      sourceRef: 'pops://purchases/order/p-1/item/i-2',
    });

    expect(second.data.id).not.toBe(first.data.id);
  });

  it('does not dedupe creates that carry no sourceRef at all', async () => {
    const api = client();

    const first = await api.items.create({ itemName: 'Hand-typed item' });
    const second = await api.items.create({ itemName: 'Hand-typed item' });

    expect(second.data.id).not.toBe(first.data.id);
  });
});

describe('items REST — cross-pillar soft URI derivation', () => {
  it('gives the reconciliation cron a work set for an item created with a transaction id', async () => {
    const created = await client().items.create({
      itemName: 'Monitor',
      purchaseTransactionId: 'tx-created',
    });
    expect(created.data.purchaseTransactionId).toBe('tx-created');

    expect(crossPillarUrisService.listDistinctPurchaseTransactionUris(inventoryDb.db)).toEqual([
      'pops://finance/transaction/tx-created',
    ]);
    expect(crossPillarUrisService.countRowsMissingPurchaseTransactionUri(inventoryDb.db)).toBe(0);
  });

  it('repoints the uri and drops the previous staleness verdict when the id changes', async () => {
    const api = client();
    const created = await api.items.create({
      itemName: 'Camera',
      purchaseTransactionId: 'tx-old',
    });
    crossPillarUrisService.markPurchaseTransactionUriStale(
      inventoryDb.db,
      'pops://finance/transaction/tx-old',
      '2026-06-14T00:00:00.000Z'
    );

    await api.items.update(created.data.id, { purchaseTransactionId: 'tx-new' });

    expect(crossPillarUrisService.listDistinctPurchaseTransactionUris(inventoryDb.db)).toEqual([
      'pops://finance/transaction/tx-new',
    ]);
    const [row] = inventoryDb.db
      .select({ staleAt: items.purchaseTransactionStaleAt })
      .from(items)
      .all();
    expect(row?.staleAt).toBeNull();
  });

  it('empties the work set when the transaction id is cleared', async () => {
    const api = client();
    const created = await api.items.create({
      itemName: 'Speaker',
      purchaseTransactionId: 'tx-clear',
    });

    await api.items.update(created.data.id, { purchaseTransactionId: null });

    expect(crossPillarUrisService.listDistinctPurchaseTransactionUris(inventoryDb.db)).toEqual([]);
    expect(crossPillarUrisService.countRowsMissingPurchaseTransactionUri(inventoryDb.db)).toBe(0);
  });

  it('leaves the uri alone on an update that does not mention the transaction id', async () => {
    const api = client();
    const created = await api.items.create({
      itemName: 'Router',
      purchaseTransactionId: 'tx-keep',
    });

    await api.items.update(created.data.id, { itemName: 'Router 2' });

    expect(crossPillarUrisService.listDistinctPurchaseTransactionUris(inventoryDb.db)).toEqual([
      'pops://finance/transaction/tx-keep',
    ]);
  });
});

describe('items REST — filters + projections', () => {
  it('searchByAssetId returns the row when found (case-insensitive)', async () => {
    const api = client();
    await api.items.create({ itemName: 'Laptop', assetId: 'POPS-001' });
    const hit = await api.items.searchByAssetId('pops-001');
    expect(hit.data?.itemName).toBe('Laptop');
  });

  it('searchByAssetId returns null when not found', async () => {
    const miss = await client().items.searchByAssetId('NOPE');
    expect(miss.data).toBeNull();
  });

  it('countByAssetPrefix counts matching items by prefix', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', assetId: 'POPS-001' });
    await api.items.create({ itemName: 'B', assetId: 'POPS-002' });
    await api.items.create({ itemName: 'C', assetId: 'OTHER-001' });

    const count = await api.items.countByAssetPrefix('pops-');
    expect(count.data).toBe(2);
  });

  it('distinctTypes returns the unique non-null set sorted', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', type: 'tool' });
    await api.items.create({ itemName: 'B', type: 'appliance' });
    await api.items.create({ itemName: 'C', type: 'tool' });
    await api.items.create({ itemName: 'D' });

    const types = await api.items.distinctTypes();
    expect(types.data).toEqual(['appliance', 'tool']);
  });

  it('filters list by search (LIKE on itemName)', async () => {
    const api = client();
    await api.items.create({ itemName: 'MacBook Pro' });
    await api.items.create({ itemName: 'iPad' });

    const list = await api.items.list({ search: 'Mac' });
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.itemName).toBe('MacBook Pro');
  });

  it('filters by tri-bool inUse', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', inUse: true });
    await api.items.create({ itemName: 'B', inUse: false });

    const inUseOnly = await api.items.list({ inUse: 'true' });
    expect(inUseOnly.data).toHaveLength(1);
    expect(inUseOnly.data[0]?.itemName).toBe('A');
  });
});

describe('items REST — error mapping', () => {
  it('returns 404 when getting an unknown item', async () => {
    await expect(client().items.get('missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 404 when updating an unknown item', async () => {
    await expect(client().items.update('missing', { itemName: 'X' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 404 when deleting an unknown item', async () => {
    await expect(client().items.delete('missing')).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects an empty itemName at the zod boundary with 400', async () => {
    await expect(client().items.create({ itemName: '' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('items REST — raw HTTP wire smoke', () => {
  it('GET /items answers 200 with the list envelope', async () => {
    const app = createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
    await requestOn(app).post('/items').send({ itemName: 'Wire smoke item' });

    const res = await requestOn(app).get('/items');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].itemName).toBe('Wire smoke item');
  });
});

describe('items REST — placing items in a container item (ADR-002 D1)', () => {
  function seedBox(name = 'Box B412'): string {
    return seedInventoryItem(inventoryDb.db, { name, isContainer: true }).id;
  }

  function placementOf(id: string) {
    return inventoryDb.db
      .select({
        placementKind: items.placementKind,
        locationId: items.locationId,
        containingItemId: items.containingItemId,
        previousPlacementKind: items.previousPlacementKind,
        previousLocationId: items.previousLocationId,
        previousContainingItemId: items.previousContainingItemId,
      })
      .from(items)
      .where(eq(items.id, id))
      .get();
  }

  it('places a created item in the container alone, even when a location is sent too', async () => {
    const api = client();
    const box = seedBox();
    const shelf = await api.locations.create({ name: 'Shelf' });

    const created = await api.items.create({
      itemName: 'Drill',
      containerId: box,
      locationId: shelf.data.id,
    });

    expect(created.data).toMatchObject({ containerId: box, locationId: null });
    expect(placementOf(created.data.id)).toMatchObject({
      placementKind: 'container',
      containingItemId: box,
      locationId: null,
    });
    const listed = await api.items.list({ containerId: box });
    expect(listed.data.map((item) => item.id)).toEqual([created.data.id]);
  });

  it('answers 404 for a containerId naming no item, or an item that is not a container', async () => {
    const api = client();
    const plain = await api.items.create({ itemName: 'Kettle' });

    await expect(api.items.create({ itemName: 'X', containerId: 'nope' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      api.items.create({ itemName: 'Y', containerId: plain.data.id })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to put a container inside itself or inside its own contents', async () => {
    const api = client();
    const outer = seedBox('Outer');
    const inner = seedBox('Inner');
    await api.items.update(inner, { containerId: outer });

    await expect(api.items.update(outer, { containerId: outer })).rejects.toMatchObject({
      status: 400,
    });
    await expect(api.items.update(outer, { containerId: inner })).rejects.toMatchObject({
      status: 400,
    });
    expect(placementOf(outer)).toMatchObject({ placementKind: 'hand' });
  });

  it('takes an item out of its container into hand, remembering the container', async () => {
    const api = client();
    const box = seedBox();
    const created = await api.items.create({ itemName: 'Tape', containerId: box });

    await api.items.update(created.data.id, { containerId: null });

    expect(placementOf(created.data.id)).toEqual({
      placementKind: 'hand',
      locationId: null,
      containingItemId: null,
      previousPlacementKind: 'container',
      previousLocationId: null,
      previousContainingItemId: box,
    });
  });

  it('deleting a container empties it: its contents survive in hand, remembering it', async () => {
    const api = client();
    const box = seedBox();
    const created = await api.items.create({ itemName: 'Cable', containerId: box });

    await api.items.delete(box);

    const survivor = await api.items.get(created.data.id);
    expect(survivor.data).toMatchObject({ containerId: null, locationId: null });
    expect(placementOf(created.data.id)).toMatchObject({
      placementKind: 'hand',
      previousPlacementKind: 'container',
      previousContainingItemId: box,
    });
  });

  it('maps the renamed columns back to the legacy field names', async () => {
    const created = await client().items.create({
      itemName: 'Router',
      assetId: 'NET01',
      type: 'Networking',
    });

    expect(created.data).toMatchObject({
      itemName: 'Router',
      assetId: 'NET01',
      type: 'Networking',
    });
    const stored = inventoryDb.db
      .select({ name: items.name, code: items.code, legacyType: items.legacyType })
      .from(items)
      .where(eq(items.id, created.data.id))
      .get();
    expect(stored).toEqual({ name: 'Router', code: 'NET01', legacyType: 'Networking' });
  });
});

describe('items REST — writes go through the command engine (POPS-4053)', () => {
  function eventsFor(id: string) {
    return inventoryDb.db.select().from(events).where(eq(events.entityId, id)).all();
  }

  it('a legacy PATCH writes an edited event with actor web', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Drill' });

    await api.items.update(created.data.id, { itemName: 'Cordless Drill', brand: 'Bosch' });

    const written = eventsFor(created.data.id).find((event) => event.kind === 'edited');
    expect(written).toMatchObject({ actorKind: 'web', actorId: null, actorLabel: null });
    expect(JSON.parse(written?.after ?? '{}')).toMatchObject({
      name: 'Cordless Drill',
      brand: 'Bosch',
    });
  });

  it('a legacy create writes a created event with actor web', async () => {
    const created = await client().items.create({ itemName: 'Kettle' });

    const written = eventsFor(created.data.id).find((event) => event.kind === 'created');
    expect(written).toMatchObject({ actorKind: 'web', entityRevision: 1 });
  });

  it('DELETE tombstones the row rather than removing it, with a deleted event from actor web', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Fan' });

    await api.items.delete(created.data.id);

    const row = inventoryDb.db
      .select({ deletedAt: items.deletedAt })
      .from(items)
      .where(eq(items.id, created.data.id))
      .get();
    expect(row?.deletedAt).not.toBeNull();

    const written = eventsFor(created.data.id).find((event) => event.kind === 'deleted');
    expect(written).toMatchObject({ actorKind: 'web' });
  });

  it('treats a tombstoned item as gone from every legacy read', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Speaker' });
    await api.items.delete(created.data.id);

    await expect(api.items.get(created.data.id)).rejects.toMatchObject({ status: 404 });
    await expect(api.items.update(created.data.id, { itemName: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(api.items.delete(created.data.id)).rejects.toMatchObject({ status: 404 });
    const list = await api.items.list();
    expect(list.data.find((row) => row.id === created.data.id)).toBeUndefined();
  });

  it('a PATCH that both moves and edits an item issues two mutations, not one', async () => {
    const api = client();
    const shelf = await api.locations.create({ name: 'Shelf' });
    const created = await api.items.create({ itemName: 'Radio' });

    await api.items.update(created.data.id, { itemName: 'AM Radio', locationId: shelf.data.id });

    const kinds = eventsFor(created.data.id).map((event) => event.kind);
    expect(kinds).toContain('moved');
    expect(kinds).toContain('edited');
  });

  it('a PATCH whose later mutation is refused rolls back the move it already applied', async () => {
    const api = client();
    const shelf = await api.locations.create({ name: 'Shelf' });
    const desk = await api.locations.create({ name: 'Desk' });
    await api.items.create({ itemName: 'Router', assetId: 'NET01' });
    const created = await api.items.create({ itemName: 'Radio', locationId: shelf.data.id });

    await expect(
      api.items.update(created.data.id, {
        itemName: 'AM Radio',
        locationId: desk.data.id,
        assetId: 'NET01',
      })
    ).rejects.toMatchObject({ status: 409 });

    const after = await api.items.get(created.data.id);
    expect(after.data).toMatchObject({
      itemName: 'Radio',
      locationId: shelf.data.id,
      assetId: null,
    });
    expect(eventsFor(created.data.id).map((event) => event.kind)).toEqual(['created']);
  });

  it('a container delete empties it through a picked_up event on its contents, actor web', async () => {
    const api = client();
    const box = seedInventoryItem(inventoryDb.db, { name: 'Box', isContainer: true }).id;
    const created = await api.items.create({ itemName: 'Cable', containerId: box });

    await api.items.delete(box);

    const written = eventsFor(created.data.id).find((event) => event.kind === 'picked_up');
    expect(written).toMatchObject({ actorKind: 'web' });
  });
});
