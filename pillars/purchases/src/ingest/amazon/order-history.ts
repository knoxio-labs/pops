/**
 * Parser for `Your Amazon Orders/Order History.csv` from the Amazon DSAR
 * ("Request My Data") bundle.
 *
 * The CSV is one row per shipment-item; this file turns those rows into
 * orders. The mixed-grain arithmetic that makes that non-trivial lives in
 * `build-shipment.ts`, and the measurements behind every choice are in the
 * README beside this file.
 */
import { createHash } from 'node:crypto';

import Papa from 'papaparse';

import { buildShipment } from './build-shipment.js';
import {
  AmazonBundleShapeError,
  ORDER_HISTORY_FILENAME,
  REQUIRED_COLUMNS,
  type AmazonAnomaly,
  type Row,
} from './columns.js';
import { readText, readTimestamp } from './fields.js';
import { buildRefundCharges, reportOrphanRefunds } from './refund-charges.js';
import { parseAmazonRefundDetails, type AmazonRefund } from './refunds.js';

import type { CreateChargeInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';

/** `purchase_sources.id` this adapter writes under. */
export const AMAZON_SOURCE_ID = 'amazon';

/** Stands in on an anomaly for a row that names no order at all. */
const UNKNOWN_ORDER_ID = '(no order id)';

export interface AmazonParseResult {
  readonly orders: readonly CreatePurchaseInput[];
  readonly anomalies: readonly AmazonAnomaly[];
}

/**
 * Parse the CSV text of `Order History.csv` into orders ready for
 * `POST /purchases`.
 *
 * Row order is preserved into `position` on every shipment and line,
 * because ids are random UUIDs and a whole ingest shares a `createdAt` to
 * the second — without the source document's own ordering there is nothing
 * stable to sort by, and the deterministic candidate ordering the
 * reconciliation engine needs would not hold.
 *
 * `refundDetailsCsv` is the text of `Refund Details.csv` when the bundle
 * carries it. Refunds join here rather than in a later pass because both
 * files arrive in the same download and `POST /purchases` is the only write
 * path this pillar has: an order is created once, with everything the
 * bundle says about it, and a re-ingest skips it (see the README).
 */
export function parseAmazonOrderHistory(
  csvText: string,
  refundDetailsCsv?: string
): AmazonParseResult {
  const orders: CreatePurchaseInput[] = [];
  const anomalies: AmazonAnomaly[] = [];

  const refunds =
    refundDetailsCsv === undefined
      ? { refundsByOrderId: new Map<string, readonly AmazonRefund[]>(), anomalies: [] }
      : parseAmazonRefundDetails(refundDetailsCsv);
  anomalies.push(...refunds.anomalies);

  const byOrderId = new Map<string, Row[]>();
  for (const row of parseRows(csvText)) {
    const orderId = readText(row['Order ID']);
    if (orderId === null) {
      // Nothing can be done with a row that names no order, but dropping it
      // quietly would be the one thing this adapter promises not to do.
      anomalies.push({
        kind: 'dropped-line',
        sourceOrderId: UNKNOWN_ORDER_ID,
        detail: `row for "${readText(row['ASIN']) ?? 'unknown ASIN'}" carries no Order ID`,
      });
      continue;
    }
    const existing = byOrderId.get(orderId);
    if (existing === undefined) byOrderId.set(orderId, [row]);
    else existing.push(row);
  }

  const attached = new Set<string>();
  for (const [orderId, orderRows] of byOrderId) {
    const orderRefunds = refunds.refundsByOrderId.get(orderId) ?? [];
    const order = buildOrder(orderId, orderRows, orderRefunds, anomalies);
    if (order === null) continue;
    orders.push(order);
    attached.add(orderId);
  }

  reportOrphanRefunds(refunds.refundsByOrderId, attached, anomalies);

  return { orders, anomalies };
}

function parseRows(csvText: string): Row[] {
  const parsed = Papa.parse<Row>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  // Papa returns rows AND errors, so ignoring `errors` lets a malformed file
  // half-parse into plausible wrong orders — the exact outcome the shape
  // check below exists to prevent. The reference bundle parses with zero
  // errors, so any error at all means this is not the file we think it is.
  const [firstError] = parsed.errors;
  if (firstError !== undefined) {
    throw new AmazonBundleShapeError(
      `${ORDER_HISTORY_FILENAME} did not parse as CSV: ${firstError.type} ${firstError.code} ` +
        `at row ${String(firstError.row ?? '?')} — ${firstError.message}`
    );
  }

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) {
    throw new AmazonBundleShapeError(`${ORDER_HISTORY_FILENAME} has no header row`);
  }

  const present = new Set(fields);
  const missing = REQUIRED_COLUMNS.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new AmazonBundleShapeError(
      `${ORDER_HISTORY_FILENAME} is missing ${String(missing.length)} expected column(s): ` +
        `${missing.join(', ')}. This is a different export format, not a corrupt file — ` +
        `verify the bundle against a fresh download before widening the parser.`
    );
  }

  return parsed.data;
}

