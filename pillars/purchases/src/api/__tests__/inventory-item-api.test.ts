/**
 * The accept that creates the asset, end to end over HTTP.
 *
 * The five things this route promises, and each is a way the fan-out has
 * been wrong before it existed: one accept mints one asset, a repeated
 * accept mints none, a declined slot mints none, a create that fails is
 * loud rather than recorded, and — since POPS-2433 — two accepts of one
 * slot in flight together also mint one between them, not two. The last
 * block pins that last promise: the fake inventory below models the real
 * pillar's `sourceRef` dedup (same slot → same URI), which is what turns
 * the second request's `ACCEPT_NOT_RECORDED` conflict into "already
 * recorded, here is the same answer" instead of an orphan. The inventory
 * pillar is a fake here — the transport it stands in for is asserted on the
 * wire in `pillars/__tests__/outbound-credential.test.ts` — so what is
 * under test is the ordering purchases keeps around it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, getPurchase, listDistinctInventoryItemUris } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { sourceRefFor } from '../inventory/asset.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { InventoryProposal, OpenedPurchasesDb } from '../../db/index.js';
import type { InventoryAssetCreateResult, InventoryAssetCreator } from '../inventory/client.js';

const { requestOn } = createTestTransport();

/**
 * A stand-in inventory pillar that records what it was asked to create.
 *
 * `calls` is what proves "exactly one row": the route can only mint an
 * asset by coming through here, so a second entry is a second asset.
 */
function fakeInventory(
  answer: (n: number) => InventoryAssetCreateResult = (n) => ({
    kind: 'created',
    inventoryItemUri: `pops://inventory/item/inv-${n}`,
  })
): InventoryAssetCreator & { readonly calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    create: async (proposal) => {
      calls.push(proposal);
      return answer(calls.length);
    },
  };
}

/**
 * A stand-in inventory pillar that models the real one's `sourceRef` dedup
 * (POPS-2433): two creates naming the same offer return the same URI, the
 * same way the real pillar's UNIQUE index turns a second insert into a
 * fetch of the first. This is the fake the race test needs — `fakeInventory`
 * above answers every call with a fresh URI regardless of what it names,
 * which cannot exercise a fix that depends on the two calls agreeing.
 */
function idempotentFakeInventory(): InventoryAssetCreator & { readonly calls: unknown[] } {
  const calls: InventoryProposal[] = [];
  const bySourceRef = new Map<string, string>();
  return {
    calls,
    create: async (proposal) => {
      calls.push(proposal);
      const ref = sourceRefFor(proposal);
      let uri = bySourceRef.get(ref);
      if (uri === undefined) {
        uri = `pops://inventory/item/inv-${bySourceRef.size + 1}`;
        bySourceRef.set(ref, uri);
      }
      return { kind: 'created', inventoryItemUri: uri };
    },
  };
}

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let purchaseId: string;
let itemId: string;

function appWith(inventoryAssets: InventoryAssetCreator): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    inventoryAssets,
  });
}

function seedOrder(quantity: number): void {
  purchaseId = createPurchase(
    opened.db,
    amazonOrder({
      sourceOrderId: `order-q${quantity}`,
      checksum: `amazon:order-q${quantity}`,
      merchantEntityName: 'Bunnings Warehouse',
      items: [
        {
          name: 'Cordless Drill',
          quantity,
          unitPriceCents: 19900,
          lineTotalCents: 19900 * quantity,
          kind: 'durable',
        },
      ],
    })
  );
  const found = getPurchase(opened.db, purchaseId)?.items[0]?.item.id;
  if (found === undefined) throw new Error('the seeded order has no line');
  itemId = found;
}

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  seedOrder(1);
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

function accept(app: Express, body: object = {}) {
  return requestOn(app).post(`/purchases/${purchaseId}/items/${itemId}/inventory-item`).send(body);
}

describe('an accept becomes one asset', () => {
  it('creates the row, records the accept against its URI, and stops offering the slot', async () => {
    const inventory = fakeInventory();
    const app = appWith(inventory);

    const created = await accept(app).expect(201);

    expect(created.body.inventoryItemUri).toBe('pops://inventory/item/inv-1');
    expect(created.body.unit).toMatchObject({
      itemId,
      inventoryItemUri: 'pops://inventory/item/inv-1',
      inventoryDeclinedAt: null,
    });
    expect(inventory.calls).toHaveLength(1);

    const offers = await requestOn(app).get(`/purchases/${purchaseId}/inventory-proposals`);
    expect(offers.body.proposals).toEqual([]);
  });

  it('puts the URI in the work set the nightly cron reconciles', async () => {
    // The whole point of recording the accept: until this, that leg had an
    // empty work set on every tick.
    await accept(appWith(fakeInventory())).expect(201);

    expect(listDistinctInventoryItemUris(opened.db)).toEqual(['pops://inventory/item/inv-1']);
  });

  it('sends inventory the offer for the slot named, not the first one going', async () => {
    seedOrder(2);
    const inventory = fakeInventory();
    const app = appWith(inventory);

    const offers = await requestOn(app).get(`/purchases/${purchaseId}/inventory-proposals`);
    expect(offers.body.proposals).toHaveLength(2);

    await accept(app).expect(201);

    expect(inventory.calls[0]).toMatchObject({ itemId, itemName: 'Cordless Drill', slot: 0 });
  });

  it('mints a distinct asset for each unnamed slot of a multi-unit line, not one shared asset (POPS-2433 review finding)', async () => {
    // sourceRefFor must key on slot, not itemId alone: two different
    // physical units of one line both answer unnamed (no unitId to send),
    // and colliding their sourceRefs would make the second accept silently
    // return the first's asset via inventory's idempotent-create dedup.
    seedOrder(2);
    const inventory = idempotentFakeInventory();
    const app = appWith(inventory);

    const first = await accept(app).expect(201);
    const second = await accept(app).expect(201);

    expect(first.body.inventoryItemUri).not.toBe(second.body.inventoryItemUri);
    expect(inventory.calls).toHaveLength(2);
    expect(listDistinctInventoryItemUris(opened.db)).toHaveLength(2);
  });
});

