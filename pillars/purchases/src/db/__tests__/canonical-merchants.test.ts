import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { proposeItemKinds } from '../../classify/propose-item-kind.js';
import {
  countPurchases,
  createPurchase,
  deletePurchase,
  getPurchase,
  listProducts,
  listPurchases,
  loadProductDictionary,
  monthSummary,
  proposeProducts,
  rankProductPurchases,
  rollUpMerchantSpend,
  updateAlias,
  upsertSource,
} from '../index.js';
import { canonicalMerchantId, storedMerchantIds } from '../services/canonical-merchants.js';
import { openTempDb } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
const identities = new Map([
  ['old-a', 'current'],
  ['old-b', 'current'],
  ['current', 'current'],
  ['other', 'other'],
]);

function purchase(merchantEntityId: string, checksum: string): string {
  return createPurchase(opened.db, {
    source: 'receipt',
    ingestMethod: 'upload',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 100,
    checksum,
    merchantEntityId,
    merchantEntityName: 'Cafe',
    items: [{ name: 'LATTE', unitPriceCents: 100, lineTotalCents: 100 }],
  });
}

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  upsertSource(opened.db, {
    id: 'receipt',
    label: 'Receipt',
    settlementWindowDays: 14,
    autoLinkPolicy: 'review',
  });
});
afterEach(() => cleanup());

describe('canonical merchant reads', () => {
  it('combines alias spend and month leaders while retaining stored foreign ids', () => {
    const a = purchase('old-a', 'a');
    purchase('old-b', 'b');
    purchase('other', 'c');
    const rollup = rollUpMerchantSpend(opened.db, { canonicalMerchants: identities });
    expect(rollup.merchants).toHaveLength(2);
    expect(rollup.merchants.find((row) => row.merchant.entityId === 'current')).toMatchObject({
      orderCount: 2,
      accounting: { netSpendCents: 200 },
    });
    expect(
      monthSummary(opened.db, '2026-02', identities).merchantLeaders.find(
        (row) => row.merchant.entityId === 'current'
      )
    ).toMatchObject({ orderCount: 2, netSpendCents: 200 });
    expect(getPurchase(opened.db, a)?.purchase.merchantEntityId).toBe('old-a');
  });

  it('expands both retired and canonical filters across aliases without matching another merchant with the same label', () => {
    purchase('old-a', 'a');
    purchase('old-b', 'b');
    purchase('other', 'c');
    for (const entityId of ['old-a', 'current']) {
      const filter = {
        merchant: { resolution: 'entity' as const, entityId },
        canonicalMerchants: identities,
      };
      expect(listPurchases(opened.db, filter)).toHaveLength(2);
      expect(countPurchases(opened.db, filter)).toBe(2);
      expect(rankProductPurchases(opened.db, filter).products).toMatchObject([
        { orderCount: 2, merchants: [{ entityId: 'current' }] },
      ]);
    }
  });

  it('isolates explicitly missing ids and refuses incomplete snapshots', () => {
    purchase('old-a', 'a');
    purchase('old-b', 'b');
    const missing = new Map([
      ['old-a', null],
      ['old-b', null],
    ]);
    expect(rollUpMerchantSpend(opened.db, { canonicalMerchants: missing }).merchants).toHaveLength(
      2
    );
    expect(canonicalMerchantId('old-a', missing)).toBe('old-a');
    expect(() => rollUpMerchantSpend(opened.db, { canonicalMerchants: new Map() })).toThrow(
      'snapshot'
    );
  });

  it('groups product names across aliases but keeps a distinct merchant separate', () => {
    purchase('old-a', 'a');
    purchase('old-b', 'b');
    purchase('other', 'c');
    expect(
      rankProductPurchases(opened.db, { canonicalMerchants: identities })
        .products.map((row) => row.orderCount)
        .toSorted()
    ).toEqual([1, 2]);
  });
});

