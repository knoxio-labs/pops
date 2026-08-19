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
import {
  COMPLETED_RETURN_STATUS,
  DIGITAL_RETURNS_FILENAME,
  DIGITAL_RETURNS_REQUIRED_COLUMNS,
  PRICE_COMPONENT,
  TAX_COMPONENT,
} from './columns.js';

import type { AmazonAnomaly, Row } from '../amazon/columns.js';

/** One reversal, netted across the component rows that describe it. */
export interface DigitalRefund {
  readonly sourceOrderId: string;
  /** Magnitude in {@link currency}. Positive — the charge that carries it is negated. */
  readonly amountCents: number;
  /** ISO 4217 as the file states it, upper-cased. */
  readonly currency: string;
  /** When the return completed, which is what a transaction would settle against. */
  readonly refundedAt: string;
}

export interface DigitalRefundParseResult {
  /** Keyed by `Order ID`, preserving file order within each order. */
  readonly refundsByOrderId: ReadonlyMap<string, readonly DigitalRefund[]>;
  readonly anomalies: readonly AmazonAnomaly[];
}

/** Stands in on an anomaly for a row that names no order at all. */
const UNKNOWN_ORDER_ID = '(no order id)';

/**
 * Parse the CSV text of `Digital Returns.csv`.
 *
 * Rows are grouped by `(Order ID, Digital Order Item ID)` because that pair
 * is what one reversal is: an order item can in principle be returned, and
 * the components of two reversals of two items must not net against each
 * other into one wrong number.
 */
export function parseAmazonDigitalReturns(csvText: string): DigitalRefundParseResult {
  const anomalies: AmazonAnomaly[] = [];
  const refundsByOrderId = new Map<string, DigitalRefund[]>();

  for (const [, rows] of groupByReturnedItem(
    parseBundleRows(csvText, DIGITAL_RETURNS_FILENAME, DIGITAL_RETURNS_REQUIRED_COLUMNS),
    anomalies
  )) {
    const refund = readRefund(rows, anomalies);
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
 * Net one reversal's component rows into a refund, or explain why not.
 *
 * Two gates, each stopping a different way of inventing money:
 *
 * - **the return must be complete.** An unfinished reversal has not moved
 *   anything, and recording it would understate what the order cost.
 * - **the net must be positive.** A reversal that nets to zero returned a
 *   subscription credit rather than money, and a zero-value refund charge
 *   would claim a disbursement no bank statement will ever carry.
 *
 * `Amount Refunded` is a second, independent statement of the same figure,
 * so where the file states it and it disagrees with the netted components
 * the refund is refused rather than guessed at — a disagreement means one
 * of the two readings is wrong and nothing in the file says which.
 */
function readRefund(rows: readonly Row[], anomalies: AmazonAnomaly[]): DigitalRefund | null {
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

  let amountCents = 0;
  for (const row of rows) {
    const component = readText(row['Monetary Component Type']);
    if (component !== PRICE_COMPONENT && component !== TAX_COMPONENT) {
      anomalies.push({
        kind: 'unknown-component-type',
        sourceOrderId,
        detail:
          `return row states Monetary Component Type "${component ?? ''}", which is neither ` +
          `"${PRICE_COMPONENT}" nor "${TAX_COMPONENT}"; the reversal was not recorded`,
      });
      return null;
    }

    const cents = readCents(row['Transaction Amount']);
    if (cents === null) {
      return drop(`unreadable Transaction Amount "${row['Transaction Amount'] ?? ''}"`);
    }
    amountCents += cents;
  }

  if (amountCents <= 0) {
    return drop(
      `the reversal's components net to ${String(amountCents)}c, so no money came back — a ` +
        'subscription credit was returned rather than a payment'
    );
  }

  const statedCents = readCents(first['Amount Refunded']);
  if (statedCents !== null && statedCents !== amountCents) {
    anomalies.push({
      kind: 'refund-amount-disagreement',
      sourceOrderId,
      detail:
        `Amount Refunded states ${String(statedCents)}c but the reversal's components net to ` +
        `${String(amountCents)}c; no refund was recorded`,
    });
    return null;
  }

  const currency = readText(first['Base Currency']);
  if (currency === null) return drop('unreadable Base Currency');

  const refundedAt = readTimestamp(first['Return Date']);
  if (refundedAt === null) return drop(`unreadable Return Date "${first['Return Date'] ?? ''}"`);

  return { sourceOrderId, amountCents, currency: currency.toUpperCase(), refundedAt };
}
