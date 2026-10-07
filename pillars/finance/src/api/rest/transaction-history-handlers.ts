/**
 * Handlers for the `transactionHistory.*` sub-router (POPS-5865).
 *
 * Read-only. Both routes are open to a guest, who is held to the accounts
 * granted to them: an event is shown only when every account it names is one
 * of those, so a move to or from an account the guest cannot see is left out
 * rather than shown with half of it missing.
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
import {
  accountAccess,
  canSeeAccount,
  requireAccountRole,
  visibleAccountIds,
  type AccountAccess,
} from './guest-access.js';
import { requireAccount } from './require-account.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeTransactionHistoryContract } from '../../contract/rest-transaction-history.js';

type Req = ServerInferRequest<typeof financeTransactionHistoryContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/**
 * 404 unless the transaction has a row the caller may see: an id with no
 * events and no row never existed here, and one on an account the caller holds
 * no grant on answers the same way.
 */
function requireTransaction(db: FinanceDb, id: string, access: AccountAccess): void {
  try {
    const row = transactionsService.getTransaction(db, id);
    if (!canSeeAccount(access, row.accountId)) throw new NotFoundError('Transaction', id);
  } catch (err) {
    if (err instanceof TransactionNotFoundError) throw new NotFoundError('Transaction', id);
    throw err;
  }
}

export function makeTransactionHistoryHandlers(db: FinanceDb) {
  return {
    forTransaction: ({ params, res }: Req['forTransaction'] & { res: Response }) =>
      runHttp(() => {
        const access = accountAccess(res, db);
        const events = transactionEventsService.listTransactionEvents(
          db,
          params.id,
          visibleAccountIds(access)
        );
        // A deleted transaction is known only by its events, and one written
        // before the log existed only by its row.
        if (events.length === 0) requireTransaction(db, params.id, access);
        return { status: 200 as const, body: { data: events.map(toTransactionHistoryEvent) } };
      }),

    forAccount: ({ params, query, res }: Req['forAccount'] & { res: Response }) =>
      runHttp(() => {
        const access = accountAccess(res, db);
        requireAccountRole(access, params.id, 'view');
        requireAccount(db, params.id);
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = transactionEventsService.listAccountEvents(db, params.id, {
          limit,
          offset,
          within: visibleAccountIds(access),
        });
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
