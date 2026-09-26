/** Acceptance tests for the ranked, cursor-paged `GET /web/search` surface. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebSearchResponseSchema } from '../../contract/rest-web-search.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';
import { makeClient } from './test-utils.js';

import type { Express } from 'express';
import type { z } from 'zod';

type SearchQuery = Record<string, string | number | undefined>;
type SearchResponse = z.infer<typeof WebSearchResponseSchema>;

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;
let app: Express;
const transport = createTestTransport();

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-web-search-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  app = createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3005',
  });
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(app);
}

function request(query: SearchQuery = {}) {
  return transport.requestOn(app).get('/web/search').query(query);
}

async function search(query: SearchQuery): Promise<SearchResponse> {
  const response = await request(query);
  if (response.status !== 200) throw new Error(`expected web search 200, got ${response.status}`);
  return WebSearchResponseSchema.parse(response.body);
}

async function expectBadQuery(query: SearchQuery): Promise<void> {
  expect((await request(query)).status).toBe(400);
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

function setLifecycle(id: string, lifecycle: string, deletedAt: string | null = null): void {
  inventoryDb.raw
    .prepare('UPDATE items SET lifecycle = ?, deleted_at = ? WHERE id = ?')
    .run(lifecycle, deletedAt, id);
}

function setLocationDeleted(id: string): void {
  inventoryDb.raw
    .prepare('UPDATE locations SET deleted_at = ? WHERE id = ?')
    .run('2026-09-26T00:00:00.000Z', id);
}

describe('GET /web/search', () => {
  it('returns an exact code hit separately and never repeats it in items', async () => {
    const exact = await client().items.create({ itemName: 'Stored cable', assetId: 'INV-001' });
    const partial = await client().items.create({
      itemName: 'Replacement cable',
      assetId: 'INV-001-X',
    });

    const page = await search({ q: ' inv-001 ', limit: 1 });

    expect(page.exact?.id).toBe(exact.data.id);
    expect(page.items.map((hit) => hit.item.id)).toEqual([partial.data.id]);
    expect(page.items.map((hit) => hit.item.id)).not.toContain(exact.data.id);
    expect(page.total).toBe(2);
  });

  it('does not return an inactive exact code hit when activeOnly is true', async () => {
    const retired = await client().items.create({
      itemName: 'Retired exact',
      assetId: 'RETIRED-001',
    });
    setLifecycle(retired.data.id, 'retired');

    const page = await search({ q: 'retired-001', activeOnly: 'true' });

    expect(page).toEqual({ exact: null, items: [], places: [], nextCursor: null, total: 0 });
  });

  it('ranks names before other fields and reports the explaining field', async () => {
    const namePrefix = await client().items.create({ itemName: 'Able adapter' });
    const wordPrefix = await client().items.create({ itemName: 'Red able adapter' });
    const nameContains = await client().items.create({ itemName: 'Cable adapter' });
    const code = await client().items.create({ itemName: 'Code marker', assetId: 'ABLE-001' });
    const note = await client().items.create({
      itemName: 'Note marker',
      notes: 'Keep able nearby',
    });
    const type = await client().items.create({ itemName: 'Type marker' });
    setPublishedType(type.data.id, 'cable');
    const table = await client().locations.create({ name: 'Table room' });
    const place = await client().items.create({
      itemName: 'Place marker',
      locationId: table.data.id,
    });

    const page = await search({ q: 'ABLE', limit: 50 });

    expect(page.items.map((hit) => hit.item.id)).toEqual([
      namePrefix.data.id,
      wordPrefix.data.id,
      nameContains.data.id,
      code.data.id,
      note.data.id,
      place.data.id,
      type.data.id,
    ]);
    expect(page.items.map((hit) => hit.tier)).toEqual([
      'prefix',
      'prefix',
      'contains',
      'other',
      'other',
      'other',
      'other',
    ]);
    expect(new Map(page.items.map((hit) => [hit.item.id, hit.field]))).toEqual(
      new Map([
        [namePrefix.data.id, null],
        [wordPrefix.data.id, null],
        [nameContains.data.id, null],
        [code.data.id, 'code'],
        [note.data.id, 'note'],
        [place.data.id, 'place'],
        [type.data.id, 'type'],
      ])
    );
  });

  it('keeps active prefix hits ahead of inactive prefix hits', async () => {
    const inactiveNamePrefix = await client().items.create({ itemName: 'Alpha retired' });
    setLifecycle(inactiveNamePrefix.data.id, 'retired');
    const activeWordPrefix = await client().items.create({ itemName: 'Shelf alpha' });

    const page = await search({ q: 'alpha' });

    expect(page.items.map((hit) => hit.item.id)).toEqual([
      activeWordPrefix.data.id,
      inactiveNamePrefix.data.id,
    ]);
  });

  it('orders active rows before inactive rows and supports activeOnly', async () => {
    const activeAlpha = await client().items.create({ itemName: 'Sorted alpha' });
    const activeZulu = await client().items.create({ itemName: 'Sorted zulu' });
    const retired = await client().items.create({ itemName: 'Sorted retired' });
    setLifecycle(retired.data.id, 'retired');

    const all = await search({ q: 'sorted', activeOnly: 'false', limit: 50 });
    const activeOnly = await search({ q: 'sorted', activeOnly: 'true', limit: 50 });

    expect(all.items.map((hit) => hit.item.id)).toEqual([
      activeAlpha.data.id,
      activeZulu.data.id,
      retired.data.id,
    ]);
    expect(activeOnly.items.map((hit) => hit.item.id)).toEqual([
      activeAlpha.data.id,
      activeZulu.data.id,
    ]);
    for (const activeOnly of ['1', 'yes', '']) {
      await expectBadQuery({ q: 'sorted', activeOnly });
    }
  });

  it('applies type and within filters to exact and ranked item matches', async () => {
    const home = await client().locations.create({ name: 'Home' });
    const shelf = await client().locations.create({ name: 'Shelf', parentId: home.data.id });
    const garage = await client().locations.create({ name: 'Garage' });
    const exact = await client().items.create({
      itemName: 'Filter exact',
      assetId: 'FILTER-001',
      locationId: shelf.data.id,
    });
    const cable = await client().items.create({
      itemName: 'Filter cable',
      locationId: shelf.data.id,
    });
    const outside = await client().items.create({
      itemName: 'Filter outside',
      locationId: garage.data.id,
    });
    const tombstone = await client().items.create({ itemName: 'Filter tombstone' });
    setPublishedType(exact.data.id, 'storage_box', true);
    setPublishedType(cable.data.id, 'cable');
    setPublishedType(outside.data.id, 'storage_box', true);
    setLifecycle(tombstone.data.id, 'retired', '2026-09-26T00:00:00.000Z');

    const filtered = await search({
      q: 'filter',
      typeKey: 'storage_box',
      within: shelf.data.id,
      limit: 50,
    });
    const exactMatch = await search({
      q: 'filter-001',
      typeKey: 'storage_box',
      within: shelf.data.id,
    });
    const wrongType = await search({ q: 'filter-001', typeKey: 'cable' });
    const wrongPlace = await search({ q: 'filter-001', within: garage.data.id });

    expect(filtered.items.map((hit) => hit.item.id)).toEqual([exact.data.id]);
    expect(filtered.total).toBe(1);
    expect(exactMatch.exact?.id).toBe(exact.data.id);
    expect(exactMatch.items).toEqual([]);
    expect(exactMatch.total).toBe(1);
    expect(wrongType).toMatchObject({ exact: { id: exact.data.id }, items: [], total: 1 });
    expect(wrongPlace).toMatchObject({ exact: { id: exact.data.id }, items: [], total: 1 });
    expect(filtered.items.map((hit) => hit.item.id)).not.toContain(tombstone.data.id);
    await expectBadQuery({ q: 'filter', typeKey: '' });
    await expectBadQuery({ q: 'filter', within: '' });
  });

  it('returns live place hits and excludes tombstoned locations and their placed items', async () => {
    const prefixPlace = await client().locations.create({ name: 'Able room' });
    const containsPlace = await client().locations.create({ name: 'Table room' });
    const deletedPlace = await client().locations.create({ name: 'Able tombstone' });
    const liveItem = await client().items.create({
      itemName: 'Hidden live',
      locationId: containsPlace.data.id,
    });
    const deletedItem = await client().items.create({
      itemName: 'Hidden deleted-place',
      locationId: deletedPlace.data.id,
    });
    setLocationDeleted(deletedPlace.data.id);

    const page = await search({ q: 'ABLE', limit: 50 });

    expect(page.places).toEqual([
      {
        location: {
          id: prefixPlace.data.id,
          revision: expect.any(Number),
          seq: expect.any(Number),
          name: 'Able room',
          parentId: null,
          sortOrder: expect.any(Number),
          deletedAt: null,
        },
        tier: 'prefix',
      },
      {
        location: {
          id: containsPlace.data.id,
          revision: expect.any(Number),
          seq: expect.any(Number),
          name: 'Table room',
          parentId: null,
          sortOrder: expect.any(Number),
          deletedAt: null,
        },
        tier: 'contains',
      },
    ]);
    expect(page.places.map((hit) => hit.location.id)).not.toContain(deletedPlace.data.id);
    expect(page.items.map((hit) => hit.item.id)).toContain(liveItem.data.id);
    expect(page.items.map((hit) => hit.item.id)).not.toContain(deletedItem.data.id);
    expect(page.items.find((hit) => hit.item.id === liveItem.data.id)?.field).toBe('place');
    expect((await search({ q: 'able', typeKey: 'cable' })).places).toEqual([]);
    expect((await search({ q: 'able', within: containsPlace.data.id })).places).toEqual(
      page.places
    );
  });

  it('returns empty results for a query with no matches', async () => {
    for (const query of [
      { q: 'does-not-exist' },
      { q: 'does-not-exist', typeKey: 'unknown-type' },
      { q: 'does-not-exist', within: 'unknown-location' },
    ]) {
      const page = await search(query);
      expect(page).toEqual({ exact: null, items: [], places: [], nextCursor: null, total: 0 });
    }
  });

  it('pages by keyset without repeats, keeps totals stable, and rejects foreign cursors', async () => {
    const exact = await client().items.create({ itemName: 'Exact cursor code', assetId: 'cursor' });
    const created = await Promise.all(
      ['Cursor alpha', 'Cursor bravo', 'Cursor charlie', 'Cursor delta', 'Cursor echo'].map(
        (itemName) => client().items.create({ itemName })
      )
    );
    const place = await client().locations.create({ name: 'Cursor place' });

    const first = await search({ q: 'cursor', limit: 2 });
    expect(first.total).toBe(7);
    expect(first.exact?.id).toBe(exact.data.id);
    expect(first.places.map((hit) => hit.location.id)).toContain(place.data.id);
    expect(first.nextCursor).not.toBeNull();

    const seen = [exact.data.id, ...first.items.map((hit) => hit.item.id)];
    let cursor = first.nextCursor;
    let lastPage: SearchResponse = first;
    for (let guard = 0; guard < 10 && cursor !== null; guard += 1) {
      lastPage = await search({ q: 'cursor', limit: 2, cursor });
      expect(lastPage.exact).toBeNull();
      expect(lastPage.places).toEqual([]);
      expect(lastPage.total).toBe(7);
      seen.push(...lastPage.items.map((hit) => hit.item.id));
      cursor = lastPage.nextCursor;
    }

    expect(cursor).toBeNull();
    expect(new Set(seen)).toEqual(new Set([exact.data.id, ...created.map((item) => item.data.id)]));
    expect(seen).toHaveLength(6);
    expect(lastPage.nextCursor).toBeNull();

    const foreign = await client().web.listItems({ q: 'cursor', limit: 1 });
    expect(foreign.nextCursor).not.toBeNull();
    await expectBadQuery({ q: 'cursor', cursor: foreign.nextCursor! });
    await expectBadQuery({ q: 'cursor', cursor: first.nextCursor!, typeKey: 'cable' });
    await expectBadQuery({ q: 'other', cursor: first.nextCursor! });
    await expectBadQuery({ q: 'cursor', cursor: 'not-a-real-cursor' });
  });

  it('escapes LIKE wildcards and trims while rejecting empty queries', async () => {
    const percent = await client().items.create({ itemName: 'Percent 100%' });
    const underscore = await client().items.create({ itemName: 'Underscore _' });
    const backslash = String.fromCharCode(92);
    const slash = await client().items.create({ itemName: `Backslash ${backslash}` });
    await client().items.create({ itemName: 'Ordinary' });

    expect((await search({ q: '%' })).items.map((hit) => hit.item.id)).toEqual([percent.data.id]);
    expect((await search({ q: '_' })).items.map((hit) => hit.item.id)).toEqual([
      underscore.data.id,
    ]);
    expect((await search({ q: backslash })).items.map((hit) => hit.item.id)).toEqual([
      slash.data.id,
    ]);
    expect((await search({ q: '  PERCENT 100%  ' })).items.map((hit) => hit.item.id)).toEqual([
      percent.data.id,
    ]);
    await expectBadQuery({});
    await expectBadQuery({ q: '' });
    await expectBadQuery({ q: '   ' });
    await expectBadQuery({ q: 'x'.repeat(201) });
  });
});
