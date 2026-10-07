/**
 * Handler for `transactionAttachments.extractReceipt` (POPS-5871).
 *
 * Reads a receipt into a suggestion for an entry that does not exist yet. The
 * only thing written anywhere is the files themselves, in the receipt store,
 * unpinned: the caller attaches them to the transaction it creates next, and
 * the store's retention sweep removes them if it never does.
 *
 * A receipt that cannot be read is an answer, not a failure. The files are
 * stored either way, so the person types the entry and still attaches them.
 * Only the store itself being out of reach is a 503.
 */
import { accountsService, AccountNotFoundError, type FinanceDb } from '../../db/index.js';
import { type PurchasesReceiptsClient, PurchasesUnavailableError } from '../purchases/client.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import { accountAccess, requireAccountRole } from './guest-access.js';
import { translatePurchasesError } from './transaction-attachments-handlers.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';
import type { z } from 'zod';

import type {
  ReceiptPart,
  ReceiptReading,
} from '../../contract/rest-transaction-attachments-schemas.js';
import type {
  ExtractReceiptResultSchema,
  financeTransactionAttachmentsContract,
  ReceiptSuggestionSchema,
} from '../../contract/rest-transaction-attachments.js';

type Req = ServerInferRequest<typeof financeTransactionAttachmentsContract>;
type ExtractReceiptResult = z.infer<typeof ExtractReceiptResultSchema>;
type ReceiptSuggestion = z.infer<typeof ReceiptSuggestionSchema>;
type ReceiptDraft = Extract<ReceiptReading, { kind: 'draft' }>['draft'];

const MS_PER_MINUTE = 60_000;
const ISO_DATE_LENGTH = 10;

/**
 * The calendar day at the shop. The reading states an instant and how far the
 * shop was from UTC; a reading that resolved no offset is taken as UTC.
 */
function dayOfPurchase(draft: ReceiptDraft): string {
  const offsetMs = (draft.orderedAtOffsetMinutes ?? 0) * MS_PER_MINUTE;
  return new Date(Date.parse(draft.orderedAt) + offsetMs).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** A receipt's total is what was paid, which a ledger records as money out. */
export function toSuggestion(draft: ReceiptDraft, accountCurrency: string): ReceiptSuggestion {
  return {
    date: dayOfPurchase(draft),
    description: draft.merchantEntityName ?? null,
    amountCents: -draft.totalCents,
    currency: draft.currency,
    currencyMismatch: draft.currency !== accountCurrency,
  };
}

function accountCurrency(db: FinanceDb, accountId: string): string {
  try {
    return accountsService.getAccount(db, accountId).currency;
  } catch (err) {
    if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', accountId);
    throw err;
  }
}

export function makeReceiptExtractHandlers(db: FinanceDb, purchases: PurchasesReceiptsClient) {
  /** The reading, or `unavailable` when purchases gave none. Any other failure is thrown. */
  async function reading(
    parts: ReceiptPart[]
  ): Promise<Awaited<ReturnType<PurchasesReceiptsClient['extract']>> | { kind: 'unavailable' }> {
    try {
      return await purchases.extract(parts);
    } catch (err) {
      if (!(err instanceof PurchasesUnavailableError)) throw err;
      console.warn(`[finance-api] no receipt reading, storing the files only. ${err.message}`);
      return { kind: 'unavailable' };
    }
  }

  async function extract(parts: ReceiptPart[], currency: string): Promise<ExtractReceiptResult> {
    const read = await reading(parts);
    if (read.kind === 'draft') {
      return {
        outcome: 'suggested',
        receiptUris: read.receiptUris,
        suggestion: toSuggestion(read.draft, currency),
      };
    }
    if (read.kind === 'unreadable') {
      return { outcome: 'unreadable', receiptUris: read.receiptUris };
    }
    // Purchases answered without saying where the files are, or did not
    // answer. Storing is idempotent by content, and it is the call that
    // decides whether the store is reachable at all.
    return { outcome: read.kind, receiptUris: await purchases.store(parts) };
  }

  return {
    extractReceipt: ({ body, res }: Req['extractReceipt'] & { res: Response }) =>
      runHttp(async () => {
        requireAccountRole(accountAccess(res, db), body.accountId, 'edit');
        const currency = accountCurrency(db, body.accountId);
        try {
          const data = await extract(body.parts, currency);
          return { status: 200 as const, body: { data } };
        } catch (err) {
          translatePurchasesError(err);
        }
      }),
  };
}
