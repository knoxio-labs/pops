import { describe, expect, it } from 'vitest';

import { ExtractedReceiptSchema } from '../extraction.js';
import { gateExtraction } from '../gate.js';
import { receiptToPurchase, RECEIPT_SOURCE_ID } from '../purchase.js';
import { receiptUri } from '../store.js';

import type { ExtractedReceipt } from '../extraction.js';
import type { StoredReceipt } from '../store.js';

const SHA = 'a'.repeat(64);
const STORED: StoredReceipt = {
  sha256: SHA,
  path: `/data/receipts/aa/${SHA}.jpg`,
  uri: receiptUri(SHA),
  bytes: 1234,
  alreadyPresent: false,
};

const receipt = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt =>
  ExtractedReceiptSchema.parse({
    merchantName: 'Bunnings Warehouse',
    purchasedOn: '2026-08-01',
    purchasedAt: '14:32',
    currency: 'AUD',
    total: '$27.50',
    tax: null,
    discounts: [],
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
    ],
    unreadable: [],
    ...over,
  });

const map = (over: Partial<ExtractedReceipt> = {}, stored = STORED) => {
  const extracted = receipt(over);
  return receiptToPurchase(extracted, gateExtraction(extracted), stored);
};

const mapped = (over: Partial<ExtractedReceipt> = {}) => {
  const result = map(over);
  if (result.kind !== 'mapped') throw new Error(`expected mapped, got ${result.kind}`);
  return result.purchase;
};

describe('an admitted reading', () => {
  it('becomes an uploaded purchase with one charge for the whole receipt', () => {
    const purchase = mapped();
    expect(purchase.source).toBe(RECEIPT_SOURCE_ID);
    expect(purchase.ingestMethod).toBe('upload');
    expect(purchase.totalCents).toBe(2750);
    expect(purchase.charges).toEqual([
      { amountCents: 2750, chargedAt: purchase.orderedAt, role: 'capture', origin: 'merchant' },
    ]);
  });

  it('keys on the photograph, so a re-upload is a 409 rather than a twin', () => {
    // A till slip carries a transaction number in a different place and
    // format for every chain, and a date-plus-total key would merge two
    // identical coffees bought an hour apart.
    expect(mapped().sourceOrderId).toBe(SHA);
  });

  it('carries the photograph as a document, because it is the evidence', () => {
    const purchase = mapped();
    expect(purchase.documents).toEqual([{ documentUri: receiptUri(SHA), kind: 'receipt' }]);
    expect(purchase.rawRef).toBe(receiptUri(SHA));
  });

  it('resolves the local wall clock to an instant', () => {
    // 14:32 on 1 August in Sydney is 04:32 UTC. Read as UTC it would be
    // 14:32Z, which is the same day here but the next one for an evening
    // shop — and the reconciliation window is measured in days.
    expect(mapped().orderedAt).toBe('2026-08-01T04:32:00.000Z');
  });

  it('assumes midday when the receipt prints no time', () => {
    // Midnight sits against a day boundary, so any error in the zone guess
    // moves the purchase to the adjacent day. Midday is the reading
    // furthest from being wrong about which day it was.
    expect(mapped({ purchasedAt: null }).orderedAt).toBe('2026-08-01T02:00:00.000Z');
  });

  it('says it does not know how it was paid for', () => {
    // `cash` is terminal — a real card shop marked that way is excluded
    // from reconciliation forever — and the paper rarely says.
    expect(mapped().settlementMode).toBe('unknown');
    expect(mapped().paymentHint).toBeUndefined();
  });

  it('names the merchant when the receipt does, and admits it when not', () => {
    expect(mapped().merchantEntityName).toBe('Bunnings Warehouse');
    // Unknown is a valid outcome. The escape hatch exists precisely for
    // merchants nothing else recognises.
    expect(mapped({ merchantName: null }).merchantEntityName).toBeNull();
  });

  it('defaults the currency rather than refusing a receipt without one', () => {
    expect(mapped({ currency: null }).currency).toBe('AUD');
    expect(mapped({ currency: 'NZD' }).currency).toBe('NZD');
  });
});

