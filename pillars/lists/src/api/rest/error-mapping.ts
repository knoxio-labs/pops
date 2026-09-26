import { defineErrors } from '@pops/pillar-express';
import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

/**
 * Map lists service errors to ts-rest response envelopes. Anything
 * unrecognised is re-thrown so Express's error pipeline (and the test
 * suite) sees the underlying stack rather than a swallowed 500.
 */
import { ListItemNotFoundError, ListNotFoundError } from '../../db/index.js';
import { isForeignKeyConstraintError, isUniqueConstraintError } from '../shared/sqlite-errors.js';

import type { ErrorBody } from '@pops/types';

/** Registered service failures returned by the lists error mapper. */
export const listServiceErrors = defineErrors('lists', {
  not_found: {
    area: 'resource',
    status: 404,
    message: 'The requested list was not found.',
    retryable: false,
  },
  conflict_unique: {
    area: 'resource',
    status: 409,
    message: 'A list with that identity already exists.',
    retryable: false,
  },
  conflict_foreign_key: {
    area: 'resource',
    status: 409,
    message: 'The operation conflicts with a related record.',
    retryable: false,
  },
});

export interface MappedHttpError {
  status: 404 | 409;
  body: ErrorBody;
}

export function tryMapServiceError(err: unknown): MappedHttpError | null {
  if (err instanceof ListNotFoundError || err instanceof ListItemNotFoundError) {
    return { status: 404, body: errorBody('lists.resource.not_found', err.message, false) };
  }
  if (isUniqueConstraintError(err)) {
    return {
      status: 409,
      body: errorBody(
        'lists.resource.conflict_unique',
        'A list with that identity already exists.',
        false
      ),
    };
  }
  if (isForeignKeyConstraintError(err)) {
    return {
      status: 409,
      body: errorBody(
        'lists.resource.conflict_foreign_key',
        'The operation conflicts with a related record.',
        false
      ),
    };
  }
  return null;
}

/** Build an ADR-054 error body for a mapped lists failure. */
export function errorBody(
  code: string,
  message: string,
  retryable: boolean,
  details?: unknown
): ErrorBody {
  return {
    code,
    message,
    requestId: getRequestId() ?? mintRequestId(),
    retryable,
    ...(details === undefined ? {} : { details }),
  };
}

export function runOrThrowHttp<T>(fn: () => T): T | MappedHttpError {
  try {
    return fn();
  } catch (err) {
    const mapped = tryMapServiceError(err);
    if (mapped !== null) return mapped;
    throw err as Error;
  }
}

export function isMappedHttpError(value: unknown): value is MappedHttpError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'body' in value &&
    (value as { status: unknown }).status !== undefined &&
    typeof (value as { body: unknown }).body === 'object'
  );
}
