import { describe, expect, it } from 'vitest';

import { CreatePurchaseBodySchema } from '../../../contract/rest-schemas.js';
import { AmazonBundleShapeError } from '../columns.js';
import { parseAmazonOrderHistory } from '../order-history.js';
import {
  ORDER_APOSTROPHE_DISCOUNT,
  ORDER_CANCELLED,
  ORDER_COMPONENT_DRIFT,
  ORDER_CONCATENATED_SHIP_DATE,
  ORDER_FOREIGN_CURRENCY,
  ORDER_HISTORY_CSV,
  ORDER_HISTORY_CSV_WRONG_SHAPE,
  csvWithRows,
  rowWith,
  ORDER_SINGLE,
  ORDER_THOUSANDS_SEPARATOR,
  ORDER_TWO_LINES_ONE_SHIPMENT,
  ORDER_TWO_SHIPMENTS,
} from './__fixtures__/order-history.js';

const { orders, anomalies } = parseAmazonOrderHistory(ORDER_HISTORY_CSV);

function order(sourceOrderId: string) {
  const found = orders.find((candidate) => candidate.sourceOrderId === sourceOrderId);
  if (found === undefined) throw new Error(`fixture order ${sourceOrderId} was not parsed`);
  return found;
}

function anomalyKinds(sourceOrderId: string): string[] {
  return anomalies
    .filter((anomaly) => anomaly.sourceOrderId === sourceOrderId)
    .map((anomaly) => anomaly.kind)
    .toSorted();
}

describe('grain', () => {
  it('produces one order per Order ID, not one per row', () => {
    // Eleven rows in the fixture, nine orders.
    expect(orders).toHaveLength(9);
  });

  it('groups an order shipped in two boxes into two shipments', () => {
    const result = order(ORDER_TWO_SHIPMENTS);
    expect(result.shipments).toHaveLength(2);
    expect(result.items).toHaveLength(2);
    expect(result.shipments?.map((shipment) => shipment.shippedAt)).toEqual([
      '2025-05-02T00:00:00.000Z',
      '2025-05-09T00:00:00.000Z',
    ]);
  });

  it('keeps two lines of one shipment in a single shipment', () => {
    const result = order(ORDER_TWO_LINES_ONE_SHIPMENT);
    expect(result.shipments).toHaveLength(1);
    expect(result.items).toHaveLength(2);
  });

  it('points every line at the shipment that carried it', () => {
    const result = order(ORDER_TWO_SHIPMENTS);
    const shipmentRefs = new Set(result.shipments?.map((shipment) => shipment.ref));
    for (const item of result.items ?? []) {
      expect(shipmentRefs.has(item.shipmentRef ?? '')).toBe(true);
    }
  });
});

describe('shipment-level columns', () => {
  it('counts a repeated subtotal once per shipment, not once per row', () => {
    // THE regression this file exists for. Subtotal 30.00 and tax 3.00 are
    // stated on both rows of this one shipment; summing per row gives 6000
    // and 600, which is what a row-wise parser produces and what silently
    // inflates every multi-item order in the bundle.
    const result = order(ORDER_TWO_LINES_ONE_SHIPMENT);
    expect(result.subtotalCents).toBe(3000);
    expect(result.taxCents).toBe(300);
  });

  it('sums the per-line total across every row', () => {
    // Total Amount, unlike subtotal, genuinely varies per line: 11.00 + 22.00.
    expect(order(ORDER_TWO_LINES_ONE_SHIPMENT).totalCents).toBe(3300);
  });

  it('adds each shipment components once across a multi-shipment order', () => {
    const result = order(ORDER_TWO_SHIPMENTS);
    expect(result.subtotalCents).toBe(4000);
    expect(result.taxCents).toBe(400);
    expect(result.shippingCents).toBe(500);
    expect(result.totalCents).toBe(4900);
  });

  it('reconstructs a shipment subtotal from its lines exactly', () => {
    // Σ(unit × quantity) === Shipment Item Subtotal held on 747/747
    // shipments in the reference bundle, so it must hold here too.
    const result = order(ORDER_TWO_LINES_ONE_SHIPMENT);
    const lineSum = (result.items ?? []).reduce((sum, item) => sum + item.lineTotalCents, 0);
    expect(lineSum).toBe(result.subtotalCents);
  });
});

