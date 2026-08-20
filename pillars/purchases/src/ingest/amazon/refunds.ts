/**
 * Parser for `Your Returns & Refunds/Refund Details.csv` from the Amazon
 * DSAR bundle — the file that says money came back.
 *
 * The bundle ships five returns-related files. This reads one of them, and
 * the README beside this file carries the measurements behind that choice:
 * the other four state no money the disbursement feed does not already
 * state, and the two that carry per-line identifiers carry four rows
 * between them.
 *
 * One row is one refund. It names an order and never a line, which is the
 * whole reason `purchase_items.refundedCents` is left alone by this adapter
 * — see the README.
 */
import { type AmazonAnomaly, type Row } from './columns.js';
import { parseBundleRows } from './csv.js';
import { readCents, readText, readTimestamp } from './fields.js';
import { type SourceRefund } from './refund-charges.js';

export const REFUND_DETAILS_FILENAME = 'Refund Details.csv';

/** Path of the refunds file within the bundle root, as Amazon lays it out. */
export const REFUND_DETAILS_BUNDLE_PATH = ['Your Returns & Refunds', REFUND_DETAILS_FILENAME];

/**
 * Columns this parser reads. Presence of all of them is the shape check,
 * for the same reason the order-history parser has one: a bundle laid out
 * differently is a different export format, and half-recognising it writes
 * plausible wrong money.
 */
export const REFUND_REQUIRED_COLUMNS = [
  'Currency',
  'Order ID',
  'Refund Amount',
  'Refund Date',
  'Reversal Status',
] as const;

/**
 * The only `Reversal Status` that means the money has actually moved.
 *
 * All 16 rows of the reference bundle read `Completed`, so gating on it
 * changes nothing there. It is gated anyway because the two errors are not
 * symmetric: the order parser ingests a cancelled line because dropping it
 * would lose money that really was spent, whereas emitting a refund whose
 * reversal has not completed would *invent* money coming back and quietly
 * understate what an order cost. An unrecognised status is reported rather
 * than assumed either way.
 */
const COMPLETED_REVERSAL_STATUS = 'completed';

export interface AmazonRefundParseResult {
  /** Keyed by `Order ID`, preserving file order within each order. */
  readonly refundsByOrderId: ReadonlyMap<string, readonly SourceRefund[]>;
  readonly anomalies: readonly AmazonAnomaly[];
}

/** Stands in on an anomaly for a refund row that names no order at all. */
const UNKNOWN_ORDER_ID = '(no order id)';

/**
 * Parse the CSV text of `Refund Details.csv`.
 *
 * A row this cannot represent is reported as a `dropped-refund` and never
 * dropped quietly: an unread refund leaves the order reporting its full
 * total as spent, which is indistinguishable from an order that was never
 * refunded at all.
 */
export function parseAmazonRefundDetails(csvText: string): AmazonRefundParseResult {
  const anomalies: AmazonAnomaly[] = [];
  const refundsByOrderId = new Map<string, SourceRefund[]>();

  for (const row of parseBundleRows(csvText, REFUND_DETAILS_FILENAME, REFUND_REQUIRED_COLUMNS)) {
    const refund = readRefund(row, anomalies);
    if (refund === null) continue;

    const existing = refundsByOrderId.get(refund.sourceOrderId);
    if (existing === undefined) refundsByOrderId.set(refund.sourceOrderId, [refund]);
    else existing.push(refund);
  }

  return { refundsByOrderId, anomalies };
}

function readRefund(row: Row, anomalies: AmazonAnomaly[]): SourceRefund | null {
  const sourceOrderId = readText(row['Order ID']) ?? UNKNOWN_ORDER_ID;
  const drop = (detail: string): null => {
    anomalies.push({ kind: 'dropped-refund', sourceOrderId, detail });
    return null;
  };

  if (sourceOrderId === UNKNOWN_ORDER_ID) return drop('refund row carries no Order ID');

  const status = readText(row['Reversal Status']);
  if (status?.toLowerCase() !== COMPLETED_REVERSAL_STATUS) {
    return drop(
      `Reversal Status is ${status === null ? 'absent' : `"${status}"`} rather than ` +
        '"Completed", so the money is not known to have moved and no refund was recorded'
    );
  }

  const amountCents = readCents(row['Refund Amount']);
  if (amountCents === null) {
    return drop(`unreadable Refund Amount "${row['Refund Amount'] ?? ''}"`);
  }
  // A negative refund is a refund of a refund, which the bundle does not
  // contain and which would net the wrong way through `refundedCents`.
  if (amountCents <= 0) return drop(`Refund Amount is not positive: ${String(amountCents)}c`);

  const currency = readText(row['Currency']);
  if (currency === null) return drop('unreadable Currency');

  const refundedAt = readTimestamp(row['Refund Date']);
  // `Refund Date` is the disbursement instant and the only date a finance
  // transaction could be matched against; `Creation Date` is when Amazon
  // wrote the record, minutes later, and is not a substitute.
  if (refundedAt === null) return drop(`unreadable Refund Date "${row['Refund Date'] ?? ''}"`);

  return { sourceOrderId, amountCents, currency: currency.toUpperCase(), refundedAt };
}
