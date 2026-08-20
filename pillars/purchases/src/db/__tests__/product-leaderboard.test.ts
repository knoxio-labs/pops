import { eq } from 'drizzle-orm';
/**
 * The product-grain leaderboard, held to the standard an aggregate needs.
 *
 * Two families of failure, and neither one throws.
 *
 * The first is arithmetic that silently multiplies. The merchant roll-up's
 * sibling file documents the fan-out that produces it — an order with three
 * charges appears three times in a charge join, six times once links are
 * joined — and the assertions here hold this fold to the same standard from
 * the other side: an order settled by many charges must still be *one*
 * order in a product's count, and the way to be sure is to build the order
 * that would multiply and check that it does not.
 *
 * The second is grouping that silently conflates. Two different products
 * sharing a row corrupts spend attribution in a way nothing downstream can
 * see, and the sku column exists on one adapter's lines only — so the tests
 * that matter most are the ones that assert lines do NOT merge: across
 * sources, across a null sku, and across names that differ in more than
 * punctuation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  purchaseChargeLinks,
  purchaseCharges,
  purchaseItems,
  rankProductPurchases,
  upsertSource,
} from '../index.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type {
  CreateItemInput,
  CreatePurchaseInput,
  OpenedPurchasesDb,
  ProductLeaderboard,
  ProductPurchases,
  PurchasesDb,
} from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  upsertSource(opened.db, {
    id: 'woolworths',
    label: 'Woolworths',
    descriptorPattern: 'WOOLWORTHS%',
    settlementWindowDays: 14,
    autoLinkPolicy: 'auto',
    ingestAdapter: 'woolworths-receipt',
  });
  upsertSource(opened.db, {
    id: 'receipt',
    label: 'Uploaded receipt',
    descriptorPattern: '%',
    settlementWindowDays: 14,
    autoLinkPolicy: 'review',
    ingestAdapter: 'receipt-upload',
  });
});

afterEach(() => {
  cleanup();
});

function order(
  overrides: Partial<CreatePurchaseInput> & { checksum: string }
): CreatePurchaseInput {
  return {
    source: 'amazon',
    ingestMethod: 'export',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    sourceOrderId: overrides.checksum,
    merchantEntityName: 'Amazon',
    ...overrides,
  };
}

/**
 * An order from the source every photographed receipt shares, whatever shop
 * printed it — so the shop is a property of the order and not of the source.
 */
function photographedOrder(
  overrides: Partial<CreatePurchaseInput> & { checksum: string; merchantEntityName: string }
): CreatePurchaseInput {
  return order({ source: 'receipt', ingestMethod: 'upload', ...overrides });
}

/** An order from a source that states no product identifier. */
function receiptOrder(
  overrides: Partial<CreatePurchaseInput> & { checksum: string }
): CreatePurchaseInput {
  return order({
    source: 'woolworths',
    ingestMethod: 'upload',
    merchantEntityName: 'Woolworths',
    ...overrides,
  });
}

function line(overrides: Partial<CreateItemInput> & { name: string }): CreateItemInput {
  return { unitPriceCents: 1179, lineTotalCents: 1179, ...overrides };
}

/** The one entry the assertion is about, named so a miss reads as a miss. */
function only(leaderboard: ProductLeaderboard): ProductPurchases {
  expect(leaderboard.products).toHaveLength(1);
  const [entry] = leaderboard.products;
  if (entry === undefined) throw new Error('unreachable: length asserted above');
  return entry;
}

function entryFor(leaderboard: ProductLeaderboard, name: string): ProductPurchases {
  const found = leaderboard.products.find((product) => product.product.name === name);
  if (found === undefined) {
    throw new Error(
      `no group named ${name}; got ${leaderboard.products.map((p) => p.product.name).join(', ')}`
    );
  }
  return found;
}

