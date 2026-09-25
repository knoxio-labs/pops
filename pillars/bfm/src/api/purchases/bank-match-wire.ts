/**
 * The charges and accounting split `purchases` sends on an order's detail,
 * and their mapping onto the mobile bank-match shapes (POPS-4646).
 *
 * `purchases` does not publish a link's statement descriptor — the row keeps
 * it as reconcile evidence and the serializer drops it on purpose — so the
 * descriptor, date and account come from finance, keyed by the transaction
 * id each link's URI names. See `../finance/matched-transactions.ts`.
 */
import { z } from 'zod';

import { parseSoftUri } from '@pops/pillar-sdk';

import { calendarDayOf } from './calendar-day.js';

import type {
  MobileChargeMatch,
  MobileMatchedTransaction,
  MobilePurchaseAccounting,
  MobilePurchaseCharge,
} from '../../contract/mobile-purchase-bank-match-schemas.js';

const PurchasesChargeLinkSchema = z.object({
  id: z.string(),
  transactionUri: z.string(),
  amountCents: z.number().int(),
  /** Null while the link is the sweep's own unreviewed match. */
  confirmedAt: z.string().nullable(),
});

/** One charge as `purchases` nests it: the row under `charge`, its links beside it. */
export const PurchasesChargeDetailSchema = z.object({
  charge: z.object({
    id: z.string(),
    amountCents: z.number().int(),
    currency: z.string(),
    chargedAt: z.iso.datetime({ offset: true }).nullable(),
    /** Open for the reason a purchase's `status` is: a new role must not 502 the detail. */
    role: z.string(),
    origin: z.string(),
  }),
  links: z.array(PurchasesChargeLinkSchema),
});

export type PurchasesChargeDetail = z.infer<typeof PurchasesChargeDetailSchema>;

export const PurchasesAccountingSchema = z.object({
  totalCents: z.number().int(),
  matchedCents: z.number().int(),
  awaitingImportCents: z.number().int(),
  residualCents: z.number().int(),
  refundedCents: z.number().int().min(0),
  netSpendCents: z.number().int(),
});

/** The finance transaction id a link's `pops://finance/transaction/<id>` URI names, if it names one. */
export function financeTransactionId(transactionUri: string): string | null {
  const parsed = parseSoftUri(transactionUri);
  if (parsed?.pillar !== 'finance' || parsed.type !== 'transaction') return null;
  return parsed.id.length > 0 ? parsed.id : null;
}

/** Every distinct finance transaction id the charges' links name, in first-seen order. */
export function matchedTransactionIds(charges: readonly PurchasesChargeDetail[]): string[] {
  const ids = charges.flatMap((entry) =>
    entry.links.map((link) => financeTransactionId(link.transactionUri))
  );
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

export function toMobileAccounting(
  accounting: z.infer<typeof PurchasesAccountingSchema>
): MobilePurchaseAccounting {
  return {
    totalCents: accounting.totalCents,
    matchedCents: accounting.matchedCents,
    awaitingImportCents: accounting.awaitingImportCents,
    residualCents: accounting.residualCents,
    refundedCents: accounting.refundedCents,
    netSpendCents: accounting.netSpendCents,
  };
}

/**
 * Charges onto the mobile shape. `offsetMinutes` is the order's own, so a
 * charge is dated the way the order it belongs to is. A link whose
 * transaction finance did not describe keeps its amount and method and
 * carries `transaction: null`.
 */
export function toMobileCharges(
  charges: readonly PurchasesChargeDetail[],
  offsetMinutes: number | null,
  transactions: ReadonlyMap<string, MobileMatchedTransaction>
): MobilePurchaseCharge[] {
  return charges.map(({ charge, links }) => ({
    id: charge.id,
    amountCents: charge.amountCents,
    currency: charge.currency,
    role: charge.role,
    origin: charge.origin,
    chargedOn: charge.chargedAt === null ? null : calendarDayOf(charge.chargedAt, offsetMinutes),
    matches: links.map((link) => toMobileMatch(link, transactions)),
  }));
}

function toMobileMatch(
  link: z.infer<typeof PurchasesChargeLinkSchema>,
  transactions: ReadonlyMap<string, MobileMatchedTransaction>
): MobileChargeMatch {
  const transactionId = financeTransactionId(link.transactionUri);
  return {
    id: link.id,
    transactionId,
    amountCents: link.amountCents,
    matchedBy: link.confirmedAt === null ? 'automatic' : 'confirmed',
    transaction: transactionId === null ? null : (transactions.get(transactionId) ?? null),
  };
}
