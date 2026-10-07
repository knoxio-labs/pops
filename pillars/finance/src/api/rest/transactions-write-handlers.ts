/**
 * The four transaction writes, `create`, `update`, `delete` and `restore`
 * (POPS-5867).
 *
 * These are the writes a guest reaches. Each needs `edit` on every account it
 * touches and is authorised before anything is written, so a refused request
 * changes no row and records no event. A caller with full reach (the operator,
 * a service, and everyone while classification is off) passes every check.
 *
 * Each write passes the request's principal to the service as the actor, so it
 * is recorded in the audit log (POPS-5865).
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
  transactionEventsService,
  TransactionNotFoundError,
  type TransactionRow,
  transactionsService,
} from '../../db/index.js';
import {
  fromTransactionSnapshot,
  toCreateTransactionInput,
  toTransaction,
  toTransactionSnapshot,
  toUpdateTransactionInput,
} from '../modules/transactions-types.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import {
  type AccountAccess,
  accountAccess,
  canSeeAccount,
  forViewer,
  requireAccountRole,
} from './guest-access.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeTransactionsContract } from '../../contract/rest-transactions.js';

type Req = ServerInferRequest<typeof financeTransactionsContract>;

/**
 * Map a transaction service error to its HTTP failure. Shared with the
 * operator-only transaction routes in `transactions-handlers.ts`.
 */
export function translateTransactionError(err: unknown, id?: string): never {
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

/**
 * Links, contacts, the tag vocabulary and the import's dedup metadata are the
 * operator's data. `rawRow` and `checksum` exist on the create body only.
 */
const OPERATOR_ONLY_FIELDS = [
  'relatedTransactionId',
  'entityId',
  'entityName',
  'tags',
  'rawRow',
  'checksum',
] as const;

type OperatorOnlyField = (typeof OPERATOR_ONLY_FIELDS)[number];

/**
 * Whether the body sets the field. The create schema defaults an absent `tags`
 * to an empty list, so an empty list there is indistinguishable from not
 * sending it and is not counted; `allowEmptyTags` is off for an update, where
 * an empty list clears the tags the operator set.
 */
function setsField(
  body: Partial<Record<OperatorOnlyField, unknown>>,
  field: OperatorOnlyField,
  allowEmptyTags: boolean
): boolean {
  const value = body[field];
  if (value === undefined) return false;
  return !(allowEmptyTags && field === 'tags' && Array.isArray(value) && value.length === 0);
}

/** @throws ValidationError naming every operator-only field a guest's body sets. */
function refuseOperatorOnlyFields(
  access: AccountAccess,
  body: Partial<Record<OperatorOnlyField, unknown>>,
  allowEmptyTags: boolean
): void {
  if (access === 'all') return;
  const set = OPERATOR_ONLY_FIELDS.filter((field) => setsField(body, field, allowEmptyTags));
  if (set.length > 0) {
    throw new ValidationError(`A shared account entry cannot set ${set.join(', ')}`, {
      fields: set,
    });
  }
}

/**
 * Refuse unless the caller holds `edit` on the account the transaction sits
 * on.
 *
 * @throws NotFoundError for a transaction on an account the caller holds no
 *   grant on, worded as a missing transaction is.
 * @throws ForbiddenError for a `view` grant.
 */
function requireEditOnTransaction(
  access: AccountAccess,
  transactionId: string,
  accountId: string
): void {
  if (!canSeeAccount(access, accountId)) throw new NotFoundError('Transaction', transactionId);
  requireAccountRole(access, accountId, 'edit');
}

/**
 * The row a guest's restore brings back: the `before` of the transaction's
 * latest delete event, never the snapshot in the request, which the guest
 * could have written themselves.
 *
 * @throws NotFoundError when the transaction has no delete event, or its
 *   latest one is on an account the caller holds no grant on.
 */
function deletedRowFromLog(db: FinanceDb, access: AccountAccess, id: string): TransactionRow {
  const deletion = transactionEventsService
    .listTransactionEvents(db, id)
    .find((event) => event.action === 'delete');
  if (deletion === undefined || deletion.before === null) {
    throw new NotFoundError('Transaction', id);
  }
  requireEditOnTransaction(access, id, deletion.accountId);
  return transactionEventsService.parseTransactionSnapshot(deletion.before);
}

export function makeTransactionWriteHandlers(db: FinanceDb) {
  return {
    create: ({ body, res }: Req['create'] & { res: Response }) =>
      runHttp(() => {
        const access = accountAccess(res, db);
        requireAccountRole(access, body.accountId, 'edit');
        refuseOperatorOnlyFields(access, body, true);
        try {
          const row = transactionsService.createTransaction(
            db,
            toCreateTransactionInput(body),
            actorOf(res)
          );
          return {
            status: 201 as const,
            body: { data: toTransaction(forViewer(access, row)), message: 'Transaction created' },
          };
        } catch (err) {
          translateTransactionError(err);
        }
      }),

    update: ({ params, body, res }: Req['update'] & { res: Response }) =>
      runHttp(() => {
        try {
          const access = accountAccess(res, db);
          if (access !== 'all') {
            const stored = transactionsService.getTransaction(db, params.id);
            requireEditOnTransaction(access, params.id, stored.accountId);
            if (body.accountId !== undefined) requireAccountRole(access, body.accountId, 'edit');
            refuseOperatorOnlyFields(access, body, false);
          }
          const row = transactionsService.updateTransaction(
            db,
            params.id,
            toUpdateTransactionInput(body),
            actorOf(res)
          );
          return {
            status: 200 as const,
            body: { data: toTransaction(forViewer(access, row)), message: 'Transaction updated' },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    delete: ({ params, res }: Req['delete'] & { res: Response }) =>
      runHttp(() => {
        try {
          const access = accountAccess(res, db);
          if (access !== 'all') {
            const stored = transactionsService.getTransaction(db, params.id);
            requireEditOnTransaction(access, params.id, stored.accountId);
          }
          const row = transactionsService.deleteTransaction(db, params.id, actorOf(res));
          return {
            status: 200 as const,
            body: {
              message: 'Transaction deleted',
              snapshot: forViewer(access, toTransactionSnapshot(row)),
            },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    restore: ({ body, res }: Req['restore'] & { res: Response }) =>
      runHttp(() => {
        try {
          const access = accountAccess(res, db);
          const snapshot =
            access === 'all'
              ? fromTransactionSnapshot(body)
              : deletedRowFromLog(db, access, body.id);
          const row = transactionsService.restoreTransaction(db, snapshot, actorOf(res));
          return {
            status: 201 as const,
            body: { data: toTransaction(forViewer(access, row)), message: 'Transaction restored' },
          };
        } catch (err) {
          translateTransactionError(err, body.id);
        }
      }),
  };
}
