/**
 * Ranking and shape for the pillar's two search adapters.
 *
 * The failure these are written against is a hit that is technically
 * correct and useless: a line item with no order id on it, a merchant name
 * presented where an entity id belongs, or a contains-match outscoring an
 * exact one so the thing the user typed is not the thing at the top.
 */
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { createPurchase, searchPurchases } from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function orderWithItems(
  checksum: string,
  merchantEntityName: string | null,
  items: readonly { name: string; sku?: string | null }[]
): string {
  return createPurchase(
    opened.db,
    amazonOrder({
      checksum,
      sourceOrderId: checksum,
      merchantEntityName,
      items: items.map((item, index) => ({
        ref: `i${String(index)}`,
        name: item.name,
        sku: item.sku ?? null,
        unitPriceCents: 1000,
        lineTotalCents: 1000,
      })),
    })
  );
}

describe('the order adapter', () => {
  it('finds an order by the merchant label it was ingested with', () => {
    const id = orderWithItems('a', 'Bunnings Warehouse', []);

    const hits = searchPurchases(opened.db, 'bunnings');

    expect(hits).toHaveLength(1);
    expect(hits[0]?.uri).toBe(`pops:purchases/purchase/${id}`);
    expect(hits[0]?.matchField).toBe('merchantEntityName');
  });

  it('carries the entity id beside the label, so a label is never read as an identity', () => {
    // Every export-ingested order is in exactly this state: a name and no
    // id. A hit that omitted the null would let a consumer assume one.
    orderWithItems('a', 'Bunnings Warehouse', []);

    const hit = searchPurchases(opened.db, 'bunnings')[0];

    expect(hit?.data['merchantEntityId']).toBeNull();
    expect(hit?.data['merchantEntityName']).toBe('Bunnings Warehouse');
  });

  it('ranks an exact merchant match above a partial one', () => {
    orderWithItems('partial', 'Bunnings Warehouse', []);
    orderWithItems('exact', 'Bunnings', []);

    const [first, second] = searchPurchases(opened.db, 'Bunnings');

    expect(first?.matchType).toBe('exact');
    expect(second?.matchType).toBe('prefix');
    expect(first?.score).toBeGreaterThan(second?.score ?? 0);
  });

  it('finds an order by the merchant order id, which is what a receipt quotes', () => {
    orderWithItems('249-1512883-0105415', 'Amazon', []);

    const hits = searchPurchases(opened.db, '249-1512883-0105415');

    expect(hits.some((hit) => hit.matchField === 'sourceOrderId')).toBe(true);
  });

  it('does not fall over on an order that names no merchant', () => {
    orderWithItems('a', null, []);

    expect(() => searchPurchases(opened.db, 'amazon')).not.toThrow();
  });
});

describe('the line-item adapter', () => {
  it('answers the question only this pillar can — which order had the thing in it', () => {
    const id = orderWithItems('a', 'Amazon', [{ name: 'Dosing funnel 58mm' }]);

    const hits = searchPurchases(opened.db, 'dosing funnel');
    const itemHit = hits.find((hit) => hit.uri.includes('purchase-item'));

    expect(itemHit).toBeDefined();
    // Without this the hit is unreachable: the pillar's only item route is
    // scoped under its order.
    expect(itemHit?.data['purchaseId']).toBe(id);
  });

  it('finds a line by sku when the name does not match', () => {
    orderWithItems('a', 'Amazon', [{ name: 'Coffee beans', sku: 'B07XYZ1234' }]);

    const hits = searchPurchases(opened.db, 'B07XYZ1234');

    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchField).toBe('sku');
  });

  it('reports one hit per line at its strongest field, not one per matching field', () => {
    orderWithItems('a', 'Amazon', [{ name: 'funnel', sku: 'funnel-58' }]);

    const itemHits = searchPurchases(opened.db, 'funnel').filter((hit) =>
      hit.uri.includes('purchase-item')
    );

    expect(itemHits).toHaveLength(1);
    expect(itemHits[0]?.matchType).toBe('exact');
    expect(itemHits[0]?.matchField).toBe('name');
  });
});

describe('both adapters together', () => {
  it('returns one flat list, because that is what a pillar /search returns', () => {
    orderWithItems('a', 'Amazon', [{ name: 'Amazon Basics cable' }]);

    const hits = searchPurchases(opened.db, 'amazon');

    expect(hits.some((hit) => hit.uri.includes('/purchase/'))).toBe(true);
    expect(hits.some((hit) => hit.uri.includes('/purchase-item/'))).toBe(true);
  });

  it('returns nothing for a blank query rather than paging the whole pillar', () => {
    orderWithItems('a', 'Amazon', [{ name: 'anything' }]);

    expect(searchPurchases(opened.db, '')).toEqual([]);
    expect(searchPurchases(opened.db, '   ')).toEqual([]);
  });

  it('matches case-insensitively in both directions', () => {
    orderWithItems('a', 'Amazon', [{ name: 'DOSING FUNNEL' }]);

    expect(searchPurchases(opened.db, 'dosing')).not.toHaveLength(0);
    expect(searchPurchases(opened.db, 'AMAZON')).not.toHaveLength(0);
  });

  it('returns nothing rather than everything when nothing matches', () => {
    orderWithItems('a', 'Amazon', [{ name: 'Dosing funnel' }]);

    expect(searchPurchases(opened.db, 'kayak')).toEqual([]);
  });
});
