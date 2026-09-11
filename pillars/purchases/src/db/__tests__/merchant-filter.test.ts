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
import { normalizeMerchantLabel, MERCHANT_LABEL_PADDING } from '../services/merchant-identity.js';
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

describe('a stored label with no usable content (POPS-2342)', () => {
  it('folds an empty-string merchantEntityName into the unattributed bucket, and it opens', () => {
    const id = insert(opened.db, { merchantEntityId: null, merchantEntityName: '' });

    expect(idsOf(opened.db, { resolution: 'unattributed' })).toEqual([id]);
    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants).toHaveLength(1);
    expect(rollup.merchants[0]?.merchant).toEqual({
      resolution: 'unattributed',
      entityId: null,
      name: null,
    });
  });

  it('folds a whitespace-only merchantEntityName into the same bucket', () => {
    const id = insert(opened.db, { merchantEntityId: null, merchantEntityName: '   ' });

    expect(idsOf(opened.db, { resolution: 'unattributed' })).toEqual([id]);
  });

  it('folds a pre-existing row stored with an empty label directly, no migration needed', () => {
    // Simulates a row written before this fold existed — the write path
    // normalises on the way in now, but a row already sitting in the
    // database with '' must still be reachable without a backfill.
    opened.raw
      .prepare(
        `INSERT INTO purchases
           (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum, merchant_entity_name)
         VALUES ('pre-existing', 'amazon', 'pre-existing-order', 'export', '2026-02-02T01:41:21Z', 'AUD', 100, 'pre-existing-checksum', '')`
      )
      .run();

    expect(idsOf(opened.db, { resolution: 'unattributed' })).toEqual(['pre-existing']);
  });

  it('still groups a real name under its name, and it still opens', () => {
    const id = insert(opened.db, { merchantEntityId: null, merchantEntityName: 'Costco' });

    expect(idsOf(opened.db, { resolution: 'name', name: 'Costco' })).toEqual([id]);
    expect(idsOf(opened.db, { resolution: 'unattributed' })).not.toContain(id);
  });
});

describe('padded and whitespace-set legacy labels (POPS-2342)', () => {
  /**
   * A row written before this fold existed, inserted with a bound
   * parameter rather than string-built SQL so a tab or NBSP survives the
   * round trip byte for byte.
   */
  function insertLegacy(id: string, label: string | null): void {
    opened.raw
      .prepare(
        `INSERT INTO purchases
           (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum, merchant_entity_name)
         VALUES (?, 'amazon', ?, 'export', '2026-02-02T01:41:21Z', 'AUD', 100, ?, ?)`
      )
      .run(id, `${id}-order`, `${id}-checksum`, label);
  }

  it('rolls a legacy trailing-space label up under the trimmed name, and the name filter opens it', () => {
    insertLegacy('padded-trailing-space', 'Amazon ');

    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants).toHaveLength(1);
    expect(rollup.merchants[0]?.merchant).toEqual({
      resolution: 'name',
      entityId: null,
      name: 'Amazon',
    });

    expect(idsOf(opened.db, { resolution: 'name', name: 'Amazon' })).toEqual([
      'padded-trailing-space',
    ]);
  });

  it('rolls a legacy leading-tab label up under the trimmed name, and the name filter opens it', () => {
    insertLegacy('padded-leading-tab', '\tAmazon');

    const rollup = rollUpMerchantSpend(opened.db);
    expect(rollup.merchants[0]?.merchant).toEqual({
      resolution: 'name',
      entityId: null,
      name: 'Amazon',
    });
    expect(idsOf(opened.db, { resolution: 'name', name: 'Amazon' })).toEqual([
      'padded-leading-tab',
    ]);
  });

  it('folds a lone-tab label into the unattributed bucket, and it opens', () => {
    insertLegacy('lone-tab', '\t');

    expect(idsOf(opened.db, { resolution: 'unattributed' })).toEqual(['lone-tab']);
  });

  it('folds a lone-NBSP label into the unattributed bucket, and it opens', () => {
    insertLegacy('lone-nbsp', '\u00a0');

    expect(idsOf(opened.db, { resolution: 'unattributed' })).toEqual(['lone-nbsp']);
  });

  /**
   * For every character {@link MERCHANT_LABEL_PADDING} names, TS
   * `normalizeMerchantLabel` and SQLite's own two-argument `trim(X, Y)` must
   * agree on blank-vs-not for a lone occurrence, and on the trimmed value
   * for a padded name. Run directly against a real SQLite connection
   * (`opened.raw`) rather than asserted from documentation, because the
   * two-argument form's Unicode handling is exactly the thing a mismatch
   * would hide in.
   */
  it('agrees with SQLite trim(X, Y), character by character, on every padding character', () => {
    const trimSql = opened.raw.prepare('select trim(?, ?) as t').pluck();

    for (const char of MERCHANT_LABEL_PADDING) {
      expect(normalizeMerchantLabel(char)).toBeNull();
      expect(trimSql.get(char, MERCHANT_LABEL_PADDING)).toBe('');

      const padded = `${char}Amazon${char}`;
      expect(normalizeMerchantLabel(padded)).toBe('Amazon');
      expect(trimSql.get(padded, MERCHANT_LABEL_PADDING)).toBe('Amazon');
    }
  });

  it('still groups a real name unaffected by padding characters it does not contain', () => {
    const id = insert(opened.db, { merchantEntityId: null, merchantEntityName: 'Bunnings' });

    expect(idsOf(opened.db, { resolution: 'name', name: 'Bunnings' })).toEqual([id]);
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