describe('a slot that is not offered creates nothing', () => {
  it('refuses a repeated accept without asking inventory a second time', async () => {
    const inventory = fakeInventory();
    const app = appWith(inventory);
    await accept(app).expect(201);

    const again = await accept(app).expect(404);

    expect(again.body.code).toBe('NOT_FOUND');
    expect(inventory.calls).toHaveLength(1);
    expect(listDistinctInventoryItemUris(opened.db)).toHaveLength(1);
  });

  it('refuses an accept on a slot already declined', async () => {
    const inventory = fakeInventory();
    const app = appWith(inventory);
    await requestOn(app)
      .post(`/purchases/${purchaseId}/items/${itemId}/inventory-proposal`)
      .send({ decision: 'declined' })
      .expect(200);

    await accept(app).expect(404);

    expect(inventory.calls).toEqual([]);
    expect(listDistinctInventoryItemUris(opened.db)).toEqual([]);
  });

  it('refuses an accept routed through the wrong order', async () => {
    const inventory = fakeInventory();

    await requestOn(appWith(inventory))
      .post(`/purchases/no-such-order/items/${itemId}/inventory-item`)
      .send({})
      .expect(404);

    expect(inventory.calls).toEqual([]);
  });

  it('refuses an accept naming a unit that is not on the line', async () => {
    const inventory = fakeInventory();

    await accept(appWith(inventory), { unitId: 'not-a-unit' }).expect(404);

    expect(inventory.calls).toEqual([]);
  });
});

