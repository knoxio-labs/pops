/**
 * The path from a merchant roll-up row back to the orders behind it.
 *
 * A merchant row is where a reader forms the question the order detail page
 * answers — "$151.20 of this is unexplained, which orders" — so the roll-up
 * and the order index have to agree about what "this merchant" selects. The
 * failure mode is not an exception: a filter that widens returns *more*
 * orders, plausibly, and a reader has no way to tell that two of the twelve
 * belong to a different merchant that happens to share a label.
 *
 * So the assertions here are partition assertions. Every group the roll-up
 * emits is opened, and the ids that come back must be exactly that group's
 * orders — which forces the union over all groups to be every order in scope
 * exactly once, and makes both widening and narrowing detectable.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, listPurchases, rollUpMerchantSpend, upsertSource } from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { MerchantFilter } from '../../contract/merchant-filter.js';
import type {
  CreatePurchaseInput,
  MerchantIdentity,
  OpenedPurchasesDb,
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
});

afterEach(() => {
  cleanup();
});

/**
 * The navigation step under test: the filter a roll-up row denotes.
 *
 * Written out rather than imported so the test states the mapping it is
 * asserting. A consumer that got this wrong — matching a label group on its
 * label alone, say — is exactly what the partition assertions catch.
 */
function filterFor(identity: MerchantIdentity): MerchantFilter {
  switch (identity.resolution) {
    case 'entity':
      return { resolution: 'entity', entityId: identity.entityId };
    case 'name':
      return { resolution: 'name', name: identity.name };
    case 'unattributed':
      return { resolution: 'unattributed' };
  }
}

let nextOrder = 0;

/**
 * `uq_purchases_source_order` and the checksum's own uniqueness both bite
 * here, so every order minted for this file gets its own pair.
 */
function order(overrides: Partial<CreatePurchaseInput>): CreatePurchaseInput {
  nextOrder += 1;
  return amazonOrder({
    checksum: `merchant-filter-${nextOrder}`,
    sourceOrderId: `order-${nextOrder}`,
    ...overrides,
  });
}

function insert(db: PurchasesDb, overrides: Partial<CreatePurchaseInput>): string {
  return createPurchase(db, order(overrides));
}

/**
 * The arrangement every test below reads.
 *
 * `Woolworths` is deliberately spelled three ways at once: as a resolved
 * entity, as a bare label on orders that resolved to nothing, and as the
 * label on a *different* entity. That is the collision a label filter widens
 * across, and no smaller corpus contains it.
 */
function seedCollidingMerchants(db: PurchasesDb): {
  resolvedWoolworths: string[];
  labelWoolworths: string[];
  rivalEntity: string[];
  unattributed: string[];
  usd: string[];
} {
  return {
    resolvedWoolworths: [
      insert(db, { merchantEntityId: 'ent-woolies', merchantEntityName: 'Woolworths' }),
      // Carries the id and no label: the entity group must still hold it.
      insert(db, { merchantEntityId: 'ent-woolies', merchantEntityName: null }),
    ],
    labelWoolworths: [
      insert(db, { merchantEntityId: null, merchantEntityName: 'Woolworths' }),
      insert(db, { merchantEntityId: null, merchantEntityName: 'Woolworths' }),
    ],
    rivalEntity: [insert(db, { merchantEntityId: 'ent-rival', merchantEntityName: 'Woolworths' })],
    unattributed: [insert(db, { merchantEntityId: null, merchantEntityName: null })],
    usd: [
      insert(db, {
        merchantEntityId: null,
        merchantEntityName: 'Woolworths',
        currency: 'USD',
        totalCents: 900,
      }),
    ],
  };
}

function idsOf(db: PurchasesDb, merchant: MerchantFilter, currency?: string): string[] {
  return listPurchases(db, { merchant, currency, limit: 500 })
    .map((row) => row.id)
    .sort();
}

