/**
 * Ranking and shape for the pillar's two search adapters.
 *
 * The failure these are written against is a hit that is technically
 * correct and useless: a line item with no order id on it, a merchant name
 * presented where an entity id belongs, or a contains-match outscoring an
 * exact one so the thing the user typed is not the thing at the top.
 */
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { buildPurchasesManifest } from '../../api/manifest.js';
import { createPurchase, searchPurchases, setPurchaseStatus, upsertSource } from '../index.js';
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
  items: readonly { name: string; sku?: string | null }[],
  orderedAt?: string
): string {
  return createPurchase(
    opened.db,
    amazonOrder({
      checksum,
      sourceOrderId: checksum,
      merchantEntityName,
      ...(orderedAt === undefined ? {} : { orderedAt }),
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

/**
 * A hit is only useful if something can act on the URI it carries, and two
 * separate declarations stand between an emitted URI and a shell that opens
 * it: the manifest's `uri.types`, and `URI_ROUTE_MAP` in `libs/navigation`.
 * This pins the first — the second is pinned in `pillars/purchases/app`, which
 * is the package that can see the routes.
 */
describe('the URI every hit carries', () => {
  function typesEmittedFor(text: string): string[] {
    const types = searchPurchases(opened.db, text).map((hit) => {
      const [, path = ''] = hit.uri.split('pops:');
      const segments = path.split('/');
      return `${segments[0] ?? ''}/${segments[1] ?? ''}`;
    });
    return [...new Set(types)].toSorted();
  }

  it('names a type the manifest declares, for every adapter', () => {
    orderWithItems('a', 'Amazon', [{ name: 'Amazon Basics cable' }]);

    const emitted = typesEmittedFor('amazon');

    expect(emitted).toEqual(['purchases/purchase', 'purchases/purchase-item']);
    for (const type of emitted) {
      expect(buildPurchasesManifest('0.1.0').uri.types).toContain(type);
    }
  });

  // ADR-012's id segment is one row's primary key, so a line's URI addresses
  // the line. The order it opens travels in `data`, asserted above.
  it('addresses the line itself, not the order it hangs off', () => {
    const purchaseId = orderWithItems('a', 'Amazon', [{ name: 'Dosing funnel' }]);

    const itemHit = searchPurchases(opened.db, 'dosing').find((hit) =>
      hit.uri.includes('/purchase-item/')
    );

    expect(itemHit?.uri).not.toContain(purchaseId);
  });
});

describe('both adapters together', () => {
  it('ranks across both adapters, not one adapter after the other', () => {
    // The order matches as a prefix; the line matches exactly.
    // Concatenating two already-sorted lists would put the weaker order hit
    // first, and the MCP tool reads this response with no engine in between
    // to re-sort it.
    orderWithItems('a', 'Bunnings Warehouse', [{ name: 'Bunnings' }]);

    const hits = searchPurchases(opened.db, 'bunnings');

    expect(hits[0]?.matchType).toBe('exact');
    expect(hits[0]?.uri).toContain('/purchase-item/');
    expect(hits.map((hit) => hit.score)).toEqual(
      [...hits.map((h) => h.score)].toSorted((x, y) => y - x)
    );
  });

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

/**
 * What decides which hits come back.
 *
 * `LIKE '%text%'` returns rows in whatever order the scan reached them,
 * which is the order they were written. These seed more matches than any
 * response holds and put the row that should win where that order would
 * lose it, so a rank that only ever saw part of the corpus — or a cut that
 * kept whichever rows arrived first — shows up as a missing hit rather than
 * as a reordering nobody notices.
 */
describe('which matches survive to the response', () => {
  const MORE_THAN_ANY_RESPONSE_HOLDS = 150;

  function fillerOrders(count: number): void {
    for (let index = 0; index < count; index += 1) {
      orderWithItems(`filler-${String(index)}`, `Reseller of vevor gear ${String(index)}`, []);
    }
  }

  it('scores every matching order, so the exact match written last still wins', () => {
    fillerOrders(MORE_THAN_ANY_RESPONSE_HOLDS);
    const id = orderWithItems('exact', 'Vevor', []);

    const hits = searchPurchases(opened.db, 'vevor');

    expect(hits[0]?.matchType).toBe('exact');
    expect(hits[0]?.uri).toBe(`pops:purchases/purchase/${id}`);
  });

  it('scores every matching line, so the exact line written last still wins', () => {
    const filler = Array.from({ length: MORE_THAN_ANY_RESPONSE_HOLDS }, (_, index) => ({
      name: `Spare vevor part ${String(index)}`,
    }));
    orderWithItems('bulk', 'Amazon', [...filler, { name: 'Vevor' }]);

    const hits = searchPurchases(opened.db, 'vevor');

    expect(hits[0]?.matchType).toBe('exact');
    expect(hits[0]?.uri).toContain('/purchase-item/');
    expect(hits[0]?.data['name']).toBe('Vevor');
  });

  it('cuts equally-scored hits by date, so the same data always answers the same', () => {
    // Every one of these scores identically and there are more of them than
    // come back, so the cut is decided entirely by the tie-break. Written
    // oldest first: keeping the order the scan produced would answer with
    // the oldest.
    for (let index = 0; index < 40; index += 1) {
      const minute = String(index + 1).padStart(2, '0');
      orderWithItems(
        `filler-${String(index)}`,
        `Reseller of vevor gear ${String(index)}`,
        [],
        `2026-01-01T00:${minute}:00Z`
      );
    }

    const dates = searchPurchases(opened.db, 'vevor').map((hit) => hit.data['orderedAt']);

    expect(dates).toHaveLength(25);
    expect(dates[0]).toBe('2026-01-01T00:40:00Z');
    expect(dates.at(-1)).toBe('2026-01-01T00:16:00Z');
  });
});

/**
 * What a scope excludes.
 *
 * A scope that was never applied answers with a superset, and a superset is
 * exactly what a filter matching broadly looks like — so every assertion
 * here names the rows that must NOT come back, not a count. Each seeds at
 * least one order the scope excludes and one it keeps, both matching the
 * text, so an ignored scope fails rather than passing by luck.
 */
describe('the orders a scope narrows to', () => {
  beforeEach(() => {
    upsertSource(opened.db, { id: 'woolworths', label: 'Woolworths' });
  });

  function orderFrom(
    source: string,
    checksum: string,
    itemName: string,
    orderedAt = '2026-02-02T01:41:21Z'
  ): string {
    return createPurchase(
      opened.db,
      amazonOrder({
        source,
        checksum,
        sourceOrderId: checksum,
        merchantEntityName: 'Vevor reseller',
        orderedAt,
        items: [
          { ref: 'i0', name: itemName, sku: null, unitPriceCents: 1000, lineTotalCents: 1000 },
        ],
      })
    );
  }

  function uris(hits: readonly { uri: string }[]): string[] {
    return hits.map((hit) => hit.uri);
  }

  it('drops the orders outside the requested source', () => {
    const amazon = orderFrom('amazon', 'a', 'Vevor grinder');
    const woolworths = orderFrom('woolworths', 'w', 'Vevor grinder');

    const hits = searchPurchases(opened.db, 'vevor', { sources: ['woolworths'] });

    expect(uris(hits)).toContain(`pops:purchases/purchase/${woolworths}`);
    expect(uris(hits)).not.toContain(`pops:purchases/purchase/${amazon}`);
  });

  it('scopes a line by the order it was bought on, since a line carries no source', () => {
    // The item adapter is the half a scope applied to the order query alone
    // would leave wide open, and a line carries no source of its own.
    const amazon = orderFrom('amazon', 'a', 'Vevor grinder');
    orderFrom('woolworths', 'w', 'Vevor grinder');

    const hits = searchPurchases(opened.db, 'vevor grinder', { sources: ['woolworths'] });
    const itemHits = hits.filter((hit) => hit.uri.includes('/purchase-item/'));

    expect(itemHits).toHaveLength(1);
    expect(itemHits[0]?.data['purchaseId']).not.toBe(amazon);
  });

  it('widens to every requested source rather than intersecting them', () => {
    const amazon = orderFrom('amazon', 'a', 'Vevor grinder');
    const woolworths = orderFrom('woolworths', 'w', 'Vevor grinder');

    const hits = searchPurchases(opened.db, 'vevor', { sources: ['amazon', 'woolworths'] });

    expect(uris(hits)).toContain(`pops:purchases/purchase/${amazon}`);
    expect(uris(hits)).toContain(`pops:purchases/purchase/${woolworths}`);
  });

  it('narrows before the ranking, so the hit asked for is not crowded out by the ones excluded', () => {
    // Every one of these scores the same, so the cap falls inside the tied
    // run and recency decides it. The wanted order is the oldest, which puts
    // it past the cap unless the scope has already removed the rest — a
    // scope applied to the ranked list instead would answer with nothing.
    const wanted = orderFrom('woolworths', 'w', 'Vevor grinder', '2026-01-01T00:00:00Z');
    for (let index = 0; index < 30; index += 1) {
      const minute = String(index + 1).padStart(2, '0');
      orderFrom('amazon', `a-${String(index)}`, 'Vevor grinder', `2026-02-01T00:${minute}:00Z`);
    }

    const unfiltered = searchPurchases(opened.db, 'vevor');
    const filtered = searchPurchases(opened.db, 'vevor', { sources: ['woolworths'] });

    expect(uris(unfiltered)).not.toContain(`pops:purchases/purchase/${wanted}`);
    expect(uris(filtered)).toContain(`pops:purchases/purchase/${wanted}`);
  });

  it('drops the orders outside the requested statuses', () => {
    const awaiting = orderFrom('amazon', 'a', 'Vevor grinder');
    const linked = orderFrom('amazon', 'b', 'Vevor grinder');
    setPurchaseStatus(opened.db, linked, 'linked');

    const hits = searchPurchases(opened.db, 'vevor', { statuses: ['linked'] });

    expect(uris(hits)).toContain(`pops:purchases/purchase/${linked}`);
    expect(uris(hits)).not.toContain(`pops:purchases/purchase/${awaiting}`);
  });

  it('bounds the window inclusively at both ends', () => {
    const before = orderFrom('amazon', 'a', 'Vevor grinder', '2025-12-31T23:59:59Z');
    const onFrom = orderFrom('amazon', 'b', 'Vevor grinder', '2026-01-01T00:00:00Z');
    const onTo = orderFrom('amazon', 'c', 'Vevor grinder', '2026-01-31T00:00:00Z');
    const after = orderFrom('amazon', 'd', 'Vevor grinder', '2026-02-01T00:00:01Z');

    const hits = uris(
      searchPurchases(opened.db, 'vevor', {
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T00:00:00Z',
      })
    );

    expect(hits).toContain(`pops:purchases/purchase/${onFrom}`);
    expect(hits).toContain(`pops:purchases/purchase/${onTo}`);
    expect(hits).not.toContain(`pops:purchases/purchase/${before}`);
    expect(hits).not.toContain(`pops:purchases/purchase/${after}`);
  });

  it('leaves the answer alone when the scope is empty', () => {
    orderFrom('amazon', 'a', 'Vevor grinder');
    orderFrom('woolworths', 'w', 'Vevor grinder');

    expect(searchPurchases(opened.db, 'vevor', {})).toEqual(searchPurchases(opened.db, 'vevor'));
  });

  it('answers nothing rather than everything when the scope excludes every match', () => {
    orderFrom('amazon', 'a', 'Vevor grinder');

    expect(searchPurchases(opened.db, 'vevor', { sources: ['woolworths'] })).toEqual([]);
  });
});
