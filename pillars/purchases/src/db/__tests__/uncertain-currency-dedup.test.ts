/**
 * Re-upload dedup when nobody transcribed the currency.
 *
 * A receipt that does not print its currency gets one inferred from the
 * address, and that inference depends on how legibly THIS photograph read.
 * Two shots of the same paper can resolve `BRL` and `XXX`, so comparing the
 * values would miss the re-upload and write the spend twice.
 *
 * Comparing nothing is the opposite failure: an unrelated receipt that DID
 * state its currency, at the same stated minute for the same cents, would be
 * refused as a duplicate of one that did not. So an untranscribed upload is
 * matched only against the rows that are equally untranscribed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, findPurchaseAtInstantForAmount } from '../index.js';
import { openTempDb, seedWoolworthsSource } from './helpers.js';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../index.js';

const UNCERTAIN = 'currency-uncertain';
const INSTANT = '2026-11-02T11:00:00Z';
const CENTS = 12890;

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedWoolworthsSource(opened);
});

afterEach(() => {
  cleanup();
});

function receipt(
  checksum: string,
  currency: string,
  tags?: readonly string[]
): CreatePurchaseInput {
  return {
    source: 'woolworths',
    ingestMethod: 'upload',
    orderedAt: INSTANT,
    currency,
    totalCents: CENTS,
    checksum,
    charges: [{ sourceChargeRef: `${checksum}-c`, amountCents: CENTS, role: 'capture' }],
    ...(tags === undefined ? {} : { tags: [...tags] }),
  };
}

describe('findPurchaseAtInstantForAmount — untranscribed currency', () => {
  it('matches a second photograph that resolved a different currency', () => {
    // The failure this exists to catch: one shot reads the address and
    // resolves BRL, a blurrier one falls through to XXX. Same paper.
    createPurchase(opened.db, receipt('clear-shot', 'BRL', [UNCERTAIN]));

    const found = findPurchaseAtInstantForAmount(opened.db, {
      source: 'woolworths',
      orderedAt: INSTANT,
      totalCents: CENTS,
      currency: 'XXX',
      uncertainCurrencyTag: UNCERTAIN,
    });

    expect(found?.checksum).toBe('clear-shot');
  });

  it('does not match a purchase whose currency was actually stated', () => {
    // A shop that printed BRL is not the same shop as one that printed
    // nothing, however well the cents and the minute line up. Refusing the
    // upload would lose a real purchase.
    createPurchase(opened.db, receipt('printed-its-currency', 'BRL'));

    const found = findPurchaseAtInstantForAmount(opened.db, {
      source: 'woolworths',
      orderedAt: INSTANT,
      totalCents: CENTS,
      currency: 'XXX',
      uncertainCurrencyTag: UNCERTAIN,
    });

    expect(found).toBeUndefined();
  });

  it('a stated-currency upload still matches only its own currency', () => {
    createPurchase(opened.db, receipt('brl-row', 'BRL'));

    const sameCurrency = findPurchaseAtInstantForAmount(opened.db, {
      source: 'woolworths',
      orderedAt: INSTANT,
      totalCents: CENTS,
      currency: 'BRL',
      uncertainCurrencyTag: null,
    });
    expect(sameCurrency?.checksum).toBe('brl-row');

    // 12890 is R$128,90 and ¥12890, and a traveller can hold both.
    const otherCurrency = findPurchaseAtInstantForAmount(opened.db, {
      source: 'woolworths',
      orderedAt: INSTANT,
      totalCents: CENTS,
      currency: 'JPY',
      uncertainCurrencyTag: null,
    });
    expect(otherCurrency).toBeUndefined();
  });
});
