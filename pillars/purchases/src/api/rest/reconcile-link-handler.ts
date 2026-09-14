/**
 * Handler for `POST /reconcile/link`, kept apart from the other reconcile
 * decisions because it is the only one that has to ask finance first.
 */
import { FINANCE_TRANSACTION_URI } from '../../contract/schemas/scalars.js';
import { linkChargeManually } from '../../db/index.js';
import { nowIso } from '../../db/services/internal.js';

import type { z } from 'zod';

import type { ManualLinkBodySchema } from '../../contract/rest-reconcile.js';
import type { ManualLinkOutcome, PurchasesDb } from '../../db/index.js';
import type { FinanceTransactionLookup } from '../finance/client.js';

type ManualLinkBody = z.infer<typeof ManualLinkBodySchema>;

interface Refused {
  status: 404 | 409 | 503;
  body: { message: string; code: string };
}

type ManualLinkResponse = { status: 200; body: { ok: true; amountCents: number } } | Refused;

function refused(status: Refused['status'], code: string, message: string): Refused {
  return { status, body: { message, code } };
}

function toResponse(outcome: ManualLinkOutcome, body: ManualLinkBody): ManualLinkResponse {
  switch (outcome.kind) {
    case 'linked':
      return {
        status: 200 as const,
        body: { ok: true as const, amountCents: outcome.amountCents },
      };
    case 'charge-not-found':
      return refused(404, 'charge_not_found', `No charge ${body.chargeId}.`);
    case 'already-linked':
      return refused(
        409,
        'already_linked',
        `Charge ${body.chargeId} is already confirmed against ${body.transactionUri}.`
      );
    case 'incomparable-currency':
      return refused(
        409,
        'incomparable_currency',
        `${body.transactionUri} states no amount in the charge's currency.`
      );
    case 'mixed-currency-claims':
      return refused(
        409,
        'mixed_currency_claims',
        `${body.transactionUri} is already claimed by a charge in another currency, and the two cannot be summed.`
      );
    case 'wrong-direction':
      return refused(
        409,
        'wrong_direction',
        `${body.transactionUri} moves money the same way as the charge; a capture is settled by money out, a refund by money in.`
      );
    case 'transaction-claimed':
      return refused(
        409,
        'transaction_claimed',
        `${body.transactionUri} is already fully claimed by confirmed links.`
      );
    case 'exceeds-charge':
      return refused(
        409,
        'exceeds_charge',
        `Charge ${body.chargeId} has ${String(outcome.remainingCents)} cents not yet explained by confirmed links.`
      );
    case 'exceeds-transaction':
      return refused(
        409,
        'exceeds_transaction',
        `${body.transactionUri} has ${String(outcome.unclaimedCents)} cents not yet claimed by confirmed links.`
      );
  }
}

/** Absent `finance` answers 503: without the transaction there is nothing to check a claim against. */
export function makeManualLinkHandler(
  db: PurchasesDb,
  finance?: FinanceTransactionLookup
): (request: { body: ManualLinkBody }) => Promise<ManualLinkResponse> {
  return async ({ body }) => {
    const transactionId = FINANCE_TRANSACTION_URI.exec(body.transactionUri)?.[1];
    if (transactionId === undefined) {
      return refused(404, 'transaction_not_found', `${body.transactionUri} names no transaction.`);
    }
    if (finance === undefined) {
      return refused(503, 'finance_unavailable', 'No finance client is configured.');
    }

    const fetched = await finance.getTransaction(transactionId);
    if (fetched.kind === 'not-found') {
      return refused(404, 'transaction_not_found', `Finance has no ${body.transactionUri}.`);
    }
    if (fetched.kind === 'unavailable') {
      return refused(
        503,
        'finance_unavailable',
        `Finance could not be read (${fetched.reason}). Nothing was written.`
      );
    }

    return toResponse(linkChargeManually(db, body, fetched.transaction, nowIso()), body);
  };
}
