/**
 * Map purchases service errors to ts-rest response envelopes. Anything
 * unrecognised is re-thrown so Express's error pipeline (and the test
 * suite) sees the underlying stack rather than a swallowed 500.
 */
import { RequestValidationError } from '@ts-rest/express';

import {
  DuplicatePurchaseError,
  InvalidIngestPayloadError,
  PurchaseNotFoundError,
  PurchaseSourceNotFoundError,
} from '../../db/index.js';
import {
  isCheckConstraintError,
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from '../shared/sqlite-errors.js';

import type { NextFunction, Response } from 'express';

export interface ErrorBody {
  message: string;
  code?: string;
}

/**
 * What a route declaring a 400 promises the body looks like when the request
 * never reached a handler. Same shape a handler-mapped 400 produces, so the
 * two ways to be rejected are indistinguishable on the wire.
 */
const VALIDATION_ERROR_BODY: ErrorBody = {
  message: 'Request does not match the contract schema',
  code: 'VALIDATION_ERROR',
};

/**
 * ts-rest rejects a request that does not match a route's `body`, `query` or
 * `params` schema **before** any handler runs, and answers with a body of its
 * own — `{ name: 'ValidationError', issues: [...] }`. Every route here that
 * declares a 400 declares {@link ErrorBody}, so without this the OpenAPI
 * document promises one shape and the server sends another, and a client
 * generated from that document cannot decode the rejection it is most likely
 * to see.
 *
 * Ordinary input reaches it: a search filter naming a field outside the closed
 * vocabulary, a `limit` that is not a number, an `orderedAt` that is not a
 * timestamp. Mirrors `pillars/finance/src/api/rest/error-mapping.ts`.
 *
 * The issues are dropped rather than forwarded: they name this server's
 * internal schema fields, and a caller that needs to know which filter was
 * refused gets that from the handler's own 400, which names it.
 */
export function createRequestValidationErrorHandler() {
  return (error: unknown, _req: unknown, res: Response, next: NextFunction): void => {
    if (!(error instanceof RequestValidationError)) {
      next(error);
      return;
    }
    res.status(400).json(VALIDATION_ERROR_BODY);
  };
}

export interface MappedHttpError {
  status: 400 | 404 | 409;
  body: ErrorBody;
}

export function tryMapServiceError(err: unknown): MappedHttpError | null {
  if (err instanceof PurchaseNotFoundError || err instanceof PurchaseSourceNotFoundError) {
    return { status: 404, body: { message: err.message, code: 'NOT_FOUND' } };
  }
  // Not a failure: an adapter re-ingesting a bundle it has already
  // processed lands here and treats the 409 as "already have it".
  if (err instanceof DuplicatePurchaseError) {
    return { status: 409, body: { message: err.message, code: 'DUPLICATE_PURCHASE' } };
  }
  // A self-inconsistent payload is the caller's mistake. Returning 500
  // would leave an adapter unable to distinguish a bad payload from a
  // broken pillar, and reasonably retrying forever.
  if (err instanceof InvalidIngestPayloadError) {
    return { status: 400, body: { message: err.message, code: 'INVALID_INGEST_PAYLOAD' } };
  }
  if (isUniqueConstraintError(err)) {
    return {
      status: 409,
      body: { message: 'A row with that identity already exists', code: 'CONFLICT_UNIQUE' },
    };
  }
  if (isForeignKeyConstraintError(err)) {
    return {
      status: 409,
      body: { message: 'Operation rejected by a foreign key constraint', code: 'CONFLICT_FK' },
    };
  }
  // A CHECK rejection means the caller sent a value the schema's closed
  // vocabulary or non-negativity rules forbid — that's a bad request, not a
  // conflict, and the 400 tells the caller to fix the payload.
  if (isCheckConstraintError(err)) {
    return {
      status: 400,
      body: { message: 'Operation rejected by a check constraint', code: 'CONSTRAINT_CHECK' },
    };
  }
  return null;
}
