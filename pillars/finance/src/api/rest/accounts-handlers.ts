/**
 * Handlers for the `accounts.*` sub-router. `translateAccountError` maps db
 * domain errors (`AccountNotFoundError`, `AccountNameConflictError`,
 * `AccountCashCurrencyConflictError`, `ReservedAccountKindError`) to shared
 * `HttpError` subclasses so `runHttp` yields 404 / 409 / 422. `delete`
 * archives rather than removing the row (see `db/services/accounts.ts`).
 */
import {
  AccountCashCurrencyConflictError,
  AccountNameConflictError,
  AccountNotFoundError,
  accountsService,
  ReservedAccountKindError,
  type FinanceDb,
} from '../../db/index.js';
import {
  toAccount,
  toCreateAccountInput,
  toUpdateAccountInput,
} from '../modules/accounts-types.js';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeAccountsContract } from '../../contract/rest-accounts.js';

type Req = ServerInferRequest<typeof financeAccountsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function translateAccountError(err: unknown, id?: string): never {
  if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', id ?? err.id);
  if (err instanceof AccountNameConflictError) throw new ConflictError(err.message);
  if (err instanceof AccountCashCurrencyConflictError) throw new ConflictError(err.message);
  if (err instanceof ReservedAccountKindError) throw new UnprocessableEntityError(err.message);
  throw err;
}

export function makeAccountsHandlers(db: FinanceDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        let archivedFilter: boolean | undefined;
        if (query.archived === 'true') archivedFilter = true;
        else if (query.archived === 'false') archivedFilter = false;

        const { rows, total } = accountsService.listAccounts(db, {
          search: query.search,
          kind: query.kind,
          archived: archivedFilter,
          limit,
          offset,
        });

        return {
          status: 200 as const,
          body: { data: rows.map(toAccount), pagination: paginationMeta(total, limit, offset) },
        };
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

    reorder: ({ body }: Req['reorder']) =>
      runHttp(() => {
        try {
          const rows = accountsService.reorderAccounts(db, body.accounts);
          return {
            status: 200 as const,
            body: { data: rows.map(toAccount), message: 'Accounts reordered' },
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
