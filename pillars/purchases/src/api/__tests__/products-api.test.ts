/**
 * The product dictionary over HTTP.
 *
 * The service tests beside `db/services/product-dictionary.ts` hold the
 * rules. What only shows up here is the wire: that a correction is reachable
 * at all — a dictionary nobody can edit is a dictionary that silently keeps
 * whatever a pass first guessed — that the two grains do not shadow each
 * other's paths, and that a request naming a row that is not there is refused
 * rather than answered with a body a client cannot tell from success.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, upsertSource } from '../../db/index.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../../db/index.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  upsertSource(opened.db, {
    id: 'woolworths',
    label: 'Woolworths',
    settlementWindowDays: 14,
    autoLinkPolicy: 'auto',
  });
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
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

function shop(checksum: string, names: readonly string[]): CreatePurchaseInput {
  return {
    source: 'woolworths',
    ingestMethod: 'upload',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    checksum,
    sourceOrderId: checksum,
    merchantEntityName: 'Woolworths',
    items: names.map((name) => ({ name, unitPriceCents: 1179, lineTotalCents: 1179 })),
  };
}

interface WireAlias {
  id: string;
  printedName: string;
  confirmedAt: string | null;
}

interface WireProduct {
  id: string;
  label: string;
  aliases: WireAlias[];
}

async function listProductsOverHttp(query = ''): Promise<WireProduct[]> {
  const res = await requestOn(app).get(`/products${query}`);
  expect(res.status).toBe(200);
  return res.body.products as WireProduct[];
}

async function aliasOverHttp(printedName: string): Promise<WireAlias & { productId: string }> {
  for (const product of await listProductsOverHttp()) {
    for (const alias of product.aliases) {
      if (alias.printedName === printedName) return { ...alias, productId: product.id };
    }
  }
  throw new Error(`no dictionary entry printed '${printedName}'`);
}

describe('POST /products/proposals', () => {
  it('mints an entry per printed wording and reports what it did', async () => {
    createPurchase(opened.db, shop('shop', ['CHK BRST 1KG', 'Chicken Breast 1kg']));

    const res = await requestOn(app).post('/products/proposals').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      scannedLines: 2,
      observedWordings: 2,
      proposed: 2,
      retired: 0,
      confirmed: 0,
    });
  });
});

describe('the dictionary listing', () => {
  beforeEach(async () => {
    createPurchase(opened.db, shop('shop', ['CHK BRST 1KG', 'Chicken Breast 1kg']));
    await requestOn(app).post('/products/proposals').send({});
  });

  it('returns each product with the wordings that resolve to it', async () => {
    const products = await listProductsOverHttp();

    expect(products.map((product) => product.label).toSorted()).toEqual([
      'CHK BRST 1KG',
      'Chicken Breast 1kg',
    ]);
    expect(products.every((product) => product.aliases.length === 1)).toBe(true);
  });

  it('merges two wordings, and shows the merge on the leaderboard', async () => {
    const target = await aliasOverHttp('Chicken Breast 1kg');
    const alias = await aliasOverHttp('CHK BRST 1KG');

    const patched = await requestOn(app)
      .patch(`/products/aliases/${alias.id}`)
      .send({ productId: target.productId, confirmed: true });

    expect(patched.status).toBe(200);
    expect(patched.body.confirmedAt).not.toBeNull();

    const board = await requestOn(app).get('/analytics/product-leaderboard');
    expect(board.body.products).toHaveLength(1);
    // Half the group's lines are in it on a wording the pass proposed and
    // nobody has asserted, so the row does not claim to be asserted — even
    // though the wording that was merged is. Whichever line the query
    // returned first must not decide that.
    expect(board.body.products[0].product).toMatchObject({ basis: 'product', confirmed: false });
    expect(board.body.coverage).toMatchObject({
      confirmedProductLines: 1,
      proposedProductLines: 1,
    });

    await requestOn(app).patch(`/products/aliases/${target.id}`).send({ confirmed: true });

    const asserted = await requestOn(app).get('/analytics/product-leaderboard');
    expect(asserted.body.products[0].product).toMatchObject({ confirmed: true });
    expect(asserted.body.coverage).toMatchObject({
      confirmedProductLines: 2,
      proposedProductLines: 0,
    });
  });

  it('renames a product without disturbing its wordings', async () => {
    const target = await aliasOverHttp('CHK BRST 1KG');

    const res = await requestOn(app)
      .patch(`/products/${target.productId}`)
      .send({ label: 'Chicken breast, 1kg' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ label: 'Chicken breast, 1kg' });
    expect(res.body.aliases).toHaveLength(1);
    expect(res.body.aliases[0]).toMatchObject({ printedName: 'CHK BRST 1KG' });
  });

  it('forgets one wording without touching the rest of the dictionary', async () => {
    const alias = await aliasOverHttp('CHK BRST 1KG');

    expect((await requestOn(app).delete(`/products/aliases/${alias.id}`)).status).toBe(200);

    expect((await listProductsOverHttp()).map((product) => product.label)).toEqual([
      'Chicken Breast 1kg',
    ]);
  });

  it('forgets a product and every wording that resolved to it', async () => {
    const target = await aliasOverHttp('CHK BRST 1KG');

    expect((await requestOn(app).delete(`/products/${target.productId}`)).status).toBe(200);

    expect((await listProductsOverHttp()).map((product) => product.label)).toEqual([
      'Chicken Breast 1kg',
    ]);
  });

  it('filters to what a human has asserted', async () => {
    const alias = await aliasOverHttp('CHK BRST 1KG');
    await requestOn(app).patch(`/products/aliases/${alias.id}`).send({ confirmed: true });

    expect((await listProductsOverHttp('?confirmed=true')).map((p) => p.label)).toEqual([
      'CHK BRST 1KG',
    ]);
    expect((await listProductsOverHttp('?confirmed=false')).map((p) => p.label)).toEqual([
      'Chicken Breast 1kg',
    ]);
  });
});

describe('refusals', () => {
  it('refuses a wording that names no row', async () => {
    const res = await requestOn(app).patch('/products/aliases/nope').send({ confirmed: true });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses to point a wording at a product that does not exist', async () => {
    createPurchase(opened.db, shop('shop', ['CHK BRST 1KG']));
    await requestOn(app).post('/products/proposals').send({});
    const alias = await aliasOverHttp('CHK BRST 1KG');

    const res = await requestOn(app)
      .patch(`/products/aliases/${alias.id}`)
      .send({ productId: 'nope' });

    expect(res.status).toBe(404);
    // The wording is still where it was: a refused repoint must not have
    // half-happened.
    expect((await aliasOverHttp('CHK BRST 1KG')).productId).toBe(alias.productId);
  });

  it('refuses a patch that states neither a target nor a confirmation', async () => {
    createPurchase(opened.db, shop('shop', ['CHK BRST 1KG']));
    await requestOn(app).post('/products/proposals').send({});
    const alias = await aliasOverHttp('CHK BRST 1KG');

    expect((await requestOn(app).patch(`/products/aliases/${alias.id}`).send({})).status).toBe(400);
  });

  it('refuses to rename a product that does not exist', async () => {
    const res = await requestOn(app).patch('/products/nope').send({ label: 'Anything' });

    expect(res.status).toBe(404);
  });

  it('refuses to delete a product that does not exist', async () => {
    expect((await requestOn(app).delete('/products/nope')).status).toBe(404);
  });
});
