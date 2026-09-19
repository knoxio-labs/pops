import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { locations } from '../../../db/index.js';
import { mutation, openHarness, seedItem, seedLocation, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'house');
  seedLocation(h, 'garage', { parentId: 'house' });
});

describe('location.create', () => {
  it('creates a root location', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation('location.create', id, { location: { name: 'Attic' } }, { baseRevision: null })
    );
    expect(outcome).toMatchObject({ status: 'applied', revision: 1 });
    const row = h.db.select().from(locations).where(eq(locations.id, id)).get();
    expect(row).toMatchObject({ name: 'Attic', parentId: null });
  });

  it('creates a location under a parent', () => {
    const id = randomUUID();
    h.run(
      mutation(
        'location.create',
        id,
        { location: { name: 'Shelf', parentId: 'garage' } },
        { baseRevision: null }
      )
    );
    const row = h.db.select().from(locations).where(eq(locations.id, id)).get();
    expect(row).toMatchObject({ parentId: 'garage' });
  });

  it('rejects a parent that does not exist', () => {
    const id = randomUUID();
    const outcome = h.run(
      mutation(
        'location.create',
        id,
        { location: { name: 'Shelf', parentId: 'nowhere' } },
        { baseRevision: null }
      )
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'target_missing' });
  });
});

describe('location.rename', () => {
  it('renames a place', () => {
    const outcome = h.run(mutation('location.rename', 'garage', { name: 'Garage (west)' }));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.db.select().from(locations).where(eq(locations.id, 'garage')).get()).toMatchObject({
      name: 'Garage (west)',
    });
  });
});

describe('location.move', () => {
  it('reparents a place', () => {
    seedLocation(h, 'shelf', { parentId: 'garage' });
    const outcome = h.run(mutation('location.move', 'shelf', { parentId: 'house' }));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.db.select().from(locations).where(eq(locations.id, 'shelf')).get()).toMatchObject({
      parentId: 'house',
    });
  });

  it('rejects reparenting a place under its own descendant', () => {
    seedLocation(h, 'shelf', { parentId: 'garage' });
    const outcome = h.run(mutation('location.move', 'house', { parentId: 'shelf' }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'cycle' });
  });

  it('rejects reparenting a place under itself', () => {
    const outcome = h.run(mutation('location.move', 'garage', { parentId: 'garage' }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'cycle' });
  });
});

describe('location.delete', () => {
  it('tombstones the place and reparents child places and direct items to its parent', () => {
    seedLocation(h, 'shelf', { parentId: 'garage' });
    seedItem(h, { id: 'drill', locationId: 'garage' });
    const outcome = h.run(mutation('location.delete', 'garage', {}));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(
      h.db.select().from(locations).where(eq(locations.id, 'garage')).get()?.deletedAt
    ).not.toBeNull();
    expect(h.db.select().from(locations).where(eq(locations.id, 'shelf')).get()).toMatchObject({
      parentId: 'house',
    });
    expect(h.item('drill')).toMatchObject({ placementKind: 'location', locationId: 'house' });
  });

  it('at a root, sends child places to the root and direct items to hand remembering the tombstoned place', () => {
    seedItem(h, { id: 'tools', locationId: 'house' });
    const outcome = h.run(mutation('location.delete', 'house', {}));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.db.select().from(locations).where(eq(locations.id, 'garage')).get()).toMatchObject({
      parentId: null,
    });
    expect(h.item('tools')).toMatchObject({
      placementKind: 'hand',
      locationId: null,
      previousPlacementKind: 'location',
      previousLocationId: 'house',
    });
  });

  it('conflicts, rather than reapplying, on an already-deleted place', () => {
    h.run(mutation('location.delete', 'garage', {}));
    const outcome = h.run(mutation('location.delete', 'garage', {}, { baseRevision: 2 }));
    expect(outcome).toMatchObject({ status: 'conflict', kind: 'deleted' });
  });
});