describe('the line items', () => {
  it('carries each line with its own money', () => {
    const items = mapped().items ?? [];
    expect(items.map((i) => [i.name, i.lineTotalCents])).toEqual([
      ['Timber Pine DAR 42x19', 1250],
      ['Screws Bugle 8g 65mm', 1500],
    ]);
  });

  it('derives a unit price from a stated count', () => {
    const items = mapped({
      total: '$27.50',
      lines: [
        { description: 'Bolt M8', amount: '$12.50', quantity: 5 },
        { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
      ],
    }).items;
    expect(items?.[0]).toMatchObject({ quantity: 5, lineTotalCents: 1250, unitPriceCents: 250 });
  });

  it('treats an unstated count as one, and keeps the qualifier that says otherwise', () => {
    // A weighed line has no count. Inventing one would be wrong; dropping
    // the "0.202 kg NET @ $2.90/kg" beside it loses how much was bought.
    const items = mapped({
      total: '$12.50',
      lines: [
        { description: 'Sand Washed 20kg', amount: '$12.50', unitNote: '0.202 kg NET @ $2.90/kg' },
      ],
    }).items;
    expect(items?.[0]).toMatchObject({ quantity: 1, unitPriceCents: 1250 });
    expect(items?.[0]?.tags).toEqual(['0.202 kg NET @ $2.90/kg']);
  });
});

describe('the totals', () => {
  it('takes them from the gate rather than recomputing them', () => {
    // The gate already did this arithmetic and its agreement with the paper
    // is the reason the reading is admissible at all. Doing it twice is a
    // chance for the two to disagree.
    const purchase = mapped({ total: '$30.25', tax: '$2.75' });
    expect(purchase.subtotalCents).toBe(2750);
    expect(purchase.taxCents).toBe(275);
    expect(purchase.totalCents).toBe(3025);
  });

  it('carries a stated discount', () => {
    const purchase = mapped({ total: '$22.50', discounts: ['$5.00'] });
    expect(purchase.discountCents).toBe(500);
    expect(purchase.subtotalCents - (purchase.discountCents ?? 0)).toBe(purchase.totalCents);
  });
});

describe('a receipt it cannot place in time', () => {
  it('refuses one with no date rather than dating it from the upload', () => {
    // A fabricated date looks exactly like a fact, and a purchase that can
    // never match a transaction is indistinguishable from one that simply
    // has not settled yet.
    const result = map({ purchasedOn: null });
    expect(result.kind).toBe('undatable');
    if (result.kind !== 'undatable') return;
    expect(result.reason).toContain('no date');
  });

  it('refuses a date that is not a real day', () => {
    // `Date.UTC` normalises 31 February into 3 March without complaint.
    const result = map({ purchasedOn: '2026-02-31' });
    expect(result.kind).toBe('undatable');
  });
});

describe('the checksum', () => {
  it('is stable for the same photograph read the same way', () => {
    expect(mapped().checksum).toBe(mapped().checksum);
  });

  it('changes when a better reading of the same photograph changes the figures', () => {
    // Dedup is `sourceOrderId`; the checksum is change detection. Re-reading
    // one photo with a better model should look different, because it is.
    expect(mapped({ total: '$27.50' }).checksum).not.toBe(
      mapped({
        total: '$27.50',
        lines: [
          { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
          { description: 'Screws Bugle 8g 65mm (corrected)', amount: '$15.00' },
        ],
      }).checksum
    );
  });

  it('differs between two photographs read identically', () => {
    const other = { ...STORED, sha256: 'b'.repeat(64) };
    const first = map();
    const second = map({}, other);
    if (first.kind !== 'mapped' || second.kind !== 'mapped')
      throw new Error('expected both mapped');
    expect(second.purchase.checksum).not.toBe(first.purchase.checksum);
  });
});
