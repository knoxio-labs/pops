/**
 * The merchant spend roll-up, held to the standard a headline figure needs.
 *
 * The failures this file is written to catch are the ones an aggregate makes
 * silently. A wrong roll-up does not throw and does not look wrong: it
 * returns a plausible number that is too big because a join fanned out, or
 * too small because a bucket was dropped, and nothing downstream can tell.
 * So the assertions are mostly *agreement* assertions — the roll-up against
 * the per-order reads it claims to summarise — rather than restatements of
 * how the fold is written.
 *
 * `rollUpMerchantSpend` calls the same `computeAccounting` that
 * `getPurchase` does, so the corpus test below is not really checking the
 * split. It is checking that every order is folded in exactly once, which is
 * the part a second implementation in SQL would get wrong and the part a
 * refactor can silently break.
 */
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  getPurchase,
  listOrdersNeedingDerivedCharge,
  listPurchases,
  mintDerivedCharge,
  purchaseChargeLinks,
  purchaseCharges,
  rollUpMerchantSpend,
  upsertSource,
} from '../index.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type {
  CreateChargeInput,
  CreatePurchaseInput,
  CurrencySpend,
  MerchantSpendRollup,
  OpenedPurchasesDb,
  PurchaseAccounting,
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
});

afterEach(() => {
  cleanup();
});

const ZERO: PurchaseAccounting = {
  totalCents: 0,
  matchedCents: 0,
  awaitingImportCents: 0,
  residualCents: 0,
  refundedCents: 0,
  netSpendCents: 0,
};

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

function linkFirstCharge(purchaseId: string, uri: string): void {
  const charge = opened.db
    .select()
    .from(purchaseCharges)
    .where(eq(purchaseCharges.purchaseId, purchaseId))
    .orderBy(asc(purchaseCharges.position), asc(purchaseCharges.id))
    .all()[0];
  if (charge === undefined) throw new Error(`no charge on ${purchaseId}`);
  opened.db
    .insert(purchaseChargeLinks)
    .values({
      chargeId: charge.id,
      transactionUri: uri,
      amountCents: charge.amountCents,
      linkType: 'exact',
    })
    .run();
}

/**
 * Sum every order the same filter selects, read one at a time through
 * `getPurchase`.
 *
 * This is the roll-up's oracle: the numbers a consumer would get by paging
 * the index and summing client-side, which is exactly what POPS-241 would
 * otherwise have to do. If the aggregate and this disagree, one of them is
 * lying to a user.
 */
function foldEveryOrder(): { accounting: PurchaseAccounting; orderCount: number } {
  const rows = listPurchases(opened.db, { limit: 500 });
  let accounting = ZERO;
  for (const row of rows) {
    const detail = getPurchase(opened.db, row.id);
    if (detail === undefined) throw new Error(`purchase ${row.id} vanished`);
    const a = detail.accounting;
    accounting = {
      totalCents: accounting.totalCents + a.totalCents,
      matchedCents: accounting.matchedCents + a.matchedCents,
      awaitingImportCents: accounting.awaitingImportCents + a.awaitingImportCents,
      residualCents: accounting.residualCents + a.residualCents,
      refundedCents: accounting.refundedCents + a.refundedCents,
      netSpendCents: accounting.netSpendCents + a.netSpendCents,
    };
  }
  return { accounting, orderCount: rows.length };
}

function currencyTotal(rollup: MerchantSpendRollup, currency: string): CurrencySpend {
  const entry = rollup.totals.find((t) => t.currency === currency);
  if (entry === undefined) throw new Error(`no ${currency} total`);
  return entry;
}