describe('opening one merchant group', () => {
  it('gives an entity group its own orders, including the one that states no label', () => {
    const seeded = seedCollidingMerchants(opened.db);

    expect(idsOf(opened.db, { resolution: 'entity', entityId: 'ent-woolies' })).toEqual(
      [...seeded.resolvedWoolworths].sort()
    );
  });

  it('gives a label group only the orders that resolved to no entity at all', () => {
    const seeded = seedCollidingMerchants(opened.db);

    const labelGroup = idsOf(opened.db, { resolution: 'name', name: 'Woolworths' }, 'AUD');

    expect(labelGroup).toEqual([...seeded.labelWoolworths].sort());
    // Two other orders in the corpus wear the same label under an entity. A
    // filter matching the label alone would return them too and read as
    // correct — the count would simply be larger than the row claimed.
    expect(labelGroup).not.toContain(seeded.resolvedWoolworths[0]);
    expect(labelGroup).not.toContain(seeded.rivalEntity[0]);
  });

  it('gives the unattributed bucket only the orders naming no merchant', () => {
    const seeded = seedCollidingMerchants(opened.db);

    expect(idsOf(opened.db, { resolution: 'unattributed' })).toEqual(seeded.unattributed);
  });

  it('separates the currencies a merchant bills in, because the roll-up rows do', () => {
    const seeded = seedCollidingMerchants(opened.db);
    const label: MerchantFilter = { resolution: 'name', name: 'Woolworths' };

    expect(idsOf(opened.db, label, 'USD')).toEqual(seeded.usd);
    expect(idsOf(opened.db, label, 'AUD')).toEqual([...seeded.labelWoolworths].sort());
  });
});

describe('every roll-up row, opened', () => {
  it('reaches exactly the orders it counted, and nobody else', () => {
    seedCollidingMerchants(opened.db);

    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants.length).toBeGreaterThan(1);

    for (const group of rollup.merchants) {
      const rows = listPurchases(opened.db, {
        merchant: filterFor(group.merchant),
        currency: group.currency,
        limit: 500,
      });

      expect(rows).toHaveLength(group.orderCount);
      expect(rows.every((row) => row.currency === group.currency)).toBe(true);
    }
  });

  it('partitions the corpus: every order in exactly one group', () => {
    seedCollidingMerchants(opened.db);

    const everyOrder = listPurchases(opened.db, { limit: 500 }).map((row) => row.id);
    const reached = rollUpMerchantSpend(opened.db).merchants.flatMap((group) =>
      listPurchases(opened.db, {
        merchant: filterFor(group.merchant),
        currency: group.currency,
        limit: 500,
      }).map((row) => row.id)
    );

    // Sorted arrays rather than sets on both sides: a set would hide a
    // duplicate, which is precisely what a widened filter produces.
    expect([...reached].sort()).toEqual([...everyOrder].sort());
  });

  it('agrees with the roll-up on what a filtered roll-up covers', () => {
    seedCollidingMerchants(opened.db);

    for (const group of rollUpMerchantSpend(opened.db).merchants) {
      const scoped = rollUpMerchantSpend(opened.db, {
        merchant: filterFor(group.merchant),
        currency: group.currency,
      });

      expect(scoped.merchants).toEqual([group]);
    }
  });
});

describe('the period a merchant row was read over', () => {
  it('carries through to the orders the row opens', () => {
    const inWindow = insert(opened.db, {
      merchantEntityId: null,
      merchantEntityName: 'Bunnings',
      orderedAt: '2026-03-04T05:06:07Z',
    });
    insert(opened.db, {
      merchantEntityId: null,
      merchantEntityName: 'Bunnings',
      orderedAt: '2025-03-04T05:06:07Z',
    });

    const rows = listPurchases(opened.db, {
      merchant: { resolution: 'name', name: 'Bunnings' },
      from: '2026-01-01T00:00:00.000000000Z',
      to: '2026-12-31T23:59:59Z',
      limit: 500,
    });

    expect(rows.map((row) => row.id)).toEqual([inWindow]);
  });
});
