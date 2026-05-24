import { TRPCError } from '@trpc/server';

import { ConflictError, HttpError, NotFoundError, ValidationError } from './errors.js';

type TRPCCode = ConstructorParameters<typeof TRPCError>[0]['code'];

// Single mapping point from domain errors to tRPC's wire-level error envelope.
// Keeps router handlers free of repeated try/catch ladders; new HttpError
// subclasses get routed through here by extending the map.
const HTTP_STATUS_TO_TRPC_CODE: Readonly<Record<number, TRPCCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  422: 'UNPROCESSABLE_CONTENT',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
};

function toTRPCError(err: HttpError): TRPCError {
  const code = HTTP_STATUS_TO_TRPC_CODE[err.statusCode] ?? 'INTERNAL_SERVER_ERROR';
  return new TRPCError({ code, message: err.message, cause: err });
}

/**
 * Runs `fn` and re-throws any HttpError subclass (NotFoundError, ConflictError,
 * ValidationError, …) as the corresponding TRPCError. Non-HttpError throws
 * bubble unchanged so the global tRPC error handler can see them as 500s.
 */
export function mapDomainErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpError) throw toTRPCError(err);
    throw err;
  }
}

export async function mapDomainErrorsAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) throw toTRPCError(err);
    throw err;
  }
}

export { ConflictError, HttpError, NotFoundError, ValidationError };