describe('grouping', () => {
  it('folds one sku bought in three orders into one row counting three', () => {
    for (const month of ['01', '02', '03']) {
      createPurchase(
        opened.db,
        order({
          checksum: `order-${month}`,
          orderedAt: `2026-${month}-04T00:00:00Z`,
          items: [
            line({ name: 'Magnetic Dosing Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } }),
          ],
        })
      );
    }

    const entry = only(rankProductPurchases(opened.db));

    expect(entry.product).toEqual({
      basis: 'sku',
      source: null,
      scheme: 'asin',
      sku: 'B0FCSJTKJ8',
      name: 'Magnetic Dosing Funnel',
    });
    expect(entry.orderCount).toBe(3);
    expect(entry.lineCount).toBe(3);
    expect(entry.landedCostCents).toBe(3537);
    expect(entry.firstPurchasedAt).toBe('2026-01-04T00:00:00Z');
    expect(entry.lastPurchasedAt).toBe('2026-03-04T00:00:00Z');
  });

  it('counts one order once when it lists the same sku on two lines', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'split',
        items: [
          line({ name: 'Magnetic Dosing Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } }),
          line({ name: 'Magnetic Dosing Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } }),
        ],
      })
    );

    const entry = only(rankProductPurchases(opened.db));

    // The distinction the route exists to make: two lines, one order. A
    // leaderboard that reported two would say a product was re-bought when
    // the buyer only ever put two of it in one basket.
    expect(entry.lineCount).toBe(2);
    expect(entry.orderCount).toBe(1);
  });

  it('sums quantity into units without inflating the order count', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'qty',
        items: [
          line({
            name: 'Pods',
            sku: { value: 'B01', scheme: 'merchant' },
            quantity: 6,
            unitPriceCents: 100,
            lineTotalCents: 600,
          }),
        ],
      })
    );

    const entry = only(rankProductPurchases(opened.db));
    expect(entry.unitCount).toBe(6);
    expect(entry.orderCount).toBe(1);
    expect(entry.lineCount).toBe(1);
  });

  it('folds one ASIN across the physical and digital Amazon exports into one row', () => {
    upsertSource(opened.db, {
      id: 'amazon-digital',
      label: 'Amazon (digital)',
      descriptorPattern: 'AMAZON%',
      settlementWindowDays: 21,
      autoLinkPolicy: 'review',
      ingestAdapter: 'amazon-digital-export',
    });
    createPurchase(
      opened.db,
      order({
        checksum: 'physical',
        orderedAt: '2026-01-04T00:00:00Z',
        items: [line({ name: 'The Way of Kings', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'digital',
        source: 'amazon-digital',
        orderedAt: '2026-03-04T00:00:00Z',
        items: [
          line({ name: 'The Way of Kings (Kindle)', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } }),
        ],
      })
    );

    // An ASIN names one product in Amazon's catalogue, and the bundle splits
    // that catalogue across two exports. Two rows here is the same product
    // reported as two, each with half its history.
    const entry = only(rankProductPurchases(opened.db));
    expect(entry.orderCount).toBe(2);
    expect(entry.lineCount).toBe(2);
    // The group is bounded by no one source, and says so rather than
    // reporting whichever line was read last.
    expect(entry.product.basis).toBe('sku');
    expect(entry.product.source).toBeNull();
  });

  it('keeps a merchant-scoped sku inside its source even where the string is an ASIN', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'asin-side',
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );
    createPurchase(
      opened.db,
      receiptOrder({
        checksum: 'merchant-side',
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'merchant' } })],
      })
    );

    // The same characters under two schemes are two identifiers. Merging them
    // would put a grocer's article number and an Amazon catalogue entry in one
    // row, which is the direction that cannot be seen once it has happened.
    const leaderboard = rankProductPurchases(opened.db);
    expect(leaderboard.products).toHaveLength(2);
    const sources = leaderboard.products.map((product) => product.product.source).sort();
    expect(sources).toEqual([null, 'woolworths']);
  });

  it('never merges the same sku string across two sources', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'am',
        items: [line({ name: 'Barware Set', sku: { value: '6015322', scheme: 'merchant' } })],
      })
    );
    createPurchase(
      opened.db,
      receiptOrder({
        checksum: 'wo',
        items: [line({ name: 'Barware Set', sku: { value: '6015322', scheme: 'merchant' } })],
      })
    );

    // An Amazon ASIN and a Woolworths article number that happen to match
    // are not one product, and a single row here would attribute one
    // merchant's spend to the other.
    expect(rankProductPurchases(opened.db).products).toHaveLength(2);
  });

  it('keeps lines that state no sku apart instead of folding them into one group', () => {
    createPurchase(
      opened.db,
      receiptOrder({
        checksum: 'grocery',
        items: [
          line({ name: 'WW Full Cream Milk 2L' }),
          line({ name: 'Wiltshire Impulse Citrus Juicer' }),
          line({ name: 'Bananas Cavendish' }),
        ],
      })
    );

    // SQL `GROUP BY sku` folds NULLs together, which would report an entire
    // grocery shop as one product bought once.
    const leaderboard = rankProductPurchases(opened.db);
    expect(leaderboard.products).toHaveLength(3);
    expect(leaderboard.coverage.nameKeyedLines).toBe(3);
  });

  it('groups two receipts of one grocery line printed with different spacing', () => {
    for (const [checksum, printed] of [
      ['first', 'WW Smky Chip Chdr TstyShrd Cheese 250g'],
      ['second', 'WW SMKY CHIP CHDR  TSTYSHRD CHEESE 250G'],
    ] as const) {
      createPurchase(
        opened.db,
        receiptOrder({
          checksum,
          orderedAt: checksum === 'first' ? '2026-01-04T00:00:00Z' : '2026-02-04T00:00:00Z',
          items: [line({ name: printed })],
        })
      );
    }

    const entry = only(rankProductPurchases(opened.db));

    expect(entry.orderCount).toBe(2);
    expect(entry.product).toEqual({
      basis: 'name',
      source: 'woolworths',
      sku: null,
      // The newest receipt's wording, deterministically, rather than
      // whichever row the query returned first.
      name: 'WW SMKY CHIP CHDR  TSTYSHRD CHEESE 250G',
      normalisedName: 'ww smky chip chdr tstyshrd cheese 250g',
    });
  });

  it('keeps two grocery lines apart when the difference is a digit, not spacing', () => {
    createPurchase(
      opened.db,
      receiptOrder({
        checksum: 'milk',
        items: [line({ name: 'WW Full Cream Milk 1L' }), line({ name: 'WW Full Cream Milk 2L' })],
      })
    );

    expect(rankProductPurchases(opened.db).products).toHaveLength(2);
  });

  it('gives a line with neither sku nor readable name a group of its own', () => {
    createPurchase(
      opened.db,
      receiptOrder({
        checksum: 'unreadable',
        items: [line({ name: '***' }), line({ name: '###' })],
      })
    );

    const leaderboard = rankProductPurchases(opened.db);

    expect(leaderboard.products).toHaveLength(2);
    expect(leaderboard.coverage.unidentifiedLines).toBe(2);
    for (const entry of leaderboard.products) {
      expect(entry.product.basis).toBe('unidentified');
      expect(entry.orderCount).toBe(1);
    }
  });

  it('keeps two shops apart when they print the same line under the shared receipt source', () => {
    for (const shop of ['Kettle Black', 'Patricia Coffee']) {
      createPurchase(
        opened.db,
        photographedOrder({
          checksum: shop,
          merchantEntityName: shop,
          items: [line({ name: 'LATTE', lineTotalCents: 550 })],
        })
      );
    }

    const leaderboard = rankProductPurchases(opened.db);

    // One source id covers every photographed receipt, so grouping on the
    // source alone would report one coffee bought at two shops as one
    // product bought twice for $11 — a merge nothing downstream can see.
    expect(leaderboard.products).toHaveLength(2);
    expect(leaderboard.products.map((entry) => entry.orderCount)).toEqual([1, 1]);
    expect(leaderboard.products.map((entry) => entry.merchants)).toEqual([
      [{ resolution: 'name', entityId: null, name: 'Kettle Black' }],
      [{ resolution: 'name', entityId: null, name: 'Patricia Coffee' }],
    ]);
  });

  it("still folds one shop's repeat purchases under that same source", () => {
    for (const month of ['01', '02']) {
      createPurchase(
        opened.db,
        photographedOrder({
          checksum: `kettle-${month}`,
          orderedAt: `2026-${month}-04T00:00:00Z`,
          merchantEntityName: 'Kettle Black',
          items: [line({ name: 'LATTE', lineTotalCents: 550 })],
        })
      );
    }

    // Confining the key to the merchant must not confine it to the order:
    // the same shop's repeats are the answer this route exists to give.
    const entry = only(rankProductPurchases(opened.db));
    expect(entry.orderCount).toBe(2);
    expect(entry.landedCostCents).toBe(1100);
  });

  it('splits one sku bought in two currencies rather than adding the cents together', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'aud',
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'usd',
        currency: 'USD',
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );

    const leaderboard = rankProductPurchases(opened.db);
    expect(leaderboard.products.map((entry) => entry.currency)).toEqual(['AUD', 'USD']);
    expect(leaderboard.products.every((entry) => entry.orderCount === 1)).toBe(true);
    // Counted per row rather than per product, which is what the field says
    // and what makes it the denominator for what `minOrderCount` withheld.
    expect(leaderboard.coverage.productCount).toBe(2);
  });
});

