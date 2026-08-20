/**
 * The HTTP surface of the inventory fan-out.
 *
 * The service tests cover what a proposal is; these cover the half only the
 * wire can get wrong — that the offer survives the contract's own response
 * schema, that a double-submitted accept is refused rather than silently
 * creating a second asset for one physical thing, and that an accept never
 * asks this pillar to write into inventory: the URI arrives from the caller,
 * which is what the boundary is.
 */
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, getPurchase } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;
let purchaseId: string;
let itemId: string;

const INVENTORY_URI = 'pops://inventory/item/i-1';

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  purchaseId = createPurchase(
    opened.db,
    amazonOrder({
      merchantEntityName: 'Bunnings Warehouse',
      items: [
        {
          name: 'Cordless Drill',
          quantity: 2,
          unitPriceCents: 19900,
          lineTotalCents: 39800,
          kind: 'durable',
        },
      ],
    })
  );
  const found = getPurchase(opened.db, purchaseId)?.items[0]?.item.id;
  if (found === undefined) throw new Error('the seeded order has no line');
  itemId = found;
  app = createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
  });
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

function decide(body: object) {
  return request(app)
    .post(`/purchases/${purchaseId}/items/${itemId}/inventory-proposal`)
    .send(body);
}

it('offers every undecided unit of a durable line', async () => {
  const res = await request(app).get(`/purchases/${purchaseId}/inventory-proposals`).expect(200);

  expect(res.body.proposals).toHaveLength(2);
  expect(res.body.proposals[0]).toMatchObject({
    itemName: 'Cordless Drill',
    purchasePriceCents: 19900,
    purchasedFromName: 'Bunnings Warehouse',
    slot: 0,
  });
});

it('records an accept against the URI the caller supplies, and stops offering that unit', async () => {
  const accepted = await decide({ decision: 'accepted', inventoryItemUri: INVENTORY_URI }).expect(
    200
  );

  expect(accepted.body.unit).toMatchObject({
    itemId,
    inventoryItemUri: INVENTORY_URI,
    inventoryDeclinedAt: null,
  });

  const res = await request(app).get(`/purchases/${purchaseId}/inventory-proposals`).expect(200);
  expect(res.body.proposals).toHaveLength(1);
});

it('records a decline and stops offering that unit', async () => {
  const declined = await decide({ decision: 'declined' }).expect(200);

  expect(declined.body.unit.inventoryDeclinedAt).toEqual(expect.any(String));
  expect(declined.body.unit.inventoryItemUri).toBeNull();
});

it('refuses a third answer to a two-unit line rather than minting a third asset', async () => {
  await decide({ decision: 'declined' }).expect(200);
  await decide({ decision: 'accepted', inventoryItemUri: INVENTORY_URI }).expect(200);

  const conflict = await decide({ decision: 'declined' }).expect(409);

  expect(conflict.body.code).toBe('PROPOSAL_ALREADY_DECIDED');
  expect(getPurchase(opened.db, purchaseId)?.items[0]?.units).toHaveLength(2);
});

it('refuses an answer routed through the wrong order', async () => {
  const res = await request(app)
    .post(`/purchases/no-such-order/items/${itemId}/inventory-proposal`)
    .send({ decision: 'declined' })
    .expect(404);

  expect(res.body.code).toBe('NOT_FOUND');
});

it('refuses an accept that names something other than a pops URI', async () => {
  await decide({ decision: 'accepted', inventoryItemUri: 'i-1' }).expect(400);

  expect(getPurchase(opened.db, purchaseId)?.items[0]?.units).toEqual([]);
});

it('refuses an accept that names a row on a pillar other than inventory', async () => {
  // A decision cannot be retracted, and the cron leg that resolves this
  // column marks anything not addressed to inventory a bad URI forever, so
  // the wrong pillar has to be refused at the boundary or not at all.
  await decide({
    decision: 'accepted',
    inventoryItemUri: 'pops://finance/transaction/t-1',
  }).expect(400);

  expect(getPurchase(opened.db, purchaseId)?.items[0]?.units).toEqual([]);
});
