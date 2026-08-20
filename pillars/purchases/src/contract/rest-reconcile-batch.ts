/**
 * The plural form of `GET /reconcile/links`.
 *
 * The singular route takes one transaction and answers it in full. A finance
 * transactions table asks a narrower question about a whole page at once —
 * which of these rows does an order explain, and did anybody say so — and
 * asking it one row at a time is a cross-pillar request per row, which is why
 * that table has no such column.
 *
 * **A POST that reads nothing and writes nothing.** The key set is the
 * request: five hundred `pops://finance/transaction/<id>` values is roughly
 * twenty-five kilobytes of query string, past what proxies and servers
 * reliably accept, and a URL truncated in transit fails as a wrong answer
 * rather than as an error. The body carries them instead. Nothing here
 * mutates, and the scope this route resolves to is its own — a caller granted
 * the batch is not thereby granted a decision.
 *
 * **It cannot disagree with the singular route** because it is not a second
 * source: both read `purchase_charge_links` through the same joins, and the
 * summary is exactly what counting the singular answer would produce. What it
 * omits it omits deliberately rather than by simplification — see
 * `db/services/reconcile-links-batch.ts` for why money is not summed here.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { FinanceTransactionUriSchema } from './schemas/purchase.js';

const c = initContract();

/**
 * The same 500 the rest of the surface caps its lists at.
 *
 * This is the route's bound, and it binds tighter than a `limit` would: the
 * answer is at most one fixed-size summary per URI asked about, so a caller
 * that can count its own request already knows the size of the response.
 * `offset` has nothing to page over — the caller states the keys, and asking
 * for the next five hundred means sending the next five hundred.
 */
export const MAX_BATCH_TRANSACTION_URIS = 500;

export const TransactionLinksBatchBodySchema = z.object({
  /**
   * At least one, because an empty batch is a caller bug that would otherwise
   * come back as an empty answer indistinguishable from "none of these were
   * purchases".
   */
  transactionUris: z.array(FinanceTransactionUriSchema).min(1).max(MAX_BATCH_TRANSACTION_URIS),
});

/**
 * One transaction's linkage at the grain an indicator can draw.
 *
 * The two counts are separate fields rather than a total and a flag because
 * `confirmedAt` is the only thing separating a human decision from the
 * engine's current belief. A row with `confirmedChargeCount: 0` is entirely
 * the matcher's guess and a later sweep may withdraw it; a consumer rendering
 * that as settled would reintroduce exactly what the field exists to prevent.
 * Both non-zero is a partly-decided transaction, which is a real state and not
 * a rounding of either.
 */
export const TransactionLinkSummarySchema = z.object({
  transactionUri: FinanceTransactionUriSchema,
  /** Distinct orders. Greater than one is a combined settlement. */
  purchaseCount: z.int().min(1),
  confirmedChargeCount: z.int().min(0),
  derivedChargeCount: z.int().min(0),
});

/**
 * Only the transactions an order explains appear.
 *
 * A requested URI missing from `transactions` means no order explains it,
 * which is the ordinary answer for most of a statement. Echoing every
 * requested URI back with zeroes would make the response proportional to the
 * question rather than to the answer, and would hand a consumer a row that
 * says nothing to draw an indicator from.
 */
export const TransactionLinksBatchSchema = z.object({
  transactions: z.array(TransactionLinkSummarySchema),
});

export const purchasesReconcileBatchContract = c.router({
  linksBatch: {
    method: 'POST',
    path: '/reconcile/links/batch',
    body: TransactionLinksBatchBodySchema,
    responses: { 200: TransactionLinksBatchSchema },
    summary: 'Which of these finance transactions an order explains, confirmed or derived',
  },
});
