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

function setPublishedType(id: string, typeKey: string, isContainer = false): void {
  inventoryDb.raw
    .prepare(
      `UPDATE items
       SET type_id = (
             SELECT item_types.id
             FROM item_types
             JOIN catalogue_revisions ON catalogue_revisions.revision = item_types.revision
             WHERE item_types.key = ? AND catalogue_revisions.status = 'published'
             ORDER BY item_types.revision DESC
             LIMIT 1
           ),
           is_container = ?,
           access = ?,
           is_full = ?
       WHERE id = ?`
    )
    .run(typeKey, isContainer ? 1 : 0, isContainer ? 'open' : null, isContainer ? 0 : null, id);
}

function setPublishedLegacyLabel(id: string, typeKey: string): string {
  const row = inventoryDb.raw
    .prepare(
      `SELECT json_extract(item_types.legacy_labels_json, '$[0]') AS label
       FROM item_types
       JOIN catalogue_revisions ON catalogue_revisions.revision = item_types.revision
       WHERE item_types.key = ? AND catalogue_revisions.status = 'published'
       ORDER BY item_types.revision DESC
       LIMIT 1`
    )
    .get(typeKey) as { label: string | null } | undefined;
  if (row?.label === null || row?.label === undefined) {
    throw new Error(`published type ${typeKey} has no legacy label`);
  }
  inventoryDb.raw
    .prepare('UPDATE items SET legacy_type = ? WHERE id = ?')
    .run(`  ${row.label}  `, id);
  return row.label;
}

function setUpdatedAt(id: string, updatedAt: string): void {
  inventoryDb.raw.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(updatedAt, id);
}

