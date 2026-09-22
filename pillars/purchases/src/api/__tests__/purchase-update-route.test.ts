/**
 * `PATCH /purchases/:id`, end to end over HTTP (POPS-4256), including the
 * inventory-unlink staging POPS-4268 puts in front of the write (POPS-4268).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, getPurchase, purchaseItemUnits } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { InventoryLinkClearer, InventoryLinkClearResult } from '../inventory/client.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;

function fakeClearer(
  answer: InventoryLinkClearResult = { kind: 'cleared' }
): InventoryLinkClearer & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    clear: async (id: string) => {
      calls.push(id);
      return answer;
    },
  };
}

function appWith(inventoryLinkClearer?: InventoryLinkClearer): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    inventoryLinkClearer,
  });
}

function seedOrder(): { purchaseId: string; itemId: string; updatedAt: string } {
  const purchaseId = createPurchase(
    opened.db,
    amazonOrder({
      totalCents: 1000,
      items: [{ name: 'Widget', unitPriceCents: 1000, lineTotalCents: 1000 }],
    })
  );
  const detail = getPurchase(opened.db, purchaseId);
  const itemId = detail?.items[0]?.item.id as string;
  return { purchaseId, itemId, updatedAt: detail?.purchase.updatedAt as string };
}

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

describe('PATCH /purchases/:id', () => {
  it('200s with the updated detail', async () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();

    const res = await requestOn(appWith())
      .patch(`/purchases/${purchaseId}`)
      .send({
        lines: [{ id: itemId, name: 'Gadget', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: updatedAt,
      });

    expect(res.status).toBe(200);
    expect(res.body.items[0].item.name).toBe('Gadget');
    expect(res.body.edit.changes).toEqual([
      { field: 'lineName', itemId, original: 'Widget', current: 'Gadget' },
    ]);
  });

  it('404s an unknown id', async () => {
    const res = await requestOn(appWith())
      .patch('/purchases/does-not-exist')
      .send({ lines: [], expectedUpdatedAt: '2026-01-01T00:00:00.000Z' });

    expect(res.status).toBe(404);
  });

  it('409s purchase_locked on a matched purchase', async () => {
    const { purchaseId, itemId } = seedOrder();
    opened.raw.prepare('UPDATE purchases SET status = ? WHERE id = ?').run('linked', purchaseId);
    const linked = getPurchase(opened.db, purchaseId);

    const res = await requestOn(appWith())
      .patch(`/purchases/${purchaseId}`)
      .send({
        totalCents: 2000,
        lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 2000 }],
        expectedUpdatedAt: linked?.purchase.updatedAt,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('purchase_locked');
  });

  it('409s purchase_stale on a mismatched expectedUpdatedAt', async () => {
    const { purchaseId, itemId } = seedOrder();

    const res = await requestOn(appWith())
      .patch(`/purchases/${purchaseId}`)
      .send({
        lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('purchase_stale');
  });

  it('400s a negative total', async () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();

    const res = await requestOn(appWith())
      .patch(`/purchases/${purchaseId}`)
      .send({
        totalCents: -100,
        lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: updatedAt,
      });

    expect(res.status).toBe(400);
  });

  it('403s a caller without purchases.purchase', async () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();
    const app = createPurchasesApiApp({
      vision: null,
      purchasesDb: opened,
      version: '1.2.3',
      selfBaseUrl: 'http://localhost:3013',
      serviceAccountVerifier: () =>
        Promise.resolve({
          outcome: 'authenticated',
          principal: { id: 'sa_other', name: 'other', scopes: ['inventory'] },
        }),
    });

    const res = await requestOn(app)
      .patch(`/purchases/${purchaseId}`)
      .set('x-api-key', 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file')
      .send({
        lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: updatedAt,
      });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /purchases/:id unlinking inventory (POPS-4268)', () => {
  it('clears inventory before committing, and the purchase commits', async () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();
    opened.db
      .insert(purchaseItemUnits)
      .values({ itemId, inventoryItemUri: 'pops://inventory/item/inv-1' })
      .run();
    const clearer = fakeClearer();

    const res = await requestOn(appWith(clearer))
      .patch(`/purchases/${purchaseId}`)
      .send({ totalCents: 0, lines: [], expectedUpdatedAt: updatedAt });

    expect(res.status).toBe(200);
    expect(clearer.calls).toEqual(['inv-1']);
    expect(res.body.items).toEqual([]);
  });

  it('makes no inventory call for an unlinked line', async () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();
    const clearer = fakeClearer();

    const res = await requestOn(appWith(clearer))
      .patch(`/purchases/${purchaseId}`)
      .send({ totalCents: 0, lines: [], expectedUpdatedAt: updatedAt });

    expect(res.status).toBe(200);
    expect(clearer.calls).toEqual([]);
    void itemId;
  });

  it('refuses the edit with a retryable error when inventory cannot be reached, and writes nothing', async () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();
    opened.db
      .insert(purchaseItemUnits)
      .values({ itemId, inventoryItemUri: 'pops://inventory/item/inv-1' })
      .run();
    const clearer = fakeClearer({ kind: 'unavailable', reason: 'unavailable' });

    const res = await requestOn(appWith(clearer))
      .patch(`/purchases/${purchaseId}`)
      .send({ totalCents: 0, lines: [], expectedUpdatedAt: updatedAt });

    expect(res.status).toBe(502);
    const after = getPurchase(opened.db, purchaseId);
    expect(after?.items).toHaveLength(1);
    expect(after?.purchase.updatedAt).toBe(updatedAt);

    // The same request retried, once inventory can be reached, succeeds —
    // nothing here was written, so the caller's own expectedUpdatedAt is
    // still valid.
    const retry = await requestOn(appWith(fakeClearer()))
      .patch(`/purchases/${purchaseId}`)
      .send({ totalCents: 0, lines: [], expectedUpdatedAt: updatedAt });
    expect(retry.status).toBe(200);
  });
});
