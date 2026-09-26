/**
 * Map bfm domain errors to ts-rest response envelopes.
 *
 * Handlers throw `HttpError` subclasses carrying a real `statusCode`; the
 * statuses this pillar declares on its contract (`401`, `404`, `429`) are
 * turned into a typed `{ status, body }` envelope. Anything else — a
 * 500-class `HttpError`, or a non-`HttpError` — is re-thrown so Express's
 * error pipeline surfaces the real stack rather than a swallowed 500.
 */
import { bfmErrorBody } from '../errors.js';
import { NotFoundError, TooManyRequestsError, UnauthorizedError } from '../shared/errors.js';

import type { ErrorBody } from '@pops/types';

export type ErrorStatus = 401 | 404 | 429;

export interface MappedHttpError {
  status: ErrorStatus;
  body: ErrorBody;
}

export function mapHttpError(err: unknown): MappedHttpError | null {
  if (err instanceof UnauthorizedError) {
    return { status: 401, body: bfmErrorBody('operator_unauthorized') };
  }
  if (err instanceof NotFoundError) {
    return { status: 404, body: bfmErrorBody('not_found') };
  }
  if (err instanceof TooManyRequestsError) {
    return {
      status: 429,
      body: bfmErrorBody('rate_limited', {
        details: { retryAfterSeconds: err.retryAfterSeconds },
      }),
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