describe('the roll-up agrees with the per-order split it summarises', () => {
  /**
   * A corpus wide enough that a fold bug shows up. Deliberately mixes the
   * shapes that break naive aggregates: several charges on one order, an
   * order with none at all, refunds, an authorization that must not count,
   * a gift-card residual, and two currencies.
   */
  function seedCorpus(): void {
    for (let i = 0; i < 40; i += 1) {
      const merchantEntityName = ['Amazon', 'Woolworths', 'Bunnings'][i % 3] ?? 'Amazon';
      const currency = i % 7 === 0 ? 'USD' : 'AUD';
      const totalCents = 1000 + i * 137;
      const charges: CreateChargeInput[] = [];

      if (i % 5 !== 0) {
        charges.push({ sourceChargeRef: `cap-${String(i)}`, amountCents: totalCents - (i % 400) });
      }
      if (i % 4 === 0) {
        charges.push({
          sourceChargeRef: `auth-${String(i)}`,
          amountCents: totalCents,
          role: 'authorization',
        });
      }
      if (i % 6 === 0) {
        charges.push({
          sourceChargeRef: `ref-${String(i)}`,
          amountCents: -(i % 300) - 1,
          role: 'refund',
        });
      }

      const id = createPurchase(
        opened.db,
        order({
          checksum: `corpus-${String(i)}`,
          merchantEntityName,
          merchantEntityId: i % 9 === 0 ? 'ent-amazon' : null,
          currency,
          totalCents,
          orderedAt: `2026-0${String((i % 9) + 1)}-02T01:41:21Z`,
          source: i % 2 === 0 ? 'amazon' : 'woolworths',
          charges,
        })
      );
      if (i % 3 === 0 && charges.length > 0) {
        linkFirstCharge(id, `pops://finance/transaction/t-${String(i)}`);
      }
    }
  }

  it('reproduces the sum of every order, field for field', () => {
    seedCorpus();
    const expected = foldEveryOrder();
    const rollup = rollUpMerchantSpend(opened.db);

    const summed = rollup.totals.reduce(
      (acc, entry) => ({
        totalCents: acc.totalCents + entry.accounting.totalCents,
        matchedCents: acc.matchedCents + entry.accounting.matchedCents,
        awaitingImportCents: acc.awaitingImportCents + entry.accounting.awaitingImportCents,
        residualCents: acc.residualCents + entry.accounting.residualCents,
        refundedCents: acc.refundedCents + entry.accounting.refundedCents,
        netSpendCents: acc.netSpendCents + entry.accounting.netSpendCents,
      }),
      ZERO
    );

    expect(summed).toEqual(expected.accounting);
  });

  it('counts every order exactly once, whatever hangs off it', () => {
    seedCorpus();
    const expected = foldEveryOrder();

    const rollup = rollUpMerchantSpend(opened.db);
    const counted = rollup.merchants.reduce((n, entry) => n + entry.orderCount, 0);
    const countedInTotals = rollup.totals.reduce((n, entry) => n + entry.orderCount, 0);

    expect(counted).toBe(expected.orderCount);
    expect(countedInTotals).toBe(expected.orderCount);
  });

  it('the merchant groups add back up to the currency totals', () => {
    seedCorpus();
    const rollup = rollUpMerchantSpend(opened.db);

    for (const total of rollup.totals) {
      const groups = rollup.merchants.filter((m) => m.currency === total.currency);
      const summed = groups.reduce((n, g) => n + g.accounting.netSpendCents, 0);
      expect(summed, total.currency).toBe(total.accounting.netSpendCents);
      expect(
        groups.reduce((n, g) => n + g.orderCount, 0),
        total.currency
      ).toBe(total.orderCount);
    }
  });

  it('the accounting identity survives summation, per group and per currency', () => {
    seedCorpus();
    const rollup = rollUpMerchantSpend(opened.db);

    for (const { accounting: a, currency } of [...rollup.merchants, ...rollup.totals]) {
      expect(a.matchedCents + a.awaitingImportCents + a.residualCents, currency).toBe(a.totalCents);
      expect(a.netSpendCents, currency).toBe(a.totalCents - a.refundedCents);
    }
  });
});

describe('an order is counted once however many rows hang off it', () => {
  it('does not multiply the total by its charges, or by their links', () => {
    // The fan-out that `SUM(purchases.total_cents)` over a charge join gets
    // wrong: this order appears three times once charges are joined and four
    // times once links are, so a database-side sum reports up to $400 of
    // spend where $100 happened.
    const id = createPurchase(
      opened.db,
      order({
        checksum: 'fanout',
        totalCents: 10_000,
        charges: [
          { sourceChargeRef: 'a', amountCents: 4000 },
          { sourceChargeRef: 'b', amountCents: 3000 },
          { sourceChargeRef: 'c', amountCents: 3000 },
        ],
      })
    );
    linkFirstCharge(id, 'pops://finance/transaction/one');
    linkFirstCharge(id, 'pops://finance/transaction/two');

    const rollup = rollUpMerchantSpend(opened.db);

    expect(rollup.merchants).toHaveLength(1);
    expect(rollup.merchants[0]?.orderCount).toBe(1);
    expect(rollup.merchants[0]?.accounting.totalCents).toBe(10_000);
    expect(rollup.merchants[0]?.accounting.netSpendCents).toBe(10_000);
    // The doubly-linked charge is matched once, not twice.
    expect(rollup.merchants[0]?.accounting.matchedCents).toBe(4000);
    expect(rollup.merchants[0]?.accounting.awaitingImportCents).toBe(6000);
  });
});