describe('a create that fails is visible, never recorded', () => {
  it.each([
    ['unauthorized', 'INVENTORY_UNAUTHORIZED'],
    ['unavailable', 'INVENTORY_UNAVAILABLE'],
    ['refused', 'INVENTORY_REFUSED'],
    ['unreadable', 'INVENTORY_RESPONSE_UNREADABLE'],
  ] as const)('reports %s by name and leaves the slot offered', async (kind, code) => {
    const app = appWith(fakeInventory(() => ({ kind, reason: 'because' })));

    const failed = await accept(app).expect(502);

    expect(failed.body).toMatchObject({ code, inventoryItemUri: null });
    expect(listDistinctInventoryItemUris(opened.db)).toEqual([]);

    const offers = await requestOn(app).get(`/purchases/${purchaseId}/inventory-proposals`);
    expect(offers.body.proposals).toHaveLength(1);
  });

  it('hands back the URI when the slot was answered while the create was in flight', async () => {
    // The one failure that leaves an asset behind. A caller that retries
    // this route mints a second one, so the response has to carry the URI
    // and say which failure this is.
    let app: Express | undefined;
    const inventory: InventoryAssetCreator = {
      create: async () => {
        await requestOn(app as Express)
          .post(`/purchases/${purchaseId}/items/${itemId}/inventory-proposal`)
          .send({ decision: 'declined' });
        return { kind: 'created', inventoryItemUri: 'pops://inventory/item/inv-race' };
      },
    };
    app = appWith(inventory);

    const orphaned = await accept(app).expect(502);

    expect(orphaned.body).toMatchObject({
      code: 'ACCEPT_NOT_RECORDED',
      inventoryItemUri: 'pops://inventory/item/inv-race',
    });
    expect(orphaned.body.message).toContain('Do not repeat this request');
  });

  it('logs the orphaned asset, since the response only reaches the caller', async () => {
    // A script that drops the 502 would otherwise leave the only trace of
    // that row nowhere on this side at all.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let app: Express | undefined;
    const inventory: InventoryAssetCreator = {
      create: async () => {
        await requestOn(app as Express)
          .post(`/purchases/${purchaseId}/items/${itemId}/inventory-proposal`)
          .send({ decision: 'declined' });
        return { kind: 'created', inventoryItemUri: 'pops://inventory/item/inv-race' };
      },
    };
    app = appWith(inventory);

    try {
      await accept(app).expect(502);

      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('accept was not recorded'),
        expect.objectContaining({ inventoryItemUri: 'pops://inventory/item/inv-race' })
      );
    } finally {
      logged.mockRestore();
    }
  });

  it('logs the orphan when the write fails for a reason this route does not answer', async () => {
    // The conflict branch is not the only way to reach step 3 with an asset
    // already created. A write that fails some other way — the database
    // busy, the disk full — leaves as a 500, and if the URI were logged
    // only on the conflict branch it would exist nowhere on this side.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = appWith({
      create: async () => {
        opened.raw.close();
        return Promise.resolve({
          kind: 'created',
          inventoryItemUri: 'pops://inventory/item/inv-lost',
        });
      },
    });

    try {
      await accept(app).expect(500);

      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('accept was not recorded'),
        expect.objectContaining({ inventoryItemUri: 'pops://inventory/item/inv-lost' })
      );
    } finally {
      logged.mockRestore();
    }
  });

  it('two accepts in flight together mint one asset between them, not two (POPS-2433)', async () => {
    // Step 1 reads this pillar's tables and step 2 is a network call, so two
    // requests that pass step 1 before either finishes step 2 both create.
    // Before POPS-2433 the fake here answered every call with a fresh URI,
    // so the loser orphaned a real, unreferenced asset. The real inventory
    // pillar dedupes creates on `sourceRef`, so `idempotentFakeInventory`
    // models that: both calls land on ONE URI, and the loser's
    // `ACCEPT_NOT_RECORDED` conflict resolves to "already recorded" rather
    // than an orphan to reconcile by hand.
    const released: Array<() => void> = [];
    const inventory = idempotentFakeInventory();
    const gated: InventoryAssetCreator & { readonly calls: unknown[] } = {
      calls: inventory.calls,
      create: async (proposal) => {
        await new Promise<void>((resolve) => released.push(resolve));
        return inventory.create(proposal);
      },
    };
    const app = appWith(gated);

    // `Promise.all` is what dispatches them: a supertest `Test` issues its
    // request when something subscribes, so building two and awaiting them
    // in turn would serialise the very thing under test.
    const both = Promise.all([accept(app), accept(app)]);
    await vi.waitFor(() => expect(released).toHaveLength(2));
    for (const release of released) release();
    const [first, second] = await both;

    expect(gated.calls).toHaveLength(2);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.inventoryItemUri).toBe(second.body.inventoryItemUri);
    expect(first.body.inventoryItemUri).toMatch(/^pops:\/\/inventory\/item\/inv-\d+$/u);

    const uris = listDistinctInventoryItemUris(opened.db);
    expect(uris).toHaveLength(1);
    expect(uris).toContain(first.body.inventoryItemUri);
  });

  it('two unnamed accepts racing for the same slot on a multi-unit line converge on one unit row, not two sharing an asset (POPS-2433 review finding)', async () => {
    // Both requests omit unitId, so findOffer hands both the identical
    // first unanswered proposal (same slot) before either has written.
    // idempotentFakeInventory then answers both with the same URI. Without
    // decideInventoryProposal's convergence check, each request inserts its
    // own purchase_item_units row against that one URI: two rows, one
    // asset, and the line's other physical unit silently unrepresented.
    seedOrder(2);
    const released: Array<() => void> = [];
    const inventory = idempotentFakeInventory();
    const gated: InventoryAssetCreator & { readonly calls: unknown[] } = {
      calls: inventory.calls,
      create: async (proposal) => {
        await new Promise<void>((resolve) => released.push(resolve));
        return inventory.create(proposal);
      },
    };
    const app = appWith(gated);

    const both = Promise.all([accept(app), accept(app)]);
    await vi.waitFor(() => expect(released).toHaveLength(2));
    for (const release of released) release();
    const [first, second] = await both;

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.unit.id).toBe(second.body.unit.id);

    const units = getPurchase(opened.db, purchaseId)?.items[0]?.units ?? [];
    expect(units).toHaveLength(1);

    const offers = await requestOn(app).get(`/purchases/${purchaseId}/inventory-proposals`);
    expect(offers.body.proposals).toHaveLength(1);
  });

  it('does not record an orphaned asset against the slot someone else answered', async () => {
    // The decision that won stands, and the asset stays unreferenced: a
    // fan-out that quietly relinked the unit would record the human's
    // decline as an accept.
    let app: Express | undefined;
    const inventory: InventoryAssetCreator = {
      create: async () => {
        await requestOn(app as Express)
          .post(`/purchases/${purchaseId}/items/${itemId}/inventory-proposal`)
          .send({ decision: 'declined' });
        return { kind: 'created', inventoryItemUri: 'pops://inventory/item/inv-race' };
      },
    };
    app = appWith(inventory);

    await accept(app).expect(502);

    expect(listDistinctInventoryItemUris(opened.db)).toEqual([]);
    expect(getPurchase(opened.db, purchaseId)?.items[0]?.units[0]).toMatchObject({
      inventoryItemUri: null,
      inventoryDeclinedAt: expect.any(String),
    });
  });
});