describe('money', () => {
  it('lands the same cost per line the order read derives, allocations included', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'landed',
        items: [
          line({
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            lineTotalCents: 1179,
            allocatedShippingCents: 250,
            allocatedAdjustmentCents: -50,
          }),
        ],
      })
    );

    // Restating `lineTotal + shipping + adjustment` in SQL would be a second
    // implementation of landed cost, free to drift from the one the line
    // read uses. This asserts the figure, not the expression.
    expect(only(rankProductPurchases(opened.db)).landedCostCents).toBe(1379);
  });

  it('sums line refunds and leaves the landed cost gross of them', () => {
    const refunded = createPurchase(
      opened.db,
      order({
        checksum: 'refunded',
        items: [
          line({
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            lineTotalCents: 1179,
          }),
        ],
      })
    );
    const partly = createPurchase(
      opened.db,
      order({
        checksum: 'kept',
        items: [
          line({
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            lineTotalCents: 1179,
          }),
        ],
      })
    );
    recordLineRefund(opened.db, refunded, 400);
    recordLineRefund(opened.db, partly, 250);

    const entry = only(rankProductPurchases(opened.db));

    // Two refunded lines rather than one, so the figure is only right if
    // every line in the group is added rather than the first one reported.
    expect(entry.refundedCents).toBe(650);
    // Beside the cost rather than inside it: a consumer that wants net can
    // subtract, and one that does not cannot be handed a net figure it
    // believes is gross.
    expect(entry.landedCostCents).toBe(2358);
  });

  it('does not multiply a product when many charges and links settle its order', () => {
    const purchaseId = createPurchase(
      opened.db,
      order({
        checksum: 'fanout',
        totalCents: 6000,
        items: [
          line({
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            lineTotalCents: 6000,
          }),
        ],
        charges: [
          { sourceChargeRef: 'a', amountCents: 2000 },
          { sourceChargeRef: 'b', amountCents: 2000 },
          { sourceChargeRef: 'c', amountCents: 2000 },
        ],
      })
    );
    linkEveryCharge(opened.db, purchaseId);

    const entry = only(rankProductPurchases(opened.db));

    // Three charges, six charge-link rows. A join that fanned out would
    // report the funnel bought three or six times, for three or six times
    // the money, and nothing in the response would look wrong.
    expect(entry.orderCount).toBe(1);
    expect(entry.lineCount).toBe(1);
    expect(entry.landedCostCents).toBe(6000);
  });
});

