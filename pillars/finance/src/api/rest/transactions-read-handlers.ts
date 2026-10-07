/**
 * The two transaction reads, `list` and `get` (POPS-5866).
 *
 * These are the transaction routes a guest reaches. Both hold a guest to the
 * accounts granted to them, and both pass every row through `forViewer` before
 * it is mapped to the wire. A transaction on an account the guest holds no
 * grant on answers as a missing one does.
 */
import { type FinanceDb, TransactionNotFoundError, transactionsService } from '../../db/index.js';
import { toTransaction } from '../modules/transactions-types.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';
import {
  accountAccess,
  canSeeAccount,
  forViewer,
  requireAccountRole,
  visibleAccountIds,
} from './guest-access.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeTransactionsContract } from '../../contract/rest-transactions.js';

type Req = ServerInferRequest<typeof financeTransactionsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export function makeTransactionReadHandlers(db: FinanceDb) {
  return {
    list: ({ query, res }: Req['list'] & { res: Response }) =>
      runHttp(() => {
        const access = accountAccess(res, db);
        if (query.accountId !== undefined) requireAccountRole(access, query.accountId, 'view');
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        // Half a keyset anchor is rejected rather than ignored. Dropping it
        // would answer with page one of an unfiltered list — a plausible
        // 200 that a paging caller reads as "start again", re-showing rows it
        // already has instead of failing where the bug is.
        //
        // The message names both halves and which one is absent, because the
        // invalid state is the pair rather than either half: a caller told only
        // that `beforeDate` is wrong has to guess whether to drop it or to
        // supply its partner. It goes in the message and not the details —
        // the wire envelope carries no details.
        if ((query.beforeDate === undefined) !== (query.beforeId === undefined)) {
          const missing = query.beforeDate === undefined ? 'beforeDate' : 'beforeId';
          throw new ValidationError(
            `beforeDate and beforeId must be supplied together; ${missing} is missing`,
            { beforeDate: query.beforeDate, beforeId: query.beforeId }
          );
        }

        const { rows, total } = transactionsService.listTransactions(
          db,
          {
            search: query.search,
            accountId: query.accountId,
            accountIds: visibleAccountIds(access),
            startDate: query.startDate,
            endDate: query.endDate,
            tag: query.tag,
            entityId: query.entityId,
            type: query.type,
            ids: query.ids,
            beforeDate: query.beforeDate,
            beforeId: query.beforeId,
          },
          limit,
          offset
        );

        return {
          status: 200 as const,
          body: {
            data: rows.map((row) => toTransaction(forViewer(access, row))),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    get: ({ params, res }: Req['get'] & { res: Response }) =>
      runHttp(() => {
        try {
          const access = accountAccess(res, db);
          const row = transactionsService.getTransaction(db, params.id);
          if (!canSeeAccount(access, row.accountId)) throw new TransactionNotFoundError(params.id);
          return { status: 200 as const, body: { data: toTransaction(forViewer(access, row)) } };
        } catch (err) {
          if (err instanceof TransactionNotFoundError) {
            throw new NotFoundError('Transaction', params.id);
          }
          throw err;
        }
      }),
  };
}
