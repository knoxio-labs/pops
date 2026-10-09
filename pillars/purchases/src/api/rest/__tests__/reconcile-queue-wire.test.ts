import { describe, expect, it } from 'vitest';

import { toWireReviewCandidate } from '../reconcile-queue-wire.js';

describe('toWireReviewCandidate', () => {
  it('omits Finance details for a malformed transaction URI', () => {
    const transactionUri = 'not-a-finance-transaction';

    expect(toWireReviewCandidate(transactionUri, new Map())).toEqual({
      transactionUri,
      description: null,
      date: null,
      payee: null,
      amountCents: null,
      settlementCurrency: null,
    });
  });

  it('omits Finance details when a valid transaction URI is not in the lookup', () => {
    const transactionUri = 'pops://finance/transaction/deleted-transaction';

    expect(toWireReviewCandidate(transactionUri, new Map())).toEqual({
      transactionUri,
      description: null,
      date: null,
      payee: null,
      amountCents: null,
      settlementCurrency: null,
    });
  });
});
