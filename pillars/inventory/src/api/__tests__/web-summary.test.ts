import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebSummaryResponseSchema } from '../../contract/rest-web-summary.js';
import { items, type Lifecycle } from '../../db/index.js';
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
}

async function summary() {
  const response = await h.api.get('/web/summary');
  expect(response.status).toBe(200);
  return WebSummaryResponseSchema.parse(response.body);
}

function setContainerState(id: string, access: 'open' | 'closed', full = false): void {
  h.db.db
    .update(items)
    .set({ isContainer: 1, access, isFull: full ? 1 : 0 })
    .where(eq(items.id, id))
    .run();
}

function setLifecycle(id: string, lifecycle: Lifecycle): void {
  h.db.db.update(items).set({ lifecycle }).where(eq(items.id, id)).run();
}

function setDeleted(id: string): void {
  h.db.db
    .update(items)
    .set({ deletedAt: '2026-09-19T11:00:00.000Z' })
    .where(eq(items.id, id))
    .run();
}

function setQuantity(id: string, quantity: number): void {
  h.db.db.update(items).set({ quantity }).where(eq(items.id, id)).run();
}

describe('GET /web/summary', () => {
  it('counts every tile over items, containers, places and in hand', async () => {
    const [kitchen, shelf] = [randomUUID(), randomUUID()];
    await apply(createLocation(kitchen, 'Kitchen'), createLocation(shelf, 'Shelf'));

    const [handItem, placedItem, openBox, handBox] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    await apply(
      createItem(handItem, 'Hand item'),
      createItem(placedItem, 'Placed item', { kind: 'location', locationId: shelf }),
      createItem(openBox, 'Open box', { kind: 'location', locationId: kitchen }),
      createItem(handBox, 'Hand box')
    );
    setContainerState(openBox, 'open');
    setContainerState(handBox, 'closed');

    expect(await summary()).toEqual({
      counts: { items: 2, things: 2, containers: 2, openContainers: 1, locations: 2, inHand: 2 },
      containerSegments: { all: 2, open: 1, closed: 1, full: 0, moving: 2, retired: 0 },
      packing: { closed: 1, fullButOpen: 0, open: 1, packedItems: 0 },
      moving: { closed: 1, total: 2, open: 1, full: 0, packed: 0 },
    });
  });

  it('things sums quantity while items counts the row once', async () => {
    const grouped = randomUUID();
    await apply(createItem(grouped, 'Six mugs'));
    setQuantity(grouped, 6);

    expect((await summary()).counts).toMatchObject({ items: 1, things: 6 });
  });

  it('a deleted item counts nowhere', async () => {
    const deleted = randomUUID();
    await apply(createItem(deleted, 'Deleted item'));
    setDeleted(deleted);

    expect(await summary()).toEqual({
      counts: { items: 0, things: 0, containers: 0, openContainers: 0, locations: 0, inHand: 0 },
      containerSegments: { all: 0, open: 0, closed: 0, full: 0, moving: 0, retired: 0 },
      packing: { closed: 0, fullButOpen: 0, open: 0, packedItems: 0 },
      moving: { closed: 0, total: 0, open: 0, full: 0, packed: 0 },
    });
  });

  it('inactive rows count only in retired', async () => {
    const [retiredBox, discardedBox, retiredItem] = [randomUUID(), randomUUID(), randomUUID()];
    await apply(
      createItem(retiredBox, 'Retired box'),
      createItem(discardedBox, 'Discarded box'),
      createItem(retiredItem, 'Retired item')
    );
    setContainerState(retiredBox, 'closed');
    setContainerState(discardedBox, 'open');
    setLifecycle(retiredBox, 'retired');
    setLifecycle(discardedBox, 'discarded');
    setLifecycle(retiredItem, 'retired');

    expect(await summary()).toEqual({
      counts: { items: 0, things: 0, containers: 0, openContainers: 0, locations: 0, inHand: 0 },
      containerSegments: { all: 0, open: 0, closed: 0, full: 0, moving: 0, retired: 1 },
      packing: { closed: 0, fullButOpen: 0, open: 0, packedItems: 0 },
      moving: { closed: 0, total: 0, open: 0, full: 0, packed: 0 },
    });
  });

  it('a full box counts in full and in its access segment', async () => {
    const [openBox, closedBox] = [randomUUID(), randomUUID()];
    await apply(createItem(openBox, 'Open full box'), createItem(closedBox, 'Closed box'));
    setContainerState(openBox, 'open', true);
    setContainerState(closedBox, 'closed');

    const result = await summary();
    expect(result.containerSegments).toEqual({
      all: 2,
      open: 1,
      closed: 1,
      full: 1,
      moving: 2,
      retired: 0,
    });
    expect(result.moving).toEqual({ closed: 1, total: 2, open: 1, full: 1, packed: 0 });
  });

  it('packing strip splits open, full but open and closed', async () => {
    const [openBox, fullBox, closedBox] = [randomUUID(), randomUUID(), randomUUID()];
    await apply(
      createItem(openBox, 'Open box'),
      createItem(fullBox, 'Full open box'),
      createItem(closedBox, 'Closed box')
    );
    setContainerState(openBox, 'open');
    setContainerState(fullBox, 'open', true);
    setContainerState(closedBox, 'closed');

    expect((await summary()).packing).toEqual({
      closed: 1,
      fullButOpen: 1,
      open: 1,
      packedItems: 0,
    });
  });

  it('packing packedItems counts active direct contents only', async () => {
    const [outer, active, retired, deleted, nested, nestedContent] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    await apply(createItem(outer, 'Outer box'));
    setContainerState(outer, 'open');
    await apply(
      createItem(active, 'Active content', { kind: 'container', itemId: outer }),
      createItem(retired, 'Retired content', { kind: 'container', itemId: outer }),
      createItem(deleted, 'Deleted content', { kind: 'container', itemId: outer }),
      createItem(nested, 'Nested box', { kind: 'container', itemId: outer })
    );
    setLifecycle(retired, 'retired');
    setDeleted(deleted);
    setContainerState(nested, 'open');
    await apply(createItem(nestedContent, 'Nested content', { kind: 'container', itemId: nested }));

    expect((await summary()).packing.packedItems).toBe(3);
  });

  it('moving packed counts nested contents of closed boxes once', async () => {
    const [outer, inner, outerContent, innerContent, inactiveContent, deletedContent] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    await apply(createItem(outer, 'Outer box'));
    setContainerState(outer, 'closed');
    await apply(createItem(inner, 'Inner box', { kind: 'container', itemId: outer }));
    setContainerState(inner, 'closed');
    await apply(
      createItem(outerContent, 'Outer content', { kind: 'container', itemId: outer }),
      createItem(innerContent, 'Inner content', { kind: 'container', itemId: inner }),
      createItem(inactiveContent, 'Inactive content', { kind: 'container', itemId: inner }),
      createItem(deletedContent, 'Deleted content', { kind: 'container', itemId: inner })
    );
    setLifecycle(inactiveContent, 'retired');
    setDeleted(deletedContent);

    expect((await summary()).moving).toEqual({
      closed: 2,
      total: 2,
      open: 0,
      full: 0,
      packed: 3,
    });
  });

  it('an empty database returns zeros', async () => {
    expect(await summary()).toEqual({
      counts: { items: 0, things: 0, containers: 0, openContainers: 0, locations: 0, inHand: 0 },
      containerSegments: { all: 0, open: 0, closed: 0, full: 0, moving: 0, retired: 0 },
      packing: { closed: 0, fullButOpen: 0, open: 0, packedItems: 0 },
      moving: { closed: 0, total: 0, open: 0, full: 0, packed: 0 },
    });
  });
});
