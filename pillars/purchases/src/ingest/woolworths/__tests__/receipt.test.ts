import { describe, expect, it } from 'vitest';

import { mapReceipt } from '../receipt.js';
import { cardPayment, changeRow, receiptPage, REAL_RECEIPT_LINES } from './fixtures.js';

import type { ReceiptPage } from '../blocks.js';

const map = (options: Parameters<typeof receiptPage>[0] = {}, id = 'abc') =>
  mapReceipt(id, receiptPage(options) as ReceiptPage);

describe('a real shop', () => {
  it('maps to one purchase carrying one charge for the whole receipt', () => {
    const purchase = map()?.purchase;
    expect(purchase?.totalCents).toBe(3258);
    expect(purchase?.currency).toBe('AUD');
    expect(purchase?.ingestMethod).toBe('export');
    expect(purchase?.charges).toEqual([
      {
        amountCents: 3258,
        chargedAt: '2026-07-24T10:39:00.000Z',
        role: 'capture',
        origin: 'merchant',
        paymentHint: 'AMEX ····6895',
      },
    ]);
  });

  it('dates the purchase from the till, not from when it was exported', () => {
    expect(map()?.purchase.orderedAt).toBe('2026-07-24T10:39:00.000Z');
  });

  it('keys on the till transaction rather than the API id', () => {
    // The activityDetailsId is an opaque blob nothing promises to keep
    // stable; store/POS/transaction/date is printed on the paper. Keying on
    // the former means a re-export mints a duplicate of every purchase.
    const purchase = map({}, 'some-opaque-id')?.purchase;
    expect(purchase?.sourceOrderId).toBe('1034-066-3184-24072026');
    expect(purchase?.rawRef).toBe('some-opaque-id');
  });

  it('gives the same receipt the same key under a different API id', () => {
    expect(map({}, 'id-one')?.purchase.sourceOrderId).toBe(
      map({}, 'id-two')?.purchase.sourceOrderId
    );
  });

  it('folds the seven rows into five items and no quantity lines', () => {
    const items = map()?.purchase.items ?? [];
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.name)).not.toContain('Qty 2 @ $9.24 each');
    expect(items.at(-1)).toMatchObject({ quantity: 2, unitPriceCents: 924, lineTotalCents: 1848 });
  });

  it('keeps the promotion wording on the item it modifies', () => {
    expect(map()?.purchase.items?.at(-1)?.tags).toEqual(['PRICE REDUCED BY $7.26 each']);
  });

  it('reconciles its own arithmetic without an anomaly', () => {
    const mapped = map();
    expect(mapped?.anomalies).toEqual([]);
    expect(mapped?.purchase.subtotalCents).toBe(3258);
  });

  it('does not put the stated GST in taxCents', () => {
    // Shelf prices include it, so the line totals already contain it.
    // Setting taxCents would make the GST appear twice in any sum of
    // components — and the receipt's own $2.96 is reconstructable from the
    // per-item `#` marks instead.
    const purchase = map()?.purchase;
    expect(purchase?.taxCents).toBeUndefined();
    expect((purchase?.subtotalCents ?? 0) - (purchase?.discountCents ?? 0)).toBe(
      purchase?.totalCents
    );
  });

  it('names the store on the purchase', () => {
    expect(map()?.purchase.merchantEntityName).toBe('Woolworths 1034 Canterbury Plaza');
  });
});

describe('the store number, which is part of the key', () => {
  it('falls back to the number printed in the title', () => {
    // A literal placeholder is a bucket every store without a `storeNo`
    // falls into, where two shops at different stores sharing a POS and
    // transaction number would silently de-duplicate each other.
    const purchase = map({ storeNo: null, storeTitle: '1766 Kogarah' })?.purchase;
    expect(purchase?.sourceOrderId).toBe('1766-066-3184-24072026');
  });

  it('keeps two stores apart even when neither states a number', () => {
    const one = map({ storeNo: null, storeTitle: 'Canterbury' })?.purchase.sourceOrderId;
    const two = map({ storeNo: '1766', storeTitle: 'Kogarah' })?.purchase.sourceOrderId;
    expect(one).not.toBe(two);
  });
});

