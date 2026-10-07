/**
 * Handlers for the `transactionHistory.*` sub-router (POPS-5865).
 *
 * Read-only. Who may call these is the scope gate's decision, made before any
 * of this runs: the routes carry no `guestRoute()`, so a guest never reaches
 * here.
 */
import {
  type FinanceDb,
  TransactionNotFoundError,
  transactionEventsService,
  transactionsService,
} from '../../db/index.js';
import { toTransactionHistoryEvent } from '../modules/transaction-history-types.js';
import { NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';
import { requireAccount } from './require-account.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTransactionHistoryContract } from '../../contract/rest-transaction-history.js';

type Req = ServerInferRequest<typeof financeTransactionHistoryContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/** 404 unless the transaction has a row: an id with no events and no row never existed here. */
function requireTransaction(db: FinanceDb, id: string): void {
  try {
    transactionsService.getTransaction(db, id);
  } catch (err) {
    if (err instanceof TransactionNotFoundError) throw new NotFoundError('Transaction', id);
    throw err;
  }
}

export function makeTransactionHistoryHandlers(db: FinanceDb) {
  return {
    forTransaction: ({ params }: Req['forTransaction']) =>
      runHttp(() => {
        const events = transactionEventsService.listTransactionEvents(db, params.id);
        // A deleted transaction is known only by its events, and one written
        // before the log existed only by its row.
        if (events.length === 0) requireTransaction(db, params.id);
        return { status: 200 as const, body: { data: events.map(toTransactionHistoryEvent) } };
      }),

    forAccount: ({ params, query }: Req['forAccount']) =>
      runHttp(() => {
        requireAccount(db, params.id);
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = transactionEventsService.listAccountEvents(
          db,
          params.id,
          limit,
          offset
        );
        return {
          status: 200 as const,
          body: {
            data: rows.map(toTransactionHistoryEvent),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),
  };
}