describe('the headline figure does not move when bookkeeping catches up', () => {
  it('survives a statement import: net spend is unchanged, only the buckets move', () => {
    // The property net spend was redefined to have. A merchant headline that
    // changed because a cron ran would be reporting import history rather
    // than spending, and the number would differ between two people looking
    // at the same year.
    const id = createPurchase(
      opened.db,
      order({
        checksum: 'import',
        totalCents: 5678,
        charges: [{ sourceChargeRef: 'cap', amountCents: 5678 }],
      })
    );

    const before = rollUpMerchantSpend(opened.db);
    linkFirstCharge(id, 'pops://finance/transaction/late');
    const after = rollUpMerchantSpend(opened.db);

    expect(after.totals[0]?.accounting.netSpendCents).toBe(
      before.totals[0]?.accounting.netSpendCents
    );
    expect(after.totals[0]?.accounting.totalCents).toBe(before.totals[0]?.accounting.totalCents);
    expect(before.totals[0]?.accounting.awaitingImportCents).toBe(5678);
    expect(after.totals[0]?.accounting.matchedCents).toBe(5678);
    expect(after.totals[0]?.accounting.awaitingImportCents).toBe(0);
  });

  it('survives a sweep minting derived charges across a whole merchant', () => {
    for (let i = 0; i < 6; i += 1) {
      createPurchase(
        opened.db,
        order({
          checksum: `mint-${String(i)}`,
          totalCents: 2000 + i,
          charges:
            i % 2 === 0
              ? []
              : [{ sourceChargeRef: `r-${String(i)}`, amountCents: -500, role: 'refund' }],
        })
      );
    }

    const before = rollUpMerchantSpend(opened.db);
    for (const pending of listOrdersNeedingDerivedCharge(opened.db)) {
      mintDerivedCharge(opened.db, pending);
    }
    const after = rollUpMerchantSpend(opened.db);

    expect(after.totals[0]?.accounting.netSpendCents).toBe(
      before.totals[0]?.accounting.netSpendCents
    );
    // Minting is what should move: the residual collapses into awaiting-import.
    expect(before.totals[0]?.accounting.residualCents).toBeGreaterThan(0);
    expect(after.totals[0]?.accounting.residualCents).toBe(0);
  });
});

describe('the unexplained bucket is returned, not left to a consumer', () => {
  it('reports the gift-card remainder as residual rather than folding it away', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'giftcard',
        totalCents: 10_000,
        // $30 paid on a gift card: no charge will ever exist for it.
        charges: [{ sourceChargeRef: 'card', amountCents: 7000 }],
      })
    );

    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants[0]?.accounting.residualCents).toBe(3000);
    // And it is still counted as spend — that money left the household.
    expect(rollup.merchants[0]?.accounting.netSpendCents).toBe(10_000);
  });

  it('surfaces an over-refund as a negative figure rather than clamping it', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'overrefund',
        totalCents: 1000,
        charges: [
          { sourceChargeRef: 'cap', amountCents: 1000 },
          { sourceChargeRef: 'ref', amountCents: -2500, role: 'refund' },
        ],
      })
    );

    const rollup = rollUpMerchantSpend(opened.db);
    // A merchant who refunded more than the order cost is a real event worth
    // seeing. Clamping at zero would hide a genuine bookkeeping error behind
    // a plausible headline (ADR-042).
    expect(rollup.merchants[0]?.accounting.netSpendCents).toBe(-1500);
    expect(rollup.totals[0]?.accounting.netSpendCents).toBe(-1500);
  });

  it('does not let one merchant’s over-refund silently erase another’s spend', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'refunder',
        merchantEntityName: 'Refunder',
        totalCents: 1000,
        charges: [{ sourceChargeRef: 'r', amountCents: -5000, role: 'refund' }],
      })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'spender', merchantEntityName: 'Spender', totalCents: 9000 })
    );

    const rollup = rollUpMerchantSpend(opened.db);
    const spender = rollup.merchants.find((m) => m.merchant.name === 'Spender');
    const refunder = rollup.merchants.find((m) => m.merchant.name === 'Refunder');

    expect(spender?.accounting.netSpendCents).toBe(9000);
    expect(refunder?.accounting.netSpendCents).toBe(-4000);
    // The currency total nets them, which is correct, but each merchant's own
    // figure stays its own.
    expect(currencyTotal(rollup, 'AUD').accounting.netSpendCents).toBe(5000);
  });
});