describe('merchants', () => {
  it('names every store of one chain a product was bought at, once each', () => {
    for (const [checksum, merchant] of [
      ['woolies-a', 'Woolworths 1034 Canterbury Plaza'],
      ['woolies-b', 'Woolworths 1034 Canterbury Plaza'],
      ['metro', 'Woolworths Metro Town Hall'],
    ] as const) {
      createPurchase(
        opened.db,
        receiptOrder({
          checksum,
          merchantEntityName: merchant,
          items: [line({ name: 'Bananas Cavendish' })],
        })
      );
    }

    const entry = only(rankProductPurchases(opened.db));

    // The export adapter labels each store, but one chain prints one
    // catalogue: splitting per branch would report a weekly staple as
    // several occasional ones.
    expect(entry.orderCount).toBe(3);
    expect(entry.merchants).toEqual([
      { resolution: 'name', entityId: null, name: 'Woolworths 1034 Canterbury Plaza' },
      { resolution: 'name', entityId: null, name: 'Woolworths Metro Town Hall' },
    ]);
  });

  it('reports a resolved entity as one, and an unnamed order as unattributed', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'entity',
        merchantEntityId: 'ent-1',
        merchantEntityName: 'Amazon AU',
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'anon',
        merchantEntityName: null,
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );

    expect(only(rankProductPurchases(opened.db)).merchants).toEqual([
      { resolution: 'entity', entityId: 'ent-1', name: 'Amazon AU' },
      // Kept rather than dropped: an order naming no merchant still bought
      // the product, and omitting it would make the merchant list disagree
      // with the order count beside it.
      { resolution: 'unattributed', entityId: null, name: null },
    ]);
  });
});