function setLifecycle(id: string, lifecycle: string, deletedAt?: string): void {
  inventoryDb.raw
    .prepare('UPDATE items SET lifecycle = ?, deleted_at = ? WHERE id = ?')
    .run(lifecycle, deletedAt ?? null, id);
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
    expect(defaultPage).toMatchObject({ total: 1, unfilteredTotal: 1, hiddenInactiveCount: 1 });

    const withInactive = await client().web.listItems({ limit: 50, includeInactive: 'true' });
    expect(new Set(withInactive.items.map((item) => item.id))).toEqual(
      new Set([active.data.id, retired.data.id])
    );
    expect(withInactive).toMatchObject({
      total: 2,
      unfilteredTotal: 2,
      hiddenInactiveCount: 0,
    });
  });

  it('applies container, access, and fullness filters together', async () => {
    const openEmpty = await client().items.create({ itemName: 'Open empty' });
    const openFull = await client().items.create({ itemName: 'Open full' });
    const closed = await client().items.create({ itemName: 'Closed' });
    const plain = await client().items.create({ itemName: 'Plain item' });
    setPublishedType(openEmpty.data.id, 'storage_box', true);
    setPublishedType(openFull.data.id, 'storage_box', true);
    setPublishedType(closed.data.id, 'storage_box', true);
    setPublishedType(plain.data.id, 'cable');
    inventoryDb.raw.prepare(`UPDATE items SET is_full = 1 WHERE id = ?`).run(openFull.data.id);
    inventoryDb.raw.prepare(`UPDATE items SET access = 'closed' WHERE id = ?`).run(closed.data.id);

    const page = await client().web.listItems({
      isContainer: 'true',
      access: 'open',
      isFull: 'false',
    });

    expect(page.items.map((item) => item.id)).toEqual([openEmpty.data.id]);
    expect(page).toMatchObject({ total: 1, unfilteredTotal: 1, hiddenInactiveCount: 0 });
  });

  it('uses lifecycle as an explicit override and never lists tombstones', async () => {
    const active = await client().items.create({ itemName: 'Active' });
    const retired = await client().items.create({ itemName: 'Retired' });
    const discarded = await client().items.create({ itemName: 'Discarded' });
    const tombstone = await client().items.create({ itemName: 'Tombstone' });
    setLifecycle(retired.data.id, 'retired');
    setLifecycle(discarded.data.id, 'discarded');
    setLifecycle(tombstone.data.id, 'destroyed', '2026-09-26T00:00:00.000Z');

    const defaultPage = await client().web.listItems();
    expect(defaultPage.items.map((item) => item.id)).toEqual([active.data.id]);
    expect(defaultPage).toMatchObject({ total: 1, unfilteredTotal: 1, hiddenInactiveCount: 2 });

    const lifecyclePage = await client().web.listItems({ lifecycle: 'retired' });
    expect(lifecyclePage.items.map((item) => item.id)).toEqual([retired.data.id]);
    expect(lifecyclePage).toMatchObject({
      total: 1,
      unfilteredTotal: 1,
      hiddenInactiveCount: 0,
    });
  });

  it('matches untyped legacy labels case-insensitively and refuses incompatible filters', async () => {
    const typed = await client().items.create({ itemName: 'Typed cable' });
    setPublishedType(typed.data.id, 'cable');
    const legacy = await client().items.create({ itemName: 'Legacy cable' });
    const legacyLabel = setPublishedLegacyLabel(legacy.data.id, 'cable');
    const retiredLegacy = await client().items.create({ itemName: 'Retired legacy cable' });
    setPublishedLegacyLabel(retiredLegacy.data.id, 'cable');
    setLifecycle(retiredLegacy.data.id, 'retired');

    const untyped = await client().web.listItems({ untyped: 'true', includeInactive: 'true' });
    expect(untyped.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([legacy.data.id, retiredLegacy.data.id])
    );
    expect(untyped.items.map((item) => item.id)).not.toContain(typed.data.id);

    const labelPage = await client().web.listItems({ legacyLabelOf: legacyLabel.toUpperCase() });
    expect(labelPage.items.map((item) => item.id)).toEqual([legacy.data.id]);

    await expect(
      client().web.listItems({ typeKey: 'cable', untyped: 'true' })
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'typeKey cannot be combined with untyped=true' },
    });
    await expect(
      client().web.listItems({ typeKey: 'cable', legacyLabelOf: legacyLabel })
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'typeKey cannot be combined with legacyLabelOf' },
    });
  });

  it('rejects non-strict boolean values for the new query filters', async () => {
    for (const field of ['untyped', 'isContainer', 'isFull']) {
      await expect(client().web.listItems({ [field]: 'yes' })).rejects.toMatchObject({
        status: 400,
      });
    }
  });

  it('uses the existing placement helpers for within and effective location filters', async () => {
    const home = await client().locations.create({ name: 'Home' });
    const shelf = await client().locations.create({ name: 'Shelf', parentId: home.data.id });
    const box = await client().items.create({ itemName: 'Shelf box', locationId: shelf.data.id });
    setPublishedType(box.data.id, 'storage_box', true);
    const inside = await client().items.create({
      itemName: 'Inside box',
      containerId: box.data.id,
    });
    const atHome = await client().items.create({ itemName: 'At home', locationId: home.data.id });

    const insideOnly = await client().web.listItems({ within: box.data.id });
    expect(insideOnly.items.map((item) => item.id)).toEqual([inside.data.id]);

    const shelfItems = await client().web.listItems({ effectiveLocationId: shelf.data.id });
    expect(new Set(shelfItems.items.map((item) => item.id))).toEqual(
      new Set([box.data.id, inside.data.id])
    );

    const homeItems = await client().web.listItems({ within: home.data.id });
    expect(new Set(homeItems.items.map((item) => item.id))).toEqual(
      new Set([box.data.id, inside.data.id, atHome.data.id])
    );
  });

  it('orders named sorts with keyset cursors and rejects a cursor used with another sort', async () => {
    const zulu = await client().items.create({ itemName: 'Zulu' });
    const alpha = await client().items.create({ itemName: 'alpha' });
    const bravo = await client().items.create({ itemName: 'Bravo' });
    setUpdatedAt(zulu.data.id, '2026-09-26T00:00:01.000Z');
    setUpdatedAt(alpha.data.id, '2026-09-26T00:00:03.000Z');
    setUpdatedAt(bravo.data.id, '2026-09-26T00:00:02.000Z');

    const first = await client().web.listItems({ sort: 'name', limit: 2 });
    expect(first.items.map((item) => item.name)).toEqual(['alpha', 'Bravo']);
    expect(first.nextCursor).not.toBeNull();

    const second = await client().web.listItems({
      sort: 'name',
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.name)).toEqual(['Zulu']);

    await expect(
      client().web.listItems({ sort: 'updated', cursor: first.nextCursor! })
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'The cursor was not issued by this route' },
    });
    await expect(client().web.listItems({ cursor: first.nextCursor! })).rejects.toMatchObject({
      status: 400,
      body: { message: 'The cursor was not issued by this route' },
    });
  });

  it('orders updated, type, where, and packing sorts with their boundary rows', async () => {
    const oldest = await client().items.create({ itemName: 'Oldest' });
    const middle = await client().items.create({ itemName: 'Middle' });
    const newest = await client().items.create({ itemName: 'Newest' });
    setUpdatedAt(oldest.data.id, '2026-09-26T00:00:01.000Z');
    setUpdatedAt(middle.data.id, '2026-09-26T00:00:02.000Z');
    setUpdatedAt(newest.data.id, '2026-09-26T00:00:03.000Z');
    const updated = await client().web.listItems({
      sort: 'updated',
      ids: [oldest.data.id, middle.data.id, newest.data.id].join(','),
    });
    expect(updated.items.map((item) => item.id)).toEqual([
      newest.data.id,
      middle.data.id,
      oldest.data.id,
    ]);

    const cable = await client().items.create({ itemName: 'Cable item' });
    const box = await client().items.create({ itemName: 'Box item' });
    const untyped = await client().items.create({ itemName: 'Untyped item' });
    setPublishedType(cable.data.id, 'cable');
    setPublishedType(box.data.id, 'storage_box', true);
    const typedFirst = await client().web.listItems({
      sort: 'type',
      limit: 2,
      ids: [cable.data.id, box.data.id, untyped.data.id].join(','),
    });
    expect(typedFirst.items.map((item) => item.id)).toEqual([cable.data.id, box.data.id]);
    expect(typedFirst.nextCursor).not.toBeNull();
    const typedLast = await client().web.listItems({
      sort: 'type',
      limit: 2,
      cursor: typedFirst.nextCursor!,
      ids: [cable.data.id, box.data.id, untyped.data.id].join(','),
    });
    expect(typedLast.items.map((item) => item.id)).toEqual([untyped.data.id]);

    const bedroom = await client().locations.create({ name: 'Bedroom' });
    const kitchen = await client().locations.create({ name: 'Kitchen' });
    const bedroomItem = await client().items.create({
      itemName: 'Bedroom item',
      locationId: bedroom.data.id,
    });
    const kitchenItem = await client().items.create({
      itemName: 'Kitchen item',
      locationId: kitchen.data.id,
    });
    const handItem = await client().items.create({ itemName: 'Hand item' });
    const whereIds = [bedroomItem.data.id, kitchenItem.data.id, handItem.data.id].join(',');
    const whereFirst = await client().web.listItems({ sort: 'where', limit: 2, ids: whereIds });
    expect(whereFirst.items.map((item) => item.id)).toEqual([
      bedroomItem.data.id,
      kitchenItem.data.id,
    ]);
    expect(whereFirst.nextCursor).not.toBeNull();
    const whereLast = await client().web.listItems({
      sort: 'where',
      limit: 2,
      cursor: whereFirst.nextCursor!,
      ids: whereIds,
    });
    expect(whereLast.items.map((item) => item.id)).toEqual([handItem.data.id]);

    const loose = await client().items.create({ itemName: 'Loose' });
    const openBox = await client().items.create({ itemName: 'Open box' });
    const fullBox = await client().items.create({ itemName: 'Full box' });
    const closedBox = await client().items.create({ itemName: 'Closed box' });
    setPublishedType(openBox.data.id, 'storage_box', true);
    setPublishedType(fullBox.data.id, 'storage_box', true);
    setPublishedType(closedBox.data.id, 'storage_box', true);
    inventoryDb.raw.prepare(`UPDATE items SET is_full = 1 WHERE id = ?`).run(fullBox.data.id);
    inventoryDb.raw
      .prepare(`UPDATE items SET access = 'closed' WHERE id = ?`)
      .run(closedBox.data.id);
    const packing = await client().web.listItems({
      sort: 'packing',
      ids: [loose.data.id, openBox.data.id, fullBox.data.id, closedBox.data.id].join(','),
    });
    expect(packing.items.map((item) => item.id)).toEqual([
      loose.data.id,
      openBox.data.id,
      fullBox.data.id,
      closedBox.data.id,
    ]);
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

  it('ranks name prefixes, name contains, and approved other fields', async () => {
    const prefix = await client().items.create({ itemName: 'Box lid' });
    const wordPrefix = await client().items.create({ itemName: 'Red box' });
    const contains = await client().items.create({ itemName: 'Toolbox' });
    const code = await client().items.create({ itemName: 'Code marker', assetId: 'BOX-001' });
    const note = await client().items.create({ itemName: 'Note marker', notes: 'Keep by box' });
    const type = await client().items.create({ itemName: 'Type marker' });
    setPublishedType(type.data.id, 'storage_box');

    const page = await client().web.listItems({ q: 'BOX', sort: 'name', limit: 50 });

    expect(page.items.map((item) => item.id)).toEqual([
      prefix.data.id,
      wordPrefix.data.id,
      contains.data.id,
      code.data.id,
      note.data.id,
      type.data.id,
    ]);
  });

  it('excludes rows that do not match q and trims the query', async () => {
    const match = await client().items.create({ itemName: 'Needle case' });
    await client().items.create({ itemName: 'Unrelated' });

    const page = await client().web.listItems({ q: '  NEEDLE  ' });
    expect(page.items.map((item) => item.id)).toEqual([match.data.id]);
    expect(page).toMatchObject({ total: 1, unfilteredTotal: 2 });

    await expect(client().web.listItems({ q: '   ' })).rejects.toMatchObject({ status: 400 });
    await expect(client().web.listItems({ q: 'x'.repeat(201) })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('treats LIKE wildcards and backslashes as literal q text', async () => {
    const percent = await client().items.create({ itemName: 'Percent 100%' });
    const underscore = await client().items.create({ itemName: 'Underscore _' });
    const backslash = String.fromCharCode(92);
    const slashItem = await client().items.create({ itemName: `Backslash ${backslash}` });
    await client().items.create({ itemName: 'Ordinary' });

    await expect(client().web.listItems({ q: '%' })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: percent.data.id })],
    });
    await expect(client().web.listItems({ q: '_' })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: underscore.data.id })],
    });
    await expect(client().web.listItems({ q: backslash })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: slashItem.data.id })],
    });
  });

  it('ranks q before the requested sort and uses id to break sort ties', async () => {
    const first = await client().items.create({ itemName: 'Needle zulu' });
    const second = await client().items.create({ itemName: 'Needle alpha' });
    const contains = await client().items.create({ itemName: 'Long needle' });
    const sameUpdatedAt = '2026-09-26T00:00:00.000Z';
    setUpdatedAt(first.data.id, sameUpdatedAt);
    setUpdatedAt(second.data.id, sameUpdatedAt);
    setUpdatedAt(contains.data.id, sameUpdatedAt);

    const page = await client().web.listItems({ q: 'needle', sort: 'updated', limit: 50 });
    const prefixIds = [first.data.id, second.data.id].toSorted();

    expect(page.items.map((item) => item.id)).toEqual([...prefixIds, contains.data.id]);
  });

  it('paginates q results without repeats or gaps with and without a sort', async () => {
    const created = await Promise.all(
      ['Box alpha', 'Box beta', 'Red box', 'Box gamma', 'Code marker'].map((itemName, index) =>
        client().items.create({
          itemName,
          ...(index === 4 ? { assetId: 'BOX-004' } : {}),
        })
      )
    );
    const expected = new Set(created.map((item) => item.data.id));

    const collect = async (sort?: 'name') => {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await client().web.listItems({
          q: 'box',
          limit: 2,
          ...(sort === undefined ? {} : { sort }),
          ...(cursor === undefined ? {} : { cursor }),
        });
        seen.push(...page.items.map((item) => item.id));
        if (page.nextCursor === null) return seen;
        cursor = page.nextCursor;
      }
      throw new Error('q pagination did not terminate');
    };

    expect(new Set(await collect())).toEqual(expected);
    expect(new Set(await collect('name'))).toEqual(expected);
  });

  it('counts only q matches while retaining the unfiltered baseline', async () => {
    const active = await client().items.create({ itemName: 'Needle active' });
    const retired = await client().items.create({ itemName: 'Needle retired' });
    await client().items.create({ itemName: 'Other active' });
    setLifecycle(retired.data.id, 'retired');

    const page = await client().web.listItems({ q: 'needle' });

    expect(page.items.map((item) => item.id)).toEqual([active.data.id]);
    expect(page).toMatchObject({ total: 1, unfilteredTotal: 2, hiddenInactiveCount: 1 });
  });

  it('combines q with container filters even when q has no container match', async () => {
    const container = await client().items.create({ itemName: 'Storage bin' });
    setPublishedType(container.data.id, 'storage_box', true);

    const matched = await client().web.listItems({
      q: 'storage',
      isContainer: 'true',
      access: 'open',
      isFull: 'false',
    });
    expect(matched.items.map((item) => item.id)).toEqual([container.data.id]);

    const missing = await client().web.listItems({
      q: 'wardrobe',
      isContainer: 'true',
      access: 'open',
      isFull: 'false',
    });
    expect(missing).toMatchObject({ items: [], total: 0, unfilteredTotal: 1 });
  });

  it('rejects q cursors without q, with another sort, and rejects old cursors with q', async () => {
    await client().items.create({ itemName: 'Box one' });
    await client().items.create({ itemName: 'Box two' });
    const qPage = await client().web.listItems({ q: 'box', sort: 'name', limit: 1 });
    const oldPage = await client().web.listItems({ sort: 'name', limit: 1 });

    await expect(client().web.listItems({ cursor: qPage.nextCursor! })).rejects.toMatchObject({
      status: 400,
      body: { message: 'The cursor was not issued by this route' },
    });
    await expect(
      client().web.listItems({ q: 'box', sort: 'updated', cursor: qPage.nextCursor! })
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'The cursor was not issued by this route' },
    });
    await expect(
      client().web.listItems({ q: 'box', sort: 'name', cursor: oldPage.nextCursor! })
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'The cursor was not issued by this route' },
    });
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
