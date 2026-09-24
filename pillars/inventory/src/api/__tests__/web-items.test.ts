/**
 * Integration tests for the `web.*` REST surface (`rest-web.ts`, Inventory
 * ADR-002 delivery slice D1): a filtered, cursor-paged item catalogue and
 * one item's detail with its history, on the new item model.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-web-items-test-'));
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

describe('web.items.list', () => {
  it('pages through every live item exactly once', async () => {
    const created = await Promise.all(
      ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((itemName) =>
        client().items.create({ itemName })
      )
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await client().web.listItems({ limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(new Set(seen)).toEqual(new Set(created.map((item) => item.data.id)));
    expect(seen).toHaveLength(created.length);
  });

  it('keeps a page already served stable when a row is inserted afterwards', async () => {
    await client().items.create({ itemName: 'Item A' });
    await client().items.create({ itemName: 'Item B' });

    const page1 = await client().web.listItems({ limit: 1 });
    expect(page1.items).toHaveLength(1);
    const alreadySeen = page1.items[0]!.id;

    // The exact id order the pre-insert rows would continue in from this
    // cursor — ground truth for what the implementation must not lose,
    // independent of where a UUID happens to sort.
    const expectedBeforeInsert = (
      inventoryDb.raw.prepare('SELECT id FROM items WHERE id > ? ORDER BY id').all(alreadySeen) as {
        id: string;
      }[]
    ).map((row) => row.id);

    const inserted = await client().items.create({ itemName: 'Item C' });

    const rest = await client().web.listItems({ limit: 10, cursor: page1.nextCursor! });
    const ids = rest.items.map((item) => item.id);

    // Never re-serves the row the caller already has.
    expect(ids).not.toContain(alreadySeen);
    // Never drops or duplicates a row that was already pending.
    expect(ids.filter((id) => expectedBeforeInsert.includes(id))).toEqual(expectedBeforeInsert);
    // The inserted row appears exactly when it sorts after the cursor —
    // an id-ordered forward cursor is not expected to surface an insert
    // that lands behind where it has already read.
    expect(ids.includes(inserted.data.id)).toBe(inserted.data.id > alreadySeen);
  });

  it('rejects a cursor this route did not issue', async () => {
    await expect(client().web.listItems({ cursor: 'not-a-real-cursor' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('excludes an inactive item unless includeInactive is set', async () => {
    const active = await client().items.create({ itemName: 'Active thing' });
    const retired = await client().items.create({ itemName: 'Retired thing' });
    inventoryDb.raw
      .prepare(`UPDATE items SET lifecycle = 'retired' WHERE id = ?`)
      .run(retired.data.id);

    const defaultPage = await client().web.listItems({ limit: 50 });
    expect(defaultPage.items.map((item) => item.id)).toEqual([active.data.id]);

    const withInactive = await client().web.listItems({ limit: 50, includeInactive: 'true' });
    expect(new Set(withInactive.items.map((item) => item.id))).toEqual(
      new Set([active.data.id, retired.data.id])
    );
  });

  it('narrows by locationId', async () => {
    const kitchen = await client().locations.create({ name: 'Kitchen' });
    const bedroom = await client().locations.create({ name: 'Bedroom' });
    const toaster = await client().items.create({
      itemName: 'Toaster',
      locationId: kitchen.data.id,
    });
    await client().items.create({ itemName: 'Lamp', locationId: bedroom.data.id });

    const page = await client().web.listItems({ limit: 50, locationId: kitchen.data.id });
    expect(page.items.map((item) => item.id)).toEqual([toaster.data.id]);
  });

  it('narrows to the ids asked for, and combines with other filters', async () => {
    const box = await client().items.create({ itemName: 'Box' });
    const lamp = await client().items.create({ itemName: 'Lamp' });
    await client().items.create({ itemName: 'Kettle' });
    const retired = await client().items.create({ itemName: 'Retired' });
    inventoryDb.raw
      .prepare(`UPDATE items SET lifecycle = 'retired' WHERE id = ?`)
      .run(retired.data.id);

    const page = await client().web.listItems({
      limit: 50,
      ids: [box.data.id, lamp.data.id, retired.data.id, 'no-such-item'].join(','),
    });
    expect(new Set(page.items.map((item) => item.id))).toEqual(
      new Set([box.data.id, lamp.data.id])
    );
  });

  it('refuses more than 200 ids, or a malformed list', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `id-${index}`).join(',');
    await expect(client().web.listItems({ ids })).rejects.toMatchObject({ status: 400 });
    await expect(client().web.listItems({ ids: 'a,,b' })).rejects.toMatchObject({ status: 400 });
    const exactly200 = Array.from({ length: 200 }, (_, index) => `id-${index}`).join(',');
    await expect(client().web.listItems({ ids: exactly200 })).resolves.toMatchObject({
      items: [],
    });
  });

  it('narrows by placementKind', async () => {
    const kitchen = await client().locations.create({ name: 'Kitchen' });
    const placed = await client().items.create({
      itemName: 'Placed',
      locationId: kitchen.data.id,
    });
    await client().items.create({ itemName: 'In hand' });

    const page = await client().web.listItems({ limit: 50, placementKind: 'location' });
    expect(page.items.map((item) => item.id)).toEqual([placed.data.id]);
  });
});

describe('web.items.get', () => {
  it('returns the item and its history, newest first', async () => {
    const created = await client().items.create({ itemName: 'Drill' });
    await client().items.update(created.data.id, { itemName: 'Cordless drill' });

    const { item, history } = await client().web.getItem(created.data.id);
    expect(item.id).toBe(created.data.id);
    expect(item.name).toBe('Cordless drill');
    expect(history.events.length).toBeGreaterThanOrEqual(2);
    expect(history.events[0]!.seq).toBeGreaterThan(history.events.at(-1)!.seq);
  });

  it('404s for an item that does not exist', async () => {
    await expect(client().web.getItem('does-not-exist')).rejects.toMatchObject({ status: 404 });
  });

  it('pages history with its own cursor', async () => {
    const created = await client().items.create({ itemName: 'Ladder' });
    for (let i = 0; i < 3; i += 1) {
      await client().items.update(created.data.id, { itemName: `Ladder ${i}` });
    }

    const page1 = await client().web.getItem(created.data.id, { historyLimit: 1 });
    expect(page1.history.events).toHaveLength(1);
    expect(page1.history.nextCursor).not.toBeNull();

    const page2 = await client().web.getItem(created.data.id, {
      historyLimit: 10,
      historyCursor: page1.history.nextCursor!,
    });
    expect(page2.history.events.length).toBeGreaterThan(0);
    expect(page2.history.events.map((e) => e.seq)).not.toContain(page1.history.events[0]!.seq);
  });
});
