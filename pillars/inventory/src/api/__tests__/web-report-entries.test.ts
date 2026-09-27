import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebReportEntriesResponseSchema } from '../../contract/rest-web-reports.js';
import { itemDocuments, itemPhotos, items, media, type ItemInsert } from '../../db/index.js';
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

async function report() {
  const response = await h.api.get('/web/reports/entries');
  expect(response.status).toBe(200);
  return WebReportEntriesResponseSchema.parse(response.body);
}

function setItem(itemId: string, values: Partial<ItemInsert>): void {
  h.db.db.update(items).set(values).where(eq(items.id, itemId)).run();
}

function setContainer(itemId: string): void {
  setItem(itemId, { isContainer: 1, access: 'closed', isFull: 0 });
}

function addPhoto(itemId: string, hash: string): void {
  h.db.db
    .insert(media)
    .values({
      sha256: hash,
      mime: 'image/jpeg',
      byteSize: 1,
      storedAt: '2026-09-19T10:00:00.000Z',
    })
    .run();
  h.db.db.insert(itemPhotos).values({ itemId, mediaSha256: hash, filePath: null }).run();
}

describe('GET /web/reports/entries', () => {
  it('lists live active items and valued containers only', async () => {
    const activeId = id();
    const retiredId = id();
    const deletedId = id();
    const emptyBoxId = id();
    const valuedBoxId = id();
    await apply(
      createItem(valuedBoxId, 'Valued box'),
      createItem(activeId, 'Active item'),
      createItem(retiredId, 'Retired item'),
      createItem(deletedId, 'Deleted item'),
      createItem(emptyBoxId, 'Empty box')
    );
    setItem(activeId, { replacementValue: 10 });
    setItem(retiredId, { replacementValue: 20, lifecycle: 'retired' });
    setItem(deletedId, { replacementValue: 30, deletedAt: '2026-09-19T11:00:00.000Z' });
    setContainer(emptyBoxId);
    setContainer(valuedBoxId);
    setItem(valuedBoxId, { replacementValue: 25 });

    const result = await report();

    expect(result.entries.map((entry) => entry.itemId)).toEqual([activeId, valuedBoxId]);
  });

  it('includes containers valued by either replacement or purchase price', async () => {
    const purchaseOnlyBoxId = id();
    await apply(createItem(purchaseOnlyBoxId, 'Purchase-only box'));
    setContainer(purchaseOnlyBoxId);
    setItem(purchaseOnlyBoxId, { purchasePrice: 15 });

    const result = await report();

    expect(result.entries).toEqual([
      expect.objectContaining({ itemId: purchaseOnlyBoxId, purchasePrice: 15 }),
    ]);
  });

  it('reads the room and place of a boxed item through its container', async () => {
    const home = id();
    const kitchen = id();
    const shelf = id();
    const box = id();
    const item = id();
    await apply(
      createLocation(home, 'Home'),
      createLocation(kitchen, 'Kitchen', home),
      createLocation(shelf, 'Shelf', kitchen),
      createItem(box, 'Box', { kind: 'location', locationId: shelf })
    );
    setContainer(box);
    setItem(box, { replacementValue: 25 });
    await apply(createItem(item, 'Item', { kind: 'container', itemId: box }));
    setItem(item, { replacementValue: 10 });

    const entry = (await report()).entries.find((candidate) => candidate.itemId === item);

    expect(entry).toMatchObject({
      effectiveLocationId: shelf,
      room: { key: kitchen, label: 'Kitchen' },
      place: 'Shelf',
    });
  });

  it('in-hand items have room In hand and no place', async () => {
    const item = id();
    await apply(createItem(item, 'Hand item'));
    setItem(item, { replacementValue: 10 });

    const entry = (await report()).entries[0];

    expect(entry).toMatchObject({
      itemId: item,
      effectiveLocationId: null,
      room: { key: 'in-hand', label: 'In hand' },
      place: null,
    });
  });

  it('takes the first receipt document and counts photos', async () => {
    const item = id();
    await apply(createItem(item, 'Documented item'));
    setItem(item, { replacementValue: 10 });
    h.db.db
      .insert(itemDocuments)
      .values({ itemId: item, paperlessDocumentId: 200, documentType: 'manual' })
      .run();
    h.db.db
      .insert(itemDocuments)
      .values({ itemId: item, paperlessDocumentId: 101, documentType: 'receipt' })
      .run();
    h.db.db
      .insert(itemDocuments)
      .values({ itemId: item, paperlessDocumentId: 102, documentType: 'receipt' })
      .run();
    addPhoto(item, 'a'.repeat(64));
    addPhoto(item, 'b'.repeat(64));

    const entry = (await report()).entries[0];

    expect(entry).toMatchObject({ receiptId: 101, photos: 2 });
  });

  it('returns values per unit as stored', async () => {
    const item = id();
    await apply(createItem(item, 'Six items'));
    setItem(item, { quantity: 6, replacementValue: 5, purchasePrice: 3 });

    const entry = (await report()).entries[0];

    expect(entry).toMatchObject({ quantity: 6, replacementValue: 5, purchasePrice: 3 });
  });

  it('an empty database returns no entries', async () => {
    await expect(report()).resolves.toEqual({ entries: [] });
  });
});