describe('how it was paid for', () => {
  it('marks a card shop as card-settled and carries the hint', () => {
    const purchase = map()?.purchase;
    expect(purchase?.settlementMode).toBe('card');
    expect(purchase?.paymentHint).toBe('AMEX ····6895');
  });

  it('marks a cash shop as cash-settled, which excludes it from the reconcile queue', () => {
    // A cash purchase will never have a transaction. Calling it `card`
    // parks it in the review queue forever asking about money that was
    // never on a statement.
    const purchase = map({
      payments: [
        { description: 'Cash', amount: '$40.00', details: [{ text: 'CASH   $40.00' }] },
        changeRow('$7.42'),
      ],
    })?.purchase;
    expect(purchase?.settlementMode).toBe('cash');
    expect(purchase?.paymentHint).toBeNull();
  });

  it('admits it does not know when the receipt states no payment', () => {
    // Nine receipts in a real 413-receipt export carry no readable payment
    // block. Calling those `card` asserts something the merchant never
    // said; calling them `cash` would be worse, since that is terminal and
    // would exclude a real card shop from reconciliation forever.
    const purchase = map({ payments: [] })?.purchase;
    expect(purchase?.settlementMode).toBe('unknown');
    expect(purchase?.paymentHint).toBeNull();
  });
});

describe('receipts it refuses', () => {
  it('refuses one with no readable transaction line', () => {
    // Without it there is no date, so the purchase could never fall inside
    // any reconciliation window and would sit unexplained forever.
    expect(map({ transactionDetails: null })).toBeNull();
    expect(map({ transactionDetails: 'POS 066 TRANS 3184' })).toBeNull();
  });

  it('refuses one with no stated total', () => {
    expect(map({ total: '' })).toBeNull();
  });
});

describe('receipts it ingests but flags', () => {
  it('flags a total that its own lines do not add up to', () => {
    // The failure this adapter exists to catch. A misread row still sums to
    // something, so only comparing against the merchant's stated total
    // notices.
    const mapped = map({ lines: REAL_RECEIPT_LINES, total: '$99.99' });
    expect(mapped?.anomalies.map((a) => a.kind)).toEqual(['totals-mismatch']);
    expect(mapped?.purchase.totalCents).toBe(9999);
  });

  it('counts a discount printed among the items, not just one in the summary', () => {
    // Everyday Extra and the BUY-2 offers arrive as negative-amount ROWS,
    // and on the real export they outnumber summary discounts entirely.
    // Dropping them on the way to `discountCents` makes every receipt
    // carrying one report a false `totals-mismatch`.
    const mapped = map({
      lines: [
        ...REAL_RECEIPT_LINES,
        { description: 'Everyday Extra 10% Discount', amount: '-3.26' },
      ],
      total: '$29.32',
    });
    expect(mapped?.anomalies).toEqual([]);
    expect(mapped?.purchase.discountCents).toBe(326);
    expect(mapped?.purchase.subtotalCents).toBe(3258);
    expect(mapped?.purchase.items?.map((i) => i.name)).not.toContain('Everyday Extra 10% Discount');
  });

  it('adds up discounts stated in both places', () => {
    const mapped = map({
      lines: [...REAL_RECEIPT_LINES, { description: 'BUY 2 for $4.60', amount: '-1.00' }],
      discounts: [{ description: 'Everyday Extra', amount: '-2.00' }],
      total: '$29.58',
    });
    expect(mapped?.anomalies).toEqual([]);
    expect(mapped?.purchase.discountCents).toBe(300);
  });

  it('subtracts a stated discount before comparing', () => {
    const mapped = map({
      total: '$30.58',
      discounts: [{ description: 'Everyday Extra', amount: '-2.00' }],
    });
    expect(mapped?.anomalies).toEqual([]);
    expect(mapped?.purchase.discountCents).toBe(200);
  });

  it('reports a product whose price never arrives instead of pricing it at zero', () => {
    const mapped = map({
      lines: [
        { description: 'Mystery Item', amount: '' },
        { description: 'Real Product', amount: '3.00' },
      ],
      total: '$3.00',
    });
    expect(mapped?.purchase.items).toHaveLength(1);
    expect(mapped?.anomalies.map((a) => a.kind)).toContain('no-amount');
  });

  it('attributes every anomaly to the receipt it came from', () => {
    const mapped = map({ total: '$99.99' }, 'receipt-42');
    expect(mapped?.anomalies.every((a) => a.activityDetailsId === 'receipt-42')).toBe(true);
  });
});

