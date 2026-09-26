import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { WebValueReportResponseSchema } from '../../contract/rest-web-reports.js';
import { itemPhotos, items, media, type ItemInsert } from '../../db/index.js';
import {
  createItem,
  createLocation,
  openSyncHarness,
  send,
  type SyncHarness,
  type WireMutation,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let h: SyncHarness;

const id = (): string => randomUUID();

beforeEach(() => {
  h = openSyncHarness(transport);
});

afterEach(() => h.close());

async function apply(...mutations: WireMutation[]): Promise<void> {
  const response = await send(h.api, mutations);
  expect(response.status).toBe(200);
}

async function report(query: Record<string, string> = {}) {
  const response = await h.api.get('/web/reports/values').query(query);
  expect(response.status).toBe(200);
  return WebValueReportResponseSchema.parse(response.body);
}

function setItem(id: string, values: Partial<ItemInsert>): void {
  h.db.db.update(items).set(values).where(eq(items.id, id)).run();
}

function setContainer(id: string): void {
  setItem(id, { isContainer: 1, access: 'closed', isFull: 0 });
}

function addPhoto(id: string, hash: string): void {
  h.db.db
    .insert(media)
    .values({
      sha256: hash,
      mime: 'image/jpeg',
      byteSize: 1,
      storedAt: '2026-09-19T10:00:00.000Z',
    })
    .run();
  h.db.db.insert(itemPhotos).values({ itemId: id, mediaSha256: hash, filePath: null }).run();
}

function publishedType(predicate: (type: { capabilities: readonly string[] }) => boolean) {
  const type = loadPublishedCatalogue(h.db.db)?.types.find(predicate);
  if (!type) throw new Error('the migrated database has no matching published type');
  return type;
}

describe('GET /web/reports/values', () => {
  it('groups by the room of the effective location, boxed items included', async () => {
    const home = id();
    const kitchen = id();
    const shelf = id();
    const box = id();
    const mug = id();
    await apply(
      createLocation(home, 'Home'),
      createLocation(kitchen, 'Kitchen', home),
      createLocation(shelf, 'Shelf', kitchen),
      createItem(box, 'Box', { kind: 'location', locationId: shelf })
    );
    setContainer(box);
    await apply(createItem(mug, 'Mug', { kind: 'container', itemId: box }));
    setItem(mug, { replacementValue: 5 });

    const result = await report();

    expect(result.groups).toEqual([
      expect.objectContaining({
        key: kitchen,
        label: 'Kitchen',
        records: 1,
        entries: [expect.objectContaining({ itemId: mug })],
      }),
    ]);
  });

  it('in-hand items group under In hand', async () => {
    const itemId = id();
    await apply(createItem(itemId, 'Hand item'));
    setItem(itemId, { replacementValue: 12 });

    const result = await report();

    expect(result.groups[0]).toMatchObject({ key: 'in-hand', label: 'In hand', value: 12 });
  });

  it('groups by catalogue type with Untyped for untyped items', async () => {
    const type = publishedType((candidate) => !candidate.capabilities.includes('containment'));
    const typedId = id();
    const untypedId = id();
    await apply(createItem(typedId, 'Typed item'), createItem(untypedId, 'Untyped item'));
    setItem(typedId, { typeId: type.id, replacementValue: 20 });
    setItem(untypedId, { replacementValue: 10 });

    const result = await report({ by: 'type' });

    expect(result.groups).toEqual([
      expect.objectContaining({ key: type.id, label: type.label, value: 20 }),
      expect.objectContaining({
        key: 'untyped',
        label: 'Untyped',
        entries: [expect.objectContaining({ typeKey: null })],
      }),
    ]);
    expect(result.groups[0]?.entries[0]?.typeKey).toBe(type.key);
  });

  it('basis purchase uses purchase price and counts replacement-only items as unvalued', async () => {
    const replacementOnlyId = id();
    const purchasedId = id();
    await apply(
      createItem(replacementOnlyId, 'Replacement only'),
      createItem(purchasedId, 'Purchased')
    );
    setItem(replacementOnlyId, { replacementValue: 20 });
    setItem(purchasedId, { replacementValue: 30, purchasePrice: 5 });

    const result = await report({ basis: 'purchase' });
    const group = result.groups[0];

    expect(group).toMatchObject({ value: 5, records: 2, unvalued: 1 });
    expect(group?.entries).toEqual([
      expect.objectContaining({ itemId: purchasedId, unitValue: 5, value: 5 }),
      expect.objectContaining({ itemId: replacementOnlyId, unitValue: null, value: null }),
    ]);
    expect(result.totals).toMatchObject({ replacement: 50, purchase: 5, unvalued: 0 });
  });

  it('value multiplies unit value by quantity', async () => {
    const mugsId = id();
    await apply(createItem(mugsId, 'Mugs'));
    setItem(mugsId, { quantity: 6, replacementValue: 5 });

    const result = await report();

    expect(result.totals).toMatchObject({ records: 1, units: 6, replacement: 30 });
    expect(result.groups[0]).toMatchObject({ value: 30 });
    expect(result.groups[0]?.entries[0]).toMatchObject({ unitValue: 5, value: 30, quantity: 6 });
  });

  it('an unvalued container is not an entry; a valued one is', async () => {
    const emptyBoxId = id();
    const valuedBoxId = id();
    await apply(createItem(emptyBoxId, 'Empty box'), createItem(valuedBoxId, 'Valued box'));
    setContainer(emptyBoxId);
    setItem(emptyBoxId, { purchasePrice: 9 });
    setContainer(valuedBoxId);
    setItem(valuedBoxId, { replacementValue: 25 });

    const result = await report();

    expect(result.totals.records).toBe(1);
    expect(result.groups[0]?.entries.map((entry) => entry.itemId)).toEqual([valuedBoxId]);
  });

  it('inactive and deleted items are excluded', async () => {
    const activeId = id();
    const retiredId = id();
    const deletedId = id();
    await apply(
      createItem(activeId, 'Active item'),
      createItem(retiredId, 'Retired item'),
      createItem(deletedId, 'Deleted item')
    );
    setItem(activeId, { replacementValue: 10 });
    setItem(retiredId, { replacementValue: 20, lifecycle: 'retired' });
    setItem(deletedId, { replacementValue: 30, deletedAt: '2026-09-19T11:00:00.000Z' });

    const result = await report();

    expect(result.totals.records).toBe(1);
    expect(result.groups[0]?.entries.map((entry) => entry.itemId)).toEqual([activeId]);
  });

  it('an empty database returns zero totals and no groups', async () => {
    for (const by of ['room', 'type'] as const) {
      await expect(report({ by })).resolves.toEqual({
        totals: { records: 0, units: 0, replacement: 0, purchase: 0, unvalued: 0, withoutPhoto: 0 },
        groups: [],
      });
    }
  });

  it('totals match reportTotals, including withoutPhoto', async () => {
    const withPhotoId = id();
    const withoutPhotoId = id();
    await apply(createItem(withPhotoId, 'With photo'), createItem(withoutPhotoId, 'Without photo'));
    setItem(withPhotoId, { quantity: 2, replacementValue: 10, purchasePrice: 8 });
    setItem(withoutPhotoId, { replacementValue: null, purchasePrice: 4 });
    addPhoto(withPhotoId, 'a'.repeat(64));

    const result = await report();

    expect(result.totals).toEqual({
      records: 2,
      units: 3,
      replacement: 20,
      purchase: 20,
      unvalued: 1,
      withoutPhoto: 1,
    });
  });

  it('groups and entries order by value, unvalued last', async () => {
    const highRoomId = id();
    const lowRoomId = id();
    const highId = id();
    const lowId = id();
    const middleId = id();
    const missingId = id();
    await apply(
      createLocation(highRoomId, 'High room'),
      createLocation(lowRoomId, 'Low room'),
      createItem(highId, 'High', { kind: 'location', locationId: highRoomId }),
      createItem(lowId, 'Low', { kind: 'location', locationId: lowRoomId }),
      createItem(middleId, 'Middle'),
      createItem(missingId, 'Missing')
    );
    setItem(highId, { replacementValue: 100 });
    setItem(lowId, { replacementValue: 50 });
    setItem(middleId, { replacementValue: 30 });
    setItem(missingId, { replacementValue: null });

    const result = await report();

    expect(result.groups.map((group) => group.label)).toEqual(['High room', 'Low room', 'In hand']);
    expect(result.groups[2]?.entries.map((entry) => entry.itemId)).toEqual([middleId, missingId]);
  });

  it('an unknown by or basis is a 400', async () => {
    const unknownGrouping = await h.api.get('/web/reports/values').query({ by: 'resale' });
    const unknownBasis = await h.api.get('/web/reports/values').query({ basis: 'resale' });

    expect(unknownGrouping.status).toBe(400);
    expect(unknownBasis.status).toBe(400);
  });
});
