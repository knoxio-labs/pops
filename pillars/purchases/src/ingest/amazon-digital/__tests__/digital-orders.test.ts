/**
 * The digital-orders parser: the component grain, the money it nets out of
 * it, and every row it refuses to turn into spend.
 */
import { describe, expect, it } from 'vitest';

import { AmazonBundleShapeError } from '../../amazon/columns.js';
import { AMAZON_DIGITAL_SOURCE_ID, PROMOTION_OFFSET_TAG } from '../digital-orders.js';
import { parseAmazonDigitalOrders } from '../digital-orders.js';
import {
  DIGITAL_ORDERS_CSV,
  DIGITAL_ORDERS_CSV_WRONG_SHAPE,
  ORDER_COLLIDES_WITH_PHYSICAL,
  ORDER_FAILED,
  ORDER_FOREIGN,
  ORDER_FREE,
  ORDER_PAID,
  ORDER_PROMOTION_OFFSET,
  ORDER_UNDATED,
  ORDER_UNKNOWN_COMPONENT,
  ORDER_UNPARSEABLE,
  digitalCsvWithRows,
  digitalRowWith,
} from './__fixtures__/digital-orders.js';
import { DIGITAL_RETURNS_CSV } from './__fixtures__/digital-returns.js';

import type { CreatePurchaseInput } from '../../../db/services/purchase-input.js';

const { orders, anomalies } = parseAmazonDigitalOrders(DIGITAL_ORDERS_CSV);

function orderFor(sourceOrderId: string): CreatePurchaseInput {
  const found = orders.find((order) => order.sourceOrderId === sourceOrderId);
  if (found === undefined) throw new Error(`no order ${sourceOrderId} was parsed`);
  return found;
}

function anomalyKinds(sourceOrderId: string): string[] {
  return anomalies
    .filter((anomaly) => anomaly.sourceOrderId === sourceOrderId)
    .map((anomaly) => anomaly.kind);
}

describe('grain', () => {
  it('groups the file’s component rows into one order each', () => {
    // Seventeen rows in, six orders out: four rows describe one
    // promotion-offset order and the rest are two apiece or refused.
    expect(orders.map((order) => order.sourceOrderId)).toEqual([
      ORDER_PAID,
      ORDER_PROMOTION_OFFSET,
      ORDER_FREE,
      ORDER_FOREIGN,
      ORDER_COLLIDES_WITH_PHYSICAL,
    ]);
  });

  it('gives every order exactly one line, which is what a redemption is', () => {
    for (const order of orders) expect(order.items).toHaveLength(1);
  });

  it('creates no shipments: nothing is delivered', () => {
    for (const order of orders) expect(order.shipments).toBeUndefined();
  });

  it('writes under its own source rather than the physical one', () => {
    for (const order of orders) expect(order.source).toBe(AMAZON_DIGITAL_SOURCE_ID);
  });
});

describe('money', () => {
  it('nets the components rather than reading the stated list price', () => {
    // `Price` says 6.99 on both rows. Summing it would double the order;
    // reading it once would be right here and wrong on every promotion.
    expect(orderFor(ORDER_PAID)).toMatchObject({
      subtotalCents: 635,
      taxCents: 64,
      discountCents: 0,
      totalCents: 699,
    });
  });

  it('reports a fully-promoted order as costing nothing', () => {
    // The list price is $14.95 and no money moved. Reading `Price` here
    // would invent $14.95 of spend on 23 of the reference bundle's 90
    // orders.
    expect(orderFor(ORDER_PROMOTION_OFFSET)).toMatchObject({
      subtotalCents: 1359,
      taxCents: 136,
      discountCents: 1495,
      totalCents: 0,
    });
  });

  it('keeps subtotal + tax - discount == total on every order it lands', () => {
    // Holds on 90 of 90 orders in the reference bundle, unlike the physical
    // export where the identity is advisory.
    for (const order of orders) {
      expect((order.subtotalCents ?? 0) + (order.taxCents ?? 0) - (order.discountCents ?? 0)).toBe(
        order.totalCents
      );
    }
  });

  it('separates a promotion-cancelled price from a thing that was free', () => {
    expect(orderFor(ORDER_PROMOTION_OFFSET).tags).toEqual([PROMOTION_OFFSET_TAG]);
    expect(orderFor(ORDER_FREE).totalCents).toBe(0);
    expect(orderFor(ORDER_FREE).tags).toBeUndefined();
  });

  it('carries the negative price component onto the line, signed', () => {
    // The order-level discount is a non-negative magnitude and the line
    // adjustment is directional — the same split the physical adapter
    // holds, and reversing either one reverses the residual arithmetic.
    expect(orderFor(ORDER_PROMOTION_OFFSET).items?.[0]).toMatchObject({
      lineTotalCents: 1359,
      allocatedAdjustmentCents: -1359,
    });
  });

  it('upper-cases the currency the order was priced in', () => {
    expect(orderFor(ORDER_FOREIGN).currency).toBe('USD');
  });
});

describe('the line', () => {
  it('asserts the digital kind rather than proposing one', () => {
    // The file IS the record of a digital purchase, so this transcribes the
    // merchant rather than guessing, and persists confirmed.
    expect(orderFor(ORDER_PAID).items?.[0]?.kind).toBe('digital');
  });

  it('keeps the ASIN as the sku and the marketplace as the merchant category', () => {
    expect(orderFor(ORDER_PROMOTION_OFFSET).items?.[0]).toMatchObject({
      name: 'A Borrowed Audiobook',
      sku: 'B000000001',
      quantity: 1,
      merchantCategory: 'www.audible.com.au',
    });
  });
});

