import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { itemPhotos } from '../../../db/index.js';
import { mutation, openHarness, seedItem, seedLocation, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
});

function splitOff(
  quantity: number,
  newItemId = randomUUID()
): { newItemId: string; outcome: unknown } {
  return { newItemId, outcome: h.run(mutation('item.split', 'screws', { newItemId, quantity })) };
}

describe('item.split', () => {
  it('reduces the original quantity and creates a new item with the split-off count', () => {
    seedItem(h, { id: 'screws', locationId: 'shelf', quantity: 40, code: 'B412' });
    const { newItemId, outcome } = splitOff(10);
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('screws').quantity).toBe(30);
    expect(h.item(newItemId)).toMatchObject({
      quantity: 10,
      placementKind: 'location',
      locationId: 'shelf',
      code: null,
    });
  });

  it('does not copy the code', () => {
    seedItem(h, { id: 'screws', locationId: 'shelf', quantity: 2, code: 'B412' });
    const { newItemId } = splitOff(1);
    expect(h.item(newItemId).code).toBeNull();
    expect(h.item('screws').code).toBe('B412');
  });

  it('copies photos onto the new item', () => {
    seedItem(h, { id: 'screws', locationId: 'shelf', quantity: 2 });
    h.raw
      .prepare(
        `INSERT INTO item_photos (item_id, media_sha256, file_path, position) VALUES (?, NULL, ?, ?)`
      )
      .run('screws', '/legacy/screws-1.jpg', 0);
    const { newItemId } = splitOff(1);
    const copied = h.db.select().from(itemPhotos).where(eq(itemPhotos.itemId, newItemId)).all();
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ filePath: '/legacy/screws-1.jpg', position: 0 });
  });

  it('rejects a split that would leave nothing behind', () => {
    seedItem(h, { id: 'screws', locationId: 'shelf' });
    const outcome = h.run(
      mutation('item.split', 'screws', { newItemId: randomUUID(), quantity: 1 })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(h.item('screws').quantity).toBe(1);
  });

  it('rejects a newItemId that already exists', () => {
    seedItem(h, { id: 'screws', locationId: 'shelf', quantity: 2 });
    seedItem(h, { id: 'existing' });
    const clash = h.run(mutation('item.split', 'screws', { newItemId: 'existing', quantity: 1 }));
    expect(clash).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });
});
