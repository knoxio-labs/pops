/**
 * Handlers for the `accounts.*` sub-router. `translateAccountError` maps db
 * domain errors (`AccountNotFoundError`, `AccountNameConflictError`,
 * `ReservedAccountKindError`, `PersonAccountRequiresEntityError`,
 * `NonPersonAccountHasEntityError`, `PersonAccountEntityConflictError`, and
 * the `AccountMerge*` refusal family from `db/services/merge-accounts.ts`) to
 * shared `HttpError` subclasses so
 * `runHttp` yields 404 / 409 / 422. `delete` archives rather than removing
 * the row (see `db/services/accounts.ts`); `merge` is the one exception —
 * it deletes the source account outright once its transactions are
 * repointed (POPS-2812).
 *
 * `create` resolves a `person` account's contact BEFORE inserting the row
 * (POPS-2771): `resolvePersonAccountEntity` calls contacts, and its result
 * decides whether `createAccount` gets a real `entityId` or the
 * `allowPendingEntity` outbox path. `list`/`get`/`reorder` all resolve each
 * row's `entityDisplayName` afterwards via `resolveAccountEntityDisplays`.
 *
 * `list` and `get` are the two routes a guest reaches (POPS-5866) and narrow
 * to the accounts granted to them. The rest are the operator's, so they
 * project with full reach.
 */
import {
  AccountMergeCheckpointCollisionError,
  AccountMergeCurrencyMismatchError,
  AccountMergeGiftCardDetailsConflictError,
  AccountMergePendingResolutionError,
  AccountMergeSameAccountError,
  AccountMergeSignMismatchError,
  AccountNameConflictError,
  AccountNotFoundError,
  accountsService,
  mergeAccounts,
  NonPersonAccountHasEntityError,
  PersonAccountEntityConflictError,
  PersonAccountRequiresEntityError,
  previewAccountMerge,
  ReservedAccountKindError,
  type FinanceDb,
} from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';
import {
  toAccountMergePreviewBody,
  toCreateAccountInput,
  toUpdateAccountInput,
} from '../modules/accounts-types.js';
import { makeAccountProjector } from '../modules/accounts/project-accounts.js';
import { resolvePersonAccountEntity } from '../modules/accounts/resolve-person-account-entity.js';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';
import {
  accountAccess,
  requireAccountRole,
  visibleAccountIds,
  type AccountAccess,
} from './guest-access.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeAccountsContract } from '../../contract/rest-accounts.js';

type Req = ServerInferRequest<typeof financeAccountsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/** The reach of a route no guest can call. */
const OWNER: AccountAccess = 'all';

/**
 * Domain errors that are always "well-formed request, semantically invalid
 * target" — mapped to 422 with the error's own message verbatim, unlike
 * `AccountNotFoundError`/`AccountNameConflictError`/
 * `PersonAccountEntityConflictError` below, which each need bespoke handling
 * (a supplied `id`, or a different status code).
 */
const UNPROCESSABLE_ACCOUNT_ERRORS = [
  ReservedAccountKindError,
  PersonAccountRequiresEntityError,
  NonPersonAccountHasEntityError,
  AccountMergeSameAccountError,
  AccountMergeCurrencyMismatchError,
  AccountMergeSignMismatchError,
  AccountMergeGiftCardDetailsConflictError,
  AccountMergePendingResolutionError,
  AccountMergeCheckpointCollisionError,
] as const;

function translateAccountError(err: unknown, id?: string): never {
  if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', id ?? err.id);
  if (err instanceof AccountNameConflictError) throw new ConflictError(err.message);
  if (err instanceof PersonAccountEntityConflictError) throw new ConflictError(err.message);
  if (err instanceof Error && UNPROCESSABLE_ACCOUNT_ERRORS.some((ctor) => err instanceof ctor)) {
    throw new UnprocessableEntityError(err.message);
  }
  throw err;
}

export function makeAccountsHandlers(db: FinanceDb, contacts: ContactsClient) {
  const project = makeAccountProjector(db, contacts);

  return {
    list: ({ query, res }: Req['list'] & { res: Response }) =>
      runHttp(async () => {
        const access = accountAccess(res, db);
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        let archivedFilter: boolean | undefined;
        if (query.archived === 'true') archivedFilter = true;
        else if (query.archived === 'false') archivedFilter = false;

        const { rows, total } = accountsService.listAccounts(db, {
          search: query.search,
          kind: query.kind,
          archived: archivedFilter,
          ids: visibleAccountIds(access),
          limit,
          offset,
        });

        return {
          status: 200 as const,
          body: {
            data: await project.many(rows, access),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    get: ({ params, res }: Req['get'] & { res: Response }) =>
      runHttp(async () => {
        try {
          const access = accountAccess(res, db);
          requireAccountRole(access, params.id, 'view');
          const row = accountsService.getAccount(db, params.id);
          return { status: 200 as const, body: { data: await project.one(row, access) } };
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
            body: { data: await project.one(row, OWNER), message: 'Account created' },
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
            body: { data: await project.many(rows, OWNER), message: 'Accounts reordered' },
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
            body: { data: await project.one(row, OWNER), message: 'Account updated' },
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
            body: { data: await project.one(row, OWNER), message: 'Account archived' },
          };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),

    previewMerge: ({ params, body }: Req['previewMerge']) =>
      runHttp(async () => {
        try {
          const preview = previewAccountMerge(db, params.id, body.targetId);
          const [source, target] = await project.many([preview.source, preview.target], OWNER);
          return {
            status: 200 as const,
            body: {
              data: toAccountMergePreviewBody(
                preview,
                source ?? (await project.one(preview.source, OWNER)),
                target ?? (await project.one(preview.target, OWNER))
              ),
            },
          };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),

    merge: ({ params, body }: Req['merge']) =>
      runHttp(async () => {
        try {
          const row = mergeAccounts(db, params.id, body.targetId);
          return {
            status: 200 as const,
            body: { data: await project.one(row, OWNER), message: 'Accounts merged' },
          };
        } catch (err) {
          translateAccountError(err, params.id);
        }
      }),
  };
}
