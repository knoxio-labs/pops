/**
 * Refunds joined onto the orders they belong to.
 *
 * Separate from `refunds.test.ts`, which tests the file in isolation: this
 * is about what `POST /purchases` ends up being sent, and about the ADR-042
 * invariant that getting money back must never make an order look more
 * broken than it did before.
 */
import { describe, expect, it } from 'vitest';

import { CreatePurchaseBodySchema } from '../../../contract/rest-schemas.js';
import { computeAccounting } from '../../../db/services/accounting.js';
import { parseAmazonOrderHistory } from '../order-history.js';
import {
  ORDER_CANCELLED,
  ORDER_HISTORY_CSV,
  ORDER_SINGLE,
  ORDER_TWO_LINES_ONE_SHIPMENT,
  csvWithRows,
  rowWith,
} from './__fixtures__/order-history.js';
import {
  REFUND_DETAILS_CSV,
  REFUND_FOREIGN,
  REFUND_FULL,
  REFUND_ORPHAN,
  REFUND_PARTIAL,
  REFUND_THOUSANDS,
  REFUND_TWICE,
  refundCsvWithRows,
  refundRowWith,
} from './__fixtures__/refund-details.js';

import type { PurchaseChargeLinkRow, PurchaseChargeRow } from '../../../db/schema.js';

const { orders, anomalies } = parseAmazonOrderHistory(ORDER_HISTORY_CSV, REFUND_DETAILS_CSV);

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

/**
 * Run the parsed order's charges through the real accounting service, as a
 * row would arrive from SQLite. Only the fields `computeAccounting` reads
 * are populated; the rest of `PurchaseChargeRow` is irrelevant to it.
 */
function accountingFor(sourceOrderId: string) {
  const parsed = order(sourceOrderId);
  const charges = (parsed.charges ?? []).map(
    (charge, index) =>
      ({
        id: `charge-${String(index)}`,
        orderAmountCents: charge.orderAmountCents ?? charge.amountCents,
        role: charge.role ?? 'capture',
      }) as PurchaseChargeRow
  );
  return computeAccounting(
    parsed.totalCents,
    charges,
    new Map<string, readonly PurchaseChargeLinkRow[]>()
  );
}

describe('attaching a refund to its order', () => {
  it('records a full refund as one negative charge', () => {
    const charges = order(REFUND_FULL).charges ?? [];
    expect(charges).toHaveLength(1);
    expect(charges[0]?.amountCents).toBe(-2200);
    expect(charges[0]?.orderAmountCents).toBe(-2200);
    expect(charges[0]?.role).toBe('refund');
  });

  it('attributes the charge to the merchant, not to the engine', () => {
    // `derived` is reserved for charges the reconciliation engine mints. A
    // refund Amazon itself states is merchant-asserted, and conflating the
    // two would let an inference overwrite the merchant's own figure.
    expect(order(REFUND_FULL).charges?.[0]?.origin).toBe('merchant');
  });

  it('dates the charge to the disbursement, which is what a transaction settles', () => {
    expect(order(REFUND_FULL).charges?.[0]?.chargedAt).toBe('2025-03-30T01:12:03.100Z');
  });

  it('states no source charge ref, because Amazon publishes none', () => {
    // A synthetic ref would be indistinguishable from a merchant-issued one
    // for every consumer that reads the column.
    expect(order(REFUND_FULL).charges?.[0]?.sourceChargeRef).toBeNull();
  });

  it('carries a partial refund without touching the order total', () => {
    const parsed = order(REFUND_PARTIAL);
    expect(parsed.totalCents).toBe(4900);
    expect(parsed.charges?.[0]?.amountCents).toBe(-1650);
  });

  it('carries both refunds when an order was refunded twice', () => {
    expect((order(REFUND_TWICE).charges ?? []).map((charge) => charge.amountCents)).toEqual([
      -1000, -500,
    ]);
  });

  it('leaves an unrefunded order with no charges at all', () => {
    // Amazon publishes no per-charge breakdown of what was paid, so the only
    // charge this adapter can emit is a refund.
    expect(order(ORDER_TWO_LINES_ONE_SHIPMENT).charges ?? []).toHaveLength(0);
  });

  it('never allocates a refund across lines', () => {
    // The disbursement feed names an order and never a line. Spreading it
    // pro rata would be a guess wearing the clothes of a measurement.
    for (const parsed of orders) {
      for (const charge of parsed.charges ?? []) {
        expect(charge.allocations ?? []).toHaveLength(0);
      }
    }
  });

  it('omits the charges key entirely rather than sending an empty array', () => {
    expect('charges' in order(ORDER_TWO_LINES_ONE_SHIPMENT)).toBe(false);
  });
});

