import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

/**
 * Map ai pillar service errors to ts-rest response envelopes.
 *
 * Handlers translate domain errors into `HttpError` subclasses carrying a
 * real `statusCode` (`UnauthorizedError` → 401, `ValidationError` → 400,
 * `NotFoundError` → 404, `ConflictError` → 409,
 * `ServiceUnavailableError` → 503). For those mapped statuses
 * we return a typed `{ status, body }` envelope; anything else is re-thrown
 * so Express's error pipeline surfaces the real stack rather than a
 * swallowed 500.
 */
import { HttpError } from '../shared/errors.js';

import type { ErrorBody } from '@pops/types';

export type ErrorStatus = 400 | 401 | 404 | 409 | 503;

export interface MappedHttpError {
  status: ErrorStatus;
  body: ErrorBody;
}

function isMappedStatus(status: number): status is ErrorStatus {
  return status === 400 || status === 401 || status === 404 || status === 409 || status === 503;
}

export function mapHttpError(err: unknown): MappedHttpError | null {
  if (err instanceof HttpError && isMappedStatus(err.statusCode)) {
    return {
      status: err.statusCode,
      body: {
        code: errorCode(err),
        message: err.message,
        requestId: getRequestId() ?? mintRequestId(),
        retryable: err.statusCode === 503,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    };
  }
  return null;
}

function errorCode(error: HttpError): string {
  switch (error.name) {
    case 'ValidationError':
      return 'ai.request.invalid';
    case 'UnauthorizedError':
      return 'ai.auth.unauthorized';
    case 'NotFoundError':
      return 'ai.resource.not_found';
    case 'ConflictError':
      return 'ai.resource.conflict';
    case 'ServiceUnavailableError':
      return 'ai.upstream.unavailable';
    default:
      return 'ai.request.failed';
  }
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
