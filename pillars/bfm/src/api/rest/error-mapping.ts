/**
 * Map bfm domain errors to ts-rest response envelopes.
 *
 * Handlers throw `HttpError` subclasses carrying a real `statusCode`; the
 * statuses this pillar declares on its contract (`401`, `404`, `429`) are
 * turned into a typed `{ status, body }` envelope. Anything else — a
 * 500-class `HttpError`, or a non-`HttpError` — is re-thrown so Express's
 * error pipeline surfaces the real stack rather than a swallowed 500.
 */
import { HttpError } from '../shared/errors.js';

export interface ErrorBody {
  message: string;
  code: string;
}

export type ErrorStatus = 401 | 404 | 429;

export interface MappedHttpError {
  status: ErrorStatus;
  body: ErrorBody;
}

function isMappedStatus(status: number): status is ErrorStatus {
  return status === 401 || status === 404 || status === 429;
}

export function mapHttpError(err: unknown): MappedHttpError | null {
  if (err instanceof HttpError && isMappedStatus(err.statusCode)) {
    return { status: err.statusCode, body: { message: err.message, code: err.name } };
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
