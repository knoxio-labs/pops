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
 * paper. `POST /purchases` is create-only and rejects a repeat with 409, so
 * this is what makes re-exporting a no-op: the second import is recognised
 * as the same shop and skipped, rather than minting a second copy of it.
 */
import { createHash } from 'node:crypto';

import { WOOLWORTHS_SOURCE_ID } from '../source-ids.js';
import { readBlocks, type ReceiptHeader, type ReceiptPage } from './blocks.js';
import { readPayment, type PaymentReading } from './payment.js';
import { groupReceiptRows, parseAmountCents, type GroupingAnomaly } from './rows.js';
import { readTransactionDetails } from './time.js';

import type { SettlementMode } from '../../contract/constants.js';
import type { CreateItemInput, CreatePurchaseInput } from '../../db/services/purchase-input.js';

export { WOOLWORTHS_SOURCE_ID };

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
    // Every mapped field, including the ones carrying no money: a
    // promotion's wording and the GST mark are read off the receipt like
    // everything else, so a change to either is a change to the purchase.
    //
    // JSON rather than delimiters, because `notes` holds verbatim promo
    // text. Joining on a separator is not injective — `["a~b","c"]` and
    // `["a","b","c"]` produce the same string — so a merchant whose
    // wording happens to contain the separator could hide a real change.
    hash.update(
      JSON.stringify([
        item.name,
        item.quantity,
        item.unitPriceCents,
        item.lineTotalCents,
        item.gstApplicable,
        item.promotionalPrice,
        item.notes,
      ])
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
    // parsed into a discount the merchant never stated as one. Prose, so it
    // is evidence rather than classification, and ordered.
    notes: grouped.notes,
    // Both are one printed character — `^` and `#` — on a receipt that
    // prints them on every line they apply to. So the absence of one is the
    // merchant saying "no", not saying nothing.
    promotionalPrice: grouped.promotional,
    gstApplicable: grouped.gstApplicable,
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

/**
 * How it was paid for, or an admission that the receipt does not say.
 *
 * `unknown` is not a hedge. Nine receipts in a real 413-receipt export
 * carry no readable payment block, and calling those `card` asserts
 * something the merchant never stated — while `cash` would be worse still,
 * since that is terminal and would exclude a real card shop from
 * reconciliation forever (ADR-042).
 */
function readSettlementMode(payment: PaymentReading): SettlementMode {
  if (payment.isCash) return 'cash';
  return payment.isCard ? 'card' : 'unknown';
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
      settlementMode: readSettlementMode(payment),
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