describe('currencies are grouped, never added together', () => {
  it('keeps an AUD order and a USD order in separate groups and separate totals', () => {
    createPurchase(
      opened.db,
      order({ checksum: 'aud', currency: 'AUD', totalCents: 1000, merchantEntityName: 'Amazon' })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'usd', currency: 'USD', totalCents: 2000, merchantEntityName: 'Amazon' })
    );

    const rollup = rollUpMerchantSpend(opened.db);

    // One merchant, two currencies, two rows. Summing 1000 AUD cents and
    // 2000 USD cents into 3000 of nothing is the failure this prevents.
    expect(rollup.merchants).toHaveLength(2);
    expect(rollup.totals.map((t) => t.currency)).toEqual(['AUD', 'USD']);
    expect(currencyTotal(rollup, 'AUD').accounting.totalCents).toBe(1000);
    expect(currencyTotal(rollup, 'USD').accounting.totalCents).toBe(2000);
  });
});

describe('merchant attribution is reported at the confidence it actually has', () => {
  it('separates a resolved entity, a name-only merchant, and an unattributed order', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'resolved',
        merchantEntityId: 'ent-bunnings',
        merchantEntityName: 'Bunnings Warehouse',
        totalCents: 100,
      })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'named', merchantEntityName: 'Amazon', totalCents: 200 })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'anon', merchantEntityName: null, totalCents: 300 })
    );

    const rollup = rollUpMerchantSpend(opened.db);
    const byResolution = new Map(rollup.merchants.map((m) => [m.merchant.resolution, m]));

    expect(byResolution.get('entity')?.merchant.entityId).toBe('ent-bunnings');
    expect(byResolution.get('name')?.merchant.name).toBe('Amazon');
    expect(byResolution.get('unattributed')?.accounting.totalCents).toBe(300);
    // The order naming no merchant is in the roll-up, not quietly missing
    // from it: 100 + 200 + 300.
    expect(currencyTotal(rollup, 'AUD').accounting.totalCents).toBe(600);
    expect(currencyTotal(rollup, 'AUD').orderCount).toBe(3);
  });

  it('does not merge a name-keyed group into an entity-keyed one', () => {
    // Half of a merchant's orders resolved and half not is the normal state
    // while entity resolution is only wired for receipts. Folding them
    // together would claim an identity for orders that have none.
    createPurchase(
      opened.db,
      order({
        checksum: 'with-id',
        merchantEntityId: 'ent-amazon',
        merchantEntityName: 'Amazon',
        totalCents: 100,
      })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'without-id', merchantEntityName: 'Amazon', totalCents: 200 })
    );

    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants).toHaveLength(2);
    expect(rollup.merchants.map((m) => m.merchant.resolution).toSorted()).toEqual([
      'entity',
      'name',
    ]);
  });

  it('labels an entity group from its most recent order, so a rename does not split it', () => {
    createPurchase(
      opened.db,
      order({
        checksum: 'old-name',
        merchantEntityId: 'ent-1',
        merchantEntityName: 'Bunnings',
        orderedAt: '2026-01-02T01:41:21Z',
        totalCents: 100,
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'new-name',
        merchantEntityId: 'ent-1',
        merchantEntityName: 'Bunnings Warehouse',
        orderedAt: '2026-03-02T01:41:21Z',
        totalCents: 200,
      })
    );

    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants).toHaveLength(1);
    expect(rollup.merchants[0]?.merchant.name).toBe('Bunnings Warehouse');
    expect(rollup.merchants[0]?.accounting.totalCents).toBe(300);
  });
});

