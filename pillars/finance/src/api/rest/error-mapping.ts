/**
 * Map finance service errors to ts-rest response envelopes.
 *
 * Handlers translate `@pops/finance` db domain errors into `HttpError`
 * subclasses carrying a real `statusCode` (`NotFoundError` → 404,
 * `ConflictError` → 409, `ValidationError` → 400). For those three mapped
 * statuses we return a typed `{ status, body }` envelope; anything else (a
 * 500-class `HttpError`, or a non-HttpError) is re-thrown so Express's
 * error pipeline surfaces the real stack rather than a swallowed 500.
 *
 * `messageKey` is carried through on the body so the FE can drive i18n off it.
 */
import { RequestValidationError } from '@ts-rest/express';

import { HttpError } from '../shared/errors.js';

import type { NextFunction, Response } from 'express';

export interface ErrorBody {
  message: string;
  code?: string;
  messageKey?: string;
}

/**
 * What every route declaring `ERR_RESPONSES` promises a 400 looks like.
 * Matches what a handler-thrown `ValidationError` maps to, so the two paths to
 * a 400 are indistinguishable on the wire.
 */
const VALIDATION_ERROR_BODY: ErrorBody = {
  message: 'Validation failed',
  code: 'ValidationError',
  messageKey: 'common.validationFailed',
};

/**
 * ts-rest rejects a request that does not match a route's `query`/`params`/
 * `body` schema **before** the handler runs, and answers with its own body —
 * `{ name: 'ValidationError', issues: [...] }`. Every route here that declares
 * a 400 declares {@link ErrorBody}, so without this the contract promises one
 * shape and the server sends another, and the generated clients built from
 * that document cannot decode it.
 *
 * Reachable from ordinary input: a non-numeric `limit`, or a `beforeDate` that
 * is not `YYYY-MM-DD`.
 *
 * The issues are deliberately dropped rather than forwarded. They name this
 * server's internal schema fields and are not localised, which is exactly what
 * `messageKey` exists to avoid — the FE resolves its own string from that.
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

export type ErrorStatus = 400 | 404 | 409 | 412;

export interface MappedHttpError {
  status: ErrorStatus;
  body: ErrorBody;
}

function isMappedStatus(status: number): status is ErrorStatus {
  return status === 400 || status === 404 || status === 409 || status === 412;
}

export function mapHttpError(err: unknown): MappedHttpError | null {
  if (err instanceof HttpError && isMappedStatus(err.statusCode)) {
    return {
      status: err.statusCode,
      body: { message: err.message, code: err.name, messageKey: err.messageKey },
    };
  }
  return null;
}

/**
 * Run a handler body and convert any mapped `HttpError` into its response
 * envelope. Accepts sync or async bodies. Unmapped throws propagate to
 * Express.
 */
export async function runHttp<T extends { status: number; body: unknown }>(
  fn: () => T | Promise<T>
): Promise<T | MappedHttpError> {
  try {
    return await fn();
  } catch (err) {
    const mapped = mapHttpError(err);
    if (mapped !== null) return mapped;
    throw err as Error;
  }
}
