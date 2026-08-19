/**
 * No ingest adapter classifies.
 *
 * `purchase_items.kind` and `purchase_item_tags` are POPS judgements about
 * what a thing *is*. No shipped source states either — the Amazon DSAR
 * bundle has 28 columns and none is a category, and a till receipt prints
 * product names, not taxonomies — so an adapter that emitted one would be
 * inferring, and an inference written into the operative column is
 * indistinguishable from a fact the merchant stated.
 *
 * That rule is a sentence in three docstrings and nothing else enforces it:
 * `purchase_item_tags` deliberately does not constrain its values, and
 * `kind`'s CHECK only polices the vocabulary. So this file runs every
 * shipped adapter over its own fixtures and asserts the columns come out
 * empty. It is the regression that catches the rule eroding, which is
 * exactly how the table filled up with promo prose the first time.
 *
 * The rule has one deliberate exception and it is not tested here because
 * no shipped source exercises it: an adapter MAY set `kind` where its
 * source states it outright. `Digital Content Orders.csv` will, and that is
 * transcription rather than inference. When that adapter lands this file
 * gains a case for it rather than a waiver.
 */
import { describe, expect, it } from 'vitest';

import { ORDER_HISTORY_CSV } from '../amazon/__tests__/__fixtures__/order-history.js';
import { parseAmazonOrderHistory } from '../amazon/order-history.js';
import { ExtractedReceiptSchema } from '../receipt/extraction.js';
import { gateExtraction } from '../receipt/gate.js';
import { receiptToPurchase } from '../receipt/purchase.js';
import { receiptUri } from '../receipt/store.js';
import { receiptPage } from '../woolworths/__tests__/fixtures.js';
import { mapReceipt } from '../woolworths/receipt.js';

import type { CreateItemInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';
import type { ReceiptPage } from '../woolworths/blocks.js';

function itemsOf(purchases: readonly CreatePurchaseInput[]): readonly CreateItemInput[] {
  return purchases.flatMap((purchase) => purchase.items ?? []);
}

function amazonItems(): readonly CreateItemInput[] {
  return itemsOf(parseAmazonOrderHistory(ORDER_HISTORY_CSV).orders);
}

function woolworthsItems(): readonly CreateItemInput[] {
  const mapped = mapReceipt('activity-1', receiptPage() as ReceiptPage);
  if (mapped === null) throw new Error('the Woolworths fixture stopped mapping');
  return mapped.purchase.items ?? [];
}

function receiptItems(): readonly CreateItemInput[] {
  const sha = 'a'.repeat(64);
  const extracted = ExtractedReceiptSchema.parse({
    merchantName: 'Bunnings Warehouse',
    purchasedOn: '2026-08-01',
    purchasedAt: '14:32',
    currency: 'AUD',
    total: '$27.50',
    tax: null,
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Screws Bugle 8g 65mm', amount: '$15.00', unitNote: '2 @ $7.50' },
    ],
  });
  const gate = gateExtraction(extracted);
  if (!gate.admissible) throw new Error('receipt fixture stopped reconciling');
  return (
    receiptToPurchase(
      extracted,
      gate,
      [
        {
          sha256: sha,
          path: `/data/receipts/aa/${sha}.jpg`,
          uri: receiptUri(sha),
          bytes: 1234,
          alreadyPresent: false,
        },
      ],
      { uploadedAt: '2026-08-06T23:11:00.000Z' }
    ).purchase.items ?? []
  );
}

const ADAPTERS: readonly (readonly [string, () => readonly CreateItemInput[]])[] = [
  ['amazon', amazonItems],
  ['woolworths', woolworthsItems],
  ['receipt', receiptItems],
];

describe.each(ADAPTERS)('the %s adapter', (name, items) => {
  it('produces lines to assert on at all', () => {
    // Without this the two assertions below pass vacuously the day a
    // fixture stops parsing, which is the failure mode of every "assert
    // nothing is present" test.
    expect(items().length, name).toBeGreaterThan(0);
  });

  it('states no item kind', () => {
    expect(
      items()
        .map((item) => item.kind)
        .filter((kind) => kind !== undefined)
    ).toEqual([]);
  });

  it('states no item tag', () => {
    expect(items().flatMap((item) => item.tags ?? [])).toEqual([]);
  });
});

describe('what the adapters do state instead', () => {
  it('keeps the Woolworths promo wording as an ordered note', () => {
    // The same information, in the column that describes what it is. This
    // is the half of the rule that would otherwise be untested: "writes no
    // tag" is also satisfied by throwing the evidence away.
    expect(woolworthsItems().flatMap((item) => item.notes ?? [])).toContain(
      'PRICE REDUCED BY $7.26 each'
    );
  });

  it("keeps the drop-zone's printed unit note", () => {
    expect(receiptItems().flatMap((item) => item.notes ?? [])).toEqual(['2 @ $7.50']);
  });

  it("keeps Amazon's product condition out of the category column", () => {
    const items = amazonItems();
    expect(items.map((item) => item.merchantCategory).filter((v) => v !== undefined)).toEqual([]);
    expect(items.some((item) => item.merchantCondition === 'New')).toBe(true);
  });
});
