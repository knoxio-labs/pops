/**
 * Handlers for the `loan.*` sub-router (POPS-2829). `translateLoanError`
 * maps db domain errors to shared `HttpError` subclasses so `runHttp` yields
 * 404 / 409 / 422, mirroring `gift-card-details-handlers.ts`.
 *
 * `AccountKindMismatchError` (the account exists but is not `kind: 'loan'`)
 * and `LoanRateNotLatestError` (a backdated rate) both become 422: the
 * request is well-formed and names a real account, but the domain refuses
 * to act on it.
 */
import {
  AccountKindMismatchError,
  AccountNotFoundError,
  LoanOffsetLinkConflictError,
  LoanOffsetLinkNotFoundError,
  LoanOffsetLinkSelfLinkError,
  LoanRateNotLatestError,
  LoanTermsNotFoundError,
  loanOffsetLinksService,
  loanTermsService,
  type FinanceDb,
} from '../../db/index.js';
import {
  toLoanOffsetLink,
  toLoanRate,
  toLoanTerms,
  toWriteLoanTermsInput,
} from '../modules/loan-types.js';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeLoanContract } from '../../contract/rest-loan.js';

type Req = ServerInferRequest<typeof financeLoanContract>;

function translateLoanError(err: unknown, id: string): never {
  if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', err.id);
  if (err instanceof AccountKindMismatchError) throw new UnprocessableEntityError(err.message);
  if (err instanceof LoanRateNotLatestError) throw new UnprocessableEntityError(err.message);
  if (err instanceof LoanTermsNotFoundError) throw new NotFoundError('Loan terms', id);
  if (err instanceof LoanOffsetLinkNotFoundError) {
    throw new NotFoundError('Loan offset link', err.id);
  }
  if (err instanceof LoanOffsetLinkConflictError) throw new ConflictError(err.message);
  if (err instanceof LoanOffsetLinkSelfLinkError) throw new UnprocessableEntityError(err.message);
  throw err;
}

function makeLoanTermsHandlers(db: FinanceDb) {
  return {
    getTerms: ({ params }: Req['getTerms']) =>
      runHttp(() => {
        try {
          const row = loanTermsService.getLoanTerms(db, params.id);
          return { status: 200 as const, body: { data: toLoanTerms(row) } };
        } catch (err) {
          translateLoanError(err, params.id);
        }
      }),

    writeTerms: ({ params, body }: Req['writeTerms']) =>
      runHttp(() => {
        try {
          const row = loanTermsService.writeLoanTerms(db, params.id, toWriteLoanTermsInput(body));
          return {
            status: 200 as const,
            body: { data: toLoanTerms(row), message: 'Loan terms saved' },
          };
        } catch (err) {
          translateLoanError(err, params.id);
        }
      }),

    listRateHistory: ({ params }: Req['listRateHistory']) =>
      runHttp(() => {
        try {
          const rows = loanTermsService.listLoanRateHistory(db, params.id);
          return { status: 200 as const, body: { data: rows.map(toLoanRate) } };
        } catch (err) {
          translateLoanError(err, params.id);
        }
      }),

    recordRate: ({ params, body }: Req['recordRate']) =>
      runHttp(() => {
        try {
          const row = loanTermsService.recordLoanRate(db, params.id, {
            annualRatePct: body.annualRatePct,
            effectiveFrom: body.effectiveFrom,
            source: body.source ?? 'manual',
          });
          return {
            status: 201 as const,
            body: { data: toLoanRate(row), message: 'Loan rate recorded' },
          };
        } catch (err) {
          translateLoanError(err, params.id);
        }
      }),
  };
}

function makeLoanOffsetLinkHandlers(db: FinanceDb) {
  return {
    listOffsetLinks: ({ params, query }: Req['listOffsetLinks']) =>
      runHttp(() => {
        try {
          const rows = loanOffsetLinksService.listOffsetLinks(
            db,
            params.id,
            query.active === 'true'
          );
          return { status: 200 as const, body: { data: rows.map(toLoanOffsetLink) } };
        } catch (err) {
          translateLoanError(err, params.id);
        }
      }),

    linkOffsetAccount: ({ params, body }: Req['linkOffsetAccount']) =>
      runHttp(() => {
        try {
          const row = loanOffsetLinksService.linkOffsetAccount(db, params.id, {
            offsetAccountId: body.offsetAccountId,
            linkedFrom: body.linkedFrom,
          });
          return {
            status: 201 as const,
            body: { data: toLoanOffsetLink(row), message: 'Offset account linked' },
          };
        } catch (err) {
          translateLoanError(err, params.id);
        }
      }),

    unlinkOffsetAccount: ({ params }: Req['unlinkOffsetAccount']) =>
      runHttp(() => {
        try {
          const row = loanOffsetLinksService.unlinkOffsetAccount(db, params.id, params.linkId);
          return {
            status: 200 as const,
            body: { data: toLoanOffsetLink(row), message: 'Offset account unlinked' },
          };
        } catch (err) {
          translateLoanError(err, params.id);
        }
      }),
  };
}

export function makeLoanHandlers(db: FinanceDb) {
  return { ...makeLoanTermsHandlers(db), ...makeLoanOffsetLinkHandlers(db) };
}