describe('money', () => {
  it('reads an apostrophe-wrapped discount as a positive order-level magnitude', () => {
    const result = order(ORDER_APOSTROPHE_DISCOUNT);
    expect(result.discountCents).toBe(550);
    expect(result.totalCents).toBe(4950);
  });

  it('keeps the discount signed on the line it applied to', () => {
    expect(order(ORDER_APOSTROPHE_DISCOUNT).items?.[0].allocatedAdjustmentCents).toBe(-550);
  });

  it('ingests a thousands-separated amount rather than dropping the line', () => {
    const result = order(ORDER_THOUSANDS_SEPARATOR);
    expect(result.totalCents).toBe(149500);
    expect(result.items).toHaveLength(1);
    expect(result.items?.[0].unitPriceCents).toBe(149500);
    expect(anomalyKinds(ORDER_THOUSANDS_SEPARATOR)).not.toContain('dropped-line');
  });

  it('never silently drops a line', () => {
    // Eleven rows in the fixture, eleven lines out. A line that cannot be
    // read must be reported, never quietly omitted from an order that still
    // totals correctly from Total Amount.
    const lines = orders.reduce((count, result) => count + (result.items?.length ?? 0), 0);
    const dropped = anomalies.filter((anomaly) => anomaly.kind === 'dropped-line').length;
    expect(lines + dropped).toBe(11);
  });

  it('never emits a negative component amount', () => {
    for (const result of orders) {
      expect(result.subtotalCents ?? 0).toBeGreaterThanOrEqual(0);
      expect(result.taxCents ?? 0).toBeGreaterThanOrEqual(0);
      expect(result.shippingCents ?? 0).toBeGreaterThanOrEqual(0);
      expect(result.discountCents ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits integers everywhere money appears', () => {
    for (const result of orders) {
      expect(Number.isSafeInteger(result.totalCents)).toBe(true);
      for (const item of result.items ?? []) {
        expect(Number.isSafeInteger(item.unitPriceCents)).toBe(true);
        expect(Number.isSafeInteger(item.lineTotalCents)).toBe(true);
      }
    }
  });
});

describe('anomalies', () => {
  it('flags a component-sum mismatch without dropping the order', () => {
    expect(anomalyKinds(ORDER_COMPONENT_DRIFT)).toContain('component-sum-mismatch');
    expect(order(ORDER_COMPONENT_DRIFT).totalCents).toBe(1200);
  });

  it('does not flag a mismatch on an order whose components reconcile', () => {
    expect(anomalyKinds(ORDER_SINGLE)).toEqual([]);
  });

  it('does not invent a mismatch when the source states no components', () => {
    // The cancelled order's subtotal is "Not Available". Treating that as
    // zero would report a mismatch against a figure Amazon never claimed.
    expect(anomalyKinds(ORDER_CANCELLED)).not.toContain('component-sum-mismatch');
  });

  it('flags a cancelled order and its zero-quantity line, and still ingests both', () => {
    expect(anomalyKinds(ORDER_CANCELLED)).toEqual(['cancelled-order', 'zero-quantity-line']);
    const result = order(ORDER_CANCELLED);
    // Three cancelled rows in the real bundle carry a non-zero total, so
    // "cancelled ⇒ drop it" would lose real money from the reconciliation.
    expect(result.totalCents).toBe(1125);
    expect(result.items?.[0].quantity).toBe(1);
  });

  it('survives Amazon own concatenated ship date and says which order it hit', () => {
    expect(anomalyKinds(ORDER_CONCATENATED_SHIP_DATE)).toContain('concatenated-ship-date');
    const result = order(ORDER_CONCATENATED_SHIP_DATE);
    expect(result.shipments?.[0].shippedAt).toBe('2025-08-02T00:00:00.000Z');
    expect(result.shipments?.[0].status).toBe('shipped');
  });
});

describe('parsing hazards', () => {
  it('reads a quoted field containing a newline without splitting the row', () => {
    // A naive line-splitting parser turns this one row into two.
    const result = order(ORDER_FOREIGN_CURRENCY);
    expect(result.items).toHaveLength(1);
    expect(result.currency).toBe('USD');
  });

  it('strips the UTF-8 BOM rather than mangling the first column name', () => {
    expect(order(ORDER_SINGLE).sourceOrderId).toBe(ORDER_SINGLE);
  });

  it('splits carrier from tracking number', () => {
    const shipment = order(ORDER_SINGLE).shipments?.[0];
    expect(shipment?.carrier).toBe('AMZL_AU');
    expect(shipment?.trackingNumber).toBe('TBA000000000001');
  });

  it('refuses a file that is not this export rather than half-parsing it', () => {
    expect(() => parseAmazonOrderHistory(ORDER_HISTORY_CSV_WRONG_SHAPE)).toThrow(
      AmazonBundleShapeError
    );
  });

  it('names the missing columns so an unfamiliar bundle is diagnosable', () => {
    expect(() => parseAmazonOrderHistory(ORDER_HISTORY_CSV_WRONG_SHAPE)).toThrow(/Order Date/u);
  });
});

describe('rows the parser cannot fully take', () => {
  it('reports a line it could not read instead of dropping it silently', () => {
    const result = parseAmazonOrderHistory(
      csvWithRows([rowWith({ 'Unit Price': 'Not Available' })])
    );
    expect(result.orders[0]?.items ?? []).toHaveLength(0);
    expect(result.anomalies.map((anomaly) => anomaly.kind)).toContain('dropped-line');
  });

  it('reports a line with no product name', () => {
    const result = parseAmazonOrderHistory(
      csvWithRows([rowWith({ 'Product Name': 'Not Available' })])
    );
    expect(result.anomalies.some((anomaly) => anomaly.kind === 'dropped-line')).toBe(true);
  });

  it('reports an unreadable total but still ingests the line', () => {
    const result = parseAmazonOrderHistory(
      csvWithRows([rowWith({ 'Total Amount': 'Not Available' })])
    );
    expect(result.anomalies.map((anomaly) => anomaly.kind)).toContain('unparseable-money');
    expect(result.orders[0]?.items ?? []).toHaveLength(1);
  });

  it('reports a row carrying no order id rather than skipping it quietly', () => {
    const result = parseAmazonOrderHistory(csvWithRows([rowWith({ 'Order ID': 'Not Available' })]));
    expect(result.orders).toHaveLength(0);
    expect(result.anomalies.map((anomaly) => anomaly.kind)).toContain('dropped-line');
  });

  it('refuses a file whose rows do not parse as CSV', () => {
    // Papa returns data alongside errors, so a half-parsed file would
    // otherwise become plausible wrong orders.
    const ragged = `${csvWithRows([rowWith({})]).trimEnd()},surplus,fields\n`;
    expect(() => parseAmazonOrderHistory(ragged)).toThrow(AmazonBundleShapeError);
  });

  it('reports an order whose date or currency is unreadable', () => {
    // The largest thing this parser can drop, so the one that must never be
    // silent.
    for (const override of [{ 'Order Date': 'nonsense' }, { Currency: 'Not Available' }]) {
      const result = parseAmazonOrderHistory(csvWithRows([rowWith(override)]));
      expect(result.orders).toHaveLength(0);
      expect(result.anomalies.map((anomaly) => anomaly.kind)).toContain('dropped-order');
    }
  });

  it('names the order it dropped, so a backfill stays auditable', () => {
    const result = parseAmazonOrderHistory(csvWithRows([rowWith({ 'Order Date': 'nonsense' })]));
    const dropped = result.anomalies.find((anomaly) => anomaly.kind === 'dropped-order');
    expect(dropped?.sourceOrderId).toBe('249-0000099-0000099');
    expect(dropped?.detail).toContain('Order Date');
  });

  it('maps an unrecognised shipment status to pending rather than guessing', () => {
    const result = parseAmazonOrderHistory(
      csvWithRows([rowWith({ 'Shipment Status': 'Teleported' })])
    );
    expect(result.orders[0]?.shipments?.[0].status).toBe('pending');
  });

  it('treats an unshipped row as one shipment rather than none', () => {
    const result = parseAmazonOrderHistory(
      csvWithRows([rowWith({ 'Ship Date': 'Not Available' })])
    );
    expect(result.orders[0]?.shipments).toHaveLength(1);
    expect(result.orders[0]?.shipments?.[0].shippedAt).toBeNull();
  });

  it('rejects a file with no header row at all', () => {
    expect(() => parseAmazonOrderHistory('')).toThrow(AmazonBundleShapeError);
  });
});

describe('determinism and idempotency', () => {
  it('produces byte-identical output across runs', () => {
    const again = parseAmazonOrderHistory(ORDER_HISTORY_CSV);
    expect(JSON.stringify(again.orders)).toBe(JSON.stringify(orders));
  });

  it('preserves source document order, which becomes position on write', () => {
    expect(orders.map((result) => result.sourceOrderId)).toEqual([
      ORDER_SINGLE,
      ORDER_TWO_LINES_ONE_SHIPMENT,
      ORDER_TWO_SHIPMENTS,
      ORDER_APOSTROPHE_DISCOUNT,
      ORDER_CANCELLED,
      ORDER_CONCATENATED_SHIP_DATE,
      ORDER_FOREIGN_CURRENCY,
      ORDER_COMPONENT_DRIFT,
      ORDER_THOUSANDS_SEPARATOR,
    ]);
  });

  it('gives every order a distinct checksum', () => {
    const checksums = new Set(orders.map((result) => result.checksum));
    expect(checksums.size).toBe(orders.length);
  });

  it('gives the same order the same checksum on re-ingest', () => {
    const again = parseAmazonOrderHistory(ORDER_HISTORY_CSV);
    expect(again.orders.map((result) => result.checksum)).toEqual(
      orders.map((result) => result.checksum)
    );
  });
});

describe('contract conformance', () => {
  it('emits a body the create endpoint accepts, for every order', () => {
    // The parser writes through POST /purchases, so a payload the contract
    // rejects is a runtime failure on the 700th order of a backfill rather
    // than a type error here.
    for (const result of orders) {
      const parsed = CreatePurchaseBodySchema.safeParse(result);
      expect(parsed.error?.message ?? 'ok').toBe('ok');
    }
  });

  it('marks every order as an export ingest against the amazon source', () => {
    for (const result of orders) {
      expect(result.source).toBe('amazon');
      expect(result.ingestMethod).toBe('export');
      expect(result.merchantEntityName).toBe('Amazon');
    }
  });

  it('states no charges, because the export states none', () => {
    // Amazon publishes no per-charge breakdown, so every order lands at
    // awaiting_settlement until the reconciliation engine mints a derived
    // charge for the transaction it matches.
    for (const result of orders) {
      expect(result.charges ?? []).toHaveLength(0);
    }
  });
});