describe('scope and withholding', () => {
  it('counts only the orders the period selects', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'old',
        orderedAt: '2025-02-02T01:41:21Z',
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'new',
        orderedAt: '2026-02-02T01:41:21Z',
        items: [line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } })],
      })
    );

    const entry = only(rankProductPurchases(opened.db, { from: '2026-01-01T00:00:00Z' }));
    expect(entry.orderCount).toBe(1);
    expect(entry.firstPurchasedAt).toBe('2026-02-02T01:41:21Z');
  });

  it('withholds products under minOrderCount while still counting them as covered', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'a',
        orderedAt: '2026-01-04T00:00:00Z',
        items: [
          line({ name: 'Funnel', sku: { value: 'REPEAT', scheme: 'merchant' } }),
          line({ name: 'Tamper', sku: { value: 'ONCE', scheme: 'merchant' } }),
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'b',
        orderedAt: '2026-02-04T00:00:00Z',
        items: [line({ name: 'Funnel', sku: { value: 'REPEAT', scheme: 'merchant' } })],
      })
    );

    const leaderboard = rankProductPurchases(opened.db, { minOrderCount: 2 });

    expect(only(leaderboard).product).toMatchObject({ sku: 'REPEAT' });
    // The withheld product is still in the denominator: a coverage figure
    // computed after the filter would describe the surviving rows rather
    // than the scope, and would read as better identity coverage than the
    // data has.
    expect(leaderboard.coverage).toEqual({
      lineCount: 3,
      skuKeyedLines: 3,
      confirmedProductLines: 0,
      proposedProductLines: 0,
      nameKeyedLines: 0,
      unidentifiedLines: 0,
      productCount: 2,
    });
  });

  it('withholds nothing by default', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'a',
        items: [line({ name: 'Tamper', sku: { value: 'ONCE', scheme: 'merchant' } })],
      })
    );

    expect(rankProductPurchases(opened.db).products).toHaveLength(1);
  });

  it('accounts for every line in scope exactly once across the bases', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'mixed',
        items: [
          line({ name: 'Funnel', sku: { value: 'B0FCSJTKJ8', scheme: 'asin' } }),
          line({ name: 'Tamper' }),
        ],
      })
    );
    createPurchase(
      opened.db,
      receiptOrder({
        checksum: 'receipt',
        items: [line({ name: 'Milk 2L' }), line({ name: '***' })],
      })
    );

    const { coverage } = rankProductPurchases(opened.db);

    expect(coverage.lineCount).toBe(4);
    expect(
      coverage.skuKeyedLines +
        coverage.confirmedProductLines +
        coverage.proposedProductLines +
        coverage.nameKeyedLines +
        coverage.unidentifiedLines
    ).toBe(coverage.lineCount);
    expect(coverage).toMatchObject({ skuKeyedLines: 1, nameKeyedLines: 2, unidentifiedLines: 1 });
  });

  it('returns an empty leaderboard, not a shape a consumer has to special-case', () => {
    expect(rankProductPurchases(opened.db)).toEqual({
      products: [],
      coverage: {
        lineCount: 0,
        skuKeyedLines: 0,
        confirmedProductLines: 0,
        proposedProductLines: 0,
        nameKeyedLines: 0,
        unidentifiedLines: 0,
        productCount: 0,
      },
    });
  });
});

describe('ordering', () => {
  it('ranks by orders, then landed cost, and serialises the same way every run', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'a',
        orderedAt: '2026-01-04T00:00:00Z',
        items: [
          line({
            name: 'Twice cheap',
            sku: { value: 'TWICE-CHEAP', scheme: 'merchant' },
            lineTotalCents: 100,
          }),
          line({
            name: 'Twice dear',
            sku: { value: 'TWICE-DEAR', scheme: 'merchant' },
            lineTotalCents: 9000,
          }),
          line({
            name: 'Once',
            sku: { value: 'ONCE', scheme: 'merchant' },
            lineTotalCents: 50_000,
          }),
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'b',
        orderedAt: '2026-02-04T00:00:00Z',
        items: [
          line({
            name: 'Twice cheap',
            sku: { value: 'TWICE-CHEAP', scheme: 'merchant' },
            lineTotalCents: 100,
          }),
          line({
            name: 'Twice dear',
            sku: { value: 'TWICE-DEAR', scheme: 'merchant' },
            lineTotalCents: 9000,
          }),
        ],
      })
    );

    const ranked = rankProductPurchases(opened.db).products.map((entry) => entry.product.name);

    // The expensive one-off does not lead a leaderboard of repeats, and
    // between two equally-repeated products the dearer one does.
    expect(ranked).toEqual(['Twice dear', 'Twice cheap', 'Once']);
    expect(rankProductPurchases(opened.db).products.map((entry) => entry.product.name)).toEqual(
      ranked
    );
  });

  it('orders currencies before spend, so two currencies never interleave', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'usd',
        currency: 'USD',
        items: [
          line({
            name: 'Dear in USD',
            sku: { value: 'USD-1', scheme: 'merchant' },
            lineTotalCents: 90_000,
          }),
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'aud',
        items: [line({ name: 'Cheap in AUD', sku: { value: 'AUD-1', scheme: 'merchant' } })],
      })
    );

    expect(rankProductPurchases(opened.db).products.map((entry) => entry.currency)).toEqual([
      'AUD',
      'USD',
    ]);
  });
});

