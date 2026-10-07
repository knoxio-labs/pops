/**
 * Handlers for the `transactions.*` sub-router. Maps db domain errors
 * (`TransactionNotFoundError`, `TransactionAlreadyExistsError`) to shared
 * `HttpError` subclasses so `runHttp` yields 404 / 409.
 *
 * `delete` returns the full row as a `snapshot` so the client can Undo via
 * `restore`, which re-inserts preserving id + dedup metadata.
 *
 * The four writes pass the request's principal to the service as the actor, so
 * each is recorded in the audit log (POPS-5865).
 *
 * `list` and `get`, the two routes a guest reaches, live in
 * `transactions-read-handlers.ts`.
 */
import { readPrincipal } from '@pops/pillar-express';

import {
  AccountNotFoundError,
  FacetCardinalityError,
  FeeTagOnNonFeeTypeError,
  type FinanceDb,
  PositiveAmountPurchaseError,
  type TransactionActor,
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
import { runHttp } from './error-mapping.js';
import { makeTransactionReadHandlers } from './transactions-read-handlers.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeTransactionsContract } from '../../contract/rest-transactions.js';

type Req = ServerInferRequest<typeof financeTransactionsContract>;

const PREVIEW_DESCRIPTIONS_LIMIT = 2000;

function translateTransactionError(err: unknown, id?: string): never {
  if (err instanceof PositiveAmountPurchaseError) throw new ValidationError(err.message);
  if (err instanceof FacetCardinalityError) {
    throw new ValidationError(err.message, { facet: err.facet, tags: err.tags });
  }
  if (err instanceof FeeTagOnNonFeeTypeError) {
    throw new ValidationError(err.message, { type: err.type, tags: err.tags });
  }
  if (err instanceof TransactionNotFoundError) throw new NotFoundError('Transaction', id ?? err.id);
  if (err instanceof TransactionAlreadyExistsError) throw new ConflictError(err.message);
  if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', err.id);
  throw err;
}

/** A service presents a key, not a session, so it has no email to record. */
function actorOf(res: Response): TransactionActor {
  const principal = readPrincipal(res);
  return principal.kind === 'service'
    ? { kind: 'service', email: null }
    : { kind: principal.kind, email: principal.email };
}

export function makeTransactionsHandlers(db: FinanceDb, contacts: ContactsClient) {
  const reads = makeTransactionReadHandlers(db);

  // Express registers these in key order, so `get` (`/transactions/:id`) has
  // to stay below the literal `suggest-tags` and `descriptions-preview` paths
  // or it answers for them.
  return {
    list: reads.list,

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

    get: reads.get,

    create: ({ body, res }: Req['create'] & { res: Response }) =>
      runHttp(() => {
        try {
          const row = transactionsService.createTransaction(
            db,
            toCreateTransactionInput(body),
            actorOf(res)
          );
          return {
            status: 201 as const,
            body: { data: toTransaction(row), message: 'Transaction created' },
          };
        } catch (err) {
          translateTransactionError(err);
        }
      }),

    update: ({ params, body, res }: Req['update'] & { res: Response }) =>
      runHttp(() => {
        try {
          const row = transactionsService.updateTransaction(
            db,
            params.id,
            toUpdateTransactionInput(body),
            actorOf(res)
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

    delete: ({ params, res }: Req['delete'] & { res: Response }) =>
      runHttp(() => {
        try {
          const row = transactionsService.deleteTransaction(db, params.id, actorOf(res));
          return {
            status: 200 as const,
            body: { message: 'Transaction deleted', snapshot: toTransactionSnapshot(row) },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    restore: ({ body, res }: Req['restore'] & { res: Response }) =>
      runHttp(() => {
        try {
          const row = transactionsService.restoreTransaction(
            db,
            fromTransactionSnapshot(body),
            actorOf(res)
          );
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
