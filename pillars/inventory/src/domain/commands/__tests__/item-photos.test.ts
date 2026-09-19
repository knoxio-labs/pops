import { beforeEach, describe, expect, it } from 'vitest';

import { mutation, openHarness, seedItem, type Harness } from './test-utils.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

let h: Harness;

function storeMedia(sha256: string): void {
  h.raw
    .prepare(
      `INSERT INTO media (sha256, mime, byte_size, stored_at) VALUES (?, 'image/jpeg', 100, ?)`
    )
    .run(sha256, '2026-09-18T00:00:00.000Z');
}

beforeEach(() => {
  h = openHarness();
  seedItem(h, { id: 'lamp' });
});

describe('item.attachPhoto', () => {
  it('attaches a stored photo and bumps the item revision', () => {
    storeMedia(HASH_A);
    const outcome = h.run(mutation('item.attachPhoto', 'lamp', { sha256: HASH_A, position: 0 }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 2 });
    const [event] = h.eventsFor('lamp');
    expect(event).toMatchObject({ kind: 'photo_added' });
    expect(JSON.parse(event?.after ?? '{}')).toEqual({ photos: [HASH_A] });
  });

  it('rejects a photo whose bytes are not stored', () => {
    const outcome = h.run(mutation('item.attachPhoto', 'lamp', { sha256: HASH_A, position: 0 }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'media_missing' });
    expect(h.eventCount()).toBe(0);
  });

  it('does not require a base revision', () => {
    storeMedia(HASH_A);
    const outcome = h.run(
      mutation('item.attachPhoto', 'lamp', { sha256: HASH_A, position: 0 }, { baseRevision: null })
    );
    expect(outcome).toMatchObject({ status: 'applied' });
  });
});

describe('item.removePhoto', () => {
  it('removes a photo and bumps the revision', () => {
    storeMedia(HASH_A);
    h.run(mutation('item.attachPhoto', 'lamp', { sha256: HASH_A, position: 0 }));
    const outcome = h.run(mutation('item.removePhoto', 'lamp', { sha256: HASH_A }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 3 });
    expect(h.eventsFor('lamp')[1]).toMatchObject({ kind: 'photo_removed' });
  });

  it('changes nothing for a hash the item does not have', () => {
    const outcome = h.run(mutation('item.removePhoto', 'lamp', { sha256: HASH_A }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 1 });
    expect(h.eventCount()).toBe(0);
  });
});

describe('item.reorderPhotos', () => {
  it("reorders exactly the item's current photos", () => {
    storeMedia(HASH_A);
    storeMedia(HASH_B);
    h.run(mutation('item.attachPhoto', 'lamp', { sha256: HASH_A, position: 0 }));
    h.run(mutation('item.attachPhoto', 'lamp', { sha256: HASH_B, position: 1 }));
    const outcome = h.run(mutation('item.reorderPhotos', 'lamp', { sha256s: [HASH_B, HASH_A] }));
    expect(outcome).toMatchObject({ status: 'applied' });
  });

  it('rejects a list that does not name exactly the current photos', () => {
    storeMedia(HASH_A);
    h.run(mutation('item.attachPhoto', 'lamp', { sha256: HASH_A, position: 0 }));
    const outcome = h.run(mutation('item.reorderPhotos', 'lamp', { sha256s: [HASH_A, HASH_B] }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });
});