describe('historical product dictionary assertions', () => {
  it('honours a confirmed historical scope after a merge without rewriting or retiring the assertion', () => {
    purchase('old-a', 'a');
    proposeProducts(opened.db);
    const original = listProducts(opened.db)[0];
    const alias = original?.aliases[0];
    if (original === undefined || alias === undefined) throw new Error('missing fixture');
    updateAlias(opened.db, alias.id, { confirmed: true });
    purchase('old-b', 'b');
    const outcome = proposeProducts(opened.db, { canonicalMerchants: identities });
    expect(outcome).toMatchObject({ proposed: 0, retired: 0, observedWordings: 1, confirmed: 1 });
    expect(listProducts(opened.db)[0]?.aliases[0]?.scopeKey).toBe(alias.scopeKey);
    const leaderboard = rankProductPurchases(opened.db, { canonicalMerchants: identities });
    expect(leaderboard.products).toMatchObject([
      {
        orderCount: 2,
        product: { basis: 'product', productId: original.product.id, confirmed: true },
      },
    ]);
    expect(storedMerchantIds(opened.db)).toContain('old-a');
  });

  it('keeps merchant ids from assertions whose original purchase has been deleted in the resolution snapshot', () => {
    const id = purchase('old-a', 'a');
    proposeProducts(opened.db);
    const alias = listProducts(opened.db)[0]?.aliases[0];
    if (alias === undefined) throw new Error('missing fixture');
    updateAlias(opened.db, alias.id, { confirmed: true });
    deletePurchase(opened.db, id);
    purchase('old-b', 'b');
    expect(storedMerchantIds(opened.db)).toEqual(expect.arrayContaining(['old-a', 'old-b']));
    expect(proposeProducts(opened.db, { canonicalMerchants: identities })).toMatchObject({
      proposed: 0,
      retired: 0,
    });
    expect(
      rankProductPurchases(opened.db, { canonicalMerchants: identities }).products
    ).toMatchObject([
      { product: { basis: 'product', productId: alias.productId, confirmed: true }, orderCount: 1 },
    ]);
  });

  it('prefers a confirmed assertion over a colliding proposal and refuses conflicting assertions', () => {
    purchase('old-a', 'a');
    purchase('old-b', 'b');
    proposeProducts(opened.db);
    const products = listProducts(opened.db);
    const first = products[0]?.aliases[0];
    const second = products[1]?.aliases[0];
    if (first === undefined || second === undefined) throw new Error('missing fixture');
    updateAlias(opened.db, first.id, { confirmed: true });
    expect([...loadProductDictionary(opened.db, identities).values()]).toMatchObject([
      { productId: first.productId, confirmed: true },
    ]);
    updateAlias(opened.db, second.id, { confirmed: true });
    expect(() => loadProductDictionary(opened.db, identities)).toThrow('Conflicting confirmed');
    expect(listProducts(opened.db)).toHaveLength(2);
  });
});

describe('classification canonical identity boundary', () => {
  it('resolves before its writes and makes one decision for alias purchases', async () => {
    const a = purchase('old-a', 'a');
    const b = purchase('old-b', 'b');
    const outcome = await proposeItemKinds(
      opened.db,
      {
        propose: async (candidates) => {
          expect(candidates).toHaveLength(1);
          expect(candidates[0]?.itemIds).toHaveLength(2);
          return JSON.stringify({ proposals: [{ id: 1, kind: 'consumable' }] });
        },
      },
      {
        canonicalMerchants: async () => {
          expect(opened.raw.inTransaction).toBe(false);
          return identities;
        },
      }
    );
    expect(outcome.candidates).toBe(1);
    expect(outcome.linesWritten).toBe(2);
    expect(getPurchase(opened.db, a)?.items[0]?.item.kind).toBe('consumable');
    expect(getPurchase(opened.db, b)?.items[0]?.item.kind).toBe('consumable');
  });

  it('aborts before model calls or writes when Contacts is unavailable', async () => {
    const id = purchase('old-a', 'a');
    let called = false;
    await expect(
      proposeItemKinds(
        opened.db,
        {
          propose: async () => {
            called = true;
            return null;
          },
        },
        {
          canonicalMerchants: async () => {
            throw new Error('Contacts unavailable');
          },
        }
      )
    ).rejects.toThrow('Contacts unavailable');
    expect(called).toBe(false);
    expect(getPurchase(opened.db, id)?.items[0]?.item.kind).toBeNull();
  });
});
