/**
 * An order's lines, out of a file whose rows are money rather than items.
 *
 * Both halves live here because they are one decision: a digital order's
 * item grain is `Digital Order Item ID`, and everything a line states —
 * name, ASIN, quantity, marketplace — repeats across that item's component
 * rows while the money does not.
 */
import { readProductIdentity, readQuantity, readText } from '../amazon/fields.js';
import { readComponents } from './components.js';

import type { CreateItemInput } from '../../db/services/purchase-input.js';
import type { AmazonAnomaly, Row } from '../amazon/columns.js';
import type { Component, ComponentTotals } from './components.js';

/** One order item, with the component rows that state its money. */
export interface DigitalLine {
  readonly row: Row;
  readonly components: readonly Component[];
}

/**
 * Split an order's rows into its items and read each one's components, or
 * give up on the whole order.
 *
 * Grouped on `Digital Order Item ID` rather than assumed to be one item.
 * The reference bundle has one item on 90 of 90 orders, but nothing in the
 * file's shape forbids two — the returns file next door groups on the same
 * pair for the same reason — and reading two items as one would name the
 * line after the first product while giving it both products' money, with
 * nothing to say it had happened.
 *
 * Giving up on the whole order rather than on the unreadable item is the
 * same call the component reader makes: zero is a real total here, so an
 * order landed short of a line would be indistinguishable from a promotion
 * that cancelled the price.
 */
export function readLines(
  rows: readonly Row[],
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): DigitalLine[] | null {
  const rowsByItemId = new Map<string, Row[]>();
  for (const row of rows) {
    const itemId = readText(row['Digital Order Item ID']) ?? '';
    const existing = rowsByItemId.get(itemId);
    if (existing === undefined) rowsByItemId.set(itemId, [row]);
    else existing.push(row);
  }

  const lines: DigitalLine[] = [];
  for (const itemRows of rowsByItemId.values()) {
    const first = itemRows[0];
    if (first === undefined) continue;

    const components = readComponents(
      itemRows,
      'Transaction Amount',
      'Component Type',
      (anomaly) => {
        anomalies.push({
          ...anomaly,
          sourceOrderId,
          detail: `${anomaly.detail}; the order was not ingested`,
        });
      }
    );
    if (components === null) return null;

    lines.push({ row: first, components });
  }

  return lines;
}

/**
 * One line, from the first of the component rows that describe it.
 *
 * `Product Name`, `ASIN`, `Quantity Ordered` and `Marketplace` are stated
 * per component row and repeat within an item, so the first row states them
 * all; `money` is that item's own components, netted. `kind` is `digital`
 * outright: the file is what a digital purchase IS, so this is transcribing
 * the merchant rather than proposing a classification, and it persists
 * asserted.
 *
 * No `shipmentRef`. There is no delivery: nothing arrives, nothing is
 * carried and nothing can be tracked, and a synthetic shipment would put a
 * fictional box in the one table whose whole purpose is real ones.
 */
export function buildItem(
  row: Row,
  money: ComponentTotals,
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): CreateItemInput | null {
  const name = readText(row['Product Name']);
  if (name === null) {
    anomalies.push({
      kind: 'dropped-line',
      sourceOrderId,
      detail: `line "${readText(row['ASIN']) ?? 'unknown ASIN'}" has no Product Name`,
    });
    return null;
  }

  const stated = readQuantity(row['Quantity Ordered']);
  if (stated === 0) {
    anomalies.push({
      kind: 'zero-quantity-line',
      sourceOrderId,
      detail: `line "${name}" has quantity 0; ingested as 1`,
    });
  }
  const quantity = stated === null || stated < 1 ? 1 : stated;

  return {
    name,
    sku: readProductIdentity(row['ASIN']),
    quantity,
    // Integer division truncates, so this reconstructs the line total only
    // where the subtotal divides evenly. `lineTotalCents` carries the
    // stated figure rather than the product, so no cent is invented.
    unitPriceCents: Math.trunc(money.subtotalCents / quantity),
    lineTotalCents: money.subtotalCents,
    // Negative, matching the physical adapter's sign convention: an
    // adjustment is directional, while the order-level `discountCents` is a
    // non-negative magnitude.
    allocatedAdjustmentCents: money.priceAdjustmentCents,
    kind: 'digital',
    merchantCategory: readText(row['Marketplace']),
  };
}
