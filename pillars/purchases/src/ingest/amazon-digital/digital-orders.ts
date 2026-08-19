/**
 * Parser for `Your Amazon Orders/Digital Content Orders.csv` from the
 * Amazon DSAR bundle.
 *
 * Digital orders are a **separate Order ID namespace** from physical ones —
 * `D01-…` against the physical `NNN-NNNNNNN-NNNNNNN` — and so they are
 * ingested under their own `purchase_sources` row rather than through a
 * widened order-history parser. The measurements behind that, and behind
 * the component arithmetic below, are in the README beside this file.
 */
import { createHash } from 'node:crypto';

import { parseBundleRows } from '../amazon/csv.js';
import { readCents, readQuantity, readText, readTimestamp } from '../amazon/fields.js';
import { buildRefundCharges, reportOrphanRefunds } from '../amazon/refund-charges.js';
import {
  DIGITAL_ORDERS_FILENAME,
  DIGITAL_REQUIRED_COLUMNS,
  PRICE_COMPONENT,
  SUCCESSFUL_ORDER_STATUS,
  TAX_COMPONENT,
} from './columns.js';
import { parseAmazonDigitalReturns, type DigitalRefund } from './digital-returns.js';

import type {
  CreateChargeInput,
  CreateItemInput,
  CreatePurchaseInput,
} from '../../db/services/purchase-input.js';
import type { AmazonAnomaly, Row } from '../amazon/columns.js';

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
      ? { refundsByOrderId: new Map<string, readonly DigitalRefund[]>(), anomalies: [] }
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

/** The money an order's component rows add up to, in the order's currency. */
interface OrderMoney {
  /** Σ positive `Price Amount` components. */
  readonly subtotalCents: number;
  /** Σ positive `Tax` components. */
  readonly taxCents: number;
  /** Magnitude of Σ negative components, of either type. */
  readonly discountCents: number;
  /** Σ every component, signed. What the card was actually charged. */
  readonly totalCents: number;
  /** Σ negative `Price Amount` components, kept signed for the line. */
  readonly priceAdjustmentCents: number;
}

function buildOrder(
  sourceOrderId: string,
  rows: readonly Row[],
  refunds: readonly DigitalRefund[],
  anomalies: AmazonAnomaly[]
): CreatePurchaseInput | null {
  const first = rows[0];
  if (first === undefined) return null;

  const drop = (detail: string): null => {
    anomalies.push({ kind: 'dropped-order', sourceOrderId, detail });
    return null;
  };

  // A row whose `Order Status` is not SUCCESS describes a purchase that did
  // not complete. The physical parser ingests a cancelled line because the
  // money was really spent; here the opposite holds — recording a failed
  // digital order would invent spend that never left the account.
  const status = readText(first['Order Status']);
  if (status?.toLowerCase() !== SUCCESSFUL_ORDER_STATUS) {
    return drop(
      `Order Status is ${status === null ? 'absent' : `"${status}"`} rather than "SUCCESS", ` +
        'so the purchase did not complete and no spend was recorded'
    );
  }

  const orderedAt = readTimestamp(first['Order Date']);
  if (orderedAt === null) return drop(`unreadable Order Date "${first['Order Date'] ?? ''}"`);

  const currency = readText(first['Base Currency Code']);
  if (currency === null) return drop('unreadable Base Currency Code');
  const orderCurrency = currency.toUpperCase();

  const money = readComponents(rows, sourceOrderId, anomalies);
  if (money === null) return null;

  const item = buildItem(first, money, sourceOrderId, anomalies);
  const charges = buildRefundCharges(sourceOrderId, orderCurrency, refunds, anomalies);

  // A price fully cancelled by a promotion, rather than a thing that was
  // free. The two are the same $0 in every column but this one.
  const promotionOffset = money.totalCents === 0 && money.subtotalCents > 0;

  return {
    source: AMAZON_DIGITAL_SOURCE_ID,
    sourceOrderId,
    ingestMethod: 'export',
    orderedAt,
    currency: orderCurrency,
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
    ...(item === null ? {} : { items: [item] }),
    ...(charges.length > 0 ? { charges } : {}),
    ...(promotionOffset ? { tags: [PROMOTION_OFFSET_TAG] } : {}),
  };
}

/**
 * Net an order's component rows into the four money fields.
 *
 * The file is one row per monetary component, and `Transaction Amount` is
 * that component's own money. Summing it across the order is the only
 * figure in the file that states what the card was charged: `Price` is the
 * list price, and on a credit-redeemed audiobook it is $14.95 against $0.00
 * actually paid.
 *
 * The redemption arrives as a matched pair — `Price Amount +13.59` with
 * `Price Amount -13.59` marked `Promotion`, and the same for tax — so the
 * positives are the goods and the negatives are the discount. Reading the
 * first row's `Price` instead would report every one of those orders at
 * full price.
 *
 * An order with no readable component is dropped rather than landed at
 * zero: zero is a real total here, so a parse failure that produced one
 * would be indistinguishable from a promotion that cancelled the price.
 */
function readComponents(
  rows: readonly Row[],
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): OrderMoney | null {
  let subtotalCents = 0;
  let taxCents = 0;
  let discountCents = 0;
  let priceAdjustmentCents = 0;

  for (const row of rows) {
    const component = readText(row['Component Type']);
    if (component !== PRICE_COMPONENT && component !== TAX_COMPONENT) {
      anomalies.push({
        kind: 'unknown-component-type',
        sourceOrderId,
        detail:
          `row states Component Type "${component ?? ''}", which is neither ` +
          `"${PRICE_COMPONENT}" nor "${TAX_COMPONENT}"; the order was not ingested because ` +
          'nothing says which side of the subtotal/tax split it belongs on',
      });
      return null;
    }

    const cents = readCents(row['Transaction Amount']);
    if (cents === null) {
      anomalies.push({
        kind: 'unparseable-money',
        sourceOrderId,
        detail:
          `${component} component has an unreadable Transaction Amount ` +
          `"${row['Transaction Amount'] ?? ''}"; the order was not ingested`,
      });
      return null;
    }

    if (cents < 0) {
      discountCents -= cents;
      if (component === PRICE_COMPONENT) priceAdjustmentCents += cents;
    } else if (component === PRICE_COMPONENT) subtotalCents += cents;
    else taxCents += cents;
  }

  return {
    subtotalCents,
    taxCents,
    discountCents,
    totalCents: subtotalCents + taxCents - discountCents,
    priceAdjustmentCents,
  };
}

/**
 * The single line every digital order has.
 *
 * One item per order on 90 of 90 orders in the reference bundle — a digital
 * order is one redemption — so `Product Name` and `ASIN` are read from the
 * first row and the components carry the money. `kind` is `digital`
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
  money: OrderMoney,
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
  const quantity = stated === null || stated < 1 ? 1 : stated;
  if (stated === 0) {
    anomalies.push({
      kind: 'zero-quantity-line',
      sourceOrderId,
      detail: `line "${name}" has quantity 0; ingested as 1`,
    });
  }

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
 * The source id is hashed first, and it is what keeps the two namespaces
 * apart under the GLOBAL uniqueness of `purchases.checksum`: a digital and
 * a physical order sharing an id would otherwise be free to hash alike, and
 * the second one imported would be rejected as a duplicate of an order it
 * has nothing to do with.
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