function buildOrder(
  sourceOrderId: string,
  rows: readonly Row[],
  refunds: readonly AmazonRefund[],
  anomalies: AmazonAnomaly[]
): CreatePurchaseInput | null {
  const firstRow = rows[0];
  if (firstRow === undefined) return null;

  const header = readOrderHeader(firstRow, sourceOrderId, anomalies);
  if (header === null) return null;
  const { orderedAt, currency } = header;
  const orderCurrency = currency.toUpperCase();

  const built = [...groupShipmentRows(rows)]
    .map(([key, shipmentRows]) =>
      buildShipment(`${sourceOrderId}|${key}`, shipmentRows, sourceOrderId, anomalies)
    )
    .filter((shipment) => shipment !== null);

  const sum = (pick: (shipment: (typeof built)[number]) => number): number =>
    built.reduce((total, shipment) => total + pick(shipment), 0);

  if (rows.every((row) => readText(row['Order Status'])?.toLowerCase() === 'cancelled')) {
    anomalies.push({
      kind: 'cancelled-order',
      sourceOrderId,
      detail: `every line is cancelled; ingested with a total of ${String(sum((s) => s.totalCents))}c`,
    });
  }

  const paymentHint = readText(firstRow['Payment Method Type']);
  const charges = buildRefundCharges(sourceOrderId, orderCurrency, refunds, anomalies);

  return {
    source: AMAZON_SOURCE_ID,
    sourceOrderId,
    ingestMethod: 'export',
    orderedAt,
    currency: orderCurrency,
    subtotalCents: Math.max(
      sum((s) => s.subtotalCents),
      0
    ),
    taxCents: Math.max(
      sum((s) => s.taxCents),
      0
    ),
    shippingCents: Math.max(
      sum((s) => s.shippingCents),
      0
    ),
    // The two sides disagree on sign, deliberately. Amazon states discounts
    // as NEGATIVE (`'-5.5'`), and the per-line `allocatedAdjustmentCents`
    // keeps that sign because an adjustment is directional. The order-level
    // `discountCents` is a NonNegativeCents magnitude, so it takes the
    // absolute value here. Do not "fix" this into agreeing: dropping the
    // Math.abs makes the contract reject every discounted order, and
    // negating the line adjustment reverses the residual arithmetic.
    discountCents: Math.abs(sum((s) => s.discountCents)),
    totalCents: sum((s) => s.totalCents),
    merchantEntityName: 'Amazon',
    settlementMode: paymentHint === null ? 'unknown' : 'card',
    paymentHint,
    rawRef: `${ORDER_HISTORY_FILENAME}#${sourceOrderId}`,
    checksum: checksumFor(sourceOrderId, rows, charges),
    shipments: built.map((shipment) => shipment.shipment),
    items: built.flatMap((shipment) => [...shipment.items]),
    ...(charges.length > 0 ? { charges } : {}),
  };
}

/**
 * Read the two order-level fields without which an order cannot exist.
 *
 * Losing a whole order is the largest thing this parser can drop, and
 * `orderedAt` is not optional downstream: it is what the reconciliation
 * window is measured against, so an order without one could never match a
 * transaction anyway. Skipping is right; skipping quietly is not.
 */
function readOrderHeader(
  row: Row,
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): { orderedAt: string; currency: string } | null {
  const orderedAt = readTimestamp(row['Order Date']);
  const currency = readText(row['Currency']);
  if (orderedAt !== null && currency !== null) return { orderedAt, currency };

  anomalies.push({
    kind: 'dropped-order',
    sourceOrderId,
    detail:
      'order was not ingested: ' +
      (orderedAt === null ? 'unreadable Order Date' : 'unreadable Currency'),
  });
  return null;
}

/**
 * Group an order's rows into shipments.
 *
 * `Ship Date` and the tracking number are perfectly correlated within an
 * order in the reference bundle — 23 orders have more than one of each and
 * none disagree — so either identifies a delivery. Ship date is used
 * because it survives the 30 rows that carry no tracking at all.
 */
function groupShipmentRows(rows: readonly Row[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = readText(row['Ship Date']) ?? 'unshipped';
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [row]);
    else existing.push(row);
  }
  return groups;
}

/**
 * Content hash over everything the bundle says about the order, so
 * re-ingesting an unchanged bundle is a no-op. The `(source,
 * sourceOrderId)` unique index is the stronger guard — it catches a
 * re-import even if this recipe changes — so this only has to be stable,
 * not clever.
 *
 * The refunds are hashed alongside the rows because a later download that
 * adds a refund to an order describes different content, and a checksum
 * that read as unchanged would assert the opposite.
 */
function checksumFor(
  sourceOrderId: string,
  rows: readonly Row[],
  charges: readonly CreateChargeInput[]
): string {
  const hash = createHash('sha256');
  hash.update(`${AMAZON_SOURCE_ID}:${sourceOrderId}`);
  for (const row of rows) {
    for (const column of REQUIRED_COLUMNS) {
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
