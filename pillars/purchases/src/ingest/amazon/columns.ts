/**
 * The vocabulary of the Amazon order-history export: its columns, its
 * status values, and the ways this parser can fail to represent a row.
 *
 * Split from the parsing itself so both the file-level shape check and the
 * per-order assembly can share one definition of what the export looks
 * like.
 */
import type { ShipmentStatus } from '../../contract/constants.js';

/** One CSV row, keyed by column name. */
export type Row = Record<string, string | undefined>;

export const ORDER_HISTORY_FILENAME = 'Order History.csv';

/**
 * Columns the parser reads. Presence of all of them is the bundle-shape
 * check: the self-serve Order History Report was retired and the DSAR
 * layout has changed across regions and over time, so a bundle that does
 * not carry these is a different format rather than a corrupt file.
 *
 * Failing loudly is the point. A parser that half-recognises an unfamiliar
 * layout writes plausible wrong rows, and `checksum` dedup then treats the
 * corrected re-ingest as a duplicate rather than a fix.
 */
export const REQUIRED_COLUMNS = [
  'ASIN',
  'Carrier Name & Tracking Number',
  'Currency',
  'Order Date',
  'Order ID',
  'Order Status',
  'Original Quantity',
  'Payment Method Type',
  'Product Name',
  'Ship Date',
  'Shipment Item Subtotal',
  'Shipment Item Subtotal Tax',
  'Shipment Status',
  'Shipping Charge',
  'Total Amount',
  'Total Discounts',
  'Unit Price',
] as const;

/** Amazon `Shipment Status` values mapped onto the pillar's closed vocabulary. */
export const SHIPMENT_STATUS_BY_SOURCE_VALUE = new Map<string, ShipmentStatus>([
  ['shipped', 'shipped'],
  ['delivered', 'delivered'],
  ['paid', 'pending'],
  ['cancelled', 'cancelled'],
  ['returned', 'returned'],
]);

/** Raised when the file is not an Amazon order-history export at all. */
export class AmazonBundleShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmazonBundleShapeError';
  }
}

/**
 * Something the parser could not represent faithfully. Anomalies never
 * abort the run — a 943-row backfill that dies on row 700 is worse than one
 * that lands every order it can and names what it could not take.
 *
 * `dropped-line` is the one that matters most: a line that cannot be read
 * is money leaving the order invisibly, because the order still totals
 * correctly from `Total Amount` and nothing downstream can tell.
 */
export interface AmazonAnomaly {
  readonly kind:
    | 'cancelled-order'
    | 'component-sum-mismatch'
    | 'concatenated-ship-date'
    | 'dropped-line'
    | 'unparseable-money'
    | 'zero-quantity-line';
  readonly sourceOrderId: string;
  readonly detail: string;
}
