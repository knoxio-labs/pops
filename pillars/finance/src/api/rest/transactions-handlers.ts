/**
 * Handlers for the `transactions.*` sub-router. Maps db domain errors
 * (`TransactionNotFoundError`, `TransactionAlreadyExistsError`) to shared
 * `HttpError` subclasses so `runHttp` yields 404 / 409.
 *
 * `delete` returns the full row as a `snapshot` so the client can Undo via
 * `restore`, which re-inserts preserving id + dedup metadata.
 */
import {
  type FinanceDb,
  TransactionAlreadyExistsError,
  TransactionNotFoundError,
  transactionsService,
  transferPairsService,
} from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';
import { suggestTags as computeSuggestedTags } from '../modules/tag-suggester/index.js';
import {
  fromTransactionSnapshot,
  toCreateTransactionInput,
  toTransaction,
  toTransactionSnapshot,
  toUpdateTransactionInput,
} from '../modules/transactions-types.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTransactionsContract } from '../../contract/rest-transactions.js';

type Req = ServerInferRequest<typeof financeTransactionsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const PREVIEW_DESCRIPTIONS_LIMIT = 2000;

function translateTransactionError(err: unknown, id?: string): never {
  if (err instanceof TransactionNotFoundError) throw new NotFoundError('Transaction', id ?? err.id);
  if (err instanceof TransactionAlreadyExistsError) throw new ConflictError(err.message);
  throw err;
}

export function makeTransactionsHandlers(db: FinanceDb, contacts: ContactsClient) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
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
            { beforeDate: query.beforeDate, beforeId: query.beforeId },
            `beforeDate and beforeId must be supplied together; ${missing} is missing`
          );
        }

        const { rows, total } = transactionsService.listTransactions(
          db,
          {
            search: query.search,
            account: query.account,
            startDate: query.startDate,
            endDate: query.endDate,
            tag: query.tag,
            entityId: query.entityId,
            type: query.type,
            beforeDate: query.beforeDate,
            beforeId: query.beforeId,
          },
          limit,
          offset
        );

        return {
          status: 200 as const,
          body: { data: rows.map(toTransaction), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    suggestTags: ({ query }: Req['suggestTags']) =>
      runHttp(async () => {
        const entityId = query.entityId ?? null;
        const entityDefaultTags = entityId
          ? new Map([[entityId, await contacts.fetchEntityDefaultTags(entityId)]])
          : undefined;
        const suggested = computeSuggestedTags(db, {
          description: query.description,
          entityId,
          entityDefaultTags,
          recordTagRuleUsage: false,
        });
        return { status: 200 as const, body: { tags: suggested } };
      }),

    descriptionsForPreview: ({ query }: Req['descriptionsForPreview']) =>
      runHttp(() => ({
        status: 200 as const,
        body: transactionsService.listDescriptionsForPreview(
          db,
          query.limit ?? PREVIEW_DESCRIPTIONS_LIMIT
        ),
      })),

    availableTags: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { tags: transactionsService.collectAvailableTags(db) },
      })),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = transactionsService.getTransaction(db, params.id);
          return { status: 200 as const, body: { data: toTransaction(row) } };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = transactionsService.createTransaction(db, toCreateTransactionInput(body));
          return {
            status: 201 as const,
            body: { data: toTransaction(row), message: 'Transaction created' },
          };
        } catch (err) {
          translateTransactionError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = transactionsService.updateTransaction(
            db,
            params.id,
            toUpdateTransactionInput(body)
          );
          return {
            status: 200 as const,
            body: { data: toTransaction(row), message: 'Transaction updated' },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    unlinkTransfer: ({ params }: Req['unlinkTransfer']) =>
      runHttp(() => {
        try {
          const row = transferPairsService.unlinkTransferPair(db, params.id);
          return {
            status: 200 as const,
            body: { data: toTransaction(row), message: 'Transfer unlinked' },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          const row = transactionsService.deleteTransaction(db, params.id);
          return {
            status: 200 as const,
            body: { message: 'Transaction deleted', snapshot: toTransactionSnapshot(row) },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    restore: ({ body }: Req['restore']) =>
      runHttp(() => {
        try {
          const row = transactionsService.restoreTransaction(db, fromTransactionSnapshot(body));
          return {
            status: 201 as const,
            body: { data: toTransaction(row), message: 'Transaction restored' },
          };
        } catch (err) {
          translateTransactionError(err, body.id);
        }
      }),
  };
}
