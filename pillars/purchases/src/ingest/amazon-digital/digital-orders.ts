/**
 * Parser for `Your Amazon Orders/Digital Content Orders.csv` from the
 * Amazon DSAR bundle.
 *
 * Digital orders are a **separate Order ID namespace** from physical ones —
 * `D01-…` against the physical `NNN-NNNNNNN-NNNNNNN` — and so they are
 * ingested under their own `purchase_sources` row rather than through a
 * widened order-history parser. The measurements behind that, and behind
 * the component arithmetic in `components.ts`, are in the README beside
 * this file.
 */
import { createHash } from 'node:crypto';

import { parseBundleRows } from '../amazon/csv.js';
import { readQuantity, readText, readTimestamp } from '../amazon/fields.js';
import {
  buildRefundCharges,
  reportOrphanRefunds,
  type SourceRefund,
} from '../amazon/refund-charges.js';
import {
  DIGITAL_ORDERS_FILENAME,
  DIGITAL_REQUIRED_COLUMNS,
  SUCCESSFUL_ORDER_STATUS,
} from './columns.js';
import { readComponents, totalComponents } from './components.js';
import { parseAmazonDigitalReturns } from './digital-returns.js';

import type {
  CreateChargeInput,
  CreateItemInput,
  CreatePurchaseInput,
} from '../../db/services/purchase-input.js';
import type { AmazonAnomaly, Row } from '../amazon/columns.js';
import type { Component, ComponentTotals } from './components.js';

/**
 * `purchase_sources.id` this adapter writes under.
 *
 * Its own row rather than `amazon`, which is what makes the namespaces
 * safe: `(source, sourceOrderId)` is the unique index, so a digital order
 * id may equal a physical one without either being read as a re-import of
 * the other. Sharing the source would make that collision a silent 409.
 */
export const AMAZON_DIGITAL_SOURCE_ID = 'amazon-digital';

/**
 * Order-grain fact recorded when a promotion cancels the whole price.
 *
 * An audiobook redeemed against a subscription credit states a $14.95 list
 * price and a $0.00 net, and without this an order that cost nothing is
 * indistinguishable from a giveaway. Free-form, like `date-uncertain` —
 * see `db/schema/purchases.ts`.
 */
export const PROMOTION_OFFSET_TAG = 'promotion-offset';

/** Stands in on an anomaly for a row that names no order at all. */
const UNKNOWN_ORDER_ID = '(no order id)';

export interface AmazonDigitalParseResult {
  readonly orders: readonly CreatePurchaseInput[];
  readonly anomalies: readonly AmazonAnomaly[];
}

/**
 * Parse the CSV text of `Digital Content Orders.csv` into orders ready for
 * `POST /purchases`.
 *
 * `digitalReturnsCsv` is the text of `Digital Returns.csv` where the bundle
 * carries it. Returns join here, not in a later pass, for the reason the
 * physical adapter joins refunds at creation: `POST /purchases` is this
 * pillar's only write path, so an order is written once with everything the
 * bundle says about it.
 */
export function parseAmazonDigitalOrders(
  csvText: string,
  digitalReturnsCsv?: string
): AmazonDigitalParseResult {
  const orders: CreatePurchaseInput[] = [];
  const anomalies: AmazonAnomaly[] = [];

  const returns =
    digitalReturnsCsv === undefined
      ? { refundsByOrderId: new Map<string, readonly SourceRefund[]>(), anomalies: [] }
      : parseAmazonDigitalReturns(digitalReturnsCsv);
  anomalies.push(...returns.anomalies);

  const byOrderId = groupByOrderId(
    parseBundleRows(csvText, DIGITAL_ORDERS_FILENAME, DIGITAL_REQUIRED_COLUMNS),
    anomalies
  );

  const builtOrderIds = new Set<string>();
  for (const [sourceOrderId, rows] of byOrderId) {
    const order = buildOrder(
      sourceOrderId,
      rows,
      returns.refundsByOrderId.get(sourceOrderId) ?? [],
      anomalies
    );
    if (order === null) continue;
    orders.push(order);
    builtOrderIds.add(sourceOrderId);
  }

  reportOrphanRefunds(returns.refundsByOrderId, builtOrderIds, DIGITAL_ORDERS_FILENAME, anomalies);

  return { orders, anomalies };
}

function groupByOrderId(rows: readonly Row[], anomalies: AmazonAnomaly[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const sourceOrderId = readText(row['Order ID']);
    if (sourceOrderId === null) {
      anomalies.push({
        kind: 'dropped-line',
        sourceOrderId: UNKNOWN_ORDER_ID,
        detail: `row for "${readText(row['ASIN']) ?? 'unknown ASIN'}" carries no Order ID`,
      });
      continue;
    }

    const existing = groups.get(sourceOrderId);
    if (existing === undefined) groups.set(sourceOrderId, [row]);
    else existing.push(row);
  }

  return groups;
}