describe('agreement with the line reads it summarises', () => {
  it('reports the landed cost of every line in scope, summed across products', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'a',
        items: [
          line({
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            lineTotalCents: 1179,
          }),
          line({
            name: 'Tamper',
            sku: { value: 'B0DSVZQ8P5', scheme: 'asin' },
            lineTotalCents: 4499,
          }),
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'b',
        items: [
          line({
            name: 'Funnel',
            sku: { value: 'B0FCSJTKJ8', scheme: 'asin' },
            lineTotalCents: 1179,
            allocatedShippingCents: 300,
          }),
        ],
      })
    );

    const leaderboard = rankProductPurchases(opened.db);
    const total = leaderboard.products.reduce((sum, entry) => sum + entry.landedCostCents, 0);

    // Nothing is dropped and nothing is double-counted: the products add
    // back up to the lines they were folded from.
    expect(total).toBe(1179 + 4499 + 1179 + 300);
    expect(entryFor(leaderboard, 'Funnel').landedCostCents).toBe(2658);
  });
});

/**
 * A refund attributed to an order's lines.
 *
 * Written through the column directly because nothing in the tree writes it:
 * the Amazon disbursement feed names an *order* and never a line, so there
 * is no ingest path that produces this state — and the fold must already be
 * right for the adapter that eventually does.
 */
function recordLineRefund(db: PurchasesDb, purchaseId: string, cents: number): void {
  db.update(purchaseItems)
    .set({ refundedCents: cents })
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .run();
}

/**
 * Two links on every charge of an order — the arrangement whose join
 * multiplies. Written through the tables directly because the ingest path
 * mints links only through the reconciliation sweep, and what is under test
 * is the read, not how the rows got there.
 */
function linkEveryCharge(db: PurchasesDb, purchaseId: string): void {
  const charges = db.select().from(purchaseCharges).all();
  for (const charge of charges) {
    if (charge.purchaseId !== purchaseId) continue;
    for (const suffix of ['x', 'y']) {
      db.insert(purchaseChargeLinks)
        .values({
          chargeId: charge.id,
          transactionUri: `pops://finance/transactions/${charge.id}-${suffix}`,
          amountCents: charge.amountCents,
          linkType: 'exact',
        })
        .run();
    }
  }
}

const DAY_SECONDS = 86_400;

describe('cadence', () => {
  it('reports no cadence for a product bought once', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'once',
        items: [line({ name: 'Kettle', sku: { value: 'B00KETTLE', scheme: 'merchant' } })],
      })
    );

    // Not a zero and not a null: a single purchase has no gap, and either
    // stand-in renders beside real cadences as if it were one.
    expect(only(rankProductPurchases(opened.db)).cadence).toEqual({ basis: 'single-purchase' });
  });

  it('measures the gaps between distinct orders', () => {
    for (const day of ['01', '08', '29']) {
      createPurchase(
        opened.db,
        order({
          checksum: `pods-${day}`,
          orderedAt: `2026-01-${day}T00:00:00Z`,
          items: [line({ name: 'Coffee Pods', sku: { value: 'B00PODS', scheme: 'merchant' } })],
        })
      );
    }

    // Gaps of 7 and 21 days.
    expect(only(rankProductPurchases(opened.db)).cadence).toEqual({
      basis: 'intervals',
      medianIntervalSeconds: 14 * DAY_SECONDS,
      meanIntervalSeconds: 14 * DAY_SECONDS,
      shortestIntervalSeconds: 7 * DAY_SECONDS,
      longestIntervalSeconds: 21 * DAY_SECONDS,
    });
  });

  it('keeps two lines in one basket a single purchase rather than a zero-length cadence', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'two-bags',
        items: [
          line({ name: 'Coffee Pods', sku: { value: 'B00PODS', scheme: 'merchant' } }),
          line({ name: 'Coffee Pods', sku: { value: 'B00PODS', scheme: 'merchant' } }),
        ],
      })
    );

    const entry = only(rankProductPurchases(opened.db));

    expect(entry.lineCount).toBe(2);
    // Buying ahead is not buying again. A fold that measured gaps between
    // lines would report this product as re-bought instantly.
    expect(entry.cadence).toEqual({ basis: 'single-purchase' });
  });

  it('separates the median from the mean on a bursty history', () => {
    for (const orderedAt of [
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      '2026-01-03T00:00:00Z',
      '2027-01-03T00:00:00Z',
    ]) {
      createPurchase(
        opened.db,
        order({
          checksum: `burst-${orderedAt}`,
          orderedAt,
          items: [line({ name: 'Label Tape', sku: { value: 'B00TAPE', scheme: 'merchant' } })],
        })
      );
    }

    const { cadence } = only(rankProductPurchases(opened.db));
    if (cadence.basis !== 'intervals') throw new Error('expected intervals');

    expect(cadence.medianIntervalSeconds).toBe(1 * DAY_SECONDS);
    expect(cadence.meanIntervalSeconds).toBeGreaterThan(100 * DAY_SECONDS);
  });
});