describe('block lookup', () => {
  it('finds its blocks by type, not by position', () => {
    // `details` is a union in source order and the order is not a contract.
    // Reversing it must change nothing.
    const page = receiptPage() as unknown as { details: unknown[] };
    const reversed = { ...page, details: [...page.details].toReversed() } as unknown as ReceiptPage;
    expect(mapReceipt('abc', reversed)?.purchase).toEqual(map()?.purchase);
  });

  it('ignores the marketing coupon barcode, which is not a transaction reference', () => {
    expect(map()?.purchase.sourceOrderId).not.toContain('6291034066318424');
  });

  it('survives a block gaining a field it has never seen', () => {
    const page = receiptPage() as unknown as { details: Record<string, unknown>[] };
    const widened = {
      ...page,
      details: page.details.map((d) => ({ ...d, someNewFieldWoolworthsAdded: { nested: true } })),
    } as unknown as ReceiptPage;
    expect(mapReceipt('abc', widened)?.purchase.totalCents).toBe(3258);
  });
});

describe('the checksum', () => {
  it('is stable for an unchanged receipt', () => {
    expect(map()?.purchase.checksum).toBe(map()?.purchase.checksum);
  });

  it('changes when any line changes', () => {
    const other = map({ lines: [...REAL_RECEIPT_LINES.slice(0, 4)], total: '$14.10' });
    expect(other?.purchase.checksum).not.toBe(map()?.purchase.checksum);
  });

  it('changes when a promotion or the GST mark changes, not only the money', () => {
    // Those are part of what was read off the receipt. A checksum that
    // ignored them would call two different readings of the same shop
    // identical — and the comment above it would be a lie.
    const plain = map({
      lines: [{ prefixChar: null, description: 'A', amount: '1.00' }],
      total: '$1.00',
    });
    const gst = map({
      lines: [{ prefixChar: '#', description: 'A', amount: '1.00' }],
      total: '$1.00',
    });
    const noted = map({
      lines: [
        { prefixChar: null, description: 'A', amount: '1.00' },
        { prefixChar: null, description: 'PRICE REDUCED BY $1.00 each', amount: '' },
      ],
      total: '$1.00',
    });

    expect(gst?.purchase.checksum).not.toBe(plain?.purchase.checksum);
    expect(noted?.purchase.checksum).not.toBe(plain?.purchase.checksum);
  });

  it('survives the site reordering its blocks or adding fields nothing reads', () => {
    // Hashing the raw payload would turn the checksum over for a change
    // that changed nothing about the purchase, marking a year of history as
    // modified on the next import.
    const page = receiptPage() as unknown as { details: Record<string, unknown>[] };
    const churned = {
      ...page,
      details: [...page.details].toReversed().map((d) => ({ ...d, aFieldAddedLater: 'x' })),
    } as unknown as ReceiptPage;
    expect(mapReceipt('abc', churned)?.purchase.checksum).toBe(map()?.purchase.checksum);
  });
});

describe('payments block shape', () => {
  it('reads a slip that lists the card after the change row', () => {
    const mapped = map({ payments: [changeRow(), cardPayment('$32.58')] });
    expect(mapped?.purchase.paymentHint).toBe('AMEX ····6895');
  });
});
