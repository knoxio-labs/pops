import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, getPurchase } from '../index.js';
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

describe('charge payment hints', () => {
  it('inherits only when the charge omits its payment hint', () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 300,
        paymentHint: 'Visa - 7373',
        charges: [
          { sourceChargeRef: 'inherited', amountCents: 100 },
          { sourceChargeRef: 'cleared', amountCents: 100, paymentHint: null },
          { sourceChargeRef: 'overridden', amountCents: 100, paymentHint: 'Amex - 1001' },
        ],
      })
    );

    const chargeHints = getPurchase(opened.db, purchaseId)?.charges.map(
      ({ charge }) => charge.paymentHint
    );

    expect(chargeHints).toEqual(['Visa - 7373', null, 'Amex - 1001']);
  });
});
