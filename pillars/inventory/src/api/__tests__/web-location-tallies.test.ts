import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebLocationTalliesResponseSchema } from '../../contract/rest-web-locations.js';
import { items, locations, type Lifecycle } from '../../db/index.js';
import {
  createItem,
  createLocation,
  openSyncHarness,
  send,
  type SyncHarness,
  type wireMutation,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let h: SyncHarness;

beforeEach(() => {
  h = openSyncHarness(transport);
});

afterEach(() => h.close());

async function apply(...mutations: ReturnType<typeof wireMutation>[]): Promise<void> {
  const response = await send(h.api, mutations);
  expect(response.status).toBe(200);
  expect(
    response.body.outcomes.every((outcome: { status: string }) => outcome.status === 'applied')
  ).toBe(true);
}

async function tallies() {
  const response = await h.api.get('/web/locations/tallies');
  expect(response.status).toBe(200);
  return WebLocationTalliesResponseSchema.parse(response.body).tallies;
}

function setBoxState(id: string): void {
  h.db.db
    .update(items)
    .set({ isContainer: 1, access: 'open', isFull: 0 })
    .where(eq(items.id, id))
    .run();
}

function setContainerPlacement(id: string, containerId: string): void {
  h.db.db
    .update(items)
    .set({ placementKind: 'container', locationId: null, containingItemId: containerId })
    .where(eq(items.id, id))
    .run();
}

function setLifecycle(id: string, lifecycle: Lifecycle): void {
  h.db.db.update(items).set({ lifecycle }).where(eq(items.id, id)).run();
}

function setDeletedItem(id: string): void {
  h.db.db
    .update(items)
    .set({ deletedAt: '2026-09-19T11:00:00.000Z' })
    .where(eq(items.id, id))
    .run();
}

function setDeletedLocation(id: string): void {
  h.db.db
    .update(locations)
    .set({ deletedAt: '2026-09-19T11:00:00.000Z' })
    .where(eq(locations.id, id))
    .run();
}

describe('GET /web/locations/tallies', () => {
  it('separates loose items, boxes, what is in the boxes, and the deep total', async () => {
    const root = randomUUID();
    const kitchen = randomUUID();
    const garage = randomUUID();
    const loose = randomUUID();
    const outer = randomUUID();
    const secondBox = randomUUID();
    const nested = randomUUID();
    const outerThing = randomUUID();
    const nestedThing = randomUUID();
    const secondThingOne = randomUUID();
    const secondThingTwo = randomUUID();
    const kitchenThing = randomUUID();
    const garageThing = randomUUID();

    await apply(
      createLocation(root, 'House'),
      createLocation(kitchen, 'Kitchen', root),
      createLocation(garage, 'Garage', root),
      createItem(loose, 'Loose thing', { kind: 'location', locationId: root }),
      createItem(outer, 'Outer box', { kind: 'location', locationId: root }),
      createItem(secondBox, 'Second box', { kind: 'location', locationId: root }),
      createItem(nested, 'Nested box'),
      createItem(outerThing, 'Outer thing'),
      createItem(nestedThing, 'Nested thing'),
      createItem(secondThingOne, 'Second thing one'),
      createItem(secondThingTwo, 'Second thing two'),
      createItem(kitchenThing, 'Kitchen thing', { kind: 'location', locationId: kitchen }),
      createItem(garageThing, 'Garage thing', { kind: 'location', locationId: garage })
    );
    setBoxState(outer);
    setBoxState(secondBox);
    setBoxState(nested);
    setContainerPlacement(nested, outer);
    setContainerPlacement(outerThing, outer);
    setContainerPlacement(nestedThing, nested);
    setContainerPlacement(secondThingOne, secondBox);
    setContainerPlacement(secondThingTwo, secondBox);

    const result = await tallies();

    expect(result[root]).toEqual({
      places: 2,
      itemsHere: 1,
      boxesHere: 2,
      inBoxes: 5,
      total: 10,
    });
    expect(result[kitchen]).toMatchObject({
      places: 0,
      itemsHere: 1,
      boxesHere: 0,
      inBoxes: 0,
      total: 1,
    });
    expect(result[garage]).toMatchObject({
      places: 0,
      itemsHere: 1,
      boxesHere: 0,
      inBoxes: 0,
      total: 1,
    });
  });

  it('counts nested boxes inside a box here, and ignores inactive things', async () => {
    const root = randomUUID();
    const outer = randomUUID();
    const nested = randomUUID();
    const activeThing = randomUUID();
    const inactiveThing = randomUUID();
    await apply(
      createLocation(root, 'Garage'),
      createItem(outer, 'Outer box', { kind: 'location', locationId: root }),
      createItem(nested, 'Nested box'),
      createItem(activeThing, 'Active thing'),
      createItem(inactiveThing, 'Retired thing')
    );
    setBoxState(outer);
    setBoxState(nested);
    setContainerPlacement(nested, outer);
    setContainerPlacement(activeThing, nested);
    setContainerPlacement(inactiveThing, outer);
    setLifecycle(inactiveThing, 'retired');

    const result = await tallies();

    expect(result[root]).toEqual({ places: 0, itemsHere: 0, boxesHere: 1, inBoxes: 2, total: 3 });
  });

  it('counts a lost thing out of the deep total', async () => {
    const root = randomUUID();
    const kept = randomUUID();
    const lost = randomUUID();
    await apply(
      createLocation(root, 'Garage'),
      createItem(kept, 'Kept thing', { kind: 'location', locationId: root }),
      createItem(lost, 'Lost thing', { kind: 'location', locationId: root })
    );
    setLifecycle(lost, 'lost');

    const result = await tallies();

    expect(result[root]).toEqual({ places: 0, itemsHere: 1, boxesHere: 0, inBoxes: 0, total: 1 });
  });

  it('leaves things in hand out, including a box in hand and its contents', async () => {
    const root = randomUUID();
    const handThing = randomUUID();
    const handBox = randomUUID();
    const boxedHandThing = randomUUID();
    await apply(
      createLocation(root, 'Garage'),
      createItem(handThing, 'Hand thing'),
      createItem(handBox, 'Hand box'),
      createItem(boxedHandThing, 'Boxed hand thing')
    );
    setBoxState(handBox);
    setContainerPlacement(boxedHandThing, handBox);

    const result = await tallies();

    expect(result[root]).toEqual({ places: 0, itemsHere: 0, boxesHere: 0, inBoxes: 0, total: 0 });
  });

  it('lists every live place with zeros and leaves deleted places out', async () => {
    const root = randomUUID();
    const emptyChild = randomUUID();
    const deletedChild = randomUUID();
    const deletedThing = randomUUID();
    await apply(
      createLocation(root, 'House'),
      createLocation(emptyChild, 'Empty room', root),
      createLocation(deletedChild, 'Deleted room', root),
      createItem(deletedThing, 'Deleted room thing', {
        kind: 'location',
        locationId: deletedChild,
      })
    );
    setDeletedLocation(deletedChild);
    setDeletedItem(deletedThing);

    const result = await tallies();

    expect(result).toEqual({
      [root]: { places: 1, itemsHere: 0, boxesHere: 0, inBoxes: 0, total: 0 },
      [emptyChild]: { places: 0, itemsHere: 0, boxesHere: 0, inBoxes: 0, total: 0 },
    });
    expect(result).not.toHaveProperty(deletedChild);
  });

  it('an empty database returns no tallies', async () => {
    expect(await tallies()).toEqual({});
  });

  it('does not count a deleted item in an otherwise live location', async () => {
    const root = randomUUID();
    const deleted = randomUUID();
    await apply(
      createLocation(root, 'Garage'),
      createItem(deleted, 'Deleted thing', { kind: 'location', locationId: root })
    );
    setDeletedItem(deleted);

    const result = await tallies();

    expect(result[root]).toEqual({ places: 0, itemsHere: 0, boxesHere: 0, inBoxes: 0, total: 0 });
  });
});