describe('ordering within a group', () => {
  /**
   * The two orders are 6 hours apart and their timestamps sort the other way
   * as text. Everything a group reports about its own ends — both dates, the
   * label it wears, both ends of its price history — has to agree with the
   * gap its cadence measures, and text ordering makes all four disagree.
   */
  function twoOffsetOrders(): void {
    createPurchase(
      opened.db,
      order({
        checksum: 'earlier-in-fact',
        orderedAt: '2026-01-02T00:00:00+10:00',
        items: [
          line({
            name: 'Filter Papers v1',
            sku: { value: 'B00FILTER', scheme: 'merchant' },
            unitPriceCents: 800,
          }),
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'later-in-fact',
        orderedAt: '2026-01-01T20:00:00Z',
        items: [
          line({
            name: 'Filter Papers v2',
            sku: { value: 'B00FILTER', scheme: 'merchant' },
            unitPriceCents: 900,
          }),
        ],
      })
    );
  }

  it('orders the two dates by the instant rather than the text', () => {
    twoOffsetOrders();

    const entry = only(rankProductPurchases(opened.db));

    expect(entry.firstPurchasedAt).toBe('2026-01-02T00:00:00+10:00');
    expect(entry.lastPurchasedAt).toBe('2026-01-01T20:00:00Z');
  });

  it('wears the label and the last price of the line that is genuinely latest', () => {
    twoOffsetOrders();

    const entry = only(rankProductPurchases(opened.db));

    expect(entry.product.name).toBe('Filter Papers v2');
    expect(entry.unitPrice.firstCents).toBe(800);
    expect(entry.unitPrice.lastCents).toBe(900);
  });

  it('measures the gap those two dates actually span', () => {
    twoOffsetOrders();

    expect(only(rankProductPurchases(opened.db)).cadence).toEqual({
      basis: 'intervals',
      medianIntervalSeconds: 6 * 3600,
      meanIntervalSeconds: 6 * 3600,
      shortestIntervalSeconds: 6 * 3600,
      longestIntervalSeconds: 6 * 3600,
    });
  });

  it('attributes the group to the merchant name the later order stated', () => {
    for (const [checksum, orderedAt, merchantEntityName] of [
      ['earlier-in-fact', '2026-01-02T00:00:00+10:00', 'Amazon AU'],
      ['later-in-fact', '2026-01-01T20:00:00Z', 'Amazon Australia'],
    ] as const) {
      createPurchase(
        opened.db,
        order({
          checksum,
          orderedAt,
          merchantEntityId: 'ent-1',
          merchantEntityName,
          items: [line({ name: 'Filter Papers', sku: { value: 'B00FILTER', scheme: 'merchant' } })],
        })
      );
    }

    expect(only(rankProductPurchases(opened.db)).merchants).toEqual([
      { resolution: 'entity', entityId: 'ent-1', name: 'Amazon Australia' },
    ]);
  });

  /**
   * `ordered_at` is a text column and nothing between the API schema and the
   * insert re-checks it, so a row whose timestamp does not parse is
   * reachable — and it arrives first here, which is the case that used to
   * pin both ends of the group to it permanently: an unreadable instant
   * loses every comparison it is offered, including the ones that would have
   * displaced it.
   */
  it('lets the orders it can read decide the ends, not the one it cannot', () => {
    for (const [checksum, orderedAt, unitPriceCents] of [
      ['unreadable', 'whenever', 500],
      ['first-readable', '2026-03-01T00:00:00Z', 600],
      ['last-readable', '2026-03-08T00:00:00Z', 700],
    ] as const) {
      createPurchase(
        opened.db,
        order({
          checksum,
          orderedAt,
          items: [
            line({
              name: `Filter Papers ${checksum}`,
              sku: { value: 'B00FILTER', scheme: 'merchant' },
              unitPriceCents,
            }),
          ],
        })
      );
    }

    const entry = only(rankProductPurchases(opened.db));

    expect(entry.firstPurchasedAt).toBe('2026-03-01T00:00:00Z');
    expect(entry.lastPurchasedAt).toBe('2026-03-08T00:00:00Z');
    expect(entry.unitPrice.firstCents).toBe(600);
    expect(entry.unitPrice.lastCents).toBe(700);
    expect(entry.product.name).toBe('Filter Papers last-readable');
    // Still three orders: the unreadable one was bought, and dropping it
    // from the count would understate the repeat purchase this route exists
    // to report. Only the gap between the two readable ones is measurable.
    expect(entry.orderCount).toBe(3);
    expect(entry.cadence).toEqual({
      basis: 'intervals',
      medianIntervalSeconds: 7 * 86400,
      meanIntervalSeconds: 7 * 86400,
      shortestIntervalSeconds: 7 * 86400,
      longestIntervalSeconds: 7 * 86400,
    });
  });
});

describe('unit price history', () => {
  function boughtAt(unitPriceCents: number, day: string, extra: Partial<CreateItemInput> = {}) {
    createPurchase(
      opened.db,
      order({
        checksum: `beans-${day}`,
        orderedAt: `2026-01-${day}T00:00:00Z`,
        items: [
          line({
            name: 'Coffee Beans',
            sku: { value: 'B00BEANS', scheme: 'merchant' },
            unitPriceCents,
            lineTotalCents: unitPriceCents,
            ...extra,
          }),
        ],
      })
    );
  }

  it('reports the ends and the extremes of the series rather than a drift figure', () => {
    boughtAt(1000, '01');
    boughtAt(600, '02');
    boughtAt(1400, '03');
    boughtAt(1200, '04');

    const { unitPrice } = only(rankProductPurchases(opened.db));

    expect(unitPrice.firstCents).toBe(1000);
    expect(unitPrice.lastCents).toBe(1200);
    // A first-to-last read alone says "up 20%". The extremes are what say
    // the two ends do not represent the series.
    expect(unitPrice.minCents).toBe(600);
    expect(unitPrice.maxCents).toBe(1400);
  });

  it('is the merchant price, not the landed cost, so a big basket does not look like a price rise', () => {
    boughtAt(1000, '01');
    boughtAt(1000, '02', { allocatedShippingCents: 4000, allocatedAdjustmentCents: 300 });

    const entry = only(rankProductPurchases(opened.db));

    // Allocated shipping is a share of an order-level figure spread over
    // that order's lines. Building the series on landed cost would report
    // this unchanged price as a 430% rise.
    expect(entry.unitPrice.firstCents).toBe(1000);
    expect(entry.unitPrice.lastCents).toBe(1000);
    expect(entry.unitPrice.maxCents).toBe(1000);
    // The landed cost still carries the allocation, which is its job.
    expect(entry.landedCostCents).toBe(1000 + 1000 + 4000 + 300);
  });

  it('splits the promotional marker three ways rather than reading silence as an ordinary price', () => {
    boughtAt(1000, '01', { promotionalPrice: false });
    boughtAt(600, '02', { promotionalPrice: true });
    boughtAt(1000, '03');

    const { unitPrice } = only(rankProductPurchases(opened.db));

    expect(unitPrice.promotionalLineCount).toBe(1);
    expect(unitPrice.ordinaryLineCount).toBe(1);
    // The line whose source said nothing. Folded into `ordinary` it would
    // assert a price the merchant never characterised.
    expect(unitPrice.unstatedPromotionLineCount).toBe(1);
  });

  it('counts the lines whose price is a weight, so a heavier bag is not read as a dearer one', () => {
    boughtAt(145, '01', { notes: ['0.500 kg NET @ $2.90/kg'] });
    boughtAt(348, '02', { notes: ['1.200 kg NET @ $2.90/kg'] });

    const { unitPrice, lineCount } = only(rankProductPurchases(opened.db));

    // Same price per kilo throughout; the series says +140% and only this
    // count says why.
    expect(unitPrice.firstCents).toBe(145);
    expect(unitPrice.lastCents).toBe(348);
    expect(unitPrice.measuredLineCount).toBe(2);
    expect(unitPrice.measuredLineCount).toBe(lineCount);
  });

  it('does not count a quantity note as a measure', () => {
    boughtAt(924, '01', { notes: ['Qty 2 @ $9.24 each', 'PRICE REDUCED BY $7.26 each'] });

    expect(only(rankProductPurchases(opened.db)).unitPrice.measuredLineCount).toBe(0);
  });

  it('counts a line carrying several notes once', () => {
    boughtAt(145, '01', { notes: ['0.500 kg NET @ $2.90/kg', 'PRICE REDUCED BY $0.20'] });

    const entry = only(rankProductPurchases(opened.db));

    // The note read is a separate query for exactly this reason: joined onto
    // the lines it would return this line twice and double every sum below.
    expect(entry.unitPrice.measuredLineCount).toBe(1);
    expect(entry.lineCount).toBe(1);
    expect(entry.landedCostCents).toBe(145);
  });

  it('leaves a line with no notes out of the measured count', () => {
    boughtAt(1000, '01');

    expect(only(rankProductPurchases(opened.db)).unitPrice.measuredLineCount).toBe(0);
  });
});
