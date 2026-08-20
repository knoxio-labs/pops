/**
 * Parser for `Your Amazon Orders/Digital Returns.csv` — the file that says
 * a digital purchase was reversed.
 *
 * Its grain matches `Digital Content Orders.csv` rather than the physical
 * `Refund Details.csv`: one row per monetary component of the reversal, so
 * a return is the SUM of its rows and never a single row's amount. That is
 * the whole reason this is not a widened `refunds.ts` — the physical file
 * states one amount per refund, this one states two to four signed pieces
 * that have to be netted before they mean anything.
 *
 * A return that nets to zero is a real and common outcome: an audiobook
 * bought with a subscription credit returns the credit, not money. See the
 * README beside this file.
 */
import { parseBundleRows } from '../amazon/csv.js';
import { readCents, readText, readTimestamp } from '../amazon/fields.js';
import { type SourceRefund } from '../amazon/refund-charges.js';
import {
  COMPLETED_RETURN_STATUS,
  DIGITAL_RETURNS_FILENAME,
  DIGITAL_RETURNS_REQUIRED_COLUMNS,
} from './columns.js';
import { netComponents, readComponents } from './components.js';

import type { AmazonAnomaly, Row } from '../amazon/columns.js';

export interface DigitalRefundParseResult {
  /** Keyed by `Order ID`, preserving file order within each order. */
  readonly refundsByOrderId: ReadonlyMap<string, readonly SourceRefund[]>;
  readonly anomalies: readonly AmazonAnomaly[];
}

/** Stands in on an anomaly for a row that names no order at all. */
const UNKNOWN_ORDER_ID = '(no order id)';

/**
 * Parse the CSV text of `Digital Returns.csv`.
 *
 * Rows are grouped by `(Order ID, Digital Order Item ID)` because that pair
 * is what one reversal is: an order item can in principle be returned on
 * its own, and the components of two reversals must not net against each
 * other into one wrong number.
 */
export function parseAmazonDigitalReturns(csvText: string): DigitalRefundParseResult {
  const anomalies: AmazonAnomaly[] = [];
  const refundsByOrderId = new Map<string, SourceRefund[]>();

  const rows = parseBundleRows(csvText, DIGITAL_RETURNS_FILENAME, DIGITAL_RETURNS_REQUIRED_COLUMNS);

  for (const [, group] of groupByReturnedItem(rows, anomalies)) {
    const refund = readRefund(group, anomalies);
    if (refund === null) continue;

    const existing = refundsByOrderId.get(refund.sourceOrderId);
    if (existing === undefined) refundsByOrderId.set(refund.sourceOrderId, [refund]);
    else existing.push(refund);
  }

  return { refundsByOrderId, anomalies };
}

function groupByReturnedItem(rows: readonly Row[], anomalies: AmazonAnomaly[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const sourceOrderId = readText(row['Order ID']);
    if (sourceOrderId === null) {
      anomalies.push({
        kind: 'dropped-refund',
        sourceOrderId: UNKNOWN_ORDER_ID,
        detail: 'return row carries no Order ID',
      });
      continue;
    }

    const key = `${sourceOrderId}|${readText(row['Digital Order Item ID']) ?? ''}`;
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [row]);
    else existing.push(row);
  }

  return groups;
}

/**
 * Whether the netted components agree with the total the file states
 * separately, where it states one at all.
 *
 * Two independent readings of one figure. A disagreement means one of them
 * is wrong and nothing in the file says which, so neither is used.
 */
function agreesWithStatedTotal(
  row: Row,
  amountCents: number,
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): boolean {
  const statedCents = readCents(row['Amount Refunded']);
  if (statedCents === null || statedCents === amountCents) return true;

  anomalies.push({
    kind: 'refund-amount-disagreement',
    sourceOrderId,
    detail:
      `Amount Refunded states ${String(statedCents)}c but the reversal's components net to ` +
      `${String(amountCents)}c; no refund was recorded`,
  });
  return false;
}

/**
 * Net one reversal's component rows into a refund, or explain why not.
 *
 * Three gates, each stopping a different way of inventing money:
 *
 * - **the return must be complete.** An unfinished reversal has not moved
 *   anything, and recording it would understate what the order cost.
 * - **the net must be positive.** A reversal that nets to zero returned a
 *   subscription credit rather than money, and a zero-value refund charge
 *   would claim a disbursement no bank statement will ever carry.
 * - **`Amount Refunded` must agree where the file states it.** It is a
 *   second, independent statement of the same figure, and where two
 *   readings disagree nothing in the file says which is right.
 */
function readRefund(rows: readonly Row[], anomalies: AmazonAnomaly[]): SourceRefund | null {
  const first = rows[0];
  if (first === undefined) return null;

  const sourceOrderId = readText(first['Order ID']) ?? UNKNOWN_ORDER_ID;
  const drop = (detail: string): null => {
    anomalies.push({ kind: 'dropped-refund', sourceOrderId, detail });
    return null;
  };

  const status = readText(first['Return Status']);
  if (status?.toLowerCase() !== COMPLETED_RETURN_STATUS) {
    return drop(
      `Return Status is ${status === null ? 'absent' : `"${status}"`} rather than ` +
        '"Customer Return Complete", so the reversal is not known to have finished and no ' +
        'refund was recorded'
    );
  }

  const components = readComponents(
    rows,
    'Transaction Amount',
    'Monetary Component Type',
    (anomaly) => {
      anomalies.push({
        ...anomaly,
        sourceOrderId,
        detail: `${anomaly.detail}; the reversal was not recorded`,
      });
    }
  );
  if (components === null) return null;

  const amountCents = netComponents(components);
  if (amountCents <= 0) {
    return drop(
      `the reversal's components net to ${String(amountCents)}c, so no money came back — a ` +
        'subscription credit was returned rather than a payment'
    );
  }

  if (!agreesWithStatedTotal(first, amountCents, sourceOrderId, anomalies)) return null;

  const currency = readText(first['Base Currency']);
  if (currency === null) return drop('unreadable Base Currency');

  const refundedAt = readTimestamp(first['Return Date']);
  if (refundedAt === null) return drop(`unreadable Return Date "${first['Return Date'] ?? ''}"`);

  return { sourceOrderId, amountCents, currency: currency.toUpperCase(), refundedAt };
}
