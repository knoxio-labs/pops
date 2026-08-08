import { describe, expect, it } from 'vitest';

import { AmazonBundleShapeError } from '../columns.js';
import { parseAmazonRefundDetails } from '../refunds.js';
import { ORDER_SINGLE } from './__fixtures__/order-history.js';
import {
  REFUND_DETAILS_CSV,
  REFUND_DETAILS_CSV_WRONG_SHAPE,
  REFUND_FULL,
  REFUND_ORPHAN,
  REFUND_PENDING,
  REFUND_THOUSANDS,
  REFUND_TWICE,
  refundCsvWithRows,
  refundRowWith,
} from './__fixtures__/refund-details.js';

const { refundsByOrderId, anomalies } = parseAmazonRefundDetails(REFUND_DETAILS_CSV);

function refundsFor(sourceOrderId: string) {
  return refundsByOrderId.get(sourceOrderId) ?? [];
}

function anomalyDetails(sourceOrderId: string): string[] {
  return anomalies
    .filter((anomaly) => anomaly.sourceOrderId === sourceOrderId)
    .map((anomaly) => anomaly.detail);
}

describe('grain', () => {
  it('keys refunds by the order they belong to', () => {
    // Eight rows in the fixture; one is pending and never becomes a refund.
    expect([...refundsByOrderId.keys()]).toHaveLength(6);
  });

  it('keeps both refunds when one order was refunded twice', () => {
    // Not present in the reference bundle, where all 16 orders have exactly
    // one refund row — but nothing in the file's shape forbids it, and
    // collapsing the second would lose money silently.
    expect(refundsFor(REFUND_TWICE).map((refund) => refund.amountCents)).toEqual([1000, 500]);
  });

  it('preserves file order within an order', () => {
    expect(refundsFor(REFUND_TWICE).map((refund) => refund.refundedAt)).toEqual([
      '2025-06-20T00:10:00.000Z',
      '2025-06-25T00:10:00.000Z',
    ]);
  });
});

describe('money', () => {
  it('reads a refund as a positive magnitude, leaving the sign to the charge', () => {
    expect(refundsFor(REFUND_FULL)[0]?.amountCents).toBe(2200);
  });

  it('reads a thousands-separated amount rather than dropping the refund', () => {
    // The same trap the order history carries: a rejected value would drop a
    // refund whose order still totals correctly, so nothing downstream could
    // tell the money never came back.
    expect(refundsFor(REFUND_THOUSANDS)[0]?.amountCents).toBe(149500);
  });

  it('emits integer cents', () => {
    for (const refunds of refundsByOrderId.values()) {
      for (const refund of refunds) {
        expect(Number.isSafeInteger(refund.amountCents)).toBe(true);
      }
    }
  });

  it('normalises the currency to upper case', () => {
    const result = parseAmazonRefundDetails(
      refundCsvWithRows([refundRowWith({ Currency: 'aud' })])
    );
    expect(result.refundsByOrderId.get(ORDER_SINGLE)?.[0]?.currency).toBe('AUD');
  });
});

describe('dates', () => {
  it('takes the disbursement date, not the record-creation date', () => {
    // `Creation Date` runs minutes to hours ahead of `Refund Date` on every
    // row of the reference bundle. Only the disbursement instant is a date a
    // finance transaction could ever settle against.
    expect(refundsFor(REFUND_FULL)[0]?.refundedAt).toBe('2025-03-30T01:12:03.100Z');
  });
});

describe('rows the parser will not turn into money', () => {
  it('refuses a refund whose reversal has not completed, and says so', () => {
    expect(refundsFor(REFUND_PENDING)).toHaveLength(0);
    expect(anomalyDetails(REFUND_PENDING).join(' ')).toContain('Reversal Status');
  });

  it('reports an unreadable amount instead of recording a zero refund', () => {
    const result = parseAmazonRefundDetails(
      refundCsvWithRows([refundRowWith({ 'Refund Amount': 'Not Available' })])
    );
    expect(result.refundsByOrderId.size).toBe(0);
    expect(result.anomalies.map((anomaly) => anomaly.kind)).toEqual(['dropped-refund']);
  });

  it('refuses a non-positive refund rather than netting the wrong way', () => {
    for (const amount of ['0', '-5.00']) {
      const result = parseAmazonRefundDetails(
        refundCsvWithRows([refundRowWith({ 'Refund Amount': amount })])
      );
      expect(result.refundsByOrderId.size).toBe(0);
      expect(result.anomalies[0]?.detail).toContain('not positive');
    }
  });

  it('reports an unreadable refund date', () => {
    const result = parseAmazonRefundDetails(
      refundCsvWithRows([refundRowWith({ 'Refund Date': 'nonsense' })])
    );
    expect(result.refundsByOrderId.size).toBe(0);
    expect(result.anomalies.map((anomaly) => anomaly.kind)).toEqual(['dropped-refund']);
  });

  it('reports an unreadable currency', () => {
    const result = parseAmazonRefundDetails(
      refundCsvWithRows([refundRowWith({ Currency: 'Not Available' })])
    );
    expect(result.refundsByOrderId.size).toBe(0);
    expect(result.anomalies[0]?.detail).toContain('Currency');
  });

  it('reports a row that names no order', () => {
    const result = parseAmazonRefundDetails(
      refundCsvWithRows([refundRowWith({ 'Order ID': 'Not Available' })])
    );
    expect(result.refundsByOrderId.size).toBe(0);
    expect(result.anomalies[0]?.detail).toContain('no Order ID');
  });

  it('never loses a row without naming it', () => {
    // Eight rows in, refunds plus reported drops must account for all eight.
    const kept = [...refundsByOrderId.values()].reduce((count, list) => count + list.length, 0);
    expect(kept + anomalies.length).toBe(8);
  });
});

describe('bundle shape', () => {
  it('refuses a file that is not this export rather than half-parsing it', () => {
    expect(() => parseAmazonRefundDetails(REFUND_DETAILS_CSV_WRONG_SHAPE)).toThrow(
      AmazonBundleShapeError
    );
  });

  it('names the missing columns so an unfamiliar bundle is diagnosable', () => {
    expect(() => parseAmazonRefundDetails(REFUND_DETAILS_CSV_WRONG_SHAPE)).toThrow(
      /Refund Amount/u
    );
  });

  it('rejects a file with no header row at all', () => {
    expect(() => parseAmazonRefundDetails('')).toThrow(AmazonBundleShapeError);
  });

  it('refuses a file whose rows do not parse as CSV', () => {
    const ragged = `${refundCsvWithRows([refundRowWith({})]).trimEnd()},surplus,fields\n`;
    expect(() => parseAmazonRefundDetails(ragged)).toThrow(AmazonBundleShapeError);
  });

  it('strips the UTF-8 BOM rather than mangling the first column name', () => {
    // The BOM sits on `Creation Date`, but a mangled header would also shift
    // nothing — the check that matters is that Order ID still resolves.
    expect(refundsByOrderId.has(REFUND_ORPHAN)).toBe(true);
  });
});

describe('determinism', () => {
  it('produces identical output across runs', () => {
    const again = parseAmazonRefundDetails(REFUND_DETAILS_CSV);
    expect(JSON.stringify([...again.refundsByOrderId])).toBe(JSON.stringify([...refundsByOrderId]));
  });
});