function buildOrder(
  sourceOrderId: string,
  rows: readonly Row[],
  refunds: readonly SourceRefund[],
  anomalies: AmazonAnomaly[]
): CreatePurchaseInput | null {
  const first = rows[0];
  if (first === undefined) return null;

  const header = readOrderHeader(first, sourceOrderId, anomalies);
  if (header === null) return null;

  const lines = readLines(rows, sourceOrderId, anomalies);
  if (lines === null) return null;

  const money = totalComponents(lines.flatMap((line) => line.components));
  if (money.totalCents < 0) {
    anomalies.push({
      kind: 'dropped-order',
      sourceOrderId,
      detail:
        `the order's components net to ${String(money.totalCents)}c, which would land as ` +
        'negative spend; nothing in the file says what a merchant paying the account means',
    });
    return null;
  }

  const items = lines.flatMap((line) => {
    const item = buildItem(line.row, totalComponents(line.components), sourceOrderId, anomalies);
    return item === null ? [] : [item];
  });
  const charges = buildRefundCharges(sourceOrderId, header.currency, refunds, anomalies);

  return {
    source: AMAZON_DIGITAL_SOURCE_ID,
    sourceOrderId,
    ingestMethod: 'export',
    orderedAt: header.orderedAt,
    currency: header.currency,
    subtotalCents: money.subtotalCents,
    taxCents: money.taxCents,
    discountCents: money.discountCents,
    totalCents: money.totalCents,
    merchantEntityName: 'Amazon',
    // The file states no payment instrument on any row — `Payment
    // Information` reads "Payment Instrument Details Not Available"
    // throughout — so there is nothing to claim a card from.
    settlementMode: 'unknown',
    rawRef: `${DIGITAL_ORDERS_FILENAME}#${sourceOrderId}`,
    checksum: checksumFor(sourceOrderId, rows, charges),
    ...(items.length > 0 ? { items } : {}),
    ...(charges.length > 0 ? { charges } : {}),
    // A price fully cancelled by a promotion, rather than a thing that was
    // free. The two are the same $0 in every column but this one.
    ...(money.totalCents === 0 && money.subtotalCents > 0 ? { tags: [PROMOTION_OFFSET_TAG] } : {}),
  };
}

/** One order item, with the component rows that state its money. */
interface DigitalLine {
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
function readLines(
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
 * Read the three order-level facts without which an order must not be
 * written.
 *
 * A status other than `SUCCESS` is the one that reads oddly beside the
 * physical parser, which ingests a cancelled line. The two are consistent:
 * there the money really was spent and dropping the line would lose it,
 * whereas here recording a failed purchase would invent spend that never
 * left the account.
 */
function readOrderHeader(
  row: Row,
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): { orderedAt: string; currency: string } | null {
  const drop = (detail: string): null => {
    anomalies.push({ kind: 'dropped-order', sourceOrderId, detail });
    return null;
  };

  const status = readText(row['Order Status']);
  if (status?.toLowerCase() !== SUCCESSFUL_ORDER_STATUS) {
    return drop(
      `Order Status is ${status === null ? 'absent' : `"${status}"`} rather than "SUCCESS", ` +
        'so the purchase did not complete and no spend was recorded'
    );
  }

  const orderedAt = readTimestamp(row['Order Date']);
  if (orderedAt === null) return drop(`unreadable Order Date "${row['Order Date'] ?? ''}"`);

  const currency = readText(row['Base Currency Code']);
  if (currency === null) return drop('unreadable Base Currency Code');

  return { orderedAt, currency: currency.toUpperCase() };
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
function buildItem(
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
    sku: readText(row['ASIN']),
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

/**
 * Content hash over everything the bundle says about the order.
 *
 * `purchases.checksum` is unique GLOBALLY rather than per source, so the
 * order id and the source id are both hashed: two renewals of one
 * subscription differ in nothing else, and an order that hashed alike would
 * be rejected as a duplicate of an order it has nothing to do with.
 */
function checksumFor(
  sourceOrderId: string,
  rows: readonly Row[],
  charges: readonly CreateChargeInput[]
): string {
  const hash = createHash('sha256');
  hash.update(`${AMAZON_DIGITAL_SOURCE_ID}:${sourceOrderId}`);
  for (const row of rows) {
    for (const column of DIGITAL_REQUIRED_COLUMNS) {
      hash.update(` ${column}=${row[column] ?? ''}`);
    }
  }
  for (const charge of charges) {
    hash.update(
      ` refund=${String(charge.amountCents)}${charge.currency ?? ''}@${charge.chargedAt ?? ''}`
    );
  }
  return hash.digest('hex');
}
