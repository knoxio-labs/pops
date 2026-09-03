/**
 * Handlers for the `accounts.*` sub-router. `translateAccountError` maps db
 * domain errors (`AccountNotFoundError`, `AccountNameConflictError`,
 * `AccountCashCurrencyConflictError`, `ReservedAccountKindError`,
 * `PersonAccountRequiresEntityError`, `NonPersonAccountHasEntityError`,
 * `PersonAccountEntityConflictError`) to shared `HttpError` subclasses so
 * `runHttp` yields 404 / 409 / 422. `delete` archives rather than removing
 * the row (see `db/services/accounts.ts`).
 *
 * `create` resolves a `person` account's contact BEFORE inserting the row
 * (POPS-2771): `resolvePersonAccountEntity` calls contacts, and its result
 * decides whether `createAccount` gets a real `entityId` or the
 * `allowPendingEntity` outbox path. `list`/`get`/`reorder` all resolve each
 * row's `entityDisplayName` afterwards via `resolveAccountEntityDisplays`.
 */
import {
  AccountCashCurrencyConflictError,
  AccountNameConflictError,
  AccountNotFoundError,
  accountsService,
  NonPersonAccountHasEntityError,
  PersonAccountEntityConflictError,
  PersonAccountRequiresEntityError,
  resolveAccountEntityDisplays,
  ReservedAccountKindError,
  type AccountRow,
  type FinanceDb,
} from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';
import {
  toAccount,
  toCreateAccountInput,
  toUpdateAccountInput,
  type Account,
} from '../modules/accounts-types.js';
import { resolvePersonAccountEntity } from '../modules/accounts/resolve-person-account-entity.js';
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
  if (err instanceof PersonAccountEntityConflictError) throw new ConflictError(err.message);
  if (err instanceof ReservedAccountKindError) throw new UnprocessableEntityError(err.message);
  if (err instanceof PersonAccountRequiresEntityError)
    throw new UnprocessableEntityError(err.message);
  if (err instanceof NonPersonAccountHasEntityError)
    throw new UnprocessableEntityError(err.message);
  throw err;
}

const NOT_A_PERSON = { entityDisplayName: null, entityDisplayNameStale: false };

async function toAccounts(rows: AccountRow[], contacts: ContactsClient): Promise<Account[]> {
  const displays = await resolveAccountEntityDisplays(contacts, rows);
  return rows.map((row) => toAccount(row, displays.get(row.id) ?? NOT_A_PERSON));
}

async function toOneAccount(row: AccountRow, contacts: ContactsClient): Promise<Account> {
  const displays = await resolveAccountEntityDisplays(contacts, [row]);
  return toAccount(row, displays.get(row.id) ?? NOT_A_PERSON);
}

export function makeAccountsHandlers(db: FinanceDb, contacts: ContactsClient) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(async () => {
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
          body: {
            data: await toAccounts(rows, contacts),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(async () => {
        try {
          const row = accountsService.getAccount(db, params.id);
          return { status: 200 as const, body: { data: await toOneAccount(row, contacts) } };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(async () => {
        try {
          const input = toCreateAccountInput(body);
          const resolved = await resolvePersonAccountEntity(contacts, input);
          const row = accountsService.createAccount(
            db,
            { ...input, entityId: resolved.entityId },
            { allowPendingEntity: resolved.allowPendingEntity }
          );
          return {
            status: 201 as const,
            body: { data: await toOneAccount(row, contacts), message: 'Account created' },
          };
        } catch (err) {
          translateAccountError(err);
        }
      }),

    reorder: ({ body }: Req['reorder']) =>
      runHttp(async () => {
        try {
          const rows = accountsService.reorderAccounts(db, body.accounts);
          return {
            status: 200 as const,
            body: { data: await toAccounts(rows, contacts), message: 'Accounts reordered' },
          };
        } catch (err) {
          translateAccountError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(async () => {
        try {
          const row = accountsService.updateAccount(db, params.id, toUpdateAccountInput(body));
          return {
            status: 200 as const,
            body: { data: await toOneAccount(row, contacts), message: 'Account updated' },
          };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(async () => {
        try {
          const row = accountsService.archiveAccount(db, params.id);
          return {
            status: 200 as const,
            body: { data: await toOneAccount(row, contacts), message: 'Account archived' },
          };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),
  };
}