describe('the roll-up covers exactly the orders the index covers', () => {
  function seedAcrossTime(): void {
    const stamps = [
      '2025-12-31T23:59:59Z',
      '2026-01-01T00:00:00Z',
      '2026-06-30T12:00:00Z',
      '2026-12-31T23:59:59Z',
    ];
    for (const [i, orderedAt] of stamps.entries()) {
      createPurchase(
        opened.db,
        order({
          checksum: `t-${String(i)}`,
          orderedAt,
          totalCents: 1000,
          source: i % 2 === 0 ? 'amazon' : 'woolworths',
        })
      );
    }
  }

  it('honours the period bounds inclusively, matching listPurchases', () => {
    seedAcrossTime();
    const filter = { from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z' };

    const indexed = listPurchases(opened.db, { ...filter, limit: 500 });
    const rollup = rollUpMerchantSpend(opened.db, filter);

    expect(rollup.totals[0]?.orderCount).toBe(indexed.length);
    expect(rollup.totals[0]?.orderCount).toBe(3);
    expect(rollup.totals[0]?.accounting.totalCents).toBe(3000);
  });

  it('honours a source filter, matching listPurchases', () => {
    seedAcrossTime();
    const filter = { sources: ['woolworths'] };

    const indexed = listPurchases(opened.db, { ...filter, limit: 500 });
    const rollup = rollUpMerchantSpend(opened.db, filter);

    expect(rollup.totals[0]?.orderCount).toBe(indexed.length);
    expect(rollup.totals[0]?.orderCount).toBe(2);
  });

  it('returns empty rather than throwing when nothing is in scope', () => {
    seedAcrossTime();
    const rollup = rollUpMerchantSpend(opened.db, { from: '2030-01-01T00:00:00Z' });
    expect(rollup).toEqual({ merchants: [], totals: [] });
  });

  it('lets an out-of-period order contribute nothing at all, not even its charges', () => {
    // A fold driven by the charge rows rather than by the orders would carry
    // last year's charges into this year's buckets, leaving a merchant whose
    // figures do not add up to its own total.
    createPurchase(
      opened.db,
      order({
        checksum: 'in',
        orderedAt: '2026-06-01T00:00:00Z',
        totalCents: 1000,
        charges: [{ sourceChargeRef: 'in-cap', amountCents: 1000 }],
      })
    );
    createPurchase(
      opened.db,
      order({
        checksum: 'out',
        orderedAt: '2025-06-01T00:00:00Z',
        totalCents: 9999,
        charges: [{ sourceChargeRef: 'out-cap', amountCents: 9999 }],
      })
    );

    const rollup = rollUpMerchantSpend(opened.db, { from: '2026-01-01T00:00:00Z' });
    const a = currencyTotal(rollup, 'AUD').accounting;
    expect(a.totalCents).toBe(1000);
    expect(a.awaitingImportCents).toBe(1000);
    expect(a.matchedCents + a.awaitingImportCents + a.residualCents).toBe(a.totalCents);
  });
});

describe('ordering is deterministic', () => {
  it('ranks by net spend within a currency, currencies ascending', () => {
    createPurchase(
      opened.db,
      order({ checksum: 'small', merchantEntityName: 'Small', totalCents: 100 })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'big', merchantEntityName: 'Big', totalCents: 900 })
    );
    createPurchase(
      opened.db,
      order({ checksum: 'usd', merchantEntityName: 'Dollarshop', currency: 'USD', totalCents: 500 })
    );

    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants.map((m) => m.merchant.name)).toEqual(['Big', 'Small', 'Dollarshop']);
  });

  it('produces the same serialisation on a repeated call', () => {
    for (let i = 0; i < 12; i += 1) {
      createPurchase(
        opened.db,
        order({
          checksum: `stable-${String(i)}`,
          // Deliberately identical totals, so ordering rests on the tie-break
          // rather than on the money.
          totalCents: 1000,
          merchantEntityName: `M${String(i % 4)}`,
        })
      );
    }

    expect(JSON.stringify(rollUpMerchantSpend(opened.db))).toBe(
      JSON.stringify(rollUpMerchantSpend(opened.db))
    );
  });
});