describe('the ADR-042 invariant', () => {
  it('never lets a refund increase the residual', () => {
    // The bug this guards: an earlier accounting summed refunds with
    // captures, so a fully-paid order that was then refunded reported the
    // refund as unexplained money. Getting money back made the "something is
    // wrong" number go up.
    for (const parsed of orders) {
      const withRefunds = accountingFor(parsed.sourceOrderId ?? '');
      expect(withRefunds.residualCents).toBe(parsed.totalCents);
    }
  });

  it('reports a refund in its own bucket, as a positive magnitude', () => {
    const accounting = accountingFor(REFUND_FULL);
    expect(accounting.refundedCents).toBe(2200);
    expect(accounting.matchedCents).toBe(0);
    expect(accounting.awaitingImportCents).toBe(0);
  });

  it('keeps the consumer identity intact on a refunded order', () => {
    const accounting = accountingFor(REFUND_TWICE);
    expect(accounting.totalCents).toBe(
      accounting.matchedCents + accounting.awaitingImportCents + accounting.residualCents
    );
  });

  it('sums both refunds of a twice-refunded order into one figure', () => {
    expect(accountingFor(REFUND_TWICE).refundedCents).toBe(1500);
  });
});

describe('refunds that cannot be attached', () => {
  it('reports a refund whose order the history does not carry', () => {
    const orphans = anomalies.filter((anomaly) => anomaly.kind === 'orphan-refund');
    expect(orphans.map((anomaly) => anomaly.sourceOrderId)).toEqual([REFUND_ORPHAN]);
  });

  it('says how much money the orphan represents, so a backfill stays auditable', () => {
    const orphan = anomalies.find((anomaly) => anomaly.kind === 'orphan-refund');
    expect(orphan?.detail).toContain('9900c AUD');
  });

  it('refuses to convert a refund stated in another currency', () => {
    // `orderAmountCents` is the unit the residual is computed in, and the
    // bundle carries no rate. Recording the settlement figure as if it were
    // the order figure would misstate what came back by whatever the rate is.
    expect(anomalyKinds(REFUND_FOREIGN)).toContain('refund-currency-mismatch');
    expect(order(REFUND_FOREIGN).charges ?? []).toHaveLength(0);
  });

  it('attaches a refund whose currency matches a non-AUD order', () => {
    // The mismatch rule is about disagreement, not about foreignness.
    expect(order(REFUND_THOUSANDS).charges?.[0]?.amountCents).toBe(-149500);
    expect(order(REFUND_THOUSANDS).charges?.[0]?.currency).toBe('BRL');
  });

  it('does not attach a refund whose reversal never completed', () => {
    expect(order(ORDER_CANCELLED).charges ?? []).toHaveLength(0);
  });

  it('reports an orphan for a refund whose order was dropped', () => {
    // An order with an unreadable date is skipped, which leaves its refund
    // with nothing to attach to — the one case where both files are
    // well-formed and the money still cannot land.
    const result = parseAmazonOrderHistory(
      csvWithRows([rowWith({ 'Order ID': ORDER_SINGLE, 'Order Date': 'nonsense' })]),
      refundCsvWithRows([refundRowWith({})])
    );
    expect(result.orders).toHaveLength(0);
    expect(result.anomalies.map((anomaly) => anomaly.kind)).toContain('orphan-refund');
  });
});

describe('a bundle with no refunds file', () => {
  it('parses exactly as it did before refunds existed', () => {
    const without = parseAmazonOrderHistory(ORDER_HISTORY_CSV);
    for (const parsed of without.orders) {
      expect(parsed.charges ?? []).toHaveLength(0);
    }
    expect(without.orders).toHaveLength(orders.length);
  });
});

describe('checksum', () => {
  it('changes when a bundle gains a refund for an order', () => {
    // A re-download that adds a refund describes different content, and a
    // checksum that read as unchanged would assert the opposite.
    const without = parseAmazonOrderHistory(ORDER_HISTORY_CSV);
    const before = without.orders.find((parsed) => parsed.sourceOrderId === REFUND_FULL);
    expect(order(REFUND_FULL).checksum).not.toBe(before?.checksum);
  });

  it('leaves the checksum of an unrefunded order alone', () => {
    const without = parseAmazonOrderHistory(ORDER_HISTORY_CSV);
    const before = without.orders.find(
      (parsed) => parsed.sourceOrderId === ORDER_TWO_LINES_ONE_SHIPMENT
    );
    expect(order(ORDER_TWO_LINES_ONE_SHIPMENT).checksum).toBe(before?.checksum);
  });

  it('stays stable across runs', () => {
    const again = parseAmazonOrderHistory(ORDER_HISTORY_CSV, REFUND_DETAILS_CSV);
    expect(again.orders.map((parsed) => parsed.checksum)).toEqual(
      orders.map((parsed) => parsed.checksum)
    );
  });
});

describe('contract conformance', () => {
  it('emits a body the create endpoint accepts, refunds included', () => {
    for (const parsed of orders) {
      const result = CreatePurchaseBodySchema.safeParse(parsed);
      expect(result.error?.message ?? 'ok').toBe('ok');
    }
  });
});
