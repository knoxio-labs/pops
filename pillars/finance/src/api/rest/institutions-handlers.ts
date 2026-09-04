/**
 * Handlers for the `institutions.*` sub-router. `translateInstitutionError`
 * maps db domain errors (`InstitutionNotFoundError`, `InstitutionConflictError`,
 * `InstitutionInUseError`, `InstitutionMergeSameInstitutionError`) to shared
 * `HttpError` subclasses so `runHttp` yields 404 / 409 / 422.
 */
import {
  InstitutionConflictError,
  InstitutionInUseError,
  InstitutionMergeSameInstitutionError,
  InstitutionNotFoundError,
} from '../../db/errors.js';
import { institutionsService, type FinanceDb } from '../../db/index.js';
import {
  toCreateInstitutionInput,
  toInstitution,
  toUpdateInstitutionInput,
} from '../modules/institutions-types.js';
import { removeInstitutionLogo, uploadInstitutionLogo } from '../modules/logo-upload.js';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeInstitutionsContract } from '../../contract/rest-institutions.js';

type Req = ServerInferRequest<typeof financeInstitutionsContract>;

function translateInstitutionError(err: unknown, id?: string): never {
  if (err instanceof InstitutionNotFoundError) throw new NotFoundError('Institution', id ?? err.id);
  if (err instanceof InstitutionConflictError) throw new ConflictError(err.message);
  if (err instanceof InstitutionInUseError) throw new ConflictError(err.message);
  if (err instanceof InstitutionMergeSameInstitutionError) {
    throw new UnprocessableEntityError(err.message);
  }
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

    merge: ({ params, body }: Req['merge']) =>
      runHttp(() => {
        try {
          const row = institutionsService.mergeInstitutions(db, params.id, body.targetId);
          return {
            status: 200 as const,
            body: { data: toInstitution(row), message: 'Institutions merged' },
          };
        } catch (err) {
          translateInstitutionError(err, params.id);
        }
      }),

    uploadLogo: ({ params, body }: Req['uploadLogo']) =>
      runHttp(() => {
        try {
          const row = uploadInstitutionLogo(db, {
            institutionId: params.id,
            contentType: body.contentType,
            data: Buffer.from(body.contentBase64, 'base64'),
          });
          return {
            status: 200 as const,
            body: { data: toInstitution(row), message: 'Logo uploaded' },
          };
        } catch (err) {
          translateInstitutionError(err, params.id);
        }
      }),

    removeLogo: ({ params }: Req['removeLogo']) =>
      runHttp(() => {
        try {
          const row = removeInstitutionLogo(db, params.id);
          return {
            status: 200 as const,
            body: { data: toInstitution(row), message: 'Logo removed' },
          };
        } catch (err) {
          translateInstitutionError(err, params.id);
        }
      }),
  };
}
