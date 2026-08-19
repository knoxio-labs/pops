/**
 * The digital-returns parser: netting a reversal's component rows, and the
 * three ways it refuses to claim money came back.
 */
import { describe, expect, it } from 'vitest';

import { AmazonBundleShapeError } from '../../amazon/columns.js';
import { parseAmazonDigitalReturns } from '../digital-returns.js';
import {
  ORDER_FOREIGN,
  ORDER_PAID,
  ORDER_PROMOTION_OFFSET,
} from './__fixtures__/digital-orders.js';
import {
  DIGITAL_RETURNS_CSV,
  DIGITAL_RETURNS_CSV_WRONG_SHAPE,
  RETURN_DISAGREEING,
  RETURN_INCOMPLETE,
  RETURN_ORPHAN,
  returnRowWith,
  returnsCsvWithRows,
} from './__fixtures__/digital-returns.js';

const { refundsByOrderId, anomalies } = parseAmazonDigitalReturns(DIGITAL_RETURNS_CSV);

function anomalyKinds(sourceOrderId: string): string[] {
  return anomalies
    .filter((anomaly) => anomaly.sourceOrderId === sourceOrderId)
    .map((anomaly) => anomaly.kind);
}

describe('netting', () => {
  it('sums a reversal’s component rows into one refund', () => {
    // 6.35 of goods and 0.64 of tax is one $6.99 refund, not two.
    expect(refundsByOrderId.get(ORDER_PAID)).toEqual([
      {
        sourceOrderId: ORDER_PAID,
        amountCents: 699,
        currency: 'AUD',
        refundedAt: '2025-04-07T08:44:00.000Z',
      },
    ]);
  });

  it('upper-cases the currency the reversal was settled in', () => {
    expect(refundsByOrderId.get(ORDER_FOREIGN)?.[0]?.currency).toBe('USD');
  });
});

describe('reversals it refuses to call money', () => {
  it('records nothing for a reversal that nets to zero', () => {
    // A credit came back, not a payment. A zero-value refund charge would
    // claim a disbursement no statement will ever carry.
    expect(refundsByOrderId.has(ORDER_PROMOTION_OFFSET)).toBe(false);
    expect(anomalyKinds(ORDER_PROMOTION_OFFSET)).toEqual(['dropped-refund']);
  });

  it('records nothing for a return that has not finished', () => {
    expect(refundsByOrderId.has(RETURN_INCOMPLETE)).toBe(false);
    expect(anomalyKinds(RETURN_INCOMPLETE)).toEqual(['dropped-refund']);
  });

  it('refuses a reversal whose stated total disagrees with its components', () => {
    // Two independent statements of one figure. When they disagree nothing
    // in the file says which is right, so neither is used.
    expect(refundsByOrderId.has(RETURN_DISAGREEING)).toBe(false);
    expect(anomalyKinds(RETURN_DISAGREEING)).toEqual(['refund-amount-disagreement']);
  });

  it('keeps an orphan so the order-level pass can report it', () => {
    // Parsing cannot know which orders exist; the caller joins and reports.
    expect(refundsByOrderId.get(RETURN_ORPHAN)).toHaveLength(1);
  });
});

describe('grouping', () => {
  it('nets two reversals of one order separately rather than together', () => {
    // Not in the reference bundle, where four returns name four orders and
    // one item each — but nothing in the file's shape forbids it, and
    // netting two items' components into one number would be wrong twice.
    const twoItems = returnsCsvWithRows([
      returnRowWith({ 'Digital Order Item ID': 'ITEM-A', 'Transaction Amount': '4.00' }),
      returnRowWith({ 'Digital Order Item ID': 'ITEM-B', 'Transaction Amount': '6.00' }),
    ]);

    expect(
      parseAmazonDigitalReturns(twoItems)
        .refundsByOrderId.get(ORDER_PAID)
        ?.map((refund) => refund.amountCents)
    ).toEqual([400, 600]);
  });

  it('reports a row that names no order at all', () => {
    const noOrder = returnsCsvWithRows([returnRowWith({ 'Order ID': 'Not Available' })]);

    expect(parseAmazonDigitalReturns(noOrder).anomalies).toEqual([
      {
        kind: 'dropped-refund',
        sourceOrderId: '(no order id)',
        detail: 'return row carries no Order ID',
      },
    ]);
  });
});

describe('bundle shape', () => {
  it('refuses a file that is not this export', () => {
    expect(() => parseAmazonDigitalReturns(DIGITAL_RETURNS_CSV_WRONG_SHAPE)).toThrow(
      AmazonBundleShapeError
    );
  });
});
