/**
 * Handlers for the `accounts.*` sub-router. `translateAccountError` maps db
 * domain errors (`AccountNotFoundError`, `AccountNameConflictError`,
 * `AccountCashCurrencyConflictError`) to shared `HttpError` subclasses so
 * `runHttp` yields 404 / 409. `delete` archives rather than removing the row
 * (see `db/services/accounts.ts`).
 */
import {
  AccountCashCurrencyConflictError,
  AccountNameConflictError,
  AccountNotFoundError,
  accountsService,
  type FinanceDb,
} from '../../db/index.js';
import {
  toAccount,
  toCreateAccountInput,
  toUpdateAccountInput,
} from '../modules/accounts-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeAccountsContract } from '../../contract/rest-accounts.js';

type Req = ServerInferRequest<typeof financeAccountsContract>;

function translateAccountError(err: unknown, id?: string): never {
  if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', id ?? err.id);
  if (err instanceof AccountNameConflictError) throw new ConflictError(err.message);
  if (err instanceof AccountCashCurrencyConflictError) throw new ConflictError(err.message);
  throw err;
}

export function makeAccountsHandlers(db: FinanceDb) {
  return {
    list: () =>
      runHttp(() => {
        const rows = accountsService.listAccounts(db);
        return { status: 200 as const, body: { data: rows.map(toAccount) } };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = accountsService.getAccount(db, params.id);
          return { status: 200 as const, body: { data: toAccount(row) } };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = accountsService.createAccount(db, toCreateAccountInput(body));
          return {
            status: 201 as const,
            body: { data: toAccount(row), message: 'Account created' },
          };
        } catch (err) {
          translateAccountError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = accountsService.updateAccount(db, params.id, toUpdateAccountInput(body));
          return {
            status: 200 as const,
            body: { data: toAccount(row), message: 'Account updated' },
          };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          const row = accountsService.archiveAccount(db, params.id);
          return {
            status: 200 as const,
            body: { data: toAccount(row), message: 'Account archived' },
          };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),
  };
}
