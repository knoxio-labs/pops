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
          items: [line({ name: 'Magnetic Dosing Funnel', sku: 'B0FCSJTKJ8' })],
        })
      );
    }

    const entry = only(rankProductPurchases(opened.db));

    expect(entry.product).toEqual({
      basis: 'sku',
      source: 'amazon',
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
          line({ name: 'Magnetic Dosing Funnel', sku: 'B0FCSJTKJ8' }),
          line({ name: 'Magnetic Dosing Funnel', sku: 'B0FCSJTKJ8' }),
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
          line({ name: 'Pods', sku: 'B01', quantity: 6, unitPriceCents: 100, lineTotalCents: 600 }),
        ],
      })
    );

    const entry = only(rankProductPurchases(opened.db));
    expect(entry.unitCount).toBe(6);
    expect(entry.orderCount).toBe(1);
    expect(entry.lineCount).toBe(1);
  });

  it('never merges the same sku string across two sources', () => {
    createPurchase(
      opened.db,
      order({ checksum: 'am', items: [line({ name: 'Barware Set', sku: '6015322' })] })
    );
    createPurchase(
      opened.db,
      receiptOrder({
        checksum: 'wo',
        items: [line({ name: 'Barware Set', sku: '6015322' })],
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
      order({ checksum: 'aud', items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8' })] })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'usd',
        currency: 'USD',
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8' })],
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
            sku: 'B0FCSJTKJ8',
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
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8', lineTotalCents: 1179 })],
      })
    );
    const partly = createPurchase(
      opened.db,
      order({
        checksum: 'kept',
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8', lineTotalCents: 1179 })],
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
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8', lineTotalCents: 6000 })],
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
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8' })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'anon',
        merchantEntityName: null,
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8' })],
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
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8' })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'new',
        orderedAt: '2026-02-02T01:41:21Z',
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8' })],
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
        items: [line({ name: 'Funnel', sku: 'REPEAT' }), line({ name: 'Tamper', sku: 'ONCE' })],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'b',
        orderedAt: '2026-02-04T00:00:00Z',
        items: [line({ name: 'Funnel', sku: 'REPEAT' })],
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
      nameKeyedLines: 0,
      unidentifiedLines: 0,
      productCount: 2,
    });
  });

  it('withholds nothing by default', () => {
    createPurchase(
      opened.db,
      order({ checksum: 'a', items: [line({ name: 'Tamper', sku: 'ONCE' })] })
    );

    expect(rankProductPurchases(opened.db).products).toHaveLength(1);
  });

  it('accounts for every line in scope exactly once across the three bases', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'mixed',
        items: [line({ name: 'Funnel', sku: 'B0FCSJTKJ8' }), line({ name: 'Tamper' })],
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
    expect(coverage.skuKeyedLines + coverage.nameKeyedLines + coverage.unidentifiedLines).toBe(
      coverage.lineCount
    );
    expect(coverage).toMatchObject({ skuKeyedLines: 1, nameKeyedLines: 2, unidentifiedLines: 1 });
  });

  it('returns an empty leaderboard, not a shape a consumer has to special-case', () => {
    expect(rankProductPurchases(opened.db)).toEqual({
      products: [],
      coverage: {
        lineCount: 0,
        skuKeyedLines: 0,
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
          line({ name: 'Twice cheap', sku: 'TWICE-CHEAP', lineTotalCents: 100 }),
          line({ name: 'Twice dear', sku: 'TWICE-DEAR', lineTotalCents: 9000 }),
          line({ name: 'Once', sku: 'ONCE', lineTotalCents: 50_000 }),
        ],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'b',
        orderedAt: '2026-02-04T00:00:00Z',
        items: [
          line({ name: 'Twice cheap', sku: 'TWICE-CHEAP', lineTotalCents: 100 }),
          line({ name: 'Twice dear', sku: 'TWICE-DEAR', lineTotalCents: 9000 }),
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
        items: [line({ name: 'Dear in USD', sku: 'USD-1', lineTotalCents: 90_000 })],
      })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'aud', items: [line({ name: 'Cheap in AUD', sku: 'AUD-1' })] })
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
          line({ name: 'Funnel', sku: 'B0FCSJTKJ8', lineTotalCents: 1179 }),
          line({ name: 'Tamper', sku: 'B0DSVZQ8P5', lineTotalCents: 4499 }),
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
            sku: 'B0FCSJTKJ8',
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
