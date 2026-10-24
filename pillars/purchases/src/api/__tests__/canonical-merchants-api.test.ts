import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import {
  createPurchase,
  getPurchase,
  listProducts,
  listPurchases,
  purchases,
  upsertSource,
} from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { CanonicalMerchantResolver } from '../contacts/canonical.js';

const { requestOn } = createTestTransport();
let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  upsertSource(opened.db, {
    id: 'receipt',
    label: 'Receipt',
    settlementWindowDays: 14,
    autoLinkPolicy: 'review',
  });
  for (const merchantEntityId of ['old-a', 'old-b']) {
    createPurchase(opened.db, {
      source: 'receipt',
      ingestMethod: 'upload',
      orderedAt: '2026-02-02T01:41:21Z',
      currency: 'AUD',
      totalCents: 100,
      checksum: merchantEntityId,
      merchantEntityId,
      merchantEntityName: 'Cafe',
      items: [{ name: 'LATTE', unitPriceCents: 100, lineTotalCents: 100 }],
    });
  }
});
afterEach(() => cleanup());

function app(resolve: CanonicalMerchantResolver) {
  return createPurchasesApiApp({
    purchasesDb: opened,
    vision: null,
    version: 'test',
    selfBaseUrl: 'http://localhost:3013',
    canonicalMerchants: resolve,
  });
}

describe('canonical identity REST seams', () => {
  it('uses the resolver for aggregates, historical filters and dictionary proposals', async () => {
    const resolve = vi.fn<CanonicalMerchantResolver>(
      async (ids) => new Map(ids.map((id) => [id, 'current']))
    );
    const request = requestOn(app(resolve));
    const spend = await request.get('/analytics/merchant-spend');
    expect(spend.status).toBe(200);
    expect(spend.body.merchants).toMatchObject([
      { merchant: { entityId: 'current' }, orderCount: 2 },
    ]);
    const list = await request.get('/purchases?merchantEntityId=current');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    expect(resolve).toHaveBeenLastCalledWith(expect.arrayContaining(['old-a', 'old-b', 'current']));
    const product = await request.get('/analytics/product-leaderboard');
    expect(product.status).toBe(200);
    expect(product.body.products).toMatchObject([
      { orderCount: 2, merchants: [{ entityId: 'current' }] },
    ]);
    const month = await request.get('/analytics/month-summary?month=2026-02');
    expect(month.status).toBe(200);
    expect(month.body.merchantLeaders).toMatchObject([
      { merchant: { entityId: 'current' }, orderCount: 2 },
    ]);
    const proposed = await request.post('/products/proposals').send({});
    expect(proposed.status).toBe(200);
    expect(proposed.body).toMatchObject({ observedWordings: 1, proposed: 1 });
  });

  it('reports resolver failures as unavailable instead of distinct identities and leaves dictionary untouched', async () => {
    const request = requestOn(
      app(async () => {
        throw new Error('dependency unavailable');
      })
    );
    for (const path of [
      '/analytics/merchant-spend',
      '/analytics/product-leaderboard',
      '/analytics/month-summary?month=2026-02',
      '/purchases?merchantEntityId=current',
    ]) {
      const response = await request.get(path);
      expect(response.status).toBe(503);
      expect(response.body.code).toContain('contacts_unavailable');
    }
    const response = await request.post('/products/proposals').send({});
    expect(response.status).toBe(503);
    expect(listProducts(opened.db)).toEqual([]);
  });
});

it('preserves historical merchant ids when a locked purchase is saved with an equivalent canonical id', async () => {
  const purchase = listPurchases(opened.db)[0];
  if (purchase === undefined) throw new Error('missing fixture');
  opened.db.update(purchases).set({ status: 'linked' }).where(eq(purchases.id, purchase.id)).run();
  const detail = getPurchase(opened.db, purchase.id);
  if (detail === undefined) throw new Error('missing fixture');
  const request = requestOn(app(async (ids) => new Map(ids.map((id) => [id, 'current']))));
  const response = await request.patch(`/purchases/${purchase.id}`).send({
    merchantEntityId: 'current',
    expectedUpdatedAt: detail.purchase.updatedAt,
    lines: detail.items.map(({ item }) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
    })),
  });
  expect(response.status).toBe(200);
  const updated = getPurchase(opened.db, purchase.id);
  expect(updated?.purchase.merchantEntityId).toBe(purchase.merchantEntityId);
  expect(updated?.edit).toBeNull();
});

it('refuses a merchant edit without writing when the identity resolver is unavailable', async () => {
  const purchase = listPurchases(opened.db)[0];
  if (purchase === undefined) throw new Error('missing fixture');
  const detail = getPurchase(opened.db, purchase.id);
  if (detail === undefined) throw new Error('missing fixture');
  const request = requestOn(
    app(async () => {
      throw new Error('Contacts unavailable');
    })
  );
  const response = await request.patch(`/purchases/${purchase.id}`).send({
    merchantEntityId: 'current',
    expectedUpdatedAt: detail.purchase.updatedAt,
    lines: detail.items.map(({ item }) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
    })),
  });
  expect(response.status).toBe(503);
  expect(getPurchase(opened.db, purchase.id)).toEqual(detail);
});
