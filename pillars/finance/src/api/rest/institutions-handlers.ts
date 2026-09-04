/**
 * Handlers for the `institutions.*` sub-router. `translateInstitutionError`
 * maps db domain errors (`InstitutionNotFoundError`, `InstitutionConflictError`,
 * `InstitutionInUseError`) to shared `HttpError` subclasses so `runHttp`
 * yields 404 / 409.
 */
import {
  InstitutionConflictError,
  InstitutionInUseError,
  InstitutionNotFoundError,
} from '../../db/errors.js';
import { institutionsService, type FinanceDb } from '../../db/index.js';
import {
  toCreateInstitutionInput,
  toInstitution,
  toUpdateInstitutionInput,
} from '../modules/institutions-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeInstitutionsContract } from '../../contract/rest-institutions.js';

type Req = ServerInferRequest<typeof financeInstitutionsContract>;

function translateInstitutionError(err: unknown, id?: string): never {
  if (err instanceof InstitutionNotFoundError) throw new NotFoundError('Institution', id ?? err.id);
  if (err instanceof InstitutionConflictError) throw new ConflictError(err.message);
  if (err instanceof InstitutionInUseError) throw new ConflictError(err.message);
  throw err;
}

export function makeInstitutionsHandlers(db: FinanceDb) {
  return {
    list: () =>
      runHttp(() => {
        const rows = institutionsService.listInstitutions(db);
        return { status: 200 as const, body: { data: rows.map(toInstitution) } };
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = institutionsService.createInstitution(db, toCreateInstitutionInput(body));
          return {
            status: 201 as const,
            body: { data: toInstitution(row), message: 'Institution created' },
          };
        } catch (err) {
          translateInstitutionError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = institutionsService.updateInstitution(
            db,
            params.id,
            toUpdateInstitutionInput(body)
          );
          return {
            status: 200 as const,
            body: { data: toInstitution(row), message: 'Institution updated' },
          };
        } catch (err) {
          translateInstitutionError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          institutionsService.deleteInstitution(db, params.id);
          return { status: 200 as const, body: { message: 'Institution deleted' } };
        } catch (err) {
          translateInstitutionError(err, params.id);
        }
      }),
  };
}