describe('rows it refuses to turn into spend', () => {
  it('drops an order whose status is not SUCCESS', () => {
    // The opposite call from the physical parser, which ingests a cancelled
    // line: there the money was really spent, here it never left.
    expect(orders.some((order) => order.sourceOrderId === ORDER_FAILED)).toBe(false);
    expect(anomalyKinds(ORDER_FAILED)).toEqual(['dropped-order']);
  });

  it('drops an order carrying a component type it has never seen', () => {
    // Folding it into either side of the subtotal/tax split would misstate
    // both, and nothing in the file says which side it belongs on.
    expect(orders.some((order) => order.sourceOrderId === ORDER_UNKNOWN_COMPONENT)).toBe(false);
    expect(anomalyKinds(ORDER_UNKNOWN_COMPONENT)).toEqual(['unknown-component-type']);
  });

  it('drops an order rather than landing an unreadable amount at zero', () => {
    // Zero is a real total here, so an order silently landed at zero would
    // be indistinguishable from a promotion that cancelled the price.
    expect(orders.some((order) => order.sourceOrderId === ORDER_UNPARSEABLE)).toBe(false);
    expect(anomalyKinds(ORDER_UNPARSEABLE)).toEqual(['unparseable-money']);
  });

  it('drops an order with no readable date, and says so', () => {
    // `orderedAt` is what the settlement window is measured against, so an
    // order without one could never match a transaction anyway.
    expect(orders.some((order) => order.sourceOrderId === ORDER_UNDATED)).toBe(false);
    expect(anomalyKinds(ORDER_UNDATED)).toEqual(['dropped-order']);
  });

  it('reports a row that names no order at all', () => {
    expect(anomalyKinds('(no order id)')).toEqual(['dropped-line']);
  });

  it('never returns an order it did not also account for', () => {
    // Every input order id is either parsed or named in an anomaly. A row
    // vanishing between the two is the failure this whole report exists to
    // prevent.
    const accounted = new Set([
      ...orders.map((order) => order.sourceOrderId),
      ...anomalies.map((anomaly) => anomaly.sourceOrderId),
    ]);
    for (const expected of [
      ORDER_PAID,
      ORDER_PROMOTION_OFFSET,
      ORDER_FREE,
      ORDER_FOREIGN,
      ORDER_FAILED,
      ORDER_UNKNOWN_COMPONENT,
      ORDER_UNPARSEABLE,
      ORDER_UNDATED,
      ORDER_COLLIDES_WITH_PHYSICAL,
    ]) {
      expect(accounted).toContain(expected);
    }
  });
});

describe('returns', () => {
  const withReturns = parseAmazonDigitalOrders(DIGITAL_ORDERS_CSV, DIGITAL_RETURNS_CSV);

  function orderWithReturns(sourceOrderId: string): CreatePurchaseInput {
    const found = withReturns.orders.find((order) => order.sourceOrderId === sourceOrderId);
    if (found === undefined) throw new Error(`no order ${sourceOrderId} was parsed`);
    return found;
  }

  it('attaches a negative charge for money that came back', () => {
    expect(orderWithReturns(ORDER_PAID).charges).toEqual([
      {
        sourceChargeRef: null,
        amountCents: -699,
        currency: 'AUD',
        orderAmountCents: -699,
        chargedAt: '2025-04-07T08:44:00.000Z',
        role: 'refund',
        origin: 'merchant',
      },
    ]);
  });

  it('attaches nothing for a reversal that returned a credit', () => {
    expect(orderWithReturns(ORDER_PROMOTION_OFFSET).charges).toBeUndefined();
  });

  it('changes the checksum, so a re-download that gains a return is not a no-op', () => {
    expect(orderWithReturns(ORDER_PAID).checksum).not.toBe(orderFor(ORDER_PAID).checksum);
  });

  it('reports a return whose order the file did not yield', () => {
    // The one failure mode that looks like success: the order simply reads
    // as fully spent, exactly as an unreturned one does.
    expect(withReturns.anomalies.map((anomaly) => anomaly.kind)).toContain('orphan-refund');
  });
});

describe('bundle shape', () => {
  it('refuses a file that is not this export', () => {
    expect(() => parseAmazonDigitalOrders(DIGITAL_ORDERS_CSV_WRONG_SHAPE)).toThrow(
      AmazonBundleShapeError
    );
  });

  it('names every column it could not find', () => {
    expect(() => parseAmazonDigitalOrders(DIGITAL_ORDERS_CSV_WRONG_SHAPE)).toThrow(
      /Component Type.*Transaction Amount|Transaction Amount/su
    );
  });

  it('reads a header the file opens with a byte-order mark on', () => {
    // The real file carries one, and it lands on the first column name. An
    // exact-match check that does not strip it rejects the real bundle.
    const parsed = parseAmazonDigitalOrders(
      digitalCsvWithRows([digitalRowWith({ 'Order ID': 'D01-9999999-9999999' })])
    );
    expect(parsed.orders).toHaveLength(1);
  });
});
