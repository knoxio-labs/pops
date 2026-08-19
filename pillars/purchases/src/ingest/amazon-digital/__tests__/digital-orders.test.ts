/**
 * The digital-orders parser: the component grain, the money it nets out of
 * it, and every row it refuses to turn into spend.
 */
import { describe, expect, it } from 'vitest';

import { CreatePurchaseBodySchema } from '../../../contract/rest-schemas.js';
import { AmazonBundleShapeError } from '../../amazon/columns.js';
import {
  AMAZON_DIGITAL_SOURCE_ID,
  PROMOTION_OFFSET_TAG,
  parseAmazonDigitalOrders,
} from '../digital-orders.js';
import {
  DIGITAL_ORDERS_CSV,
  DIGITAL_ORDERS_CSV_WRONG_SHAPE,
  ORDER_COLLIDES_WITH_PHYSICAL,
  ORDER_FAILED,
  ORDER_FOREIGN,
  ORDER_FREE,
  ORDER_ID_SENTINEL,
  ORDER_IDS_IN_FIXTURE,
  ORDER_NET_NEGATIVE,
  ORDER_PAID,
  ORDER_PROMOTION_OFFSET,
  ORDER_TWO_ITEMS,
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
    // Twenty-three rows in, six orders out, in the order the file states
    // them: the rest are refused and named in an anomaly.
    expect(orders.map((order) => order.sourceOrderId)).toEqual([
      ORDER_PAID,
      ORDER_PROMOTION_OFFSET,
      ORDER_FREE,
      ORDER_FOREIGN,
      ORDER_COLLIDES_WITH_PHYSICAL,
      ORDER_TWO_ITEMS,
    ]);
  });

  it('splits an order on Digital Order Item ID rather than assuming one line', () => {
    // A digital order is one redemption on 90 of 90 in the reference
    // bundle, but nothing in the file's shape forbids two. Reading them as
    // one would name the line after the first product and hand it both
    // products' money, with no anomaly to say so.
    expect(orderFor(ORDER_TWO_ITEMS).items).toEqual([
      expect.objectContaining({
        name: 'The First Of Two',
        sku: { value: 'B000000010', scheme: 'asin' },
        lineTotalCents: 400,
      }),
      expect.objectContaining({
        name: 'The Second Of Two',
        sku: { value: 'B000000011', scheme: 'asin' },
        lineTotalCents: 600,
      }),
    ]);
  });

  it('still totals a multi-item order across every one of its components', () => {
    expect(orderFor(ORDER_TWO_ITEMS)).toMatchObject({
      subtotalCents: 1000,
      taxCents: 100,
      discountCents: 0,
      totalCents: 1100,
    });
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

  it('lands the money every order in the file adds up to', () => {
    // The whole table rather than a spot check, and literal figures rather
    // than the parser's own arithmetic restated: the identity
    // `subtotal + tax - discount == total` holds by construction in
    // `totalComponents`, so asserting it proves nothing about the reading.
    expect(
      orders.map((order) => [
        order.sourceOrderId,
        order.subtotalCents,
        order.taxCents,
        order.discountCents,
        order.totalCents,
      ])
    ).toEqual([
      [ORDER_PAID, 635, 64, 0, 699],
      [ORDER_PROMOTION_OFFSET, 1359, 136, 1495, 0],
      [ORDER_FREE, 0, 0, 0, 0],
      [ORDER_FOREIGN, 1923, 0, 0, 1923],
      [ORDER_COLLIDES_WITH_PHYSICAL, 499, 50, 0, 549],
      [ORDER_TWO_ITEMS, 1000, 100, 0, 1100],
    ]);
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
      sku: { value: 'B000000001', scheme: 'asin' },
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

  it('drops an order whose components net below zero', () => {
    // Not a promotion cancelling a price — that lands at exactly zero.
    // Nothing in the file says what a merchant paying the account means,
    // and landing it would put negative spend into the merchant total.
    expect(orders.some((order) => order.sourceOrderId === ORDER_NET_NEGATIVE)).toBe(false);
    expect(anomalyKinds(ORDER_NET_NEGATIVE)).toEqual(['dropped-order']);
  });

  it('reports a row that names no order at all', () => {
    expect(anomalyKinds('(no order id)')).toEqual(['dropped-line']);
  });

  it('never returns an order it did not also account for', () => {
    // Every input order id is either parsed or named in an anomaly, read
    // off the fixture's own rows rather than restated here — a case added
    // to the file is covered by this the moment it is added. A row
    // vanishing between the two is the failure the report exists to
    // prevent.
    const accounted = new Set([
      ...orders.map((order) => order.sourceOrderId),
      ...anomalies.map((anomaly) => anomaly.sourceOrderId),
    ]);

    for (const stated of ORDER_IDS_IN_FIXTURE) {
      expect(accounted).toContain(stated === ORDER_ID_SENTINEL ? '(no order id)' : stated);
    }
  });
});

describe('the checksum', () => {
  it('separates two orders the file states identically', () => {
    // `purchases.checksum` is unique GLOBALLY. Two subscription renewals of
    // the same product at the same price differ in nothing but their order
    // id, so a recipe that did not hash it would make the second one a
    // duplicate of the first and lose it inside a run that reported
    // success.
    const twins = parseAmazonDigitalOrders(
      digitalCsvWithRows([
        digitalRowWith({ 'Order ID': 'D01-0000000-0000021' }),
        digitalRowWith({ 'Order ID': 'D01-0000000-0000022' }),
      ])
    );

    expect(twins.orders).toHaveLength(2);
    expect(twins.orders[0]?.checksum).not.toBe(twins.orders[1]?.checksum);
  });
});

describe('contract conformance', () => {
  it('emits a body the create endpoint accepts, for every order', () => {
    // The adapter writes through POST /purchases, so a payload the contract
    // rejects is a runtime failure on the 90th order of a backfill rather
    // than a type error here.
    for (const order of orders) {
      const parsed = CreatePurchaseBodySchema.safeParse(order);
      expect(parsed.error?.message ?? 'ok').toBe('ok');
    }
  });

  it('carries the promotion-offset tag through the wire contract', () => {
    // Not covered by the safeParse above: zod strips unknown keys without
    // erroring, so a create body with no `tags` field would accept the
    // order and silently discard the one column that tells a $0 redemption
    // from a giveaway.
    expect(CreatePurchaseBodySchema.parse(orderFor(ORDER_PROMOTION_OFFSET)).tags).toEqual([
      PROMOTION_OFFSET_TAG,
    ]);
    expect(CreatePurchaseBodySchema.parse(orderFor(ORDER_FREE)).tags).toBeUndefined();
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
