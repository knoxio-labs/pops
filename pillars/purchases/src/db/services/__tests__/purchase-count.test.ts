/**
 * `countPurchases` must answer for the whole scope, never a page of it — the
 * property `listPurchases(...).length` cannot stand in for once the scope
 * outgrows the default page size.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../__tests__/helpers.js';
import { countPurchases, createPurchase, listPurchases, setPurchaseStatus } from '../../index.js';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

let nextOrder = 0;

function order(overrides: Partial<CreatePurchaseInput>): CreatePurchaseInput {
  nextOrder += 1;
  return amazonOrder({
    checksum: `purchase-reads-${nextOrder}`,
    sourceOrderId: `order-${nextOrder}`,
    ...overrides,
  });
}

describe('countPurchases', () => {
  it('counts every row in scope with no filter', () => {
    createPurchase(opened.db, order({}));
    createPurchase(opened.db, order({}));
    createPurchase(opened.db, order({}));

    expect(countPurchases(opened.db)).toBe(3);
  });

  it('counts the whole filtered scope, not a page of it', () => {
    const total = 105;
    for (let i = 0; i < total; i += 1) {
      createPurchase(opened.db, order({}));
    }
    for (let i = 0; i < 4; i += 1) {
      const id = createPurchase(opened.db, order({}));
      setPurchaseStatus(opened.db, id, 'ignored');
    }

    expect(countPurchases(opened.db, { statuses: ['awaiting_settlement'] })).toBe(total);
    expect(listPurchases(opened.db, { statuses: ['awaiting_settlement'] }).length).toBeLessThan(
      total
    );
    expect(listPurchases(opened.db, { statuses: ['awaiting_settlement'], limit: 2 }).length).toBe(
      2
    );
  });
});
