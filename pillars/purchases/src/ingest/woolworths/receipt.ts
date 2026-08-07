/**
 * One captured receipt → one {@link CreatePurchaseInput}.
 *
 * Two decisions here are not obvious from the code.
 *
 * **GST is not carried into `taxCents`.** Australian shelf prices include
 * it, so the line totals already contain the GST the receipt states
 * separately as `#Total includes GST`. Putting that figure in `taxCents`
 * would make it appear twice in any sum of components. It is not lost:
 * `gstApplicable` on each item — the `#` prefix the receipt prints — is
 * exactly the information needed to reconstruct it.
 *
 * **The natural key is the till transaction, not the API id.** The
 * `activityDetailsId` is an opaque, base64 blob whose stability across
 * exports nothing guarantees, whereas store/POS/transaction/date is what
 * the receipt itself identifies the purchase by and is printed on the
 * paper. Re-exporting therefore updates the same purchase rather than
 * minting a second copy of it.
 */
import { createHash } from 'node:crypto';

import { readBlocks, type ReceiptHeader, type ReceiptPage } from './blocks.js';
import { readPayment } from './payment.js';
import { groupReceiptRows, parseAmountCents, type GroupingAnomaly } from './rows.js';
import { readTransactionDetails } from './time.js';

import type { CreateItemInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';

export const WOOLWORTHS_SOURCE_ID = 'woolworths';

const CURRENCY = 'AUD';

/**
 * Tolerance for `Σ lines − Σ discounts === stated total`.
 *
 * Zero. Unlike the Amazon export, which allocates shipping and tax across
 * lines and lands a couple of cents out, a till receipt prints exactly what
 * was tendered — so a mismatch here means the grouping misread a row, which
 * is the one failure this adapter exists to prevent.
 */
const TOTAL_TOLERANCE_CENTS = 0;

export interface WoolworthsAnomaly {
  readonly kind: GroupingAnomaly['kind'] | 'dropped-receipt' | 'totals-mismatch';
  readonly activityDetailsId: string;
  readonly detail: string;
}

export interface MappedReceipt {
  readonly purchase: CreatePurchaseInput;
  readonly anomalies: readonly WoolworthsAnomaly[];
}

function sumLines(lines: readonly { amount?: string | null }[] | null | undefined): number {
  return (lines ?? []).reduce(
    (total, line) => total + Math.abs(parseAmountCents(line.amount) ?? 0),
    0
  );
}

/**
 * Content hash over what was *mapped*, not over the payload it came from.
 *
 * Hashing the raw `details` array would make the checksum turn over
 * whenever the site reorders its union or adds a field to a block nothing
 * reads — marking every purchase in a year's history as changed for
 * reasons that changed nothing about the purchase.
 */
function checksumFor(purchase: {
  sourceOrderId: string;
  orderedAt: string;
  totalCents: number;
  discountCents: number;
  items: readonly CreateItemInput[];
}): string {
  const hash = createHash('sha256');
  hash.update(`${WOOLWORTHS_SOURCE_ID}:${purchase.sourceOrderId}:${purchase.orderedAt}`);
  hash.update(`:${String(purchase.totalCents)}:${String(purchase.discountCents)}`);
  for (const item of purchase.items) {
    hash.update(
      ` ${item.name}|${String(item.quantity)}|${String(item.unitPriceCents)}|${String(item.lineTotalCents)}`
    );
  }
  return hash.digest('hex');
}

function toItem(grouped: ReturnType<typeof groupReceiptRows>['items'][number]): CreateItemInput {
  return {
    name: grouped.name,
    quantity: grouped.quantity,
    unitPriceCents: grouped.unitPriceCents,
    lineTotalCents: grouped.lineTotalCents,
    // The receipt's own wording for a promotion, kept verbatim rather than
    // parsed into a discount the merchant never stated as one, plus the `^`
    // marker as a tag of its own so "was this on special" is answerable
    // without re-reading prose.
    tags: grouped.promotional ? [...grouped.notes, 'promotional-price'] : grouped.notes,
    merchantCategory: grouped.gstApplicable ? 'gst-applicable' : null,
  };
}

/**
 * The store, as both a key part and a label.
 *
 * `title` already reads `1034 Canterbury Plaza`, so the merchant name is
 * that prefixed rather than the store number repeated — and the title is
 * also the fallback for the number itself. A literal `unknown` in the key
 * is a bucket every store without a `storeNo` falls into, and two shops at
 * different stores that share a POS and transaction number would collide
 * there and silently de-duplicate each other.
 */
function readStore(header: ReceiptHeader | null): { number: string; merchantName: string } {
  const title = header?.title ?? null;
  const fromTitle = /^\s*(\d+)\b/u.exec(title ?? '')?.[1] ?? null;
  return {
    number: header?.storeNo ?? fromTitle ?? 'unknown-store',
    merchantName: title === null ? 'Woolworths' : `Woolworths ${title}`,
  };
}

function collectAnomalies(
  activityDetailsId: string,
  grouping: readonly GroupingAnomaly[],
  totals: { subtotalCents: number; discountCents: number; totalCents: number }
): WoolworthsAnomaly[] {
  const anomalies: WoolworthsAnomaly[] = grouping.map((anomaly) => ({
    kind: anomaly.kind,
    activityDetailsId,
    detail: anomaly.detail,
  }));

  const residual = totals.subtotalCents - totals.discountCents - totals.totalCents;
  if (Math.abs(residual) > TOTAL_TOLERANCE_CENTS) {
    anomalies.push({
      kind: 'totals-mismatch',
      activityDetailsId,
      detail:
        `lines total ${String(totals.subtotalCents)}c less ` +
        `${String(totals.discountCents)}c of discounts, but the receipt states ` +
        `${String(totals.totalCents)}c`,
    });
  }
  return anomalies;
}

/**
 * Map one receipt, or explain why it could not be mapped.
 *
 * A receipt with no readable transaction line or no stated total is
 * refused: `orderedAt` is what the reconciliation window is measured
 * against and `totalCents` is what a transaction is matched to, so ingesting
 * one without them would create a row that can never link to anything and
 * can never be told apart from one that simply has not settled yet.
 */
export function mapReceipt(activityDetailsId: string, page: ReceiptPage): MappedReceipt | null {
  const blocks = readBlocks(page);
  const stamp = readTransactionDetails(blocks.footer?.transactionDetails);
  const totalCents = parseAmountCents(blocks.summary?.receiptTotal?.amount);

  if (stamp === null || totalCents === null || blocks.lines === null) {
    return null;
  }

  const store = readStore(blocks.header);
  const sourceOrderId = `${store.number}-${stamp.pos}-${stamp.transaction}-${stamp.localDate}`;
  const { items, discounts, anomalies: grouping } = groupReceiptRows(blocks.lines);
  const payment = readPayment(blocks.payments);
  // Two places state a discount and both are real: the summary block, and
  // negative-amount rows sitting among the items.
  const discountCents =
    sumLines(blocks.summary?.discounts) +
    discounts.reduce((total, discount) => total + discount.amountCents, 0);
  const subtotalCents = items.reduce((total, item) => total + item.lineTotalCents, 0);
  const totals = { subtotalCents, discountCents, totalCents };
  const mappedItems = items.map(toItem);

  return {
    purchase: {
      source: WOOLWORTHS_SOURCE_ID,
      sourceOrderId,
      ingestMethod: 'export',
      orderedAt: stamp.occurredAt,
      currency: CURRENCY,
      ...totals,
      merchantEntityName: store.merchantName,
      settlementMode: payment.isCash ? 'cash' : 'card',
      paymentHint: payment.hint,
      rawRef: activityDetailsId,
      checksum: checksumFor({
        sourceOrderId,
        orderedAt: stamp.occurredAt,
        totalCents,
        discountCents,
        items: mappedItems,
      }),
      items: mappedItems,
      charges: [
        {
          amountCents: totalCents,
          chargedAt: stamp.occurredAt,
          role: 'capture',
          origin: 'merchant',
          paymentHint: payment.hint,
        },
      ],
    },
    anomalies: collectAnomalies(activityDetailsId, grouping, totals),
  };
}
